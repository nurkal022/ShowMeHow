'use client';
import { useEffect, useRef, useState } from 'react';
import type { Column, QueryResult, Row } from '@/lib/org/datasets';
import { callApi } from '@/components/cabinet/api';
import { IconDownload, IconSend, IconSpark, IconTrash } from '@/components/icons';

interface Answer { id: number; question: string; result: QueryResult; insight: { answer: string; points: string[] } }

const SUGGESTIONS = [
  'Какие классы отстают сильнее всего?',
  'Топ-5 учеников с высоким риском и причины',
  'Сравни учителей по скорости проверки',
  'Средний балл по предметам',
  'Какие задания даются труднее всего?',
  'Как менялась активность за последний месяц?',
  'Сколько учеников с высоким риском в каждом классе?',
  'У кого из учителей больше всего непроверенных работ?',
];
const HISTORY_KEY = 'tesseract.org.ask.history';
let seq = 0;

function cell(v: Row[string], c: Column): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v !== 'number') {
    if (c.type === 'date') return new Date(`${v}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return String(v);
  }
  const n = v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return c.type === 'percent' ? `${n}%` : c.type === 'hours' ? `${n} ч` : c.type === 'days' ? `${n} дн.` : n;
}

function toCsv(r: QueryResult): string {
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = r.columns.map((c) => esc(c.label)).join(';');
  const body = r.rows.map((row) => r.columns.map((c) => esc(row[c.key] === null ? '' : String(row[c.key]))).join(';'));
  return `﻿${[head, ...body].join('\n')}`;
}

/** Вопросы директора: ответы копятся лентой сверху вниз, свежий — первым. */
export default function AskBoard({ slug }: { slug: string }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); if (Array.isArray(h)) setRecent(h.filter((x) => typeof x === 'string').slice(0, 6)); } catch { /* приватный режим */ }
  }, []);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(text);
    setError('');
    const res = await callApi<{ result: QueryResult; insight: Answer['insight'] }>(`/api/org/${slug}/insights`, 'POST', { action: 'ask', question: text });
    setBusy('');
    if (!res.ok) return setError(res.error);
    setAnswers((a) => [{ id: ++seq, question: text, ...res.data }, ...a]);
    setQuestion('');
    const next = [text, ...recent.filter((x) => x !== text)].slice(0, 6);
    setRecent(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* не беда */ }
  }

  return (
    <div className="ask">
      <form className="ask-box" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
        <span className="ask-orb" aria-hidden="true"><IconSpark size={20} /></span>
        <textarea ref={input} rows={1} value={question} maxLength={500} placeholder="Например: какие классы отстают по физике и почему?"
          aria-label="Вопрос" onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(question); } }} />
        <button type="submit" className="btn btn-primary" disabled={!question.trim() || !!busy}><IconSend size={16} />Спросить</button>
      </form>
      <div className="ask-chips">
        {(recent.length ? [...recent, ...SUGGESTIONS.filter((s) => !recent.includes(s))] : SUGGESTIONS).slice(0, 8).map((s) => (
          <button key={s} type="button" className="chip" disabled={!!busy} onClick={() => { setQuestion(s); void ask(s); }}>{s}</button>
        ))}
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      {busy && (
        <div className="ask-card ask-pending" role="status">
          <p className="ask-q">{busy}</p>
          <div className="advice-loading"><span className="ai-busy-orb" aria-hidden="true"><i /><i /><i /></span>Помощник выбирает данные, считает и формулирует ответ…</div>
          <div className="skeleton ask-skeleton" />
        </div>
      )}
      {answers.length === 0 && !busy && (
        <div className="ask-empty">
          <span className="ask-empty-orb" aria-hidden="true"><IconSpark size={28} /></span>
          <h2>Спросите про школу обычными словами</h2>
          <p className="muted">Помощник выберет нужные данные — ученики, классы, учителя, курсы, задания или динамика по дням, — посчитает
            и покажет ответ таблицей и графиком. Цифры считает сервер: модель их не придумывает.</p>
        </div>
      )}
      {answers.map((a) => <AnswerCard key={a.id} a={a} onRemove={() => setAnswers((x) => x.filter((y) => y.id !== a.id))} />)}
    </div>
  );
}

function AnswerCard({ a, onRemove }: { a: Answer; onRemove: () => void }) {
  const { result } = a;
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const rows = sort ? [...result.rows].sort((x, y) => {
    const p = x[sort.key];
    const q = y[sort.key];
    if (p === null) return 1;
    if (q === null) return -1;
    return (typeof p === 'number' && typeof q === 'number' ? p - q : String(p).localeCompare(String(q), 'ru', { numeric: true })) * sort.dir;
  }) : result.rows;
  function download() {
    const blob = new Blob([toCsv(result)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.plan.title || 'отчёт'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <article className="ask-card">
      <header className="ask-card-head">
        <p className="ask-q">{a.question}</p>
        <button type="button" className="cab-icon-btn" aria-label="Убрать ответ" onClick={onRemove}><IconTrash size={16} /></button>
      </header>
      <div className="ask-answer">
        <span className="ask-answer-icon" aria-hidden="true"><IconSpark size={16} /></span>
        <div>
          <p>{a.insight.answer}</p>
          {a.insight.points.length > 0 && <ul>{a.insight.points.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      </div>
      {result.plan.chart.type !== 'none' && result.rows.length > 1 && <Chart result={result} />}
      <div className="ask-table-head">
        <b>{result.plan.title}</b>
        <span className="muted">{result.total > result.rows.length ? `показано ${result.rows.length} из ${result.total}` : `${result.total} строк`}</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={download}><IconDownload size={15} />CSV для Excel</button>
      </div>
      {result.rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table ask-table">
            <thead><tr>{result.columns.map((c) => (
              <th key={c.key} className={c.type === 'text' ? '' : 'center'}>
                <button type="button" className={sort?.key === c.key ? 'th-sort active' : 'th-sort'}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.type === 'text' ? 1 : -1 }))}>{c.label}</button>
              </th>
            ))}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{result.columns.map((c) => (
                  <td key={c.key} data-label={c.label} className={c.type === 'text' ? '' : 'center num'}>
                    {c.type === 'percent' && typeof r[c.key] === 'number'
                      ? <span className="inline-meter"><span className="meter"><i style={{ width: `${Math.max(0, Math.min(100, r[c.key] as number))}%` }} /></span><span className="num">{cell(r[c.key], c)}</span></span>
                      : cell(r[c.key], c)}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="ask-plan">
        <summary>Как считали</summary>
        <p className="muted">Набор «{result.plan.dataset}»{result.plan.filters.length ? `, условия: ${result.plan.filters.map((f) => `${f.column} ${f.op} ${f.value}`).join(', ')}` : ''}
          {result.plan.groupBy ? `, группировка по ${result.plan.groupBy.column}` : ''}{result.plan.sort ? `, сортировка ${result.plan.sort.column} ${result.plan.sort.dir === 'asc' ? '↑' : '↓'}` : ''}.</p>
      </details>
    </article>
  );
}

const COLORS = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-2)'];

function Chart({ result }: { result: QueryResult }) {
  const { chart } = result.plan;
  const xCol = result.columns.find((c) => c.key === chart.x) ?? { key: chart.x, label: chart.x, type: 'text' as const };
  const ys = chart.y.map((k) => result.columns.find((c) => c.key === k)).filter((c): c is Column => !!c);
  const rows = result.rows.slice(0, chart.type === 'bar' ? 20 : 120);
  const max = Math.max(1, ...rows.flatMap((r) => ys.map((y) => (typeof r[y.key] === 'number' ? r[y.key] as number : 0))));
  if (!ys.length) return null;
  const legend = ys.length > 1 && (
    <ul className="chart-legend ask-legend">{ys.map((y, i) => <li key={y.key}><i style={{ background: COLORS[i] }} />{y.label}</li>)}</ul>
  );
  if (chart.type === 'bar') {
    return (
      <div className="ask-chart">
        {legend}
        <ul className="hbars">
          {rows.map((r, i) => (
            <li key={i} style={{ ['--i' as string]: i }}>
              <span className="hbar-label">{cell(r[xCol.key], xCol)}</span>
              <span className="hbar-tracks">
                {ys.map((y, j) => {
                  const v = typeof r[y.key] === 'number' ? r[y.key] as number : 0;
                  return (
                    <span key={y.key} className="hbar-track">
                      <i style={{ width: `${(v / max) * 100}%`, background: COLORS[j] }} />
                      <b>{cell(r[y.key], y)}</b>
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const W = 640;
  const H = 180;
  const step = rows.length > 1 ? W / (rows.length - 1) : W;
  return (
    <div className="ask-chart">
      {legend}
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="ask-line" role="img" aria-label={result.plan.title}>
        {[0.25, 0.5, 0.75, 1].map((k) => <line key={k} x1={0} x2={W} y1={H - H * k} y2={H - H * k} className="chart-grid" />)}
        {ys.map((y, j) => {
          const pts = rows.map((r, i) => `${i * step},${H - ((typeof r[y.key] === 'number' ? r[y.key] as number : 0) / max) * (H - 8)}`);
          return (
            <g key={y.key}>
              <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={COLORS[j]} opacity={0.1} className="chart-area-in" />
              <polyline points={pts.join(' ')} fill="none" stroke={COLORS[j]} strokeWidth={2.2} strokeLinejoin="round" pathLength={1} className="chart-line-draw" />
            </g>
          );
        })}
        {rows.map((r, i) => (i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1) && (
          <text key={i} x={Math.min(W - 30, Math.max(0, i * step - 16))} y={H + 18} className="chart-tick">{cell(r[xCol.key], xCol)}</text>
        ))}
      </svg>
    </div>
  );
}
