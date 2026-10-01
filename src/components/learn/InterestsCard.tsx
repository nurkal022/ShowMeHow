'use client';
import { useState } from 'react';
import {
  interestsFilled, INTERESTS_LIMITS, PRESET_TAGS, sanitizeInterests, STYLE_OPTIONS,
  type LearnStyle, type StudentInterests,
} from '@/lib/lms/interests';
import { callApi } from '@/components/cabinet/api';
import { IconCheck, IconPlus, IconSpark, IconTarget, IconUser } from '@/components/icons';
import { useFormat, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { learnMe, learnTags } from '@/i18n/messages/learn-me';

/**
 * Интересы ученика в три шага: чипы, пара фраз о себе, способ объяснения. Форма
 * разбита на шаги не ради красоты — сплошной столбец из полей ученик не заполняет,
 * а три коротких экрана с растущей полосой заполняет до конца.
 */

const STEPS = ['step_0', 'step_1', 'step_2'] as const;

const STEP_ICONS = [IconSpark, IconUser, IconTarget];

export default function InterestsCard({ initial }: { initial: StudentInterests }) {
  const t = useT(learnMe);
  const tc = useT(common);
  // Готовый тег — по словарю; свой тег ученика словарь не знает и показывает как есть.
  const tagLabel = useT(learnTags);
  const f = useFormat();
  const [value, setValue] = useState(initial);
  const [step, setStep] = useState(0);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function patch(next: Partial<StudentInterests>) {
    setValue((v) => ({ ...v, ...next }));
    setSaved(false);
  }

  function toggleTag(tag: string) {
    patch({
      tags: value.tags.includes(tag)
        ? value.tags.filter((t) => t !== tag)
        : value.tags.length < INTERESTS_LIMITS.tags ? [...value.tags, tag] : value.tags,
    });
  }

  function addCustom() {
    // Чистим тем же кодом, что и сервер: иначе после сохранения тег «переехал» бы на глазах.
    const tag = sanitizeInterests({ tags: [custom] }).tags[0];
    setCustom('');
    if (tag && !value.tags.includes(tag)) toggleTag(tag);
  }

  async function save() {
    setSaving(true);
    setError('');
    const res = await callApi<{ interests: StudentInterests }>('/api/learn/interests', 'PATCH', { interests: value });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setValue(res.data.interests);
    setSaved(true);
  }

  const percent = interestsFilled(value);
  const customTags = value.tags.filter((t) => !PRESET_TAGS.includes(t));

  return (
    <section className="ic-card" aria-label={t('interests')}>
      <header className="ic-head">
        <div>
          <h2>{t('interests')}</h2>
          <p className="muted">{t('interestsSub')}</p>
        </div>
        <span className="ic-percent" aria-hidden="true">{percent}%</span>
      </header>

      <div className="ic-progress">
        <span className="ic-progress-track"><i style={{ width: `${percent}%` }} /></span>
        <span className="visually-hidden">{t('filledSr', { p: percent })}</span>
      </div>

      <nav className="ic-steps" aria-label={t('stepsAria')}>
        {STEPS.map((label, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <button key={label} type="button" className={`ic-step${i === step ? ' active' : ''}`}
              aria-current={i === step} onClick={() => setStep(i)}>
              <Icon size={15} /><span>{t(label)}</span>
            </button>
          );
        })}
      </nav>

      <div className="ic-pane" key={step}>
        {step === 0 && (
          <>
            <p className="ic-hint">{t('tagsHint', { n: INTERESTS_LIMITS.tags })}</p>
            <div className="ic-tags">
              {[...PRESET_TAGS, ...customTags].map((tag) => (
                <button key={tag} type="button" className={`ic-tag${value.tags.includes(tag) ? ' on' : ''}`}
                  aria-pressed={value.tags.includes(tag)} onClick={() => toggleTag(tag)}>
                  {value.tags.includes(tag) && <IconCheck size={13} />}{tagLabel(tag as keyof typeof learnTags.ru)}
                </button>
              ))}
            </div>
            <div className="ic-add">
              <input className="input" value={custom} maxLength={INTERESTS_LIMITS.tag} placeholder={t('addOwn')}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
              <button type="button" className="btn btn-sm" onClick={addCustom} disabled={!custom.trim()}>
                <IconPlus size={15} />{tc('add')}
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <label className="field">
              <span>{t('hobbies')}</span>
              <textarea className="input" rows={4} value={value.about} maxLength={INTERESTS_LIMITS.about}
                placeholder={t('hobbiesPlaceholder')}
                onChange={(e) => patch({ about: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('dream')}</span>
              <input className="input" value={value.dream} maxLength={INTERESTS_LIMITS.dream}
                placeholder={t('dreamPlaceholder')} onChange={(e) => patch({ dream: e.target.value })} />
            </label>
          </>
        )}

        {step === 2 && (
          <div className="ic-styles" role="radiogroup" aria-label={t('stylesAria')}>
            {STYLE_OPTIONS.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={value.style === o.value}
                className={`ic-style${value.style === o.value ? ' on' : ''}`}
                // Повторный клик снимает выбор: передумать здесь не менее нормально, чем выбрать.
                onClick={() => patch({ style: (value.style === o.value ? '' : o.value) as LearnStyle })}>
                <b>{t(`style_${o.value}`)}</b>
                <small>{t(`style_${o.value}_hint`)}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="ic-foot">
        {step > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep(step - 1)}>{tc('back')}</button>}
        {step < STEPS.length - 1 && <button type="button" className="btn btn-sm" onClick={() => setStep(step + 1)}>{tc('next')}</button>}
        <span className="spacer" />
        {saved && <span className="ic-saved" role="status"><IconCheck size={14} />{t('savedLower')}</span>}
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? tc('saving') : tc('save')}
        </button>
      </footer>
      {error && <p className="error-box" role="alert">{f.message(error)}</p>}
    </section>
  );
}
