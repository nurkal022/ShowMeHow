'use client';
import { useMemo, useState } from 'react';
import {
  INSTRUMENTS, LEVELS, SECTIONS, STYLES, localizeSection, sectionByKey,
  type Instrument, type Level, type Style,
} from './data';
import { buildPrompt, isComplete, noteTags, type ConstructorDraft } from './buildPrompt';
import Stage from './stage/Stage';
import Examples from './stage/Examples';
import { IconChevron, IconSend } from '../icons';
import { useLocale, useT } from '@/i18n/client';
import { workbenchStand } from '@/i18n/messages/workbench-stand';

interface Props {
  disabled: boolean;
  /** Строка про остаток квоты; показывается рядом с кнопкой. */
  quotaNote?: React.ReactNode;
  onCreate: (prompt: string) => void;
  onWriteText: (prompt: string) => void;
  defaultLevel?: Level;
  defaultStyle?: Style;
}

/**
 * Стенд: слева подсказки, справа образ выбранного.
 *
 * Ни один список здесь не ограничивает. Рядом с каждым стоит равноправное поле
 * «своё», и написанное руками попадает в запрос наравне с выбранным — а в конце
 * запроса даже весомее. Списки нужны, чтобы показать, что система умеет, а не
 * чтобы очертить, что ей можно поручить.
 */
export default function ConstructorStand({
  disabled, quotaNote, onCreate, onWriteText, defaultLevel, defaultStyle,
}: Props) {
  const t = useT(workbenchStand);
  const locale = useLocale();
  const [section, setSection] = useState('');
  const [phenomenon, setPhenomenon] = useState('');
  const [custom, setCustom] = useState('');
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [style, setStyle] = useState<Style>(defaultStyle ?? 'schematic');
  const [instruments, setInstruments] = useState<Instrument[]>(['slider', 'readout']);
  const [params, setParams] = useState<string[]>([]);
  const [ownParam, setOwnParam] = useState('');
  const [notes, setNotes] = useState('');
  const [level, setLevel] = useState<Level>(defaultLevel ?? 'grade10to11');
  const [showText, setShowText] = useState(false);
  // Текст, поправленный руками. null — текст следует за формой. Как только
  // человек что-то изменил в самом тексте, форма его больше не перезаписывает:
  // иначе одно случайное касание чипа стёрло бы правку.
  const [edited, setEdited] = useState<string | null>(null);

  const current = sectionByKey(section);
  // Подписи чипов — на языке интерфейса; подбор примеров идёт по русской таблице.
  const view = current ? localizeSection(current, locale) : undefined;
  const chosen = custom.trim() || phenomenon;

  const draft: ConstructorDraft = {
    section, phenomenon: chosen, mode, style, parameters: params, instruments, notes, level,
  };
  const complete = isComplete(draft);
  const prompt = useMemo(() => (complete ? buildPrompt(draft, locale) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section, chosen, mode, style, level, instruments.join(), params.join(), notes, locale]);

  const finalPrompt = edited ?? prompt;

  function pickSection(key: string) {
    const next = sectionByKey(key);
    setSection(key); setPhenomenon(''); setCustom(''); setParams([]); setOwnParam('');
    // Приборы раздела — стартовая рекомендация, а не приговор: их тут же меняют.
    if (next) setInstruments(next.instruments);
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  }

  function addOwnParam() {
    const v = ownParam.trim();
    if (!v || params.includes(v)) { setOwnParam(''); return; }
    setParams((p) => [...p, v]);
    setOwnParam('');
  }

  return (
    <div className="stand">
      <h1 className="visually-hidden">{t('heading')}</h1>
      <div className="stand-form">
        <Block title={t('bWhat')} hint={t('hintExample')}>
          <div className="chip-wrap" role="group" aria-label={t('sectionAria')}>
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" aria-pressed={s.key === section}
                className={s.key === section ? 'chip chip-action active' : 'chip chip-action'}
                onClick={() => pickSection(s.key)}>{localizeSection(s, locale).label}</button>
            ))}
          </div>
          {view && (
            <div className="chip-wrap" role="group" aria-label={t('phenomenonAria')}>
              {view.phenomena.map((p) => (
                <button key={p} type="button" aria-pressed={p === phenomenon && !custom.trim()}
                  className={p === phenomenon && !custom.trim() ? 'chip chip-action active' : 'chip chip-action'}
                  onClick={() => { setPhenomenon(p); setCustom(''); }}>{p}</button>
              ))}
            </div>
          )}
          <input className="input" placeholder={t('ownPh')}
            value={custom} onChange={(e) => setCustom(e.target.value)} />
        </Block>

        <Block title={t('bLook')}>
          <div className="segmented">
            {(['2d', '3d'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m}
                className={mode === m ? 'segmented-item active' : 'segmented-item'}
                onClick={() => setMode(m)}>{m.toUpperCase()}</button>
            ))}
          </div>
          <div className="ctor-styles">
            {STYLES.map((s) => (
              <button key={s.value} type="button"
                className={style === s.value ? 'ctor-style active' : 'ctor-style'}
                onClick={() => setStyle(s.value)}>
                <strong>{t(`style_${s.value}`)}</strong>
                <span>{t(`style_${s.value}_hint`)}</span>
              </button>
            ))}
          </div>
        </Block>

        <Block title={t('bPanel')} hint={t('hintPanel')}>
          <div className="chip-wrap" role="group" aria-label={t('instrumentsAria')}>
            {INSTRUMENTS.map((i) => (
              <button key={i.value} type="button" title={t(`inst_${i.value}_hint`)}
                aria-pressed={instruments.includes(i.value)}
                className={instruments.includes(i.value) ? 'chip chip-action active' : 'chip chip-action'}
                onClick={() => setInstruments((v) => toggle(v, i.value))}>{t(`inst_${i.value}`)}</button>
            ))}
          </div>
        </Block>

        <Block title={t('bControl')} hint={view ? t('hintExample') : undefined}>
          {view ? (
            <div className="chip-wrap" role="group" aria-label={t('paramsAria')}>
              {view.parameters.map((p) => (
                <button key={p} type="button" aria-pressed={params.includes(p)}
                  className={params.includes(p) ? 'chip chip-action active' : 'chip chip-action'}
                  onClick={() => setParams((v) => toggle(v, p))}>{p}</button>
              ))}
              {params.filter((p) => !view.parameters.includes(p)).map((p) => (
                <button key={p} type="button" className="chip chip-action active chip-own"
                  aria-label={t('removeParam', { name: p })}
                  onClick={() => setParams((v) => v.filter((x) => x !== p))}>{p}</button>
              ))}
            </div>
          ) : (
            <p className="muted">{t('autoParams')}</p>
          )}
          <input className="input" placeholder={t('ownParamPh')} value={ownParam}
            onChange={(e) => setOwnParam(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwnParam(); } }}
            onBlur={addOwnParam} />
        </Block>

        <Block title={t('bAudience')}>
          <div className="segmented">
            {LEVELS.map((l) => (
              <button key={l.value} type="button" aria-pressed={level === l.value}
                className={level === l.value ? 'segmented-item active' : 'segmented-item'}
                onClick={() => setLevel(l.value)}>{t(`level_${l.value}`)}</button>
            ))}
          </div>
        </Block>

        <Block title={t('bNotes')} hint={t('hintNotes')}>
          <textarea className="input" rows={2} value={notes}
            placeholder={t('notesPh')}
            onChange={(e) => setNotes(e.target.value)} />
        </Block>
      </div>

      <div className="stand-view">
        <Stage config={{
          section, phenomenon: chosen, mode, style, instruments,
          parameters: params, notes: noteTags(notes), level,
        }} />
        <Examples section={current} />
        <div className="stand-bar">
          <button className="btn btn-primary" disabled={disabled || !complete}
            onClick={() => onCreate(finalPrompt)}>
            <IconSend size={17} />{t('create')}
          </button>
          {/* Кнопка доступна всегда: без неё человек, который хочет просто
              печатать, оказывался заперт на стенде — пока ничего не выбрано,
              переход в поле был выключен. Ничего не собрано — поле откроется
              пустым, и это ровно то, чего он хотел. */}
          <button className="link-btn" onClick={() => onWriteText(finalPrompt)}>
            {t('openAsText')}
          </button>
          <span className="spacer" />
          {quotaNote}
        </div>
        {complete && (
          <details className="stand-prompt" open={showText}
            onToggle={(e) => setShowText(e.currentTarget.open)}>
            <summary><IconChevron size={15} />{t('fullPrompt')}{edited !== null && t('editedManually')}</summary>
            {/* Редактируется на месте: образ и приборы остаются перед глазами,
                а уточнить можно словом. «Создать» отправит именно этот текст. */}
            <textarea className="stand-prompt-text" value={finalPrompt} rows={7}
              aria-label={t('promptAria')}
              onChange={(e) => setEdited(e.target.value)} />
            {edited !== null && (
              <div className="stand-prompt-note">
                {t('formLocked')}
                <button type="button" className="link-btn" onClick={() => setEdited(null)}>
                  {t('rebuild')}
                </button>
              </div>
            )}
          </details>
        )}
      </div>
    </div>
  );
}

function Block({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="stand-block">
      <h3>
        {title}
        {hint && <span className="stand-hint">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}
