'use client';
import { useEffect, useRef, useState } from 'react';
import { cellsToText, parseCells, parseNumber } from '@/lib/research/data';
import { IconClose, IconPlus } from '@/components/icons';
import { useLocale, useT } from '@/i18n/client';
import { researchEditor } from '@/i18n/messages/research-editor';
import { researchFigure } from '@/i18n/messages/research-figure';

/**
 * Таблица данных как в Excel: правка ячеек, вставка блока из Excel/Origin прямо в сетку,
 * стрелки и Enter для перехода. Номер строки — переключатель «выброс»: строка остаётся
 * в данных, но не участвует в подгонке. Источник правды — текст документа; сетка держит
 * свою копию, чтобы новая пустая строка не пропадала до того, как в неё что-то введут.
 */
export default function DataGrid({ text, onChange, excluded, onToggleRow }: {
  text: string; onChange: (text: string) => void; excluded: number[]; onToggleRow: (row: number) => void;
}) {
  const t = useT(researchEditor);
  const tf = useT(researchFigure);
  const locale = useLocale();
  const [cells, setCells] = useState(() => parseCells(text, locale));
  const emitted = useRef(text);
  const table = useRef<HTMLTableElement>(null);

  // Текст поменяли снаружи (файл, режим «текстом») — перечитываем сетку.
  useEffect(() => {
    if (text !== emitted.current) { setCells(parseCells(text, locale)); emitted.current = text; }
  }, [text, locale]);

  const commit = (next: { headers: string[]; rows: string[][] }) => {
    setCells(next);
    const out = cellsToText(next.headers, next.rows);
    emitted.current = out;
    onChange(out);
  };

  const setCell = (r: number, c: number, v: string) => commit({ ...cells, rows: cells.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const setHeader = (c: number, v: string) => commit({ ...cells, headers: cells.headers.map((h, j) => (j === c ? v : h)) });

  const focus = (r: number, c: number) => {
    const el = table.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    el?.focus();
    el?.select();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (r === cells.rows.length - 1 && e.key === 'Enter') {
        commit({ ...cells, rows: [...cells.rows, cells.headers.map(() => '')] });
        requestAnimationFrame(() => focus(r + 1, c));
      } else focus(Math.min(r + 1, cells.rows.length - 1), c);
    } else if (e.key === 'ArrowUp') { e.preventDefault(); focus(Math.max(r - 1, -1), c); }
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionEnd === e.currentTarget.value.length) focus(r, Math.min(c + 1, cells.headers.length - 1));
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) focus(r, Math.max(c - 1, 0));
  };

  /** Вставка блока из таблицы: раскладываем по ячейкам, начиная с текущей, расширяя таблицу. */
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const data = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(data)) return;
    e.preventDefault();
    const block = data.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split(/\t|;/));
    const width = Math.max(cells.headers.length, c + Math.max(...block.map((b) => b.length)));
    const headers = Array.from({ length: width }, (_, j) => cells.headers[j] ?? tf('column', { n: j + 1 }));
    const rows = cells.rows.map((row) => Array.from({ length: width }, (_, j) => row[j] ?? ''));
    let start = r;
    // Вставили в строку заголовков блок, где первая строка текстовая, — это заголовки.
    if (r === -1) {
      const first = block[0];
      if (first.some((v) => v.trim() && Number.isNaN(parseNumber(v)))) { first.forEach((v, k) => { headers[c + k] = v.trim() || headers[c + k]; }); block.shift(); }
      start = 0;
    }
    block.forEach((line, i) => {
      const ri = start + i;
      while (rows.length <= ri) rows.push(headers.map(() => ''));
      line.forEach((v, k) => { rows[ri][c + k] = v.trim(); });
    });
    commit({ headers, rows });
  };

  const bad = (v: string) => v.trim() !== '' && Number.isNaN(parseNumber(v));

  return (
    <div className="dg-wrap">
      <table className="dg" ref={table}>
        <thead>
          <tr>
            <th className="dg-corner" />
            {cells.headers.map((h, c) => (
              <th key={c}>
                <input className="dg-head" value={h} data-r={-1} data-c={c} onChange={(e) => setHeader(c, e.target.value)}
                  onKeyDown={(e) => onKey(e, -1, c)} onPaste={(e) => onPaste(e, -1, c)} aria-label={t('colHeader', { n: c + 1 })} />
                {cells.headers.length > 1 && (
                  <button type="button" className="dg-del-col" title={t('delCol')} aria-label={t('delCol')}
                    onClick={() => commit({ headers: cells.headers.filter((_, j) => j !== c), rows: cells.rows.map((row) => row.filter((_, j) => j !== c)) })}><IconClose size={11} /></button>
                )}
              </th>
            ))}
            <th className="dg-add-col">
              <button type="button" title={t('addCol')} aria-label={t('addCol')}
                onClick={() => commit({ headers: [...cells.headers, tf('column', { n: cells.headers.length + 1 })], rows: cells.rows.map((row) => [...row, '']) })}><IconPlus size={13} /></button>
            </th>
          </tr>
        </thead>
        <tbody>
          {cells.rows.map((row, r) => {
            const off = excluded.includes(r);
            return (
              <tr key={r} className={off ? 'dg-off' : ''}>
                <td className="dg-n">
                  <button type="button" onClick={() => onToggleRow(r)} title={off ? t('restorePoint') : t('excludePoint')}>{r + 1}</button>
                </td>
                {row.map((v, c) => (
                  <td key={c} className={bad(v) ? 'dg-bad' : ''}>
                    <input value={v} data-r={r} data-c={c} inputMode="decimal" onChange={(e) => setCell(r, c, e.target.value)}
                      onKeyDown={(e) => onKey(e, r, c)} onPaste={(e) => onPaste(e, r, c)} aria-label={t('cellAria', { r: r + 1, col: cells.headers[c] })} />
                  </td>
                ))}
                <td className="dg-row-tools">
                  <button type="button" title={t('delRow')} aria-label={t('delRow')} onClick={() => commit({ ...cells, rows: cells.rows.filter((_, i) => i !== r) })}><IconClose size={11} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="dg-add-row" onClick={() => { commit({ ...cells, rows: [...cells.rows, cells.headers.map(() => '')] }); requestAnimationFrame(() => focus(cells.rows.length, 0)); }}>
        <IconPlus size={13} />{t('row')}
      </button>
    </div>
  );
}
