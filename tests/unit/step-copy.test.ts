import { describe, it, expect } from 'vitest';
import { stageCopy, candidateCopy, refineCopy, queuedCopy, STAGE_TITLES } from '@/components/progress/stepCopy';
import type { PipelineStage } from '@/lib/types';
import type { CandidateStatus } from '@/components/progress/deriveProgress';

const STAGES: PipelineStage[] = ['planning', 'generating', 'critiquing', 'judging', 'refining', 'saving'];
const STATUSES: CandidateStatus[] = ['generating', 'rendering', 'fixing', 'critiquing', 'ok', 'failed'];

describe('stageCopy', () => {
  it('returns a non-empty string for every stage', () => {
    for (const s of STAGES) expect(stageCopy(s).trim().length).toBeGreaterThan(0);
  });
  it('planning copy mentions the model / plan', () => {
    expect(stageCopy('planning').toLowerCase()).toContain('модел');
  });
});

describe('candidateCopy', () => {
  it('returns a non-empty string for every status', () => {
    for (const s of STATUSES) expect(candidateCopy(s).trim().length).toBeGreaterThan(0);
  });
  it('failed status explains the candidate dropped out', () => {
    expect(candidateCopy('failed').toLowerCase()).toContain('не удалось');
  });
});

describe('refineCopy', () => {
  it('is non-empty and includes the round number', () => {
    const copy = refineCopy(2);
    expect(copy.trim().length).toBeGreaterThan(0);
    expect(copy).toContain('2');
  });
});

describe('STAGE_TITLES', () => {
  it('has a non-empty title for every stage', () => {
    for (const s of STAGES) expect(STAGE_TITLES[s].trim().length).toBeGreaterThan(0);
  });
});

describe('queuedCopy', () => {
  it('очередь описывается местом в ней', () => {
    expect(queuedCopy(1)).toContain('перед вами');
    expect(queuedCopy(1)).toContain('1');
  });
});
