import { describe, expect, it } from 'vitest';
import { codeTicker, type Ctx } from '@/lib/pipeline/stages';
import { currentActivity } from '@/components/workbench/LiveStage';
import type { PipelineEvent } from '@/lib/types';
import { saveDraft, getDraft, listDrafts } from '@/lib/jobs/drafts';

describe('живая генерация', () => {
  it('лента кода шлёт событие не чаще раза в две секунды и несёт хвост', () => {
    const events: PipelineEvent[] = [];
    const ctx = { emit: (e: PipelineEvent) => events.push(e) } as unknown as Ctx;
    const tick = codeTicker(ctx, 'generator');
    tick('<html>');
    tick('<body>');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'gen-progress', role: 'generator', chars: 6 });
  });
  it('активность берётся из последнего значимого события', () => {
    expect(currentActivity([])).toBe('Начинаю');
    expect(currentActivity([{ type: 'stage', stage: 'generating', status: 'start', at: 1 }])).toBe('Пишу код симуляции');
    expect(currentActivity([
      { type: 'stage', stage: 'generating', status: 'start', at: 1 }, { type: 'draft', version: 1, label: 'x' },
      { type: 'candidate', index: 0, status: 'critiquing' },
    ])).toBe('Проверяю физику и наглядность');
  });
  it('черновики без базы нумеруются с единицы и читаются обратно', async () => {
    const job = `job-${Math.random()}`;
    expect(await saveDraft(job, 'Первая версия', '<html>1</html>')).toBe(1);
    expect(await saveDraft(job, 'После проверки', '<html>2</html>')).toBe(2);
    expect((await getDraft(job, 2))?.html).toBe('<html>2</html>');
    expect(await getDraft(job, 3)).toBeNull();
    expect((await listDrafts(job)).map((d) => d.label)).toEqual(['Первая версия', 'После проверки']);
  });
});
