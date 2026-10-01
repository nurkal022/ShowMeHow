'use client';
import { useState } from 'react';
import type { PlanSpec, SimLevel, SimParameter, PlanStep, PlanView } from '@/lib/types';
import { IconCheck, IconClose, IconPlus, IconSend, IconTrash } from '../icons';
import Markup from '../lms/Markup';
import { useT } from '@/i18n/client';
import { workbench } from '@/i18n/messages/workbench';
import { common } from '@/i18n/messages/common';

export const LEVEL_OPTIONS: [SimLevel, 'levelDemo' | 'levelLab' | 'levelResearch', 'levelDemoHint' | 'levelLabHint' | 'levelResearchHint'][] = [
  ['demo', 'levelDemo', 'levelDemoHint'],
  ['lab', 'levelLab', 'levelLabHint'],
  ['research', 'levelResearch', 'levelResearchHint'],
];

const VIEW_LABELS: Record<PlanView['kind'], keyof typeof workbench.ru> = {
  scene: 'viewScene', chart: 'viewChart', phase: 'viewPhase', table: 'viewTable', formula: 'viewFormula', section: 'viewSection',
};

/**
 * Карточка плана до генерации. Правка здесь стоит секунды: человек видит, что понял
 * планировщик, и меняет уровень, параметры, виды и шаги урока до того, как потрачены
 * минуты генерации. Всё редактируется на месте; «попросить изменить» — перепланирование
 * словами, для того, что руками править долго.
 */
export default function PlanEditor({
  spec, busy, replanning, onChange, onGenerate, onCorrect, onCancel,
}: {
  spec: PlanSpec;
  busy: boolean;
  replanning: boolean;
  onChange: (spec: PlanSpec) => void;
  onGenerate: () => void;
  onCorrect: (text: string) => void;
  onCancel: () => void;
}) {
  const t = useT(workbench);
  const tc = useT(common);
  const [correction, setCorrection] = useState('');
  const [physicsOpen, setPhysicsOpen] = useState(false);
  const level = spec.level ?? 'demo';
  const disabled = busy || replanning;

  const set = (patch: Partial<PlanSpec>) => onChange({ ...spec, ...patch });
  const setParam = (i: number, patch: Partial<SimParameter>) =>
    set({ parameters: spec.parameters.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const setStep = (i: number, patch: Partial<PlanStep>) =>
    set({ scenario: (spec.scenario ?? []).map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  function numberField(v: string, fallback: number): number {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  function submitCorrection() {
    const text = correction.trim();
    if (!text || disabled) return;
    onCorrect(text);
    setCorrection('');
  }

  return (
    <div className={`plan-editor${replanning ? ' is-replanning' : ''}`}>
      <div className="plan-editor-head">
        <span className="plan-editor-kicker">{t('planKicker')}</span>
        <input className="plan-editor-title" value={spec.title} disabled={disabled}
          aria-label={t('planTitleAria')} onChange={(e) => set({ title: e.target.value })} />
        <div className="plan-editor-meta">
          <span>{spec.subject}</span>
          <span className={`badge badge-${spec.mode}`}>{spec.mode.toUpperCase()}</span>
          {spec.audience && <span>{spec.audience}</span>}
        </div>
      </div>

      <div className="plan-section">
        <div className="plan-section-title">{t('planLevel')}</div>
        <div className="level-cards" role="radiogroup" aria-label={t('simLevel')}>
          {LEVEL_OPTIONS.map(([v, label, hint]) => (
            <button key={v} type="button" role="radio" aria-checked={level === v} disabled={disabled}
              className={level === v ? 'level-card active' : 'level-card'} onClick={() => set({ level: v })}>
              <b>{t(label)}</b><span>{t(hint)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="plan-section">
        <div className="plan-section-title">{t('planGoals')}</div>
        <textarea className="plan-goals" rows={Math.max(2, spec.learningGoals.length)} disabled={disabled}
          value={spec.learningGoals.join('\n')} aria-label={t('planGoalsAria')}
          onChange={(e) => set({ learningGoals: e.target.value.split('\n').map((g) => g.trimStart()).filter((g, i, a) => g || i === a.length - 1) })} />
      </div>

      <div className="plan-section">
        <div className="plan-section-title">
          {t('planParams')} <span className="muted">{t('planParamsHint')}</span>
        </div>
        <div className="plan-params">
          <div className="plan-param plan-param-head" aria-hidden>
            <span>{t('colLabel')}</span><span>{t('colFrom')}</span><span>{t('colTo')}</span><span>{t('colStart')}</span><span>{t('colUnit')}</span><span />
          </div>
          {spec.parameters.map((p, i) => (
            <div className="plan-param" key={`${p.name}:${p.min}:${p.max}:${p.value}`}>
              <input value={p.label} disabled={disabled} aria-label={t('paramLabelAria')}
                onChange={(e) => setParam(i, { label: e.target.value })} />
              <input inputMode="decimal" defaultValue={p.min} disabled={disabled} aria-label={t('minAria')}
                onBlur={(e) => setParam(i, { min: numberField(e.target.value, p.min) })} />
              <input inputMode="decimal" defaultValue={p.max} disabled={disabled} aria-label={t('maxAria')}
                onBlur={(e) => setParam(i, { max: numberField(e.target.value, p.max) })} />
              <input inputMode="decimal" defaultValue={p.value} disabled={disabled} aria-label={t('startAria')}
                onBlur={(e) => setParam(i, { value: numberField(e.target.value, p.value) })} />
              <input value={p.unit} disabled={disabled} aria-label={t('unitAria')}
                onChange={(e) => setParam(i, { unit: e.target.value })} />
              <button type="button" className="icon-btn" disabled={disabled || spec.parameters.length <= 1}
                aria-label={t('removeParam', { name: p.label })}
                onClick={() => set({ parameters: spec.parameters.filter((_, k) => k !== i) })}>
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {(spec.views?.length ?? 0) > 0 && (
        <div className="plan-section">
          <div className="plan-section-title">{t('planViews')}</div>
          <div className="plan-chips">
            {spec.views!.map((v, i) => (
              <span className="plan-chip" key={`${v.title}-${i}`} title={v.what}>
                <em>{t(VIEW_LABELS[v.kind])}</em>{v.title}
                <button type="button" aria-label={t('removeView', { name: v.title })} disabled={disabled}
                  onClick={() => set({ views: spec.views!.filter((_, k) => k !== i) })}><IconClose size={12} /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {level !== 'demo' && (
        <div className="plan-section">
          <div className="plan-section-title">{t('planScenario')}</div>
          <ol className="plan-steps">
            {(spec.scenario ?? []).map((s, i) => (
              <li key={i}>
                <input className="plan-step-title" value={s.title} disabled={disabled} aria-label={t('stepAria')}
                  onChange={(e) => setStep(i, { title: e.target.value })} />
                <textarea rows={2} value={s.task} disabled={disabled} aria-label={t('stepTaskAria')}
                  onChange={(e) => setStep(i, { task: e.target.value })} />
                <button type="button" className="icon-btn" disabled={disabled} aria-label={t('removeStep')}
                  onClick={() => set({ scenario: (spec.scenario ?? []).filter((_, k) => k !== i) })}><IconTrash size={15} /></button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-sm btn-ghost" disabled={disabled}
            onClick={() => set({ scenario: [...(spec.scenario ?? []), { title: t('newStepTitle'), task: t('newStepTask') }] })}>
            <IconPlus size={15} />{t('addStep')}
          </button>
        </div>
      )}

      {(spec.invariants?.length ?? 0) > 0 && (
        <div className="plan-section">
          <div className="plan-section-title">
            {t('planInvariants')} <span className="muted">{t('planInvariantsHint')}</span>
          </div>
          <ul className="plan-invariants">
            {spec.invariants!.map((inv, i) => <li key={i}><IconCheck size={13} /><Markup text={inv.text} /></li>)}
          </ul>
        </div>
      )}

      {spec.wowMoment && (
        <div className="plan-wow"><b>{t('planWow')}</b><Markup text={spec.wowMoment} /></div>
      )}

      <button type="button" className="plan-physics-toggle" onClick={() => setPhysicsOpen((v) => !v)}>
        {physicsOpen ? t('physicsHide') : t('physicsShow')}
      </button>
      {physicsOpen && <div className="plan-physics"><Markup text={spec.physics} /></div>}

      <div className="plan-correct">
        <input value={correction} disabled={disabled} placeholder={t('planCorrectPh')}
          aria-label={t('planCorrectAria')} onChange={(e) => setCorrection(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCorrection(); } }} />
        <button type="button" className="icon-btn" disabled={disabled || !correction.trim()}
          aria-label={t('planCorrectSend')} onClick={submitCorrection}><IconSend size={17} /></button>
      </div>

      <div className="plan-actions">
        <button type="button" className="btn btn-primary" disabled={disabled} onClick={onGenerate}>
          {replanning ? t('replanning') : t('buildSim')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>{tc('cancel')}</button>
      </div>
    </div>
  );
}
