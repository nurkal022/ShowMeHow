'use client';
import type { PipelineEvent } from '@/lib/types';

const STAGE_LABELS: Record<string, string> = {
  planning: '📋 Составляю план симуляции',
  generating: '⚙️ Генерирую кандидатов',
  judging: '⚖️ Судья сравнивает кандидатов',
  refining: '✨ Довожу до порога качества',
  saving: '💾 Сохраняю',
};
const CAND_LABELS: Record<string, string> = {
  generating: 'генерация', rendering: 'проверка рендера', fixing: 'автопочинка',
  critiquing: 'физик-критик', ok: '✓ готов', failed: '✗ выбыл',
};

export default function ProgressFeed({ events }: { events: PipelineEvent[] }) {
  const shots = new Map<number, string>();
  const candStatus = new Map<number, string>();
  const lines: string[] = [];
  let scores: string | null = null;
  for (const e of events) {
    if (e.type === 'stage') lines.push(STAGE_LABELS[e.stage] ?? e.stage);
    if (e.type === 'candidate') candStatus.set(e.index, CAND_LABELS[e.status]);
    if (e.type === 'screenshot') shots.set(e.index, e.dataUrl);
    if (e.type === 'warning') lines.push('⚠️ ' + e.message);
    if (e.type === 'scores')
      scores = e.scores.map((s, i) =>
        `К${i}: физика ${s.physics} / наглядность ${s.clarity} / ` +
        `интерактив ${s.interactivity} / эстетика ${s.aesthetics}`).join('\n');
  }
  return (
    <div className="progress-feed">
      {lines.map((l, i) => <div key={i} className="progress-line">{l}</div>)}
      <div className="progress-cands">
        {[...candStatus.entries()].map(([i, st]) => (
          <div key={i} className="cand-chip">
            Кандидат {i + 1}: {st}
            {shots.has(i) && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL screenshot, next/image doesn't support it
              <img src={shots.get(i)} alt="" className="cand-shot" />
            )}
          </div>
        ))}
      </div>
      {scores && <pre className="progress-scores">{scores}</pre>}
    </div>
  );
}
