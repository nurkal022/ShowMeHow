'use client';
import { useCallback, useEffect, useState } from 'react';
import type { RiskAdvice } from '@/lib/org/ai';
import type { RiskLevel, StudentRisk } from '@/lib/org/reports';
import { callApi } from '@/components/cabinet/api';
import { formatAgo } from '@/lib/lms/format';
import { Avatar } from '@/components/cabinet/viz';
import Layer from '@/components/cabinet/Layer';
import { IconClose, IconCopy, IconSpark } from '@/components/icons';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { org } from '@/i18n/messages/org';
import { common } from '@/i18n/messages/common';

const LEVELS: { key: RiskLevel | 'all'; label: 'lvlAll' | 'lvlHigh' | 'lvlMedium' | 'lvlLow' }[] = [
  { key: 'all', label: 'lvlAll' }, { key: 'high', label: 'lvlHigh' }, { key: 'medium', label: 'lvlMedium' }, { key: 'low', label: 'lvlLow' },
];

/** Таблица риска: фильтр по уровню и классу, причины чипами, совет помощника по ученику. */
export default function RiskBoard({ slug, students }: { slug: string; students: StudentRisk[] }) {
  const t = useT(org);
  const f = useFormat();
  const locale = useLocale();
  const [level, setLevel] = useState<RiskLevel | 'all'>('all');
  const [group, setGroup] = useState('');
  const [open, setOpen] = useState<StudentRisk | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const groups = [...new Set(students.flatMap((s) => s.groups))].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  const shown = students.filter((s) => (level === 'all' ? s.level !== 'ok' : s.level === level) && (!group || s.groups.includes(group)));

  return (
    <section className="cab-card">
      <div className="board-bar risk-bar">
        <div className="cf-filter" role="group" aria-label={t('riskLevel')}>
          {LEVELS.map((l) => (
            <button key={l.key} type="button" aria-pressed={level === l.key}
              className={level === l.key ? 'cf-filter-item active' : 'cf-filter-item'} onClick={() => setLevel(l.key)}>
              {t(l.label)}<span className="cf-count">{students.filter((s) => (l.key === 'all' ? s.level !== 'ok' : s.level === l.key)).length}</span>
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <select className="select board-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('classLabel')}>
            <option value="">{t('allClasses')}</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>
      {shown.length === 0 ? <p className="empty-state">{t('noneFit')}</p> : (
        <div className="table-wrap">
          <table className="data-table risk-table">
            <thead><tr><th>{t('r_student')}</th><th>{t('r_risk')}</th><th>{t('r_reasons')}</th><th className="center">{t('r_score')}</th><th>{t('r_seen')}</th><th className="actions"><span className="visually-hidden">{t('actions')}</span></th></tr></thead>
            <tbody key={`${level}-${group}`}>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td data-label={t('r_student')}><span className="person-cell"><Avatar name={s.name} size={32} /><span><b>{s.name}</b><small className="muted">{s.groups.join(', ') || t('noClass')}</small></span></span></td>
                  <td data-label={t('r_risk')}>
                    <span className={`risk-meter lvl-${s.level}`} title={t('of100', { n: s.score })}>
                      <span><i style={{ width: `${s.score}%` }} /></span><b>{s.score}</b><small>{t(`lvl_${s.level}`)}</small>
                    </span>
                  </td>
                  <td data-label={t('r_reasons')}><div className="chip-row">{s.factors.map((x) => <span key={x.label} className="chip-sm risk-chip">{f.message(x.label)}</span>)}</div></td>
                  <td data-label={t('r_score')} className="center num">{s.avgPercent === null ? '—' : `${s.avgPercent}%`}</td>
                  <td data-label={t('r_seen')}>{formatAgo(s.lastActive, locale)}</td>
                  <td className="actions"><button type="button" className="btn btn-sm ai-btn" onClick={() => setOpen(s)}><IconSpark size={14} />{t('whatToDo')}</button></td>
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
  const t = useT(org);
  const tc = useT(common);
  const f = useFormat();
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
      <aside className="advice-drawer" role="dialog" aria-label={t('adviceFor', { name: student.name })}>
        <header>
          <Avatar name={student.name} size={44} />
          <div><h2>{student.name}</h2><span className="muted">{student.groups.join(', ')} · {t('riskOf', { n: student.score })}</span></div>
          <button type="button" className="cab-icon-btn" aria-label={tc('close')} onClick={onClose}><IconClose size={18} /></button>
        </header>
        <div className="chip-row">{student.factors.map((x) => <span key={x.label} className="chip-sm risk-chip">{f.message(x.label)}</span>)}</div>
        {error ? <p className="error-box" role="alert">{error}</p> : !advice ? (
          <div className="advice-loading"><span className="ai-busy-orb" aria-hidden="true"><i /><i /><i /></span>{t('thinking')}</div>
        ) : (
          <>
            <p className="advice-summary">{advice.summary}</p>
            <h3>{t('steps')}</h3>
            <ol className="advice-steps">{advice.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            {advice.message && (
              <>
                <h3>{t('messageTitle')}</h3>
                <blockquote className="advice-message">{advice.message}</blockquote>
                <button type="button" className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(advice.message); setCopied(true); }}>
                  <IconCopy size={15} />{copied ? t('copied') : t('copy')}
                </button>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
