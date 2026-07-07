import fs from 'node:fs';
import path from 'node:path';
import prompts from './prompts.json';
import { aggregate, type EvalRow } from './score';
import { makeCtx, runPipeline } from '../src/lib/pipeline/run';
import { rescore } from '../src/lib/pipeline/judge';
import { plan } from '../src/lib/pipeline/stages';
import { getArtifact } from '../src/lib/storage';
import { renderArtifact, closeBrowser } from '../src/lib/renderer';
import type { RubricScores } from '../src/lib/types';

async function evalOne(prompt: string): Promise<EvalRow> {
  try {
    const ctx = makeCtx(() => {});
    const meta = await runPipeline(ctx, { prompt, mode: 'max' });
    // финальная независимая оценка сохранённого артефакта
    const spec = await plan(ctx, prompt);
    const render = await renderArtifact(getArtifact(meta.id));
    const { scores } = await rescore(ctx, spec,
      { html: getArtifact(meta.id), render, critic: null, alive: render.ok });
    return { prompt, scores };
  } catch (e) {
    return { prompt, scores: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function fmt(s: RubricScores): string {
  return `физика ${s.physics.toFixed(1)}, наглядность ${s.clarity.toFixed(1)}, ` +
    `интерактив ${s.interactivity.toFixed(1)}, эстетика ${s.aesthetics.toFixed(1)}`;
}

const rows: EvalRow[] = [];
for (const p of prompts) {
  console.log('▶', p);
  rows.push(await evalOne(p));
}
await closeBrowser();

const agg = aggregate(rows);
const today = new Date().toISOString().slice(0, 10);
const lines = [
  `# Eval ${today}`,
  '',
  `Средние: ${fmt(agg.avg)}`,
  `Порог пройден (все ≥ 8): ${(agg.passRate * 100).toFixed(0)}%`,
  '',
  ...rows.map((r) => `- ${r.scores ? '✅' : '❌'} ${r.prompt}` +
    (r.scores ? ` — ${fmt(r.scores)}` : ` — ${r.error}`)),
];
const out = path.join('evals', 'results', `${today}.md`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n'));
console.log('Отчёт:', out);
