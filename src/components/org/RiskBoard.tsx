'use client';
import { useCallback, useEffect, useState } from 'react';
import type { RiskAdvice } from '@/lib/org/ai';
import type { RiskLevel, StudentRisk } from '@/lib/org/reports';
import { callApi } from '@/components/cabinet/api';
import { formatAgo } from '@/lib/lms/format';
import { Avatar } from '@/components/cabinet/viz';
import Layer from '@/components/cabinet/Layer';
import { IconClose, IconCopy, IconSpark } from '@/components/icons';

const LEVELS: { key: RiskLevel | 'all'; label: string }[] = [
  { key: 'all', label: 'Все в зоне риска' }, { key: 'high', label: 'Высокий' }, { key: 'medium', label: 'Средний' }, { key: 'low', label: 'Низкий' },
];
const LABEL: Record<RiskLevel, string> = { high: 'высокий', medium: 'средний', low: 'низкий', ok: 'нет' };

/** Таблица риска: фильтр по уровню и классу, причины чипами, совет помощника по ученику. */
export default function RiskBoard({ slug, students }: { slug: string; students: StudentRisk[] }) {
  const [level, setLevel] = useState<RiskLevel | 'all'>('all');
  const [group, setGroup] = useState('');
  const [open, setOpen] = useState<StudentRisk | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const groups = [...new Set(students.flatMap((s) => s.groups))].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  const shown = students.filter((s) => (level === 'all' ? s.level !== 'ok' : s.level === level) && (!group || s.groups.includes(group)));

  return (
    <section className="cab-card">
      <div className="board-bar risk-bar">
        <div className="cf-filter" role="group" aria-label="Уровень риска">
          {LEVELS.map((l) => (
            <button key={l.key} type="button" aria-pressed={level === l.key}
              className={level === l.key ? 'cf-filter-item active' : 'cf-filter-item'} onClick={() => setLevel(l.key)}>
              {l.label}<span className="cf-count">{students.filter((s) => (l.key === 'all' ? s.level !== 'ok' : s.level === l.key)).length}</span>
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <select className="select board-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Класс">
            <option value="">Все классы</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>
      {shown.length === 0 ? <p className="empty-state">Под этот фильтр никто не подходит — хороший знак.</p> : (
        <div className="table-wrap">
          <table className="data-table risk-table">
            <thead><tr><th>Ученик</th><th>Риск</th><th>Причины</th><th className="center">Балл</th><th>Был</th><th className="actions"><span className="visually-hidden">Действия</span></th></tr></thead>
            <tbody key={`${level}-${group}`}>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td data-label="Ученик"><span className="person-cell"><Avatar name={s.name} size={32} /><span><b>{s.name}</b><small className="muted">{s.groups.join(', ') || 'без класса'}</small></span></span></td>
                  <td data-label="Риск">
                    <span className={`risk-meter lvl-${s.level}`} title={`${s.score} из 100`}>
                      <span><i style={{ width: `${s.score}%` }} /></span><b>{s.score}</b><small>{LABEL[s.level]}</small>
                    </span>
                  </td>
                  <td data-label="Причины"><div className="chip-row">{s.factors.map((f) => <span key={f.label} className="chip-sm risk-chip">{f.label}</span>)}</div></td>
                  <td data-label="Балл" className="center num">{s.avgPercent === null ? '—' : `${s.avgPercent}%`}</td>
                  <td data-label="Был">{formatAgo(s.lastActive)}</td>
                  <td className="actions"><button type="button" className="btn btn-sm ai-btn" onClick={() => setOpen(s)}><IconSpark size={14} />Что делать</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <Layer><AdviceDrawer slug={slug} student={open} onClose={close} /></Layer>}
    </section>
  );
}

function AdviceDrawer({ slug, student, onClose }: { slug: string; student: StudentRisk; onClose: () => void }) {
  const [advice, setAdvice] = useState<RiskAdvice | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    void callApi<{ advice: RiskAdvice }>(`/api/org/${slug}/insights`, 'POST', { action: 'advise', studentId: student.id })
      .then((res) => { if (live) { if (res.ok) setAdvice(res.data.advice); else setError(res.error); } });
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => { live = false; document.removeEventListener('keydown', onEsc); };
  }, [slug, student.id, onClose]);
  return (
    <div className="advice-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="advice-drawer" role="dialog" aria-label={`Совет по ученику ${student.name}`}>
        <header>
          <Avatar name={student.name} size={44} />
          <div><h2>{student.name}</h2><span className="muted">{student.groups.join(', ')} · риск {student.score}/100</span></div>
          <button type="button" className="cab-icon-btn" aria-label="Закрыть" onClick={onClose}><IconClose size={18} /></button>
        </header>
        <div className="chip-row">{student.factors.map((f) => <span key={f.label} className="chip-sm risk-chip">{f.label}</span>)}</div>
        {error ? <p className="error-box" role="alert">{error}</p> : !advice ? (
          <div className="advice-loading"><span className="ai-busy-orb" aria-hidden="true"><i /><i /><i /></span>Помощник думает, как помочь…</div>
        ) : (
          <>
            <p className="advice-summary">{advice.summary}</p>
            <h3>Шаги</h3>
            <ol className="advice-steps">{advice.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            {advice.message && (
              <>
                <h3>Сообщение ученику или родителям</h3>
                <blockquote className="advice-message">{advice.message}</blockquote>
                <button type="button" className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(advice.message); setCopied(true); }}>
                  <IconCopy size={15} />{copied ? 'Скопировано' : 'Скопировать'}
                </button>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
