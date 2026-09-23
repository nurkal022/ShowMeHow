import type {
  PipelineEvent, PipelineStage, PlanSpec, PlanSummary, QualityMode, SimulationMeta,
  CandidateResult, RubricScores, Role, RenderReport,
} from '../types';
import { minScore } from '../types';
import { activeProvider, NO_PROVIDER_MESSAGE } from '../settings';
import { bindChat, type ChatFn, type UsageInfo } from '../provider';
import { renderArtifact } from '../renderer';
import { createSimulation, saveThumbnail, getArtifact, updateArtifact, saveSpec, getSpec, listExemplars } from '../storage';
import { extractHtml, findForbiddenUrls, instrument, reinstrument, stripRuntime } from '../artifact';
import { pickExemplar, pickOwnExemplar } from '../exemplars';
import { listBundledDemos } from '../demos';
import { REFINER_SYSTEM, REFINER_EDITS_SYSTEM, REFINER_SECTIONS_SYSTEM, CDN_WHITELIST } from './prompts';
import { getSection, listSections, lostSections, keepsSections, putSection, sectionMap } from './sections';
import { readConfig, writeConfig, mergeConfig, type SimConfig } from './config';
import {
  applyEdits, looksLikeHtml, parseEdits, parseRefinePatch, parseRefineReport, type RefineReport,
} from './edits';
import {
  plan, generateCandidate, verifyCandidate, fixArtifact, codeTicker, buildCore, planLayers, addLayer,
  coverageFailures, type Ctx, type Brief,
} from './stages';
import { checkCore } from './core';
import { levelOf } from './spec';
import { judge, rescore } from './judge';

const ZERO_SCORES: RubricScores = { physics: 0, clarity: 0, interactivity: 0, aesthetics: 0 };
const CDN_ALLOWED = Object.values(CDN_WHITELIST);

/**
 * Режим задаёт глубину полировки, а не число вариантов: кандидат всегда один.
 * Перебор акцентов был механизмом разнообразия, но хорошая учебная симуляция
 * обязана быть точной, наглядной и интерактивной одновременно — теперь этого
 * требуют от единственного кандидата сразу (см. GENERATION_RULES).
 */
export const MODES: Record<QualityMode, {
  useJudge: boolean; maxRefine: number; threshold: number;
  /** Ядро физики пишется и проверяется числами отдельно от сцены. */
  core: boolean;
  /** Слои (виды, сценарий урока) достраиваются поверх основы для lab/research. */
  layers: boolean;
}> = {
  fast: { useJudge: false, maxRefine: 0, threshold: 0, core: false, layers: false },
  standard: { useJudge: true, maxRefine: 1, threshold: 0, core: true, layers: true },
  max: { useJudge: true, maxRefine: 3, threshold: 8, core: true, layers: true },
};

/**
 * Бюджет времени до слоёв: если основа собиралась дольше, слои не начинаем — лучше
 * сохранить рабочий тренажёр сейчас, чем держать человека ещё несколько минут.
 */
export const LAYER_BUDGET_MS: Record<QualityMode, number> = {
  fast: 0, standard: 8 * 60_000, max: 14 * 60_000,
};

/** После этого срока новый круг доводки не начинается: человек ждёт, а тренажёр уже рабочий. */
export const REFINE_BUDGET_MS: Record<QualityMode, number> = {
  fast: 0, standard: 10 * 60_000, max: 18 * 60_000,
};

/**
 * Стала ли версия лучше: не просела худшая оценка и выросла сумма. Одна худшая оценка
 * важнее средней — тренажёр с физикой 2 из 10 плох, как бы ни был красив.
 */
export function improved(before: RubricScores, after: RubricScores): boolean {
  const sum = (s: RubricScores) => s.physics + s.clarity + s.interactivity + s.aesthetics + (s.depth ?? 0);
  return minScore(after) >= minScore(before) && sum(after) > sum(before);
}

/** Метка «основа восстановлена из точки продолжения» — выход из блока генерации без провала. */
const RESUMED = Symbol('resumed');

/** Кооперативная отмена: runPipeline бросает это между этапами, если signal() вернул true. */
export class CancelledError extends Error {
  constructor() {
    super('Отменено пользователем');
    this.name = 'CancelledError';
  }
}

export function makeCtx(emit: (e: PipelineEvent) => void): Ctx {
  const p = activeProvider();
  if (!p) throw new Error(NO_PROVIDER_MESSAGE);
  const onUsage = (u: UsageInfo & { role: Role; model: string }) =>
    emit({ type: 'usage', role: u.role, model: u.model,
      promptTokens: u.promptTokens, completionTokens: u.completionTokens, ms: u.ms });
  const chats = new Map<Role, ChatFn>();
  return {
    chat: (role, messages, opts) => {
      if (!chats.has(role)) chats.set(role, bindChat(p, role, onUsage));
      return chats.get(role)!(messages, opts);
    },
    hasVision: !!p.visionModel,
    render: (html, opts) => renderArtifact(html, opts),
    emit,
    checkCore: (code, spec) => checkCore(code, spec),
  };
}

function emitStage(ctx: Ctx, stage: PipelineStage, status: 'start' | 'end'): void {
  ctx.emit({ type: 'stage', stage, status, at: Date.now() });
}

function planSummary(spec: PlanSpec): PlanSummary {
  return {
    title: spec.title,
    subject: spec.subject,
    mode: spec.mode,
    physics: spec.physics,
    parameters: spec.parameters.map((p) => ({ label: p.label, unit: p.unit })),
    goals: spec.learningGoals,
    level: levelOf(spec),
    views: spec.views?.map((v) => v.title),
    steps: spec.scenario?.map((s) => s.title),
    invariants: spec.invariants?.map((i) => i.text),
  };
}

export async function runPipeline(
  ctx: Ctx,
  input: {
    ownerId: string; prompt: string; imageDataUrl?: string; mode: QualityMode;
    /** План, который человек уже посмотрел и утвердил: планировщик не вызывается. */
    spec?: PlanSpec;
    /** Уровень и аудитория, названные до плана. */
    brief?: Brief;
    /**
     * Вызывается сразу после сохранения, до превью и события done. Воркер записывает
     * id в задание: повторная попытка после потери воркера не создаст вторую симуляцию.
     */
    onSaved?: (simulationId: string) => Promise<void>;
  },
  signal?: () => boolean,
): Promise<SimulationMeta> {
  function checkCancelled(): void {
    if (signal?.()) throw new CancelledError();
  }

  const mode = MODES[input.mode];
  const startedAt = Date.now();
  const warnings: string[] = [];
  if (!ctx.hasVision) {
    warnings.push('Vision-модель не настроена: без визуальной критики и судьи.');
    ctx.emit({ type: 'warning', message: warnings[0] });
  }

  // Повтор задания после потери воркера: продолжаем с последнего сохранённого этапа.
  const resumed = ctx.checkpoint?.load() ?? null;
  if (resumed?.spec) {
    ctx.emit({ type: 'warning', message: 'Продолжаю с сохранённого этапа — сделанное до сбоя не пропало.' });
  }

  checkCancelled();
  emitStage(ctx, 'planning', 'start');
  const spec = input.spec ?? resumed?.spec ?? await plan(ctx, input.prompt, input.imageDataUrl, input.brief);
  ctx.checkpoint?.save({ spec });
  emitStage(ctx, 'planning', 'end');
  ctx.emit({ type: 'plan-ready', spec: planSummary(spec) });

  // Ближайшая одобренная демка идёт генератору как эталон уровня проработки.
  const exemplarEntry = pickExemplar(listBundledDemos(), spec);
  const exemplarHtml = exemplarEntry ? exemplarEntry.html : undefined;
  // Свои эталоны автора важнее вшитых демок: он сам отметил, какие приборы ему нравятся.
  let ownExemplar: string | undefined;
  try {
    ownExemplar = pickOwnExemplar(await listExemplars(input.ownerId), spec, listSections) ?? undefined;
  } catch { /* эталон — подсказка, без него генерация идёт как обычно */ }

  // Ядро физики: отдельно и с числовой проверкой. Сбой ядра не срывает генерацию —
  // генератор тогда пишет физику сам, как раньше.
  let core: string | undefined = resumed?.core;
  if (mode.core && ctx.checkCore && !core && !resumed?.built) {
    checkCancelled();
    emitStage(ctx, 'physics', 'start');
    try {
      const built = await buildCore(ctx, spec);
      if (built) {
        core = built.code.core;
        ctx.checkpoint?.save({ core });
        ctx.emit({ type: 'physics-check', ok: built.report.ok, results: built.report.results });
        if (built.report.hard.length) {
          const msg = 'Ядро физики прошло не все числовые проверки: ' + built.report.hard.slice(0, 2).join('; ');
          warnings.push(msg);
          ctx.emit({ type: 'warning', message: msg });
        }
      }
    } catch (e) {
      if (e instanceof CancelledError) throw e;
    } finally {
      emitStage(ctx, 'physics', 'end');
    }
  }

  emitStage(ctx, 'generating', 'start');
  let candidate: CandidateResult | null = null;
  try {
    checkCancelled();
    ctx.emit({ type: 'candidate', index: 0, status: 'generating' });
    try {
      if (resumed?.built) {
        // Основа со слоями уже собрана до сбоя: только перепроверяем её запуском.
        const render = await ctx.render(resumed.built, { probes: true });
        candidate = { html: resumed.built, render, critic: null, alive: render.ok };
        ctx.emit({ type: 'candidate', index: 0, status: render.ok ? 'ok' : 'failed' });
        throw RESUMED;
      }
      const html = await generateCandidate(ctx, spec, exemplarHtml, core, ownExemplar);
      // Рабочие версии verifyCandidate отдаёт человеку сам — только те, что запустились без ошибок.
      candidate = await verifyCandidate(ctx, spec, html, 0);
    } catch (e) {
      if (e !== RESUMED) {
        ctx.emit({ type: 'candidate', index: 0, status: 'failed' });
        candidate = null;
      }
    }
  } finally {
    // Отмена не должна оставить висящий stage-start: без end чип таймлайна
    // пульсировал бы вечно.
    emitStage(ctx, 'generating', 'end');
  }

  // Слои поверх рабочей основы: так тренажёр становится сложнее, не упираясь в лимит
  // одного ответа. Сломанный слой откатывается — основа не теряется.
  if (candidate?.alive && mode.layers && !resumed?.built) {
    const layers = planLayers(spec);
    if (layers.length && Date.now() - startedAt > LAYER_BUDGET_MS[input.mode]) {
      const msg = 'Основа собиралась дольше обычного — сохраняю её без дополнительных слоёв; их можно добавить доработкой.';
      warnings.push(msg);
      ctx.emit({ type: 'warning', message: msg });
    } else if (layers.length) {
      emitStage(ctx, 'layers', 'start');
      try {
        for (const layer of layers) {
          checkCancelled();
          ctx.emit({ type: 'layer', name: layer.name, title: layer.title, status: 'start' });
          const next = await applyLayer(ctx, spec, candidate, layer);
          if (next) {
            candidate = next;
            await ctx.draft?.(layer.title, next.html);
            ctx.emit({ type: 'layer', name: layer.name, title: layer.title, status: 'ok' });
          } else {
            ctx.emit({ type: 'layer', name: layer.name, title: layer.title, status: 'skipped' });
            const msg = `Слой «${layer.title}» не удался и пропущен.`;
            warnings.push(msg);
            ctx.emit({ type: 'warning', message: msg });
          }
        }
      } finally {
        emitStage(ctx, 'layers', 'end');
      }
    }
  }

  if (candidate?.alive) ctx.checkpoint?.save({ built: candidate.html });

  let best: CandidateResult;
  let feedback = '';

  if (!candidate || !candidate.alive) {
    // Кандидат один: подстраховки «возьмём другого» больше нет. Сломанный
    // сохраняем best-effort, но заражённый запрещённым CDN — никогда.
    if (!candidate) throw new Error('Не удалось сгенерировать кандидата.');
    if (findForbiddenUrls(candidate.html, CDN_ALLOWED).length > 0) {
      throw new Error('Кандидат содержит запрещённые внешние ресурсы.');
    }
    const msg = 'Кандидат завершился с ошибками — сохранён как есть.';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
    best = candidate;
  } else if (mode.useJudge && ctx.hasVision) {
    checkCancelled();
    emitStage(ctx, 'judging', 'start');
    let verdict = null;
    try {
      verdict = await judge(ctx, spec, [candidate]);
    } catch {
      verdict = null; // судья недоступен/вернул мусор — деградируем ниже
    }
    emitStage(ctx, 'judging', 'end');

    if (!verdict) {
      // судья недоступен ещё до первого вердикта — деградируем на единственного кандидата,
      // не теряя уже сгенерированный (и отрендеренный) вариант.
      const msg = 'Судья недоступен — выбран первый кандидат.';
      warnings.push(msg);
      ctx.emit({ type: 'warning', message: msg });
      best = candidate;
    } else {
      ctx.emit({
        type: 'judge-verdict', scores: verdict.scores, winnerIndex: verdict.winnerIndex,
        candidateIndices: [0], feedback: verdict.feedback,
      });
      best = candidate;
      feedback = verdict.feedback;
      // judge может вернуть массив scores короче числа кандидатов (сломанный JSON от модели);
      // подстраховываемся нулевым объектом, чтобы minScore() ниже не упал на undefined.
      let current = verdict.scores[verdict.winnerIndex] ?? { ...ZERO_SCORES };

      if (mode.maxRefine > 0) {
        emitStage(ctx, 'refining', 'start');
        // finally: отмена (checkCancelled перед кругом или проброшенный CancelledError
        // из круга) не должна оставлять висящий refining-start без end.
        try {
          for (let round = 0; round < mode.maxRefine; round++) {
            if (Date.now() - startedAt > REFINE_BUDGET_MS[input.mode]) {
              const msg = 'Время на доводку вышло — сохраняю лучшую версию; улучшить можно доработкой.';
              warnings.push(msg);
              ctx.emit({ type: 'warning', message: msg });
              break;
            }
            const belowThreshold = mode.threshold > 0 && minScore(current) < mode.threshold;
            const firstStandardRound = mode.threshold === 0 && round === 0 && !!feedback;
            if (!belowThreshold && !firstStandardRound) break;
            checkCancelled();
            const before = current;
            try {
              const refined = await refineHtml(ctx, best.html, feedback);
              const verified = await verifyCandidate(ctx, spec, refined.html, 0, 'refine');
              if (!verified.alive) {
                // доводка сломала — оставляем предыдущее
                ctx.emit({ type: 'refine-round', round: round + 1, before, after: null });
                break;
              }
              const re = await rescore(ctx, spec, verified);
              ctx.emit({ type: 'refine-round', round: round + 1, before, after: re.scores });
              // Доводка обязана улучшать: хуже по оценкам — оставляем прежнюю версию и
              // заканчиваем. Раньше принималась любая, и доводка могла снизить все оценки.
              if (!improved(before, re.scores)) {
                const msg = 'Доводка не улучшила оценки — оставил версию до неё.';
                warnings.push(msg);
                ctx.emit({ type: 'warning', message: msg });
                break;
              }
              best = verified;
              current = re.scores;
              feedback = re.feedback;
            } catch (e) {
              if (e instanceof CancelledError) throw e;
              // рефайн или пересуд упал (например, судья вернул не-JSON) — не валим пайплайн,
              // просто останавливаемся на текущем лучшем кандидате.
              ctx.emit({ type: 'refine-round', round: round + 1, before, after: null });
              break;
            }
          }
        } finally {
          emitStage(ctx, 'refining', 'end');
        }
      }
    }
  } else {
    best = candidate;
  }

  if (!best.render.animated) {
    const msg = 'Анимация может быть статичной';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
  }

  checkCancelled();
  emitStage(ctx, 'saving', 'start');
  const meta = await createSimulation(input.ownerId, {
    title: spec.title, prompt: input.prompt, subject: spec.subject,
    tags: spec.learningGoals.slice(0, 3),
    warning: warnings.length ? warnings.join(' ') : undefined,
  }, best.html);
  await saveSpec(input.ownerId, meta.id, spec);
  await input.onSaved?.(meta.id);
  const shot = best.render.screenshots[1] ?? best.render.screenshots[0];
  if (shot) await saveThumbnail(input.ownerId, meta.id, shot);
  emitStage(ctx, 'saving', 'end');
  ctx.emit({ type: 'done', simulationId: meta.id });
  return meta;
}

function probeFailures(r: CandidateResult['render']): number {
  return r.probes?.failures.length ?? 0;
}

/**
 * Один слой: достроить, проверить, при поломке — один круг починки, иначе откат.
 * Слой принимается, если тренажёр живой и проб провалено не больше, чем до слоя.
 */
async function applyLayer(
  ctx: Ctx, spec: PlanSpec, base: CandidateResult, layer: ReturnType<typeof planLayers>[number],
): Promise<CandidateResult | null> {
  let html: string | null;
  try {
    html = await addLayer(ctx, spec, base.html, layer);
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return null;
  }
  if (!html) return null;
  const accept = (h: string, r: CandidateResult['render']) =>
    r.ok && r.animated && findForbiddenUrls(h, CDN_ALLOWED).length === 0 &&
    probeFailures(r) + coverageFailures(spec, r).length <= probeFailures(base.render);
  let report = await ctx.render(html, { probes: true });
  if (accept(html, report)) return { ...base, html, render: report };
  try {
    const errors = [...report.errors, ...(report.probes?.failures ?? []).map((f) => 'Проба не пройдена — ' + f)];
    if (!report.animated) errors.push('Анимация не идёт: кадры не меняются со временем');
    html = await fixArtifact(ctx, html, errors);
    report = await ctx.render(html, { probes: true });
    if (accept(html, report)) return { ...base, html, render: report };
  } catch (e) {
    if (e instanceof CancelledError) throw e;
  }
  return null;
}

/**
 * Доводка и правка по просьбе: сначала точечные правки, если не легли — весь файл.
 * Вместе с правками модель присылает отчёт; при переписывании файла целиком отчёта
 * не будет — там формат ответа другой, и просить его вторым запросом дороже, чем молчать.
 */
async function refineHtml(
  ctx: Ctx, html: string, feedback: string, spec?: PlanSpec | null,
): Promise<{ html: string; report: RefineReport | null }> {
  const base = stripRuntime(html);
  // Размеченный тренажёр правится секциями и настройками: это надёжнее find/replace.
  if (listSections(base).length > 0) {
    const sectioned = await refineSections(ctx, base, feedback, spec ?? null);
    if (sectioned) return sectioned;
  }
  const context = spec ? `Спецификация тренажёра:\n${JSON.stringify(spec, null, 2)}\n\n` : '';
  const user = `${context}Замечания:\n${feedback}\n\nHTML:\n\`\`\`html\n${base}\n\`\`\``;
  try {
    const out = await ctx.chat('refiner', [
      { role: 'system', content: REFINER_EDITS_SYSTEM },
      { role: 'user', content: user },
    ], { onDelta: codeTicker(ctx, 'refiner') });
    const edits = parseEdits(out);
    const patched = edits ? applyEdits(base, edits) : null;
    if (patched) return { html: instrument(patched), report: parseRefineReport(out) };
    if (!edits && looksLikeHtml(out) && keepsSections(base, extractHtml(out))) {
      return { html: instrument(extractHtml(out)), report: null };
    }
  } catch { /* ниже — полный файл */ }
  const out = await ctx.chat('refiner', [
    { role: 'system', content: REFINER_SYSTEM },
    { role: 'user', content: user },
  ], { onDelta: codeTicker(ctx, 'refiner') });
  const whole = extractHtml(out);
  const lost = lostSections(base, whole);
  if (lost.length) throw new Error('Правка выбросила части тренажёра (' + lost.join(', ') + ') — оставил прежнюю версию.');
  return { html: instrument(whole), report: null };
}

/**
 * Один ответ модели, три способа правки: наложение настроек, точечные замены и
 * переписанные секции. null — ничего не легло, вызывающий идёт старым путём.
 */
async function refineSections(
  ctx: Ctx, base: string, feedback: string, spec: PlanSpec | null,
): Promise<{ html: string; report: RefineReport | null } | null> {
  const user = (spec ? `Спецификация тренажёра:\n${JSON.stringify(spec, null, 2)}\n\n` : '') +
    `Секции: ${sectionMap(base)}\nНастройки сейчас: ${JSON.stringify(readConfig(base))}\n\n` +
    `Просьба:\n${feedback}\n\nHTML:\n\`\`\`html\n${base}\n\`\`\``;
  let out: string;
  try {
    out = await ctx.chat('refiner', [
      { role: 'system', content: REFINER_SECTIONS_SYSTEM },
      { role: 'user', content: user },
    ], { onDelta: codeTicker(ctx, 'refiner') });
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return null;
  }
  const patch = parseRefinePatch(out);
  if (!patch) return null;
  let html = base;
  if (patch.config) html = writeConfig(html, mergeConfig(readConfig(html), patch.config));
  if (patch.edits.length) {
    const edited = applyEdits(html, patch.edits);
    if (!edited) return null; // правки не легли — пусть старый путь попробует целиком
    html = edited;
  }
  for (const [name, body] of Object.entries(patch.sections)) {
    const next = putSection(html, name, body);
    if (next === null) return null;
    html = next;
  }
  if (html === base || !keepsSections(base, html)) return null;
  return { html: instrument(html), report: parseRefineReport(out) };
}

async function recheckCore(ctx: Ctx, spec: PlanSpec | null, before: string, after: string): Promise<string[]> {
  if (!spec || !ctx.checkCore) return [];
  const core = getSection(after, 'physics');
  if (core === null || core === getSection(before, 'physics')) return [];
  try {
    const report = await ctx.checkCore({ core, checks: 'var CHECKS = [];' }, spec);
    return report.hard.map((f) => 'Ядро физики после правки не проходит проверку — ' + f);
  } catch {
    return [];
  }
}

/** Какие пробы прошли до правки и провалились после — это и есть регрессия. */
export function lostProbes(before: RenderReport, after: RenderReport): string[] {
  const passed = new Set((before.probes?.results ?? []).filter((r) => r.status === 'pass').map((r) => r.id));
  return (after.probes?.results ?? [])
    .filter((r) => r.status === 'fail' && passed.has(r.id))
    .map((r) => `${r.label}: ${r.detail}`);
}

export async function refineExisting(
  ctx: Ctx, ownerId: string, id: string, instruction: string,
  opts: { signal?: () => boolean; onSaved?: (simulationId: string) => Promise<void> } = {},
): Promise<void> {
  function checkCancelled(): void {
    if (opts.signal?.()) throw new CancelledError();
  }

  const html = await getArtifact(ownerId, id);
  if (html === null) throw new Error('Симуляция не найдена');
  const spec = await getSpec(ownerId, id);
  checkCancelled();
  emitStage(ctx, 'refining', 'start');
  try {
    // Проверка «как было» идёт параллельно с моделью: с ней сравним результат правки.
    const beforeP = ctx.render(reinstrument(html), { probes: true }).catch(() => null);
    const first = await refineHtml(ctx, html, instruction, spec);
    let refined = first.html;
    // Правка тронула ядро физики — проверяем его теми же числами, что и при генерации.
    const coreErrors = await recheckCore(ctx, spec, html, refined);
    if (coreErrors.length) refined = await fixArtifact(ctx, refined, coreErrors);
    let report = await ctx.render(refined, { probes: true });
    let forbidden = findForbiddenUrls(refined, CDN_ALLOWED);
    for (let attempt = 0; (!report.ok || forbidden.length > 0) && attempt < 2; attempt++) {
      const errors = [...report.errors];
      if (forbidden.length) errors.push(`Запрещённые внешние ресурсы: ${forbidden.join(', ')}`);
      refined = await fixArtifact(ctx, refined, errors);
      report = await ctx.render(refined, { probes: true });
      forbidden = findForbiddenUrls(refined, CDN_ALLOWED);
    }
    if (!report.ok) throw new Error('Правка сломала симуляцию: ' + report.errors.join('; '));
    if (forbidden.length > 0) {
      throw new Error('Правка внесла запрещённые внешние ресурсы: ' + forbidden.join(', '));
    }
    // Защита от регрессии: то, что работало до правки, должно работать и после.
    const before = await beforeP;
    let lost = before ? lostProbes(before, report) : [];
    if (lost.length) {
      try {
        const fixed = await fixArtifact(ctx, refined,
          lost.map((f) => 'После доработки перестало работать — ' + f));
        const fixedReport = await ctx.render(fixed, { probes: true });
        const fixedLost = before ? lostProbes(before, fixedReport) : [];
        if (fixedReport.ok && findForbiddenUrls(fixed, CDN_ALLOWED).length === 0 && fixedLost.length < lost.length) {
          refined = fixed;
          report = fixedReport;
          lost = fixedLost;
        }
      } catch (e) {
        if (e instanceof CancelledError) throw e;
      }
    }
    // Последняя точка отмены: после записи артефакта отменять уже нечего.
    checkCancelled();
    await updateArtifact(ownerId, id, refined);
    if (spec) await saveSpec(ownerId, id, specWithConfig(spec, readConfig(refined)));
    await opts.onSaved?.(id);
    const shot = report.screenshots[1] ?? report.screenshots[0];
    if (shot) await saveThumbnail(ownerId, id, shot);
    // Отчёт — после записи: он рассказывает о том, что уже лежит в симуляции.
    if (first.report) {
      ctx.emit({
        type: 'note', summary: first.report.summary, changed: first.report.changed,
        skipped: first.report.skipped, next: first.report.next,
      });
    }
    if (lost.length) ctx.emit({ type: 'regression', lost });
  } finally {
    emitStage(ctx, 'refining', 'end');
  }
  ctx.emit({ type: 'done', simulationId: id });
}

/** План должен совпадать с тем, что видит ученик: подписи и диапазоны из наложения переносим в него. */
export function specWithConfig(spec: PlanSpec, config: SimConfig): PlanSpec {
  const params = config.parameters ?? {};
  const next: PlanSpec = {
    ...spec,
    title: config.title ?? spec.title,
    parameters: spec.parameters.map((p) => ({ ...p, ...(params[p.name] ?? {}) })),
  };
  if (config.presets) next.presets = config.presets;
  return next;
}
