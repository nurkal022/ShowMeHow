import type { CandidateResult, PipelineEvent, PlanSpec, RenderReport } from '../types';
import type { ChatFn } from '../provider';
import { textPart, imagePart } from '../provider';
import type { RenderFn } from '../renderer';
import { extractHtml, extractJson, findForbiddenUrls, instrument } from '../artifact';
import { PLANNER_SYSTEM, generatorSystem, FIXER_SYSTEM, CRITIC_SYSTEM, CDN_WHITELIST } from './prompts';

export interface Ctx {
  genChat: ChatFn;
  visionChat: ChatFn | null;
  render: RenderFn;
  emit: (e: PipelineEvent) => void;
}

export async function plan(ctx: Ctx, prompt: string, imageDataUrl?: string): Promise<PlanSpec> {
  const content = imageDataUrl
    ? [textPart(prompt), imagePart(imageDataUrl)]
    : prompt;
  const out = await ctx.genChat([
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content },
  ]);
  return extractJson<PlanSpec>(out);
}

export async function generateCandidate(ctx: Ctx, spec: PlanSpec, styleHint: string): Promise<string> {
  const out = await ctx.genChat([
    { role: 'system', content: generatorSystem(styleHint) },
    { role: 'user', content: 'Спецификация:\n' + JSON.stringify(spec, null, 2) },
  ]);
  return instrument(extractHtml(out));
}

export async function fixArtifact(ctx: Ctx, html: string, errors: string[]): Promise<string> {
  const out = await ctx.genChat([
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

/** Ранг качества рендера: сломан(0) < ok+статика(1) < ok+анимация(2). */
function rank(report: RenderReport): 0 | 1 | 2 {
  if (!report.ok) return 0;
  return report.animated ? 2 : 1;
}

interface Ranked { html: string; report: RenderReport }

export async function verifyCandidate(
  ctx: Ctx, spec: PlanSpec, html: string, index: number,
): Promise<CandidateResult> {
  ctx.emit({ type: 'candidate', index, status: 'rendering' });
  let current = html;
  let report = await ctx.render(current);
  // best-so-far: если попытки починки только ухудшают результат, в конце возвращаем лучшую
  // из виденных версий, а не последнюю сломанную.
  let best: Ranked = { html: current, report };
  for (let attempt = 0; attempt < 2; attempt++) {
    const forbidden = findForbiddenUrls(current, CDN_ALLOWED);
    if (report.ok && report.animated && forbidden.length === 0) break;
    ctx.emit({ type: 'candidate', index, status: 'fixing' });
    const errors = [...report.errors];
    if (report.ok && !report.animated) errors.push(STATIC_ANIMATION_ERROR);
    if (forbidden.length) errors.push(`Запрещённые внешние ресурсы: ${forbidden.join(', ')}`);
    try {
      current = await fixArtifact(ctx, current, errors);
    } catch {
      break; // фиксер сам упал — используем лучшее из уже отрендеренного
    }
    report = await ctx.render(current);
    if (rank(report) > rank(best.report)) best = { html: current, report };
  }
  if (rank(report) < rank(best.report)) {
    current = best.html;
    report = best.report;
  }
  if (!report.ok) {
    ctx.emit({ type: 'candidate', index, status: 'failed' });
    return { html: current, render: report, critic: null, alive: false };
  }
  if (report.screenshots[0]) {
    ctx.emit({ type: 'screenshot', index, dataUrl: toDataUrl(report.screenshots[0]) });
  }
  let critic = null;
  if (ctx.visionChat) {
    ctx.emit({ type: 'candidate', index, status: 'critiquing' });
    try {
      const animationNote = report.animated
        ? ''
        : `\n\nВНИМАНИЕ: ${STATIC_ANIMATION_ERROR.toLowerCase()} даже после попыток починки.`;
      const out = await ctx.visionChat([
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: [
          textPart('Спецификация:\n' + JSON.stringify(spec, null, 2) + animationNote),
          ...report.screenshots.map((s) => imagePart(toDataUrl(s))),
        ] },
      ]);
      critic = extractJson<{ physicsOk: boolean; issues: string[] }>(out);
    } catch {
      critic = null; // критик упал — не валим кандидата
    }
  }
  ctx.emit({ type: 'candidate', index, status: 'ok' });
  return { html: current, render: report, critic, alive: true };
}
