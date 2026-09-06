'use client';
import { useMemo, useState } from 'react';
import { SECTIONS, STYLES, LEVELS, sectionByKey, type Level, type Style } from './data';
import { buildPrompt, isComplete, type ConstructorDraft } from './buildPrompt';

interface Props {
  disabled: boolean;
  onCreate: (prompt: string) => void;
  onEditText: (prompt: string) => void;
}

/**
 * Четыре шага вместо пустого поля: раздел и явление → как показать → чем управлять →
 * для кого. На выходе — обычный текстовый промпт, который уходит в тот же пайплайн.
 */
export default function Constructor({ disabled, onCreate, onEditText }: Props) {
  const [section, setSection] = useState('');
  const [phenomenon, setPhenomenon] = useState('');
  const [custom, setCustom] = useState('');
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [style, setStyle] = useState<Style>('schematic');
  const [params, setParams] = useState<string[]>([]);
  const [auto, setAuto] = useState(true);
  const [level, setLevel] = useState<Level>('grade10to11');

  const current = sectionByKey(section);
  const chosen = custom.trim() || phenomenon;

  const draft: Partial<ConstructorDraft> = {
    section, phenomenon: chosen, mode, style, level,
    parameters: auto ? [] : params,
  };
  const complete = isComplete(draft);
  const preview = useMemo(
    () => (complete ? buildPrompt(draft as ConstructorDraft) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section, chosen, mode, style, level, auto, params.join('|')],
  );

  function pickSection(key: string) {
    setSection(key); setPhenomenon(''); setCustom(''); setParams([]);
  }
  function toggleParam(p: string) {
    setAuto(false);
    setParams((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  return (
    <div className="constructor">
      <div className="ctor-step">
        <span className="label">1 · Раздел и явление</span>
        <div className="ctor-tiles">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button"
              className={s.key === section ? 'ctor-tile active' : 'ctor-tile'}
              onClick={() => pickSection(s.key)}>{s.label}</button>
          ))}
        </div>
        {current && (
          <>
            <div className="ctor-chips">
              {current.phenomena.map((p) => (
                <button key={p} type="button"
                  className={p === phenomenon && !custom.trim() ? 'chip chip-action active' : 'chip chip-action'}
                  onClick={() => { setPhenomenon(p); setCustom(''); }}>{p}</button>
              ))}
            </div>
            <input className="input" placeholder="Или своё явление…" value={custom}
              onChange={(e) => setCustom(e.target.value)} />
          </>
        )}
      </div>

      <div className="ctor-step">
        <span className="label">2 · Как показать</span>
        <div className="segmented">
          {(['2d', '3d'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m}
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
      </div>

      <div className="ctor-step">
        <span className="label">3 · Чем управлять</span>
        {current ? (
          <div className="ctor-chips">
            <button type="button" className={auto ? 'chip chip-action active' : 'chip chip-action'}
              onClick={() => { setAuto(true); setParams([]); }}>предложи сам</button>
            {current.parameters.map((p) => (
              <button key={p} type="button"
                className={!auto && params.includes(p) ? 'chip chip-action active' : 'chip chip-action'}
                onClick={() => toggleParam(p)}>{p}</button>
            ))}
          </div>
        ) : <p className="muted">Сначала выберите раздел.</p>}
      </div>

      <div className="ctor-step">
        <span className="label">4 · Для кого</span>
        <div className="segmented">
          {LEVELS.map((l) => (
            <button key={l.value} type="button" role="radio" aria-checked={level === l.value}
              className={level === l.value ? 'segmented-item active' : 'segmented-item'}
              onClick={() => setLevel(l.value)}>{l.label}</button>
          ))}
        </div>
      </div>

      <div className="ctor-step">
        <span className="label">Что уйдёт модели</span>
        <p className="ctor-preview">{preview || 'Выберите раздел и явление — здесь появится готовый текст.'}</p>
        <div className="composer-row">
          <button type="button" className="btn btn-primary" disabled={disabled || !complete}
            onClick={() => onCreate(preview)}>Создать</button>
          <button type="button" className="btn" disabled={!complete}
            onClick={() => onEditText(preview)}>Доработать текст</button>
        </div>
      </div>
    </div>
  );
}
