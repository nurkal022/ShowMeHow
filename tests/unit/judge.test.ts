import { describe, it, expect, vi } from 'vitest';
import { judge, rescore } from '@/lib/pipeline/judge';
import type { Ctx } from '@/lib/pipeline/stages';
import type { CandidateResult, PlanSpec } from '@/lib/types';

const SPEC = { title: 't', subject: 's', mode: '2d', learningGoals: [], physics: 'p',
  parameters: [], visualPlan: 'v' } as PlanSpec;

function cand(): CandidateResult {
  return { html: '<html/>', alive: true, critic: { physicsOk: true, issues: ['мелочь'] },
    render: { ok: true, errors: [], animated: true, screenshots: [Buffer.from('x')] } };
}
const verdict = { winnerIndex: 1,
  scores: [{ physics: 7, clarity: 7, interactivity: 7, aesthetics: 7 },
           { physics: 9, clarity: 9, interactivity: 8, aesthetics: 9 }],
  feedback: 'добавь график' };

function ctx(visionChat: Ctx['visionChat']): Ctx {
  return { genChat: vi.fn(), visionChat, render: vi.fn(), emit: vi.fn() };
}

describe('judge', () => {
  it('parses verdict from vision model', async () => {
    const c = ctx(vi.fn(async () => JSON.stringify(verdict)));
    const v = await judge(c, SPEC, [cand(), cand()]);
    expect(v.winnerIndex).toBe(1);
    expect(v.scores).toHaveLength(2);
  });

  it('degrades without vision: winner 0, zero scores', async () => {
    const v = await judge(ctx(null), SPEC, [cand(), cand()]);
    expect(v.winnerIndex).toBe(0);
    expect(v.scores[0].physics).toBe(0);
  });
});

describe('rescore', () => {
  it('returns single score set', async () => {
    const c = ctx(vi.fn(async () =>
      JSON.stringify({ winnerIndex: 0, scores: [verdict.scores[1]], feedback: 'ок' })));
    const r = await rescore(c, SPEC, cand());
    expect(r.scores.physics).toBe(9);
    expect(r.feedback).toBe('ок');
  });
});
