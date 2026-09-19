'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PipelineEvent, PlanSummary } from '@/lib/types';
import PreviewFrame from '@/components/PreviewFrame';
import Markup from '@/components/lms/Markup';
import { IconCheck } from '@/components/icons';

interface DraftRef { version: number; label: string }

const STAGE_TEXT: Record<string, string> = {
  planning: 'Продумываю, что и как показать',
  generating: 'Пишу код симуляции',
  judging: 'Оцениваю результат со стороны',
  refining: 'Довожу по замечаниям',
  saving: 'Сохраняю',
};
const CANDIDATE_TEXT: Record<string, string> = {
  rendering: 'Запускаю и смотрю, что получилось', fixing: 'Чиню найденные ошибки',
  critiquing: 'Проверяю физику и наглядность', ok: 'Проверка пройдена',
};

/** Что сейчас происходит — одной фразой, по журналу задания. */
export function currentActivity(events: PipelineEvent[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type === 'queued') return `В очереди: ${e.position}`;
    if (e.type === 'candidate' && CANDIDATE_TEXT[e.status]) return CANDIDATE_TEXT[e.status];
    if (e.type === 'targeted-fix') return 'Исправляю конкретные замечания';
    if (e.type === 'stage' && e.status === 'start') return STAGE_TEXT[e.stage] ?? 'Работаю';
  }
  return 'Начинаю';
}

/**
 * Рабочая область во время генерации. Пустой она не бывает: сначала — чертёж будущей
 * симуляции из плана и живая лента кода, затем — первая версия, с которой можно работать,
 * пока идёт проверка и полировка. Новые версии подменяют её сами; любую можно оставить.
 */
export default function LiveStage({ events, jobId, onKeep, keeping }: {
  events: PipelineEvent[]; jobId: string | null; onKeep: (version: number) => void; keeping: boolean;
}) {
  const plan = useMemo(() => {
    const e = events.find((x) => x.type === 'plan-ready');
    return e && e.type === 'plan-ready' ? e.spec : null;
  }, [events]);
  const drafts = useMemo(
    () => events.flatMap((e): DraftRef[] => (e.type === 'draft' ? [{ version: e.version, label: e.label }] : [])), [events]);
  const progress = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) { const e = events[i]; if (e.type === 'gen-progress') return e; }
    return null;
  }, [events]);
  const usable = drafts.filter((d) => !broken.has(d.version));
  const latest = usable[usable.length - 1]?.version ?? null;
  const [pinned, setPinned] = useState<number | null>(null);
  const [html, setHtml] = useState<Record<number, string>>({});
  const [flash, setFlash] = useState(false);
  // Версии, упавшие уже в браузере человека: их не показываем, остаёмся на прошлой рабочей.
  const [broken, setBroken] = useState<ReadonlySet<number>>(new Set());
  const wanted = pinned ?? latest;
  // Пока новая версия грузится, на экране остаётся прежняя — без мигания пустотой.
  const shown = wanted !== null && html[wanted] ? wanted
    : [...usable].reverse().find((d) => html[d.version])?.version ?? null;
  const activity = currentActivity(events);

  useEffect(() => {
    if (!jobId || wanted === null || html[wanted]) return;
    let alive = true;
    fetch(`/api/jobs/${jobId}/drafts/${wanted}`).then(async (res) => {
      if (!alive || !res.ok) return;
      const body = await res.json() as { html: string };
      setHtml((prev) => ({ ...prev, [wanted]: body.html }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [jobId, wanted, html]);

  // Пришла новая версия — короткая вспышка, чтобы подмена не выглядела сбоем.
  useEffect(() => {
    if (latest === null || latest === 1) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(t);
  }, [latest]);

  if (shown !== null) {
    const current = drafts.find((d) => d.version === shown);
    return (
      <div className="live live-draft">
        <div className={flash ? 'live-bar flash' : 'live-bar'}>
          <span className="live-pulse" aria-hidden="true" />
          <div className="live-bar-text">
            <strong>{`Версия ${shown} · ${current?.label ?? ''}`}{broken.size > 0 && <em className="live-note">{' · версия с ошибкой скрыта'}</em>}</strong>
            <span>{pinned !== null && pinned !== latest
              ? `Есть версия новее (v${latest}) — вы смотрите закреплённую`
              : `${activity}… — с симуляцией уже можно работать`}</span>
          </div>
          {usable.length > 1 && (
            <div className="live-versions" role="group" aria-label="Версии">
              {usable.map((d) => (
                <button key={d.version} type="button" title={d.label} aria-pressed={d.version === shown}
                  className={d.version === shown ? 'on' : undefined}
                  onClick={() => setPinned(d.version === latest ? null : d.version)}>{`v${d.version}`}</button>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-sm btn-primary" disabled={keeping} onClick={() => onKeep(shown)}
            title="Остановить полировку и сохранить эту версию в библиотеку">
            <IconCheck size={15} />{keeping ? 'Сохраняю…' : 'Оставить эту версию'}
          </button>
        </div>
        <PreviewFrame html={html[shown]} key={shown} onSimError={() => {
          // Упала — отмечаем и откатываемся; если откатываться некуда, показываем как есть.
          if (usable.length > 1) { setBroken((b) => new Set(b).add(shown)); setPinned(null); }
        }} />
      </div>
    );
  }

  return (
    <div className="live live-blueprint">
      <div className="live-grid" aria-hidden="true" />
      <div className="live-center">
        <div className="live-status"><span className="live-pulse" aria-hidden="true" /><span>{activity}…</span></div>
        {plan ? <Blueprint plan={plan} /> : <Thinking />}
        {progress && <CodeTicker chars={progress.chars} tail={progress.tail} />}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="live-thinking">
      <div className="live-orbit" aria-hidden="true"><i /><i /><i /></div>
      <p>Разбираю запрос: какое явление, какие величины менять, что измерять.</p>
      <p className="muted">Первая рабочая версия появится здесь же — с ней можно будет работать, не дожидаясь конца.</p>
    </div>
  );
}

/** Чертёж из плана: название, суть, параметры будущих ползунков и цели. Появляется по частям. */
function Blueprint({ plan }: { plan: PlanSummary }) {
  return (
    <div className="live-plan">
      <span className="live-eyebrow">{`${plan.subject} · ${plan.mode === '3d' ? '3D' : '2D'}`}</span>
      <h2>{plan.title}</h2>
      <div className="live-physics"><Markup text={plan.physics} /></div>
      {plan.parameters.length > 0 && (
        <div className="live-sliders">
          {plan.parameters.slice(0, 6).map((p, i) => (
            <div key={p.label} className="live-slider"
              style={{ ['--d' as string]: `${i * 120}ms`, ['--w' as string]: `${30 + ((i * 37) % 55)}%` }}>
              <span>{p.label}{p.unit && <small>{`, ${p.unit}`}</small>}</span>
              <i />
            </div>
          ))}
        </div>
      )}
      {plan.goals.length > 0 && (
        <ul className="live-goals">
          {plan.goals.slice(0, 3).map((g, i) => <li key={g} style={{ ['--d' as string]: `${600 + i * 150}ms` }}>{g}</li>)}
        </ul>
      )}
    </div>
  );
}

function CodeTicker({ chars, tail }: { chars: number; tail: string }) {
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [tail]);
  const lines = tail.split('\n').slice(-9).join('\n');
  return (
    <div className="live-code">
      <div className="live-code-head"><span>пишется код</span><span>{`${(chars / 1000).toFixed(1).replace('.', ',')} тыс. символов`}</span></div>
      <pre ref={box}>{lines}<span className="live-caret" /></pre>
    </div>
  );
}
