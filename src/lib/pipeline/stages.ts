import type { CandidateResult, CriticIssue, PipelineEvent, PlanSpec, RenderReport, Role } from '../types';
import type { ChatMessage } from '../provider';
import { textPart, imagePart } from '../provider';
import type { RenderFn } from '../renderer';
import { extractHtml, extractJson, findForbiddenUrls, instrument, stripRuntime } from '../artifact';
import {
  PLANNER_SYSTEM, generatorSystem, FIXER_SYSTEM, CRITIC_SYSTEM, REFINER_SYSTEM, CDN_WHITELIST,
} from './prompts';

export interface Ctx {
  /** Один вход в модель для всех ролей: конфиг роли резолвится в provider-слое. */
  chat: (role: Role, messages: ChatMessage[]) => Promise<string>;
  /** Доступна ли vision-модель (критик и судья). */
  hasVision: boolean;
  render: RenderFn;
  emit: (e: PipelineEvent) => void;
}

export async function plan(ctx: Ctx, prompt: string, imageDataUrl?: string): Promise<PlanSpec> {
  const content = imageDataUrl
    ? [textPart(prompt), imagePart(imageDataUrl)]
    : prompt;
  const out = await ctx.chat('planner', [
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content },
  ]);
  return extractJson<PlanSpec>(out);
}

export async function generateCandidate(
  ctx: Ctx, spec: PlanSpec, styleHint: string, exemplar?: string,
): Promise<string> {
  const out = await ctx.chat('generator', [
    { role: 'system', content: generatorSystem(styleHint, exemplar) },
    { role: 'user', content: 'Спецификация:\n' + JSON.stringify(spec, null, 2) },
  ]);
  return instrument(extractHtml(out));
}

export async function fixArtifact(ctx: Ctx, html: string, errors: string[]): Promise<string> {
  const out = await ctx.chat('fixer', [
    { role: 'system', content: FIXER_SYSTEM },
    { role: 'user', content: `Ошибки:\n${errors.join('\n')}\n\nHTML:\n\`\`\`html\n${html}\n\`\`\`` },
  ]);
  return instrument(extractHtml(out));
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

export async function verifyCandidate(
  ctx: Ctx, spec: PlanSpec, html: string, index: number, styleName: string,
): Promise<CandidateResult> {
  ctx.emit({ type: 'candidate', index, status: 'rendering', styleHint: styleName });
  let current = html;
  let report = await ctx.render(current, { probes: true });
  // best-so-far: если попытки починки только ухудшают результат, в конце возвращаем лучшую
  // из виденных версий, а не последнюю сломанную.
  let best: Ranked = { html: current, report };
  for (let attempt = 0; attempt < 2; attempt++) {
    const forbidden = findForbiddenUrls(current, CDN_ALLOWED);
    const probeFailed = (report.probes?.failures.length ?? 0) > 0;
    if (report.ok && report.animated && forbidden.length === 0 && !probeFailed) break;
    ctx.emit({ type: 'candidate', index, status: 'fixing', styleHint: styleName });
    const errors = [...report.errors];
    if (report.ok && !report.animated) errors.push(STATIC_ANIMATION_ERROR);
    if (forbidden.length) errors.push(`Запрещённые внешние ресурсы: ${forbidden.join(', ')}`);
    for (const f of report.probes?.failures ?? []) errors.push('Проба не пройдена — ' + f);
    try {
      current = await fixArtifact(ctx, current, errors);
    } catch {
      break; // фиксер сам упал — используем лучшее из уже отрендеренного
    }
    report = await ctx.render(current, { probes: true });
    if (rank(current, report) > rank(best.html, best.report)) best = { html: current, report };
  }
  if (rank(current, report) < rank(best.html, best.report)) {
    current = best.html;
    report = best.report;
  }
  // Заражённый запрещёнными URL финалист не может уйти в библиотеку, даже если рендер прошёл.
  if (!report.ok || findForbiddenUrls(current, CDN_ALLOWED).length > 0) {
    ctx.emit({ type: 'candidate', index, status: 'failed', styleHint: styleName });
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
    ctx.emit({ type: 'candidate', index, status: 'critiquing', styleHint: styleName });
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
      const out = await ctx.chat('refiner', [
        { role: 'system', content: REFINER_SYSTEM },
        { role: 'user', content: `${instruction}\n\nHTML:\n\`\`\`html\n${stripRuntime(current)}\n\`\`\`` },
      ]);
      const fixed = instrument(extractHtml(out));
      const fixedReport = await ctx.render(fixed, { probes: true });
      if (rank(fixed, fixedReport) >= rank(current, report)) {
        current = fixed;
        report = fixedReport;
      }
    } catch {
      // Целевая починка — попытка улучшить, а не обязательный этап:
      // её провал не должен убивать живого кандидата.
    }
  }
  ctx.emit({ type: 'candidate', index, status: 'ok', styleHint: styleName });
  return { html: current, render: report, critic, alive: true };
}
