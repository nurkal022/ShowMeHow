'use client';
import { useMemo, useRef, useState } from 'react';
import { buildPlot, type PlotDoc, type PlotSeriesDoc } from '@/lib/research/doc';
import { columnStats, pearson } from '@/lib/research/data';
import {
  compareModels, FIT_MODELS, formatNum, formatWithError, latexTable, methodsText, type FitModelKey, type ModelRank,
} from '@/lib/research/fit';
import { renderPlot } from '@/lib/research/plot';
import { previewSize } from '@/lib/research/journals';
import { nearestPoint, parseMap, toData } from '@/lib/research/plot-map';
import { IconClose, IconEdit, IconPlus, IconTarget, IconTrash, IconUpload } from '@/components/icons';
import FigureOptions from './FigureOptions';
import Figure, { type FigurePick } from './Figure';
import DataGrid from './DataGrid';
import { CopyButton, download, ExportBar, fileSafe } from './shared';
import { useLocale, useT } from '@/i18n/client';
import { researchEditor } from '@/i18n/messages/research-editor';
import { common } from '@/i18n/messages/common';

type Tool = 'outlier' | 'note' | null;

/**
 * График из данных: таблица → столбцы → аппроксимация → рисунок, параметры с погрешностями
 * и абзац «Методы». Клик по рисунку отмечает выброс или ставит подпись. Всё считается в браузере.
 */
export default function PlotEditor({ doc, onChange, title }: { doc: PlotDoc; onChange: (d: PlotDoc) => void; title: string }) {
  const t = useT(researchEditor);
  const tc = useT(common);
  const locale = useLocale();
  const built = useMemo(() => buildPlot(doc, locale), [doc, locale]);
  const svg = useMemo(() => renderPlot({ ...built.spec, ...previewSize(doc.size) }), [built, doc.size]);
  const residualSvgs = useMemo(() => (built.residualSpecs ?? []).map((s, i) => renderPlot({ ...s, width: previewSize(doc.size).width, height: Math.round(previewSize(doc.size).height * 0.42), clipId: `res${i}`, legend: false })), [built, doc.size]);
  const headers = built.table?.headers ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [drag, setDrag] = useState(false);
  const [ranking, setRanking] = useState<{ series: number; list: ModelRank[] } | null>(null);
  const set = (patch: Partial<PlotDoc>) => onChange({ ...doc, ...patch });
  const setSeries = (i: number, patch: Partial<PlotSeriesDoc>) =>
    set({ series: doc.series.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const excluded = doc.excluded ?? [];
  const toggleRow = (row: number) => set({ excluded: excluded.includes(row) ? excluded.filter((r) => r !== row) : [...excluded, row].sort((a, b) => a - b) });
  const notes = doc.annotations ?? [];

  const colSelect = (value: number | null, change: (v: number | null) => void, allowNone = false) => (
    <select value={value ?? ''} onChange={(e) => change(e.target.value === '' ? null : Number(e.target.value))}>
      {allowNone && <option value="">{t('none')}</option>}
      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
    </select>
  );

  const pick = (p: FigurePick) => {
    const map = parseMap(p.map);
    if (!map || !tool) return;
    if (tool === 'outlier') {
      const pts = built.spec.series.flatMap((s) => s.points);
      const hit = nearestPoint(map, p.sx, p.sy, pts);
      if (hit && hit.row !== undefined) toggleRow(hit.row);
    } else {
      const pts = built.spec.series.flatMap((s) => s.points);
      const hit = nearestPoint(map, p.sx, p.sy, pts, 24);
      const at = hit ?? toData(map, p.sx, p.sy);
      set({ annotations: [...notes, { x: +at.x.toPrecision(6), y: +at.y.toPrecision(6), text: t('noteDefault') }] });
      setTool(null);
    }
  };

  const loadFile = async (f: File) => set({ data: await f.text(), excluded: [] });
  const stats = headers.map((h, i) => ({ h, s: columnStats(built.table!.columns[i]) }));

  return (
    <div className={`rs-editor${drag ? ' rs-dragging' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}>
      {drag && <div className="rs-drop"><IconUpload size={28} /><strong>{t('dropFile')}</strong><span>{t('dropHint')}</span></div>}
      <div className="rs-side">
        <section className="rs-panel">
          <div className="rs-panel-head">
            <h3>{t('data')}</h3>
            <span className="rs-row">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRaw((r) => !r)}>{raw ? t('asTable') : t('asText')}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()}><IconUpload size={14} />{t('file')}</button>
            </span>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.dat" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await loadFile(f);
              e.target.value = '';
            }} />
          </div>
          {raw
            ? <textarea className="input rs-data" spellCheck={false} value={doc.data} onChange={(e) => set({ data: e.target.value })}
              placeholder={t('dataPh')} />
            : <DataGrid text={doc.data} onChange={(data) => set({ data })} excluded={excluded} onToggleRow={toggleRow} />}
          <p className="muted rs-small">
            {t(excluded.length ? 'dataSummaryExcl' : 'dataSummary', { rows: built.table?.rows ?? 0, cols: headers.length, ex: excluded.length })}
          </p>
          <label className="field"><span>{t('columnX')}</span>{colSelect(doc.x, (v) => set({ x: v ?? 0 }))}</label>
        </section>

        {doc.series.map((s, i) => (
          <section className="rs-panel" key={i}>
            <div className="rs-panel-head">
              <h3>{t('seriesN', { n: i + 1 })}</h3>
              {doc.series.length > 1 && (
                <button type="button" className="icon-btn" aria-label={t('deleteSeries')} onClick={() => set({ series: doc.series.filter((_, k) => k !== i) })}><IconTrash size={16} /></button>
              )}
            </div>
            <div className="rs-grid2">
              <label className="field"><span>Y</span>{colSelect(s.y, (v) => setSeries(i, { y: v ?? 0 }))}</label>
              <label className="field"><span>{t('errorY')}</span>{colSelect(s.err, (v) => setSeries(i, { err: v }), true)}</label>
            </div>
            <div className="rs-grid2">
              <label className="field"><span>{t('label')}</span><input value={s.label} onChange={(e) => setSeries(i, { label: e.target.value })} /></label>
              <label className="field"><span>{t('mode')}</span>
                <select value={s.mode} onChange={(e) => setSeries(i, { mode: e.target.value as PlotSeriesDoc['mode'] })}>
                  <option value="markers">{t('modeMarkers')}</option><option value="line">{t('modeLine')}</option><option value="both">{t('modeBoth')}</option>
                </select>
              </label>
            </div>
            <label className="field"><span>{t('fit')}</span>
              <select value={s.fit?.model ?? ''} onChange={(e) => setSeries(i, {
                fit: e.target.value ? { model: e.target.value as FitModelKey, expr: s.fit?.expr ?? 'a*x + b' } : null,
              })}>
                <option value="">{t('none')}</option>
                {FIT_MODELS.map((m) => <option key={m.key} value={m.key}>{t(`fit_${m.key}`)}: {m.expr}</option>)}
                <option value="custom">{t('customFormula')}</option>
              </select>
            </label>
            {s.fit?.model === 'custom' && (
              <label className="field"><span>y =</span>
                <input className="rs-mono" value={s.fit.expr ?? ''} onChange={(e) => setSeries(i, { fit: { model: 'custom', expr: e.target.value } })}
                  placeholder="U0*exp(-x/tau) + c" />
              </label>
            )}
            <button type="button" className="btn btn-sm btn-ghost rs-add" onClick={() => {
              const xs = built.table?.columns[doc.x] ?? [];
              const ys = built.table?.columns[s.y] ?? [];
              const keep = xs.map((_, k) => !excluded.includes(k));
              setRanking({ series: i, list: compareModels({ xs: xs.filter((_, k) => keep[k]), ys: ys.filter((_, k) => keep[k]) }) });
            }}><IconTarget size={14} />{t('whichModel')}</button>
            {ranking?.series === i && (
              <div className="rs-rank rs-reveal">
                <div className="rs-panel-head"><span className="muted rs-small">{t('aiccHint')}</span>
                  <button type="button" className="icon-btn" aria-label={tc('close')} onClick={() => setRanking(null)}><IconClose size={13} /></button></div>
                {ranking.list.length === 0 && <p className="muted rs-small">{t('noModelFits')}</p>}
                {ranking.list.slice(0, 6).map((m, k) => (
                  <button key={m.model} type="button" className={`rs-rank-row${s.fit?.model === m.model ? ' on' : ''}`} onClick={() => setSeries(i, { fit: { model: m.model } })}>
                    <span className="rs-rank-name">{k === 0 && <span className="rs-rank-best">{t('best')}</span>}{t(`fit_${m.model}`)}</span>
                    <span className="rs-rank-bar"><i style={{ width: `${Math.max(m.weight * 100, 2)}%` }} /></span>
                    <span className="rs-mono rs-rank-num">Δ {m.delta.toFixed(1)}</span>
                    <span className="rs-mono rs-rank-num">R² {m.r2.toFixed(3)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
        {headers.length > 1 && (
          <button type="button" className="btn btn-sm btn-secondary rs-add" onClick={() => set({
            series: [...doc.series, { y: Math.min(headers.length - 1, doc.series.length + 1), err: null, label: '', mode: 'markers', fit: null }],
          })}><IconPlus size={14} />{t('addSeries')}</button>
        )}
        <FigureOptions doc={doc} onChange={(p) => set(p)} />
      </div>

      <div className="rs-main">
        <div className="rs-figtools" role="toolbar" aria-label={t('figTools')}>
          <button type="button" className={tool === 'outlier' ? 'rs-tool on' : 'rs-tool'} onClick={() => setTool(tool === 'outlier' ? null : 'outlier')}
            title={t('outlierTitle')}><IconTarget size={14} />{t('outlier')}</button>
          <button type="button" className={tool === 'note' ? 'rs-tool on' : 'rs-tool'} onClick={() => setTool(tool === 'note' ? null : 'note')}
            title={t('noteTitle')}><IconEdit size={14} />{t('note')}</button>
          <span className="rs-figtools-sep" />
          <label className="rs-tool-check"><input type="checkbox" checked={!!doc.band} onChange={(e) => set({ band: e.target.checked })} />{t('band')}</label>
          <label className="rs-tool-check"><input type="checkbox" checked={!!doc.residuals} onChange={(e) => set({ residuals: e.target.checked })} />{t('residuals')}</label>
          {tool && <span className="rs-tool-hint">{tool === 'outlier' ? t('outlierHint') : t('noteHint')}</span>}
        </div>
        <Figure svg={svg} size={doc.size} onPick={pick} pickMode={tool} />
        {residualSvgs.map((r, i) => <Figure key={i} svg={r} size={doc.size} />)}
        {notes.length > 0 && (
          <div className="rs-notes">
            {notes.map((n, i) => (
              <span key={i} className="rs-note-chip">
                <input value={n.text} aria-label={t('noteText')} size={Math.max(6, n.text.length)}
                  onChange={(e) => set({ annotations: notes.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
                <button type="button" aria-label={t('deleteNote')} onClick={() => set({ annotations: notes.filter((_, k) => k !== i) })}><IconClose size={11} /></button>
              </span>
            ))}
          </div>
        )}
        {built.errors.map((e) => <p key={e} className="rs-error">{e}</p>)}
        <ExportBar svg={svg} render={({ width, height }) => renderPlot({ ...built.spec, width, height })} spec={built.spec} name={title} size={doc.size} />
      </div>

      <div className="rs-results">
        {built.fits.map((r, i) => r && (
          <section className="rs-panel rs-fit" key={i}>
            <div className="rs-panel-head">
              <h3>{doc.series.length > 1 ? t('fitResultN', { n: i + 1 }) : t('fitResult')}</h3>
              {!r.converged && <span className="badge">{t('notConverged')}</span>}
            </div>
            <p className="rs-mono rs-formula">y = {r.expr}</p>
            <div className="rs-params">
              {r.params.map((p) => (
                <div key={p.name} className="rs-param-card">
                  <span className="rs-mono rs-param-card-name">{p.name}</span>
                  <span className="rs-mono rs-param-card-val">{formatWithError(p.value, p.error)}</span>
                </div>
              ))}
            </div>
            <div className="rs-fit-stats">
              <span><b>R²</b> {r.r2.toFixed(5)}</span>
              <span><b>RMSE</b> {formatNum(r.rmse)}</span>
              {r.chi2red !== null && <span><b>χ²/ν</b> {formatNum(r.chi2red, 3)}</span>}
              <span><b>n</b> {r.n}{excluded.length ? ` (−${excluded.length})` : ''}</span>
              <span><b>AICc</b> {formatNum(r.aicc, 4)}</span>
            </div>
            <p className="rs-methods">{methodsText(r, doc.xLabel, doc.yLabel, locale)}{excluded.length ? t('excludedPoints', { list: excluded.map((k) => k + 1).join(', ') }) : ''}</p>
            <div className="rs-row">
              <CopyButton text={methodsText(r, doc.xLabel, doc.yLabel, locale) + (excluded.length ? t('excludedPoints', { list: excluded.map((k) => k + 1).join(', ') }) : '')} label={t('methodsCopy')} />
            </div>
            <details className="rs-more">
              <summary>{t('more')}</summary>
              <div className="rs-row">
                <CopyButton text={latexTable(r, locale)} label={t('latexTable')} />
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => download(`${fileSafe(title)}-fit.csv`,
                  'parameter,value,std_error\n' + r.params.map((p) => `${p.name},${p.value},${p.error}`).join('\n') + `\nR2,${r.r2},\nRMSE,${r.rmse},`,
                  'text/csv;charset=utf-8')}>{t('paramsCsv')}</button>
              </div>
            </details>
          </section>
        ))}

        {stats.length > 0 && (
          <details className="rs-panel rs-more-panel">
            <summary><h3>{t('stats')}</h3></summary>
            <div className="rs-scroll">
              <table className="rs-table">
                <thead><tr><th>{t('colColumn')}</th><th>n</th><th>{t('colMean')}</th><th>SD</th><th>SEM</th><th>{t('colMedian')}</th><th>min</th><th>max</th></tr></thead>
                <tbody>
                  {stats.map(({ h, s }) => (
                    <tr key={h}><td>{h}</td><td>{s.n}</td>{[s.mean, s.sd, s.sem, s.median, s.min, s.max].map((v, k) => <td key={k} className="rs-mono">{formatNum(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {doc.series.map((s, i) => {
              const r = pearson(built.table!.columns[doc.x] ?? [], built.table!.columns[s.y] ?? []);
              return Number.isFinite(r) ? <p key={i} className="muted rs-small">{t('pearson', { a: headers[doc.x], b: headers[s.y], r: r.toFixed(4) })}</p> : null;
            })}
          </details>
        )}
      </div>
    </div>
  );
}
