'use client';
import { useRef } from 'react';
import { MAX_ROSTER_LINES, rosterKey } from '@/lib/org/roster';
import { IconTrash } from '@/components/icons';

export type RosterRow = [string, string];

const MIN_ROWS = 8;
const blank = (n: number): RosterRow[] => Array.from({ length: n }, () => ['', ''] as RosterRow);

/** Строки таблицы → текст, который понимает серверный разбор списка. */
export function rosterText(rows: RosterRow[]): string {
  return rows.filter((r) => r[0].trim() || r[1].trim()).map((r) => `${r[0].trim()};${r[1].trim()}`).join('\n');
}

/** Вставка из Excel, Google Таблиц или обычного списка: табуляция, «;», «,» или пробел между фамилией и именем. */
export function parsePasted(text: string): RosterRow[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).map((line): RosterRow => {
    const cells = line.includes('\t') ? line.split('\t') : /[;,]/.test(line) ? line.split(/[;,]/) : line.split(/\s+/);
    const parts = cells.map((c) => c.trim()).filter(Boolean);
    // «1. Иванов Иван» из ведомости: номер в начале не нужен.
    if (parts.length > 2 && /^\d+[.)]?$/.test(parts[0])) parts.shift();
    return [parts[0] ?? '', parts.slice(1, 3).join(' ')];
  });
}

/**
 * Список учеников таблицей: вставка прямо из Excel, правка в ячейках, Enter — вниз.
 * Дубли и неполные строки подсвечиваются сразу, до проверки на сервере.
 */
export default function RosterGrid({ rows, onChange }: { rows: RosterRow[]; onChange: (rows: RosterRow[]) => void }) {
  const table = useRef<HTMLTableElement>(null);
  const shown = rows.length < MIN_ROWS ? [...rows, ...blank(MIN_ROWS - rows.length)] : rows;
  const seen = new Map<string, number>();
  for (const r of shown) if (r[0].trim() && r[1].trim()) { const k = rosterKey(r[0], r[1]); seen.set(k, (seen.get(k) ?? 0) + 1); }

  const commit = (next: RosterRow[]) => {
    const trimmed = [...next];
    while (trimmed.length > 0 && !trimmed[trimmed.length - 1][0] && !trimmed[trimmed.length - 1][1]) trimmed.pop();
    // Последняя строка всегда пустая — чтобы было куда печатать дальше.
    onChange([...trimmed, ['', '']].slice(0, MAX_ROSTER_LINES) as RosterRow[]);
  };
  const focus = (r: number, c: number) => requestAnimationFrame(() =>
    table.current?.querySelector<HTMLInputElement>(`input[data-cell="${r}-${c}"]`)?.focus());

  function paste(e: React.ClipboardEvent, r: number, c: number) {
    const text = e.clipboardData.getData('text');
    if (!/[\n\t;]/.test(text)) return;
    e.preventDefault();
    const pasted = parsePasted(text);
    const next = shown.map((x) => [...x] as RosterRow);
    pasted.forEach((p, i) => {
      const at = r + i;
      while (next.length <= at) next.push(['', '']);
      // Одна колонка, вставленная во вторую ячейку, — это имена.
      next[at] = c === 1 && !p[1] ? [next[at][0], p[0]] : p;
    });
    commit(next);
    focus(Math.min(r + pasted.length, MAX_ROSTER_LINES - 1), 0);
  }

  return (
    <div className="cf-grid-wrap">
      <table ref={table} className="cf-grid">
        <thead><tr><th className="cf-grid-n">№</th><th>Фамилия</th><th>Имя</th><th className="cf-grid-x" /></tr></thead>
        <tbody>
          {shown.map((row, r) => {
            const filled = row[0].trim() || row[1].trim();
            const incomplete = filled && (!row[0].trim() || !row[1].trim());
            const dup = !incomplete && filled && (seen.get(rosterKey(row[0], row[1])) ?? 0) > 1;
            return (
              <tr key={r} className={incomplete ? 'warn' : dup ? 'dup' : undefined}>
                <td className="cf-grid-n">{r + 1}</td>
                {[0, 1].map((c) => (
                  <td key={c}>
                    <input data-cell={`${r}-${c}`} value={row[c]} maxLength={60} autoComplete="off" spellCheck={false}
                      aria-label={`${c === 0 ? 'Фамилия' : 'Имя'}, строка ${r + 1}`}
                      placeholder={r === 0 ? (c === 0 ? 'Иванов' : 'Иван') : undefined}
                      onChange={(e) => commit(shown.map((x, i) => (i === r ? (c === 0 ? [e.target.value, x[1]] : [x[0], e.target.value]) : x) as RosterRow))}
                      onPaste={(e) => paste(e, r, c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focus(r + 1, c); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); focus(Math.max(0, r - 1), c); }
                      }} />
                  </td>
                ))}
                <td className="cf-grid-x">
                  {incomplete && <span className="cf-grid-flag" title="Нужны и фамилия, и имя">неполная</span>}
                  {dup && <span className="cf-grid-flag" title="Такая строка уже есть в списке">дубль</span>}
                  {filled && (
                    <button type="button" className="icon-btn" tabIndex={-1} aria-label={`Удалить строку ${r + 1}`}
                      onClick={() => commit(shown.filter((_, i) => i !== r))}><IconTrash size={14} /></button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
