'use client';
import { useMemo, useState } from 'react';
import {
  INSTRUMENTS, LEVELS, SECTIONS, STYLES, sectionByKey,
  type Instrument, type Level, type Style,
} from './data';
import { buildPrompt, isComplete, noteTags, type ConstructorDraft } from './buildPrompt';
import Stage from './stage/Stage';
import Examples from './stage/Examples';
import { IconChevron, IconSend } from '../icons';

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

  const current = sectionByKey(section);
  const chosen = custom.trim() || phenomenon;

  const draft: ConstructorDraft = {
    section, phenomenon: chosen, mode, style, parameters: params, instruments, notes, level,
  };
  const complete = isComplete(draft);
  const prompt = useMemo(() => (complete ? buildPrompt(draft) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section, chosen, mode, style, level, instruments.join(), params.join(), notes]);

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
      <h1 className="visually-hidden">Конструктор симуляции</h1>
      <div className="stand-form">
        <Block title="Что показываем" hint="например">
          <div className="chip-wrap" role="group" aria-label="Раздел">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" aria-pressed={s.key === section}
                className={s.key === section ? 'chip chip-action active' : 'chip chip-action'}
                onClick={() => pickSection(s.key)}>{s.label}</button>
            ))}
          </div>
          {current && (
            <div className="chip-wrap" role="group" aria-label="Явление">
              {current.phenomena.map((p) => (
                <button key={p} type="button" aria-pressed={p === phenomenon && !custom.trim()}
                  className={p === phenomenon && !custom.trim() ? 'chip chip-action active' : 'chip chip-action'}
                  onClick={() => { setPhenomenon(p); setCustom(''); }}>{p}</button>
              ))}
            </div>
          )}
          <input className="input" placeholder="Или своё — что угодно"
            value={custom} onChange={(e) => setCustom(e.target.value)} />
        </Block>

        <Block title="Как выглядит">
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
                <strong>{s.label}</strong>
                <span>{s.hint}</span>
              </button>
            ))}
          </div>
        </Block>

        <Block title="Что на панели" hint="включается справа">
          <div className="chip-wrap" role="group" aria-label="Приборы на панели">
            {INSTRUMENTS.map((i) => (
              <button key={i.value} type="button" title={i.hint}
                aria-pressed={instruments.includes(i.value)}
                className={instruments.includes(i.value) ? 'chip chip-action active' : 'chip chip-action'}
                onClick={() => setInstruments((v) => toggle(v, i.value))}>{i.label}</button>
            ))}
          </div>
        </Block>

        <Block title="Чем управлять" hint={current ? 'например' : undefined}>
          {current ? (
            <div className="chip-wrap" role="group" aria-label="Управляемые параметры">
              {current.parameters.map((p) => (
                <button key={p} type="button" aria-pressed={params.includes(p)}
                  className={params.includes(p) ? 'chip chip-action active' : 'chip chip-action'}
                  onClick={() => setParams((v) => toggle(v, p))}>{p}</button>
              ))}
              {params.filter((p) => !current.parameters.includes(p)).map((p) => (
                <button key={p} type="button" className="chip chip-action active chip-own"
                  aria-label={`Убрать параметр «${p}»`}
                  onClick={() => setParams((v) => v.filter((x) => x !== p))}>{p}</button>
              ))}
            </div>
          ) : (
            <p className="muted">Ничего не выбирайте — подберём сами.</p>
          )}
          <input className="input" placeholder="Свой параметр — Enter" value={ownParam}
            onChange={(e) => setOwnParam(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwnParam(); } }}
            onBlur={addOwnParam} />
        </Block>

        <Block title="Для кого">
          <div className="segmented">
            {LEVELS.map((l) => (
              <button key={l.value} type="button" aria-pressed={level === l.value}
                className={level === l.value ? 'segmented-item active' : 'segmented-item'}
                onClick={() => setLevel(l.value)}>{l.label}</button>
            ))}
          </div>
        </Block>

        <Block title="Что ещё важно" hint="своими словами">
          <textarea className="input" rows={2} value={notes}
            placeholder="Например: два маятника связаны пружиной"
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
            onClick={() => onCreate(prompt)}>
            <IconSend size={17} />Создать
          </button>
          {/* Кнопка доступна всегда: без неё человек, который хочет просто
              печатать, оказывался заперт на стенде — пока ничего не выбрано,
              переход в поле был выключен. Ничего не собрано — поле откроется
              пустым, и это ровно то, чего он хотел. */}
          <button className="link-btn" onClick={() => onWriteText(prompt)}>
            Открыть как текст
          </button>
          <span className="spacer" />
          {quotaNote}
        </div>
        {complete && (
          <details className="stand-prompt" open={showText}
            onToggle={(e) => setShowText(e.currentTarget.open)}>
            <summary><IconChevron size={15} />Запрос целиком</summary>
            <pre>{prompt}</pre>
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
