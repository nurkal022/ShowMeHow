'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildModel, MAX_SNAPSHOTS, modelParams, odeVarNames, phaseAxes, snapshotLabel, splitFunctionLine, type ModelDoc, type ModelParam } from '@/lib/research/doc';
import { parseTable } from '@/lib/research/data';
import { fit, formatWithError } from '@/lib/research/fit';
import { compile, parse, toLatex } from '@/lib/research/expr';
import { renderPlot } from '@/lib/research/plot';
import { previewSize } from '@/lib/research/journals';
import { parseEquation } from '@/lib/research/ode';
import { galleryDoc, type GalleryModel } from '@/lib/research/model-gallery';
import { IconClose, IconLibrary, IconPlus, IconTarget } from '@/components/icons';
import FigureOptions from './FigureOptions';
import Figure from './Figure';
import ModelGallery from './ModelGallery';
import { ParamSlider, PointAnimator } from './ModelControls';
import { CopyButton, ExportBar } from './shared';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { researchEditor } from '@/i18n/messages/research-editor';

/**
 * Модель по формуле: y = f(x; параметры) или система ОДУ. Параметры находятся
 * в формуле сами и становятся слайдерами; поверх можно положить точки эксперимента
 * и подогнать под них параметры. Для систем — фазовый портрет, для всех — бегущая
 * по решению точка и сравнение сценариев. Это «тренажёр» без генерации — мгновенно и точно.
 */
export default function ModelEditor({ doc: rawDoc, onChange, title, readOnly = false }: {
  doc: ModelDoc; onChange?: (d: ModelDoc) => void; title: string; readOnly?: boolean;
}) {
  // Значения слайдеров живут отдельно: движение ползунка перерисовывает график сразу,
  // а в документ (и на сервер) уходит, когда ползунок отпустили.
  const t = useT(researchEditor);
  const f = useFormat();
  const locale = useLocale();
  const [live, setLive] = useState<Record<string, number>>({});
  const [animating, setAnimating] = useState<string | null>(null);
  const [fitNote, setFitNote] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  // Читатель публичной страницы тоже может переключить вид — локально, без записи в документ.
  const [localView, setLocalView] = useState<Partial<ModelDoc>>({});
  const doc = readOnly ? { ...rawDoc, ...localView } : rawDoc;
  const set = (patch: Partial<ModelDoc>) => onChange?.({ ...rawDoc, ...patch });
  const setView = (patch: Partial<ModelDoc>) => (readOnly ? setLocalView((v) => ({ ...v, ...patch })) : set(patch));
  const figRef = useRef<HTMLDivElement>(null);
  const clipId = `mdl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const values = useMemo(() => Object.fromEntries(doc.params.map((p) => [p.name, live[p.name] ?? p.value])), [doc.params, live]);
  const built = useMemo(() => buildModel(doc, values, locale), [doc, values, locale]);
  const svg = useMemo(() => renderPlot({ ...built.spec, ...previewSize(doc.size), clipId }), [built, doc.size, clipId]);
  const { error: formulaError } = useMemo(() => modelParams(doc), [doc]);
  const varNames = useMemo(() => odeVarNames(doc), [doc]);
  const axes = phaseAxes(doc);
  const snaps = doc.snapshots ?? [];
  const xName = built.view === 'phase' ? 't' : (doc.xLabel || (doc.mode === 'ode' ? 't' : 'x')).split(',')[0].trim();

  // Анимация параметра: ползунок ходит туда-обратно — видно, за что параметр отвечает.
  useEffect(() => {
    if (!animating) return;
    const p = doc.params.find((q) => q.name === animating);
    if (!p) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const phase = ((now - t0) / 4000) % 1;
      const k = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      setLive((l) => ({ ...l, [p.name]: p.min + (p.max - p.min) * k }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating, doc.params]);

  /** Зафиксировать текущие значения как сценарий; подпись — то, что поменялось с прошлого. */
  const capture = () => {
    if (snaps.length >= MAX_SNAPSHOTS) return;
    const vals = { ...values };
    const prev = snaps[snaps.length - 1]?.values;
    const changed = prev ? Object.fromEntries(Object.entries(vals).filter(([k, v]) => prev[k] !== v)) : vals;
    set({ snapshots: [...snaps, { label: snapshotLabel(Object.keys(changed).length ? changed : vals, locale), values: vals }] });
  };
  const pickTemplate = (m: GalleryModel) => {
    if (!confirm(t('confirmTemplate', { title: m.title }))) return;
    setAnimating(null);
    setLive({});
    setGallery(false);
    onChange?.({ ...galleryDoc(m), size: rawDoc.size });
  };

  const setLines = (text: string) => {
    const lines = text.split('\n');
    const next = { ...doc, lines };
    const { params, error } = modelParams(next);
    const initial = { ...doc.initial };
    if (doc.mode === 'ode' && !error) {
      lines.filter((l) => l.trim()).forEach((l) => { try { const n = parseEquation(l).name; if (!(n in initial)) initial[n] = 1; } catch { /* покажет ошибка ниже */ } });
    }
    onChange?.({ ...next, params: error ? doc.params : params, initial });
  };
  const setParam = (name: string, patch: Partial<ModelParam>) =>
    set({ params: doc.params.map((p) => (p.name === name ? { ...p, ...patch } : p)) });

  const table = doc.data.trim() ? parseTable(doc.data, locale) : null;

  /** Подогнать параметры первой кривой к точкам эксперимента (только для явной формулы). */
  const fitToData = () => {
    setFitNote(null);
    if (!table || doc.dataY === null) return;
    const line = doc.lines.find((l) => l.trim());
    if (!line) return;
    const { rhs } = splitFunctionLine(line);
    const vars = compile(rhs).vars;
    const indep = vars.includes('x') ? 'x' : 't';
    try {
      const r = fit({
        xs: table.columns[doc.dataX] ?? [], ys: table.columns[doc.dataY] ?? [], model: 'custom',
        expr: indep === 'x' ? rhs : rhs.replace(/\bt\b/g, 'x'), initial: values,
      });
      setLive({});
      set({
        params: doc.params.map((p) => {
          const f = r.params.find((q) => q.name === p.name);
          if (!f) return p;
          return { ...p, value: f.value, min: Math.min(p.min, f.value), max: Math.max(p.max, f.value) };
        }),
      });
      setFitNote(t('fitted', { params: r.params.map((p) => `${p.name} = ${formatWithError(p.value, p.error)}`).join(', '), r2: r.r2.toFixed(4) }));
    } catch (e) {
      setFitNote(f.message(e instanceof Error ? e.message : String(e)));
    }
  };

  const latex = useMemo(() => doc.lines.filter((l) => l.trim()).map((l) => {
    try {
      if (doc.mode === 'ode') { const eq = parseEquation(l); return `\\frac{d${eq.name}}{dt} = ${toLatex(parse(eq.rhs))}`; }
      const { name, rhs } = splitFunctionLine(l);
      return `${name ?? 'y'} = ${toLatex(parse(rhs))}`;
    } catch { return ''; }
  }).filter(Boolean).join(' \\\\\n'), [doc.lines, doc.mode]);

  const commitParam = (name: string, v: number) => {
    if (readOnly) return;
    setParam(name, { value: v });
    setLive(({ [name]: _, ...rest }) => rest);
  };

  const sliders = (
    <section className="rs-panel">
      <div className="rs-panel-head"><h3>{t('params')}</h3>{doc.params.length > 0 && <span className="muted rs-small rs-param-tip">{t('paramTip')}</span>}</div>
      {doc.params.length === 0 && <p className="muted rs-small">{t('noParams')}</p>}
      {doc.params.map((p) => (
        <ParamSlider key={p.name} p={p} value={values[p.name] ?? p.value} readOnly={readOnly} animating={animating === p.name}
          onLive={(v) => { setAnimating(null); setLive((l) => ({ ...l, [p.name]: v })); }}
          onCommit={(v) => { setAnimating(null); commitParam(p.name, v); }}
          onRange={(patch) => { setParam(p.name, patch); if (patch.value !== undefined) setLive(({ [p.name]: _, ...rest }) => rest); }}
          onAnimate={() => { if (animating === p.name) { setAnimating(null); setLive({}); } else setAnimating(p.name); }} />
      ))}
    </section>
  );

  /** Над рисунком: вид (время / фазовый портрет), оси фазы и бегущая точка. */
  const viewBar = (
    <div className="rs-model-bar">
      {varNames.length >= 2 && (
        <div className="segmented rs-model-view" role="group" aria-label={t('viewAria')}>
          <button type="button" className={built.view === 'time' ? 'segmented-item active' : 'segmented-item'} aria-pressed={built.view === 'time'}
            onClick={() => setView({ view: 'time' })}>{t('viewTime')}</button>
          <button type="button" className={built.view === 'phase' ? 'segmented-item active' : 'segmented-item'} aria-pressed={built.view === 'phase'}
            onClick={() => setView({ view: 'phase', phaseX: axes?.[0], phaseY: axes?.[1] })}>{t('viewPhase')}</button>
        </div>
      )}
      {built.view === 'phase' && axes && (
        <div className="rs-model-axes">
          <label><span>X</span>
            <select value={axes[0]} onChange={(e) => setView({ phaseX: e.target.value, phaseY: e.target.value === axes[1] ? axes[0] : axes[1] })}>
              {varNames.map((n) => <option key={n} value={n}>{doc.varLabels?.[n] || n}</option>)}
            </select>
          </label>
          <label><span>Y</span>
            <select value={axes[1]} onChange={(e) => setView({ phaseY: e.target.value, phaseX: e.target.value === axes[0] ? axes[1] : axes[0] })}>
              {varNames.map((n) => <option key={n} value={n}>{doc.varLabels?.[n] || n}</option>)}
            </select>
          </label>
          {!built.field && <span className="muted rs-small" title={t('noFieldTitle')}>{t('noField')}</span>}
        </div>
      )}
      <PointAnimator built={built} hostRef={figRef} xName={xName} />
    </div>
  );

  /** Сценарии: зафиксированные наборы параметров пунктиром поверх текущей кривой. */
  const snapBar = !readOnly && (
    <div className="rs-snaps">
      <button type="button" className="btn btn-sm btn-secondary" onClick={capture} disabled={snaps.length >= MAX_SNAPSHOTS || !!built.errors.length && !built.current.length}
        title={snaps.length >= MAX_SNAPSHOTS ? t('maxSnaps', { n: MAX_SNAPSHOTS }) : t('snapTitle')}>
        <IconPlus size={14} />{t('snap')}
      </button>
      {snaps.map((s, k) => (
        <span key={k} className="rs-snap" style={{ '--snap': built.snapshotColors[k] ?? 'var(--muted)' } as React.CSSProperties}>
          <button type="button" className="rs-snap-swatch" aria-label={t('snapRestore', { label: s.label })} title={t('snapRestoreTitle')}
            onClick={() => { setLive({}); set({ params: doc.params.map((p) => (Number.isFinite(s.values[p.name]) ? { ...p, value: s.values[p.name], min: Math.min(p.min, s.values[p.name]), max: Math.max(p.max, s.values[p.name]) } : p)) }); }} />
          <input className="rs-snap-label" value={s.label} size={Math.max(4, Math.min(28, s.label.length))} aria-label={t('snapLabel')} maxLength={60}
            onChange={(e) => set({ snapshots: snaps.map((q, i) => (i === k ? { ...q, label: e.target.value } : q)) })} />
          <button type="button" className="rs-snap-x" aria-label={t('snapRemove', { label: s.label })} onClick={() => set({ snapshots: snaps.filter((_, i) => i !== k) })}><IconClose size={12} /></button>
        </span>
      ))}
    </div>
  );

  const figure = (
    <div className="rs-model-fig" ref={figRef}>
      <Figure svg={svg} size={doc.size} />
    </div>
  );

  if (readOnly) {
    return (
      <div className="rs-editor rs-editor-view">
        <div className="rs-main">
          {viewBar}
          {figure}
          {built.errors.map((e) => <p key={e} className="rs-error">{e}</p>)}
        </div>
        <div className="rs-side">{sliders}</div>
      </div>
    );
  }

  const switchMode = (mode: 'function' | 'ode') => {
    const next: ModelDoc = {
      ...doc, mode, lines: mode === 'ode' ? ["x' = -k*x"] : ['y = a*sin(b*x)'], initial: mode === 'ode' ? { x: 1 } : doc.initial,
      view: 'time', phaseX: undefined, phaseY: undefined, snapshots: [], template: undefined, varLabels: undefined,
    };
    setLive({});
    onChange?.({ ...next, params: modelParams(next).params, xLabel: mode === 'ode' ? 't' : 'x' });
  };

  return (
    <div className="rs-editor">
      <div className="rs-side">
        <section className="rs-panel">
          <div className="rs-model-top">
            <div className="segmented" role="group" aria-label={t('modelMode')}>
              <button type="button" className={doc.mode === 'function' ? 'segmented-item active' : 'segmented-item'} onClick={() => switchMode('function')}>{t('modeFn')}</button>
              <button type="button" className={doc.mode === 'ode' ? 'segmented-item active' : 'segmented-item'} onClick={() => switchMode('ode')}>{t('modeOde')}</button>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGallery(true)} title={t('templatesTitle')}><IconLibrary size={14} />{t('templates')}</button>
          </div>
          <label className="field">
            <span>{doc.mode === 'ode' ? t('linesOde') : t('linesFn')}</span>
            <textarea className="input rs-mono rs-lines" spellCheck={false} rows={Math.max(3, doc.lines.length + 1)}
              value={doc.lines.join('\n')} onChange={(e) => setLines(e.target.value)} />
          </label>
          {formulaError ? <p className="rs-error">{f.message(formulaError)}</p>
            : <p className="muted rs-small">{t('funcsHint')}</p>}
          <div className="rs-grid2">
            <label className="field"><span>{doc.mode === 'ode' ? t('tFrom') : t('from')}</span><input type="number" value={doc.from} onChange={(e) => set({ from: Number(e.target.value) })} /></label>
            <label className="field"><span>{t('to')}</span><input type="number" value={doc.to} onChange={(e) => set({ to: Number(e.target.value) })} /></label>
          </div>
          {doc.mode === 'ode' && Object.keys(doc.initial).length > 0 && (
            <div className="rs-initial">
              <span className="muted rs-small">{t('initial')}</span>
              <div className="rs-grid2">
                {Object.entries(doc.initial).map(([k, v]) => (
                  <label className="field" key={k}><span className="rs-mono">{k}(0)</span>
                    <input type="number" value={v} onChange={(e) => set({ initial: { ...doc.initial, [k]: Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>
        {sliders}
        <section className="rs-panel">
          <h3>{t('points')}</h3>
          <textarea className="input rs-data rs-data-sm" spellCheck={false} value={doc.data} onChange={(e) => set({ data: e.target.value, dataY: doc.dataY ?? (e.target.value.trim() ? 1 : null) })}
            placeholder={t('pointsPh')} />
          {table && table.headers.length > 1 && (
            <>
              <div className="rs-grid2">
                <label className="field"><span>X</span>
                  <select value={doc.dataX} onChange={(e) => set({ dataX: Number(e.target.value) })}>{table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select>
                </label>
                <label className="field"><span>Y</span>
                  <select value={doc.dataY ?? ''} onChange={(e) => set({ dataY: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">{t('hide')}</option>{table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              </div>
              {doc.mode === 'function' && doc.dataY !== null && (
                <button type="button" className="btn btn-sm btn-primary" onClick={fitToData}><IconTarget size={14} />{t('fitToPoints')}</button>
              )}
              {fitNote && <p className="rs-small rs-fit-note">{fitNote}</p>}
            </>
          )}
          {built.view === 'phase' && doc.dataY !== null && doc.data.trim() && <p className="muted rs-small">{t('pointsInTime')}</p>}
        </section>
        <FigureOptions doc={doc} onChange={(p) => set(p)} />
      </div>
      <div className="rs-main">
        {viewBar}
        {figure}
        {snapBar}
        {built.errors.map((e) => <p key={e} className="rs-error">{e}</p>)}
        <ExportBar svg={svg} render={({ width, height }) => renderPlot({ ...built.spec, width, height })} spec={built.spec} name={title} size={doc.size} />
      </div>

      <div className="rs-results">
        {latex && (
          <section className="rs-panel">
            <div className="rs-panel-head"><h3>{t('latexFormulas')}</h3><CopyButton text={latex} label="LaTeX" /></div>
            <pre className="rs-code">{latex}</pre>
          </section>
        )}
      </div>
      <ModelGallery open={gallery} onClose={() => setGallery(false)} onPick={pickTemplate} />
    </div>
  );
}
