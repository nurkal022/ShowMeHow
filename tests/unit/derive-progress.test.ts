import { describe, it, expect } from 'vitest';
import { deriveProgress } from '@/components/progress/deriveProgress';
import type { PipelineEvent, RubricScores } from '@/lib/types';

const SCORES: RubricScores = { physics: 8, clarity: 7, interactivity: 6, aesthetics: 9 };

describe('deriveProgress', () => {
  it('marks a stage active on start and done (with duration) on end', () => {
    const events: PipelineEvent[] = [
      { type: 'stage', stage: 'planning', status: 'start', at: 1000 },
      { type: 'stage', stage: 'planning', status: 'end', at: 4000 },
    ];
    const s = deriveProgress(events);
    const planning = s.stages.find((x) => x.stage === 'planning')!;
    expect(planning.status).toBe('done');
    expect(planning.endAt! - planning.startAt!).toBe(3000);
    // остальные этапы ещё pending, не терминально
    expect(s.stages.find((x) => x.stage === 'generating')!.status).toBe('pending');
    expect(s.terminal).toBeNull();
  });

  it('keeps a started-but-not-ended stage active while pipeline is running', () => {
    const events: PipelineEvent[] = [
      { type: 'stage', stage: 'generating', status: 'start', at: 1000 },
    ];
    const s = deriveProgress(events);
    expect(s.stages.find((x) => x.stage === 'generating')!.status).toBe('active');
  });

  it('hard-error tolerance: terminal error closes an active stage as interrupted, and marks never-started stages skipped', () => {
    const events: PipelineEvent[] = [
      { type: 'stage', stage: 'planning', status: 'start', at: 1000 },
      // 'planning' never got its 'end' (e.g. plan() threw) — pipeline reports error directly.
      { type: 'error', message: 'Провайдер недоступен' },
    ];
    const s = deriveProgress(events);
    expect(s.stages.find((x) => x.stage === 'planning')!.status).toBe('interrupted');
    expect(s.stages.find((x) => x.stage === 'generating')!.status).toBe('skipped');
    expect(s.stages.find((x) => x.stage === 'saving')!.status).toBe('skipped');
    expect(s.terminal).toEqual({ type: 'error', message: 'Провайдер недоступен' });
  });

  it('cancelled event also closes all stages (no stage stays pending forever)', () => {
    const events: PipelineEvent[] = [
      { type: 'stage', stage: 'planning', status: 'start', at: 1000 },
      { type: 'stage', stage: 'planning', status: 'end', at: 1500 },
      { type: 'stage', stage: 'generating', status: 'start', at: 1500 },
      { type: 'cancelled' },
    ];
    const s = deriveProgress(events);
    expect(s.stages.find((x) => x.stage === 'planning')!.status).toBe('done');
    expect(s.stages.find((x) => x.stage === 'generating')!.status).toBe('interrupted');
    expect(s.stages.find((x) => x.stage === 'judging')!.status).toBe('skipped');
    expect(s.terminal).toEqual({ type: 'cancelled' });
  });

  it('fast mode (no judge, no refine): judging/refining stay pending until terminal, then skipped', () => {
    const events: PipelineEvent[] = [
      { type: 'stage', stage: 'planning', status: 'start', at: 0 },
      { type: 'stage', stage: 'planning', status: 'end', at: 100 },
      { type: 'stage', stage: 'generating', status: 'start', at: 100 },
      { type: 'stage', stage: 'generating', status: 'end', at: 500 },
      { type: 'stage', stage: 'saving', status: 'start', at: 500 },
      { type: 'stage', stage: 'saving', status: 'end', at: 600 },
      { type: 'done', simulationId: 'sim1' },
    ];
    const before = deriveProgress(events.slice(0, 4)); // mid-pipeline, no terminal yet
    expect(before.stages.find((x) => x.stage === 'judging')!.status).toBe('pending');
    const after = deriveProgress(events);
    expect(after.stages.find((x) => x.stage === 'judging')!.status).toBe('skipped');
    expect(after.stages.find((x) => x.stage === 'refining')!.status).toBe('skipped');
    expect(after.terminal).toEqual({ type: 'done', simulationId: 'sim1' });
  });

  it('builds candidate map from candidate/screenshot/critic-verdict events and applies judge winner via candidateIndices', () => {
    const events: PipelineEvent[] = [
      { type: 'candidate', index: 0, status: 'generating', styleHint: 'Реализм' },
      { type: 'candidate', index: 1, status: 'generating', styleHint: 'Схема' },
      { type: 'candidate', index: 0, status: 'ok', styleHint: 'Реализм' },
      { type: 'candidate', index: 1, status: 'failed', styleHint: 'Схема' },
      { type: 'screenshot', index: 0, dataUrl: 'data:image/png;base64,abc' },
      { type: 'critic-verdict', index: 0, physicsOk: false, issues: ['слишком быстро'] },
      // только кандидат 0 дожил ("alive"); судья видит один вариант, но original index 0.
      {
        type: 'judge-verdict', scores: [SCORES], candidateIndices: [0],
        winnerIndex: 0, feedback: 'улучшить контраст',
      },
    ];
    const s = deriveProgress(events);
    expect(s.candidates).toHaveLength(2);
    const c0 = s.candidates.find((c) => c.index === 0)!;
    const c1 = s.candidates.find((c) => c.index === 1)!;
    expect(c0.status).toBe('ok');
    expect(c0.styleHint).toBe('Реализм');
    expect(c0.screenshot).toBe('data:image/png;base64,abc');
    expect(c0.critic).toEqual({ physicsOk: false, issues: ['слишком быстро'] });
    expect(c0.scores).toEqual(SCORES);
    expect(c0.isWinner).toBe(true);
    expect(c1.status).toBe('failed');
    expect(c1.isWinner).toBe(false);
    expect(s.judgeFeedback).toBe('улучшить контраст');
  });

  it('collects refine rounds with before/after (after=null when a round is interrupted)', () => {
    const events: PipelineEvent[] = [
      { type: 'refine-round', round: 1, before: SCORES, after: { ...SCORES, physics: 9 } },
      { type: 'refine-round', round: 2, before: { ...SCORES, physics: 9 }, after: null },
    ];
    const s = deriveProgress(events);
    expect(s.refineRounds).toHaveLength(2);
    expect(s.refineRounds[1].after).toBeNull();
  });

  it('collects plan-ready and warning events', () => {
    const plan = {
      title: 'Маятник', subject: 'Физика', mode: '2d' as const, physics: 'F=ma',
      parameters: [{ label: 'Длина', unit: 'м' }], goals: ['понять период'],
    };
    const events: PipelineEvent[] = [
      { type: 'plan-ready', spec: plan },
      { type: 'warning', message: 'Vision-модель не настроена' },
    ];
    const s = deriveProgress(events);
    expect(s.plan).toEqual(plan);
    expect(s.warnings).toEqual(['Vision-модель не настроена']);
  });

  it('returns no terminal state and empty derived data for an empty event list', () => {
    const s = deriveProgress([]);
    expect(s.terminal).toBeNull();
    expect(s.plan).toBeNull();
    expect(s.candidates).toEqual([]);
    expect(s.stages.every((st) => st.status === 'pending')).toBe(true);
  });
});
