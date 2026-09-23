import type { CandidateResult, CriticIssue, PipelineEvent, PlanSpec, RenderReport, Role, SimLevel } from '../types';
import type { ChatCallOpts, ChatMessage } from '../provider';
import { textPart, imagePart } from '../provider';
import type { RenderFn } from '../renderer';
import { extractHtml, extractJson, findForbiddenUrls, instrument, stripRuntime } from '../artifact';
import { applyEdits, looksLikeHtml, parseEdits } from './edits';
import {
  PLANNER_SYSTEM, REPLANNER_SYSTEM, generatorSystem, FIXER_SYSTEM, CRITIC_SYSTEM, REFINER_SYSTEM, CDN_WHITELIST,
  FIXER_EDITS_SYSTEM, REFINER_EDITS_SYSTEM, LAYER_SYSTEM, coreBrief, ownExemplarBrief,
} from './prompts';
import { normalizeSpec, levelOf } from './spec';
import { PHYSICS_SYSTEM, PHYSICS_FIX_SYSTEM, parseCoreReply, type CoreCode, type CoreReport } from './core';
import type { Checkpoint } from '../jobs/checkpoints';
import { putSection, sectionsFromReply, getSection, keepsSections, lostSections } from './sections';

export interface Ctx {
  /** Один вход в модель для всех ролей: конфиг роли резолвится в provider-слое. */
  chat: (role: Role, messages: ChatMessage[], opts?: ChatCallOpts) => Promise<string>;
  /** Сохраняет версию, которую человек может открыть уже сейчас. Без него (тесты, eval) черновиков нет. */
  draft?: (label: string, html: string) => Promise<void>;
  /** Доступна ли vision-модель (критик и судья). */
  hasVision: boolean;
  render: RenderFn;
  emit: (e: PipelineEvent) => void;
  /**
   * Числовая проверка ядра физики в песочнице. Без неё (тесты, окружения без браузера)
   * этап ядра пропускается и генерация идёт одним проходом, как раньше.
   */
  checkCore?: (code: CoreCode, spec: PlanSpec) => Promise<CoreReport>;
  /** Точки продолжения: повторная попытка задания начинает с последнего дорогого этапа. */
  checkpoint?: {
    load: () => Checkpoint | null;
    save: (patch: Checkpoint) => void;
  };
}

/** Что человек сказал о тренажёре до плана: уровень и аудитория. Пустое — решает планировщик. */
export interface Brief { level?: SimLevel; audience?: string }

function briefText(brief?: Brief): string {
  if (!brief) return '';
  const lines: string[] = [];
  if (brief.level) lines.push(`Уровень тренажёра (level): ${brief.level}.`);
  if (brief.audience) lines.push(`Аудитория: ${brief.audience}.`);
  return lines.length ? '\n\n' + lines.join('\n') : '';
}

/**
 * План с проверкой кодом. Если спецификацию починить нельзя (нет параметров, пустая
 * физика), планировщика переспрашивают один раз с перечнем проблем; второй ответ
 * принимается как есть — лучше неполный план, чем сорванная генерация.
 */
export async function plan(
  ctx: Ctx, prompt: string, imageDataUrl?: string, brief?: Brief,
): Promise<PlanSpec> {
  const text = prompt + briefText(brief);
  const content = imageDataUrl ? [textPart(text), imagePart(imageDataUrl)] : text;
  const messages: ChatMessage[] = [
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content },
  ];
  const out = await ctx.chat('planner', messages);
  const first = normalizeSpec(extractJson<unknown>(out), { level: brief?.level });
  if (brief?.level) first.spec.level = brief.level;
  if (first.problems.length === 0) return first.spec;
  try {
    const again = await ctx.chat('planner', [
      ...messages,
      { role: 'assistant', content: out },
      { role: 'user', content: 'В спецификации проблемы, исправь и пришли JSON целиком:\n- ' + first.problems.join('\n- ') },
    ]);
    const second = normalizeSpec(extractJson<unknown>(again), { level: first.spec.level });
    if (brief?.level) second.spec.level = brief.level;
    return second.problems.length <= first.problems.length ? second.spec : first.spec;
  } catch {
    return first.spec;
  }
}

/** Поправка к плану: человек посмотрел карточку и попросил изменить. Секунды вместо минут генерации. */
export async function replan(ctx: Ctx, spec: PlanSpec, correction: string): Promise<PlanSpec> {
  const out = await ctx.chat('planner', [
    { role: 'system', content: REPLANNER_SYSTEM },
    { role: 'user', content: `Спецификация:\n${JSON.stringify(spec, null, 2)}\n\nПоправка: ${correction}` },
  ]);
  return normalizeSpec(extractJson<unknown>(out), { level: levelOf(spec) }).spec;
}

/**
 * Ядро физики: пишется отдельно и проверяется числами. До двух кругов починки по
 * проваленным проверкам; дальше берётся лучшее из виденных — генерация не срывается
 * из-за строгого инварианта, но о провале человек узнаёт.
 */
export async function buildCore(ctx: Ctx, spec: PlanSpec): Promise<{ code: CoreCode; report: CoreReport } | null> {
  if (!ctx.checkCore) return null;
  const user = 'Спецификация:\n' + JSON.stringify(spec, null, 2);
  let out = await ctx.chat('generator', [
    { role: 'system', content: PHYSICS_SYSTEM },
    { role: 'user', content: user },
  ], { onDelta: codeTicker(ctx, 'generator') });
  let code = parseCoreReply(out);
  if (!code) return null;
  let report = await ctx.checkCore(code, spec);
  let best = { code, report };
  // Чиним только настоящие провалы: мягкие («параметр ни на что не влияет») переписыванием ядра не лечатся.
  for (let round = 0; round < 2 && report.hard.length > 0; round++) {
    try {
      out = await ctx.chat('fixer', [
        { role: 'system', content: PHYSICS_FIX_SYSTEM },
        { role: 'user', content: `${user}\n\nЯдро:\n\`\`\`js\n${code.core}\n\`\`\`\n\`\`\`js\n${code.checks}\n\`\`\`\n\n` +
          `Проваленные проверки:\n- ${report.hard.join('\n- ')}` },
      ], { onDelta: codeTicker(ctx, 'fixer') });
    } catch {
      break;
    }
    const next = parseCoreReply(out);
    if (!next) break;
    code = next;
    report = await ctx.checkCore(code, spec);
    if (report.hard.length < best.report.hard.length) best = { code, report };
  }
  return best;
}

export async function generateCandidate(
  ctx: Ctx, spec: PlanSpec, exemplar?: string, core?: string, ownExemplar?: string,
): Promise<string> {
  const layered = !!core && levelOf(spec) !== 'demo';
  const out = await ctx.chat('generator', [
    { role: 'system', content: generatorSystem(ownExemplar ? undefined : exemplar) + (ownExemplar ? ownExemplarBrief(ownExemplar) : '') },
    { role: 'user', content: 'Спецификация:\n' + JSON.stringify(spec, null, 2) + (core ? coreBrief(core, layered) : '') },
  ], { onDelta: codeTicker(ctx, 'generator') });
  let html = extractHtml(out);
  // Проверенное ядро возвращаем на место дословно: модель любит «чуть поправить» физику.
  if (core && getSection(html, 'physics') !== null) html = putSection(html, 'physics', core) ?? html;
  return instrument(html);
}

export interface Layer { name: string; title: string; task: string }

/** Какие слои достроить поверх основы. Для демонстрации слоёв нет: всё влезает в один проход. */
export function planLayers(spec: PlanSpec): Layer[] {
  if (levelOf(spec) === 'demo') return [];
  const layers: Layer[] = [];
  const extra = (spec.views ?? []).filter((v) => v.kind !== 'scene').slice(1);
  if (extra.length) {
    layers.push({
      name: 'views', title: 'Дополнительные виды и измерения',
      task: 'Добавь секцию views — дополнительные виды из плана:\n' +
        extra.map((v) => `- ${v.title} (${v.kind}): ${v.what}`).join('\n') +
        '\nФазовые диаграммы — SimUI.chart с mode:\'xy\'; таблица измерений — SimUI.table с record; ' +
        'разрез или вид сверху — отдельный canvas внутри SimUI.panel. Приборы не должны закрывать сцену: ' +
        'раскладывай по разным углам, лишнее сворачивай.',
    });
  }
  if (spec.scenario?.length) {
    layers.push({
      name: 'scenario', title: 'Сценарий урока',
      task: 'Добавь секцию scenario — сценарий урока через SimUI.steps по шагам плана:\n' +
        spec.scenario.map((s, i) => `${i + 1}. ${s.title}: ${s.task}${s.expect ? ` (ожидаем: ${s.expect})` : ''}`).join('\n') +
        '\nВ onStep выставляй нужные значения через SimUI.set(name, value). Для шагов, где ученик должен ' +
        'ответить, добавь SimUI.task: answer считай из ядра (PHYS.observe или прогон PHYS.step), а не константой.',
    });
  }
  return layers;
}

/** Слой поверх рабочего тренажёра. null — ответ не лёг (нет секций, некуда вставить). */
export async function addLayer(ctx: Ctx, spec: PlanSpec, html: string, layer: Layer): Promise<string | null> {
  const base = stripRuntime(html);
  const out = await ctx.chat('generator', [
    { role: 'system', content: LAYER_SYSTEM },
    { role: 'user', content: `Спецификация:\n${JSON.stringify(spec, null, 2)}\n\nЗадача слоя: ${layer.task}` +
      `\n\nHTML:\n\`\`\`html\n${base}\n\`\`\`` },
  ], { onDelta: codeTicker(ctx, 'generator') });
  const sections = sectionsFromReply(out, layer.name);
  delete sections.physics;
  if (Object.keys(sections).length === 0) return null;
  let next: string | null = base;
  for (const [name, body] of Object.entries(sections)) {
    next = putSection(next, name, body);
    if (next === null) return null;
  }
  return instrument(next);
}

/** Лента «модель пишет код»: не чаще раза в две секунды, с хвостом последних строк. */
export function codeTicker(ctx: Ctx, role: Role): (chunk: string) => void {
  let text = '';
  let last = 0;
  return (chunk) => {
    text += chunk;
    const now = Date.now();
    if (now - last < 2000) return;
    last = now;
    ctx.emit({ type: 'gen-progress', role, chars: text.length, tail: text.slice(-600) });
  };
}

/**
 * Починка. Модели уходит HTML без нашего рантайма (кит и harness она не должна переписывать —
 * раньше именно из-за них ответ упирался в предел токенов и шёл минутами). Сначала просим
 * точечные правки; если они не легли — полный файл, как раньше.
 */
export async function fixArtifact(ctx: Ctx, html: string, errors: string[]): Promise<string> {
  const base = stripRuntime(html);
  const problems = `Ошибки:\n${errors.join('\n')}`;
  try {
    const out = await ctx.chat('fixer', [
      { role: 'system', content: FIXER_EDITS_SYSTEM },
      { role: 'user', content: `${problems}\n\nHTML:\n\`\`\`html\n${base}\n\`\`\`` },
    ], { onDelta: codeTicker(ctx, 'fixer') });
    const edits = parseEdits(out);
    const patched = edits ? applyEdits(base, edits) : null;
    if (patched) return instrument(patched);
    if (!edits && looksLikeHtml(out) && keepsSections(base, extractHtml(out))) return instrument(extractHtml(out));
  } catch { /* точечная починка не удалась — ниже полный файл */ }
  const out = await ctx.chat('fixer', [
    { role: 'system', content: FIXER_SYSTEM },
    { role: 'user', content: `${problems}\n\nHTML:\n\`\`\`html\n${base}\n\`\`\`` },
  ], { onDelta: codeTicker(ctx, 'fixer') });
  const whole = extractHtml(out);
  const lost = lostSections(base, whole);
  // Починка, выбросившая слои, хуже поломки: вызывающий оставит лучшую из виденных версий.
  if (lost.length) throw new Error('починка потеряла секции: ' + lost.join(', '));
  return instrument(whole);
}

function toDataUrl(png: Buffer): string {
  return 'data:image/png;base64,' + png.toString('base64');
}

const STATIC_ANIMATION_ERROR = 'Анимация не идёт: кадры не меняются со временем';
const CDN_ALLOWED = Object.values(CDN_WHITELIST);

/**
 * Ранг качества версии: заражённая запрещённым CDN или сломанная (0) < ok+статика (1) <
 * ok+анимация, но с провалами проб (2) < ok+анимация, пробы чисты (3). Заражённость важнее
 * красоты рендера: версия с запрещённым URL никогда не может обойти чистую в best-so-far,
 * каким бы хорошим ни был её рендер.
 */
function rank(html: string, report: RenderReport): 0 | 1 | 2 | 3 {
  if (!report.ok || findForbiddenUrls(html, CDN_ALLOWED).length > 0) return 0;
  if (!report.animated) return 1;
  return (report.probes?.failures.length ?? 0) > 0 ? 2 : 3;
}

interface Ranked { html: string; report: RenderReport }

/**
 * Сверка «план ↔ тренажёр»: всё, что обещано в плане, обязано быть на странице.
 * Пропуски становятся провалом пробы — их чинит тот же фиксер, что и остальное.
 */
export function coverageFailures(spec: PlanSpec, report: RenderReport): string[] {
  const controls = report.probes?.controls;
  if (!controls) return [];
  const names = new Set(controls.map((c) => c.name));
  const out: string[] = [];
  const missing = spec.parameters.filter((p) => !names.has(p.name));
  if (missing.length) {
    out.push('Нет слайдеров для параметров плана: ' +
      missing.map((p) => `${p.label} (name: '${p.name}')`).join(', ') +
      ' — каждый параметр spec.parameters обязан быть SimUI.slider с тем же name');
  }
  return out;
}

function withCoverage(spec: PlanSpec, report: RenderReport): RenderReport {
  const gaps = coverageFailures(spec, report);
  if (!report.probes || gaps.length === 0) return report;
  const results = [...report.probes.results,
    ...gaps.map((detail) => ({ id: 'coverage', label: 'Всё из плана на месте', status: 'fail' as const, detail }))];
  const judged = results.filter((r) => r.status !== 'skip');
  return {
    ...report,
    probes: {
      ...report.probes,
      results,
      passRate: judged.length ? judged.filter((r) => r.status === 'pass').length / judged.length : 1,
      failures: [...report.probes.failures, ...gaps.map((g) => `Всё из плана на месте: ${g}`)],
    },
  };
}

export async function verifyCandidate(
  ctx: Ctx, spec: PlanSpec, html: string, index: number,
  /** Проверка после доводки: версии для человека подписываются иначе, чем первая. */
  phase: 'first' | 'refine' = 'first',
): Promise<CandidateResult> {
  ctx.emit({ type: 'candidate', index, status: 'rendering' });
  let current = html;
  let report = withCoverage(spec, await ctx.render(current, { probes: true }));
  // Человеку в рабочую область уходят только версии, которые запустились без ошибок.
  const offer = async (label: string, h: string, r: RenderReport) => {
    if (r.ok && r.errors.length === 0 && findForbiddenUrls(h, CDN_ALLOWED).length === 0) await ctx.draft?.(label, h);
  };
  await offer(phase === 'refine' ? 'Доводка' : 'Первая версия', current, report);
  // best-so-far: если попытки починки только ухудшают результат, в конце возвращаем лучшую
  // из виденных версий, а не последнюю сломанную.
  let best: Ranked = { html: current, report };
  for (let attempt = 0; attempt < 2; attempt++) {
    const forbidden = findForbiddenUrls(current, CDN_ALLOWED);
    const probeFailed = (report.probes?.failures.length ?? 0) > 0;
    if (report.ok && report.animated && forbidden.length === 0 && !probeFailed) break;
    // Рабочая и живая симуляция, у которой не прошли только пробы поведения, — один круг
    // починки, не два: второй редко что-то меняет, а стоит минуту-две ожидания.
    if (attempt > 0 && report.ok && report.animated && forbidden.length === 0) break;
    ctx.emit({ type: 'candidate', index, status: 'fixing' });
    const errors = [...report.errors];
    if (report.ok && !report.animated) errors.push(STATIC_ANIMATION_ERROR);
    if (forbidden.length) errors.push(`Запрещённые внешние ресурсы: ${forbidden.join(', ')}`);
    for (const f of report.probes?.failures ?? []) errors.push('Проба не пройдена — ' + f);
    try {
      current = await fixArtifact(ctx, current, errors);
    } catch {
      break; // фиксер сам упал — используем лучшее из уже отрендеренного
    }
    report = withCoverage(spec, await ctx.render(current, { probes: true }));
    if (rank(current, report) > rank(best.html, best.report)) {
      best = { html: current, report };
      await offer('Починена', current, report);
    }
  }
  if (rank(current, report) < rank(best.html, best.report)) {
    current = best.html;
    report = best.report;
  }
  // Заражённый запрещёнными URL финалист не может уйти в библиотеку, даже если рендер прошёл.
  if (!report.ok || findForbiddenUrls(current, CDN_ALLOWED).length > 0) {
    ctx.emit({ type: 'candidate', index, status: 'failed' });
    return { html: current, render: report, critic: null, alive: false };
  }
  if (report.screenshots[0]) {
    ctx.emit({ type: 'screenshot', index, dataUrl: toDataUrl(report.screenshots[0]) });
  }
  if (report.probes) {
    ctx.emit({
      type: 'probe-report', index, passRate: report.probes.passRate,
      results: report.probes.results.map((r) => ({
        id: r.id, label: r.label, status: r.status, detail: r.detail })),
    });
  }
  let critic: { physicsOk: boolean; issues: CriticIssue[] } | null = null;
  if (ctx.hasVision) {
    ctx.emit({ type: 'candidate', index, status: 'critiquing' });
    try {
      const probeNote = report.probes && report.probes.failures.length
        ? '\n\nАвтоматические пробы не пройдены:\n- ' + report.probes.failures.join('\n- ')
        : '';
      const animationNote = report.animated
        ? ''
        : `\n\nВНИМАНИЕ: ${STATIC_ANIMATION_ERROR.toLowerCase()} даже после попыток починки.`;
      const out = await ctx.chat('critic', [
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: [
          textPart('Спецификация:\n' + JSON.stringify(spec, null, 2) + animationNote + probeNote),
          ...report.screenshots.map((s) => imagePart(toDataUrl(s))),
        ] },
      ]);
      const raw = extractJson<{ physicsOk: boolean; issues: unknown[] }>(out);
      critic = {
        physicsOk: !!raw.physicsOk,
        issues: (raw.issues ?? []).map((i): CriticIssue =>
          typeof i === 'string'
            ? { severity: 'major', text: i }
            : { severity: (i as CriticIssue).severity ?? 'major',
                text: String((i as CriticIssue).text ?? '') }),
      };
    } catch {
      critic = null; // критик упал — не валим кандидата
    }
  }
  if (critic) {
    ctx.emit({
      type: 'critic-verdict', index, physicsOk: critic.physicsOk,
      issues: critic.issues.map((i) => i.text),
    });
  }
  // Замечания критика раньше уходили только судье и никогда не чинились.
  // Блокеры и мажоры получают один целевой раунд правки с перепроверкой.
  const serious = (critic?.issues ?? []).filter(
    (i) => i.severity === 'blocker' || i.severity === 'major');
  if (serious.length > 0) {
    ctx.emit({ type: 'targeted-fix', index, issues: serious.map((i) => i.text) });
    try {
      const instruction = 'Исправь именно эти замечания рецензента, не трогая остальное:\n- ' +
        serious.map((i) => i.text).join('\n- ');
      const base = stripRuntime(current);
      const out = await ctx.chat('refiner', [
        { role: 'system', content: REFINER_EDITS_SYSTEM },
        { role: 'user', content: `${instruction}\n\nHTML:\n\`\`\`html\n${base}\n\`\`\`` },
      ], { onDelta: codeTicker(ctx, 'refiner') });
      const edits = parseEdits(out);
      const patched = edits ? applyEdits(base, edits) : null;
      const rewritten = !edits && looksLikeHtml(out) ? extractHtml(out) : null;
      const whole = rewritten && keepsSections(base, rewritten) ? rewritten : null;
      // Правки не легли — целевая починка пропускается: кандидат уже рабочий.
      if (!patched && !whole) throw new Error('правки рецензента не применились');
      const fixed = instrument(patched ?? whole!);
      const fixedReport = withCoverage(spec, await ctx.render(fixed, { probes: true }));
      if (rank(fixed, fixedReport) >= rank(current, report)) {
        current = fixed;
        report = fixedReport;
        await offer('По замечаниям рецензента', current, report);
      }
    } catch {
      // Целевая починка — попытка улучшить, а не обязательный этап:
      // её провал не должен убивать живого кандидата.
    }
  }
  ctx.emit({ type: 'candidate', index, status: 'ok' });
  return { html: current, render: report, critic, alive: true };
}
