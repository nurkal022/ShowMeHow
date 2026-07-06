import type { CandidateResult, PipelineEvent, PlanSpec } from '../types';
import type { ChatFn } from '../provider';
import { textPart, imagePart } from '../provider';
import type { RenderFn } from '../renderer';
import { extractHtml, extractJson, instrument } from '../artifact';
import { PLANNER_SYSTEM, generatorSystem, FIXER_SYSTEM, CRITIC_SYSTEM } from './prompts';

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

export async function verifyCandidate(
  ctx: Ctx, spec: PlanSpec, html: string, index: number,
): Promise<CandidateResult> {
  ctx.emit({ type: 'candidate', index, status: 'rendering' });
  let current = html;
  let report = await ctx.render(current);
  for (let attempt = 0; !report.ok && attempt < 2; attempt++) {
    ctx.emit({ type: 'candidate', index, status: 'fixing' });
    try {
      current = await fixArtifact(ctx, current, report.errors);
    } catch {
      break; // фиксер сам упал — кандидат выбывает
    }
    report = await ctx.render(current);
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
      const out = await ctx.visionChat([
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: [
          textPart('Спецификация:\n' + JSON.stringify(spec, null, 2)),
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
