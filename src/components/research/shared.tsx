'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { ResearchItem, ResearchProject } from '@/lib/research/store';
import type { PlotSpec } from '@/lib/research/plot';
import { figureSize, figureWarnings, presetByKey } from '@/lib/research/journals';
import { IconCheck, IconCopy, IconDownload, IconLock, IconUsers } from '@/components/icons';
import { currentLocale, useLocale, useT } from '@/i18n/client';
import { translator } from '@/i18n/core';
import { localizeMessage } from '@/i18n/catalog';
import { common } from '@/i18n/messages/common';
import { researchCommon } from '@/i18n/messages/research-common';

/* ----------------------------------- запросы ----------------------------------- */

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Сервер пишет по-русски — переводим на язык интерфейса здесь, чтобы любой catch показывал понятный текст.
  if (!res.ok) {
    const locale = currentLocale();
    const msg = (data as { error?: string }).error;
    throw new Error(msg ? localizeMessage(msg, locale) : translator(researchCommon, locale)('httpError', { n: res.status }));
  }
  return data as T;
}

export const patchItem = (id: string, body: Record<string, unknown>) =>
  api<{ item: ResearchItem }>(`/api/research/items/${id}`, { method: 'PATCH', body }).then((r) => r.item);

/**
 * Автосохранение документа: пишет через паузу после последней правки, чтобы
 * слайдер не слал запрос на каждый пиксель. Возвращает состояние для подписи.
 */
export function useAutosave(id: string, doc: unknown, delay = 900): 'saved' | 'saving' | 'dirty' | 'error' {
  const [state, setState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  // Сравниваем с последним сохранённым, а не «пропускаем первый запуск»: в Strict Mode
  // эффект срабатывает дважды, и открытие материала слало бы лишний PATCH.
  const saved = useRef(JSON.stringify(doc));
  useEffect(() => {
    const json = JSON.stringify(doc);
    if (json === saved.current) return;
    setState('dirty');
    const t = setTimeout(() => {
      setState('saving');
      patchItem(id, { doc }).then(() => { saved.current = json; setState('saved'); }, () => setState('error'));
    }, delay);
    return () => clearTimeout(t);
  }, [id, doc, delay]);
  return state;
}

export function SaveBadge({ state }: { state: ReturnType<typeof useAutosave> }) {
  const tc = useT(common);
  const text = { saved: tc('saved'), saving: tc('saving'), dirty: tc('unsaved'), error: tc('saveFailed') }[state];
  return <span className={`rs-save rs-save-${state}`}>{state === 'saved' && <IconCheck size={13} />}{text}</span>;
}

/* ----------------------------------- экспорт ----------------------------------- */

export function download(name: string, content: string | Blob, mime = 'text/plain;charset=utf-8') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** SVG → PNG в заданном масштабе: 3× даёт ~300 dpi для рисунка в колонку журнала. */
export async function svgToPng(svg: string, scale = 3): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('svg')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('png'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const fileSafe = (s: string) => (s.trim() || 'figure').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);

export function CopyButton({ text, label, className = 'btn btn-sm btn-secondary' }: { text: string; label?: string; className?: string }) {
  const tc = useT(common);
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} onClick={() => {
      navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => {});
    }}>
      {done ? <IconCheck size={14} /> : <IconCopy size={14} />}{done ? tc('copied') : label ?? tc('copy')}
    </button>
  );
}

/**
 * Выгрузка рисунка. С `render` рисунок можно заказать под колонку журнала: он
 * перерисовывается в физическом размере (шрифт остаётся читаемым), а PNG
 * масштабируется до dpi журнала. Старый вызов со `svg` работает как раньше.
 */
export function ExportBar({ svg, render, spec, name, size = '', children }: {
  svg?: string | null;
  render?: (opts: { width: number; height: number }) => string;
  /** Пресет размера из оформления рисунка («elsevier:single»); '' — как на экране. */
  size?: string;
  /** Описание рисунка — по нему проверяем требования журнала. */
  spec?: PlotSpec;
  name: string;
  /** Доп. кнопки в ту же строку (например, «Jupyter»). */
  children?: ReactNode;
}) {
  const t = useT(researchCommon);
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const chosen = render ? presetByKey(size) : null;
  if (!svg && !render) return null;

  const dims = chosen ? figureSize(chosen.preset, chosen.column) : null;
  // Рисуем по клику, а не при каждом рендере: редактор перерисовывается на каждое движение слайдера.
  const current = () => (dims && render ? render({ width: dims.widthPx, height: dims.heightPx }) : svg ?? render!({ width: 760, height: 480 }));
  const scale = dims?.scale ?? 3;
  const suffix = chosen ? `-${chosen.preset.key}-${chosen.column === 'double' ? '2col' : '1col'}` : '';
  const warnings = chosen && spec ? figureWarnings(spec, chosen.preset, locale) : [];

  return (
    <div className="rs-export-wrap">
      <div className="rs-export">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => download(`${fileSafe(name)}${suffix}.svg`, current(), 'image/svg+xml')}>
          <IconDownload size={14} />{t('svgForPaper')}
        </button>
        <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { download(`${fileSafe(name)}${suffix}.png`, await svgToPng(current(), scale)); } finally { setBusy(false); }
        }}>
          <IconDownload size={14} />{t('pngDpi', { dpi: chosen ? chosen.preset.dpi : 300 })}
        </button>
        {children}
      </div>
      {chosen && dims && (
        <p className="muted rs-small rs-export-note">
          {t('exportNote', { w: chosen.preset[chosen.column].mm, h: Math.round(dims.heightPx / (96 / 25.4)), font: chosen.preset.font })}
        </p>
      )}
      {warnings.map((w) => <p key={w} className="muted rs-small rs-export-note">{w}</p>)}
    </div>
  );
}

/* --------------------------------- публикация --------------------------------- */

export function SharePanel({ token, onToggle, what }: { token: string | null; onToggle: (on: boolean) => Promise<void>; what: string }) {
  const t = useT(researchCommon);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = token ? `${origin}/r/${token}` : '';
  useEffect(() => {
    if (url && canvas.current) QRCode.toCanvas(canvas.current, url, { width: 132, margin: 1 }).catch(() => {});
  }, [url]);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try { await onToggle(on); } finally { setBusy(false); }
  };
  return (
    <section className="rs-panel">
      <h3>{token ? <IconUsers size={16} /> : <IconLock size={16} />}{t('publication')}</h3>
      {!token ? (
        <>
          <p className="muted rs-small">{t('privateHint', { what })}</p>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => toggle(true)}>{t('publishByLink')}</button>
        </>
      ) : (
        <div className="rs-share">
          <div className="rs-share-main">
            <label className="field"><span>{t('link')}</span><input readOnly value={url} onFocus={(e) => e.target.select()} /></label>
            <div className="rs-row">
              <CopyButton text={url} label={t('link')} />
              <CopyButton text={`<iframe src="${url}?embed=1" width="760" height="560" style="border:0" loading="lazy"></iframe>`} label={t('embedCode')} />
              <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => toggle(false)}>{t('closeAccess')}</button>
            </div>
          </div>
          <figure className="rs-qr"><canvas ref={canvas} /><figcaption>{t('qrPoster')}</figcaption></figure>
        </div>
      )}
    </section>
  );
}

export function ProjectSelect({ value, projects, onChange }: {
  value: string | null; projects: Pick<ResearchProject, 'id' | 'title'>[]; onChange: (id: string | null) => void;
}) {
  const t = useT(researchCommon);
  return (
    <label className="field rs-project-select">
      <span>{t('project')}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t('noProject')}</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
    </label>
  );
}
