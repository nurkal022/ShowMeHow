'use client';
import { useEffect, useState } from 'react';
import { citations, TOKEN_URL, ZENODO_LICENSES, type ZenodoInfo } from '@/lib/research/zenodo';
import { IconAlert, IconBook, IconClose, IconPlus } from '@/components/icons';
import { api, CopyButton, svgToPng } from './shared';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchZenodo } from '@/i18n/messages/research-zenodo';

const LICENSE_KEYS: Record<string, 'lic_cc_by' | 'lic_cc_by_sa' | 'lic_cc0' | 'lic_mit'> = {
  'cc-by-4.0': 'lic_cc_by', 'cc-by-sa-4.0': 'lic_cc_by_sa', 'cc0-1.0': 'lic_cc0', mit: 'lic_mit',
};

/**
 * DOI через Zenodo: постоянная запись в архиве CERN от имени автора. Публикация
 * необратима, поэтому путь длинный нарочно: форма с предпросмотром файлов и
 * обязательная галочка «понимаю, удалить нельзя».
 */

interface Settings { connected: boolean; sandbox: boolean; name?: string }
interface Creator { name: string; affiliation: string; orcid: string }
interface Preview {
  files: { name: string; size: number }[];
  figures: Record<string, string>;
  defaults: { title: string; description: string; keywords: string[]; creators: Creator[]; version: string };
}

const kb = (n: number, t: (k: 'bytes' | 'kb' | 'mb', p: { n: string | number }) => string) =>
  (n < 1024 ? t('bytes', { n }) : n < 1024 * 1024 ? t('kb', { n: (n / 1024).toFixed(1) }) : t('mb', { n: (n / 1024 / 1024).toFixed(1) }));

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(b);
  });
}

export default function ZenodoPanel({ target, id, zenodo, authorName }: {
  target: 'item' | 'project'; id: string; zenodo: ZenodoInfo | null; authorName?: string;
}) {
  const t = useT(researchZenodo);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [info, setInfo] = useState(zenodo);
  const [author, setAuthor] = useState(authorName ?? '');
  const [form, setForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ settings: Settings; authorName: string }>('/api/research/zenodo').then((r) => {
      setSettings(r.settings);
      setAuthor((a) => a || r.authorName);
    }, (e: Error) => setError(e.message));
  }, []);

  return (
    <section className="rs-panel rs-zenodo">
      <h3><IconBook size={16} />{t('title')}</h3>
      {error && <p className="rs-error">{error}</p>}
      {!settings ? <div className="rs-skeleton rs-zen-skel" /> : !settings.connected ? (
        <Connect onDone={setSettings} />
      ) : (
        <>
          {info && !form && <Published info={info} />}
          {!info && !form && (
            <p className="muted rs-small">
              {target === 'item' ? t('leadItem') : t('leadProject')}
            </p>
          )}
          {form ? (
            <PublishForm target={target} id={id} author={author} prev={info} sandbox={settings.sandbox}
              onCancel={() => setForm(false)} onDone={(z) => { setInfo(z); setForm(false); }} />
          ) : (
            <div className="rs-row">
              <button type="button" className={`btn btn-sm ${info ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setForm(true)}>
                {info ? t('newVersion') : t('prepare')}
              </button>
              <span className="muted rs-small">
                {settings.sandbox ? 'sandbox.zenodo.org' : 'zenodo.org'}
                {' · '}
                <button type="button" className="rs-linkbtn" onClick={async () => {
                  if (!confirm(t('confirmDisconnect'))) return;
                  setSettings((await api<{ settings: Settings }>('/api/research/zenodo', { method: 'DELETE' })).settings);
                }}>{t('disconnect')}</button>
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Connect({ onDone }: { onDone: (s: Settings) => void }) {
  const t = useT(researchZenodo);
  const [token, setToken] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="rs-zen-form" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError(null);
      try {
        onDone((await api<{ settings: Settings }>('/api/research/zenodo', { method: 'PUT', body: { token, sandbox } })).settings);
      } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
    }}>
      <p className="muted rs-small">
        {t('about1')} <b>{t('irreversible')}</b>{t('about2')}
      </p>
      <ol className="rs-small rs-zen-steps">
        <li>{t('step1a')} <a href={TOKEN_URL(sandbox)} target="_blank" rel="noreferrer">{t('step1link')}</a> {t('step1b')} <code>deposit:write</code> {t('and')} <code>deposit:actions</code>.</li>
        <li>{t('step2')}</li>
      </ol>
      <label className="field"><span>{t('token')}</span>
        <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
      </label>
      <label className="rs-check">
        <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
        {t('sandbox')}
      </label>
      {error && <p className="rs-error">{error}</p>}
      <div className="rs-row"><button type="submit" className="btn btn-sm btn-primary" disabled={busy || !token.trim()}>{busy ? t('checking') : t('connect')}</button></div>
    </form>
  );
}

function Published({ info }: { info: ZenodoInfo }) {
  const t = useT(researchZenodo);
  const f = useFormat();
  const locale = useLocale();
  const doiUrl = `https://doi.org/${info.doi}`;
  const year = new Date(info.publishedAt).getFullYear();
  const cite = citations({ doi: info.doi, title: info.title ?? '', creators: info.creators ?? [], version: info.version, year, uploadType: info.uploadType }, locale);
  return (
    <div className="rs-zen-done">
      <a className="rs-doi" href={info.sandbox ? info.url : doiUrl} target="_blank" rel="noreferrer">
        <span className="rs-doi-tag">DOI</span><span className="rs-doi-value">{info.doi}</span>
      </a>
      <p className="muted rs-small">
        {t('versionLine', { v: info.version, date: f.date(info.publishedAt, { day: 'numeric', month: 'numeric', year: 'numeric' }) })} <a href={info.url} target="_blank" rel="noreferrer">{t('zenodoPage')}</a>
        {info.conceptDoi && <> · {t('allVersions')} <a href={`https://doi.org/${info.conceptDoi}`} target="_blank" rel="noreferrer">{info.conceptDoi}</a></>}
      </p>
      {info.sandbox && (
        <p className="rs-zen-warn rs-small"><IconAlert size={14} />{t('sandboxRecord')}</p>
      )}
      <div className="rs-cite">
        {([[t('gost'), cite.gost], ['APA', cite.apa], ['BibTeX', cite.bibtex]] as const).map(([name, text]) => (
          <div key={name} className="rs-cite-row">
            <div className="rs-panel-head"><span className="rs-kind">{name}</span><CopyButton text={text} /></div>
            <pre className="rs-cite-text">{text}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function PublishForm({ target, id, author, prev, sandbox, onCancel, onDone }: {
  target: 'item' | 'project'; id: string; author: string; prev: ZenodoInfo | null; sandbox: boolean;
  onCancel: () => void; onDone: (z: ZenodoInfo) => void;
}) {
  const t = useT(researchZenodo);
  const tc = useT(common);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [keywords, setKeywords] = useState('');
  const [license, setLicense] = useState<string>('cc-by-4.0');
  const [relatedDoi, setRelatedDoi] = useState('');
  const [version, setVersion] = useState('1');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Preview>(`/api/research/zenodo/publish?target=${target}&id=${id}`).then((p) => {
      setPreview(p);
      const d = p.defaults;
      setTitle(prev?.title ?? d.title);
      setDescription(d.description);
      const fromPrev = prev?.creators?.map((name) => ({ name, affiliation: '', orcid: '' }));
      setCreators(fromPrev?.length ? fromPrev : d.creators.length ? d.creators : [{ name: author, affiliation: '', orcid: '' }]);
      setKeywords(d.keywords.join(', '));
      setVersion(d.version);
    }, (e: Error) => setError(e.message));
  }, [target, id, prev, author]);

  if (!preview) return error ? <p className="rs-error">{error}</p> : <div className="rs-skeleton rs-zen-skel" />;
  const setCreator = (i: number, patch: Partial<Creator>) => setCreators((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const pngNames = Object.keys(preview.figures);

  async function submit() {
    setError(null);
    try {
      // PNG рисуем в браузере (шрифты и растеризация — там), сервер лишь кладёт готовые файлы.
      setBusy(t('preparingPng'));
      const pngs: Record<string, string> = {};
      for (const [name, svg] of Object.entries(preview!.figures)) {
        try { pngs[name] = await blobToBase64(await svgToPng(svg, 3)); } catch { /* без PNG запись всё равно полная: есть SVG */ }
      }
      setBusy(t('uploading'));
      const r = await api<{ zenodo: ZenodoInfo }>('/api/research/zenodo/publish', {
        method: 'POST',
        body: {
          target, id, confirm: true, pngs,
          metadata: {
            title, description, creators, license, version, relatedDoi: relatedDoi.trim() || undefined,
            keywords: keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean),
          },
        },
      });
      onDone(r.zenodo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rs-zen-form">
      {prev && <p className="muted rs-small">{t('newVersionOf', { doi: prev.doi })}</p>}
      {sandbox && <p className="rs-zen-warn rs-small"><IconAlert size={14} />{t('sandboxWarn')}</p>}
      <label className="field"><span>{t('recTitle')}</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} /></label>
      <label className="field"><span>{t('description')}</span>
        <textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={t('descriptionPh')} />
      </label>
      <div className="rs-zen-creators">
        <span className="rs-small muted">{t('creatorsHint')}</span>
        {creators.map((c, i) => (
          <div key={i} className="rs-zen-creator">
            <input className="input" placeholder={t('namePh')} value={c.name} onChange={(e) => setCreator(i, { name: e.target.value })} aria-label={t('author')} />
            <input className="input" placeholder={t('affiliation')} value={c.affiliation} onChange={(e) => setCreator(i, { affiliation: e.target.value })} aria-label={t('affiliation')} />
            <input className="input" placeholder="0000-0000-0000-0000" value={c.orcid} onChange={(e) => setCreator(i, { orcid: e.target.value })} aria-label="ORCID" />
            <button type="button" className="icon-btn" aria-label={t('removeAuthor')} disabled={creators.length < 2}
              onClick={() => setCreators((cs) => cs.filter((_, k) => k !== i))}><IconClose size={15} /></button>
          </div>
        ))}
        <div><button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreators((cs) => [...cs, { name: '', affiliation: '', orcid: '' }])}><IconPlus size={14} />{t('author')}</button></div>
      </div>
      <div className="rs-zen-grid">
        <label className="field"><span>{t('keywords')}</span><input value={keywords} onChange={(e) => setKeywords(e.target.value)} /></label>
        <label className="field"><span>{t('license')}</span>
          <select value={license} onChange={(e) => setLicense(e.target.value)}>
            {ZENODO_LICENSES.map((l) => <option key={l.id} value={l.id}>{LICENSE_KEYS[l.id] ? t(LICENSE_KEYS[l.id]) : l.label}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('relatedDoi')}</span><input value={relatedDoi} onChange={(e) => setRelatedDoi(e.target.value)} placeholder="10.1234/abcd" /></label>
        <label className="field"><span>{t('version')}</span><input value={version} onChange={(e) => setVersion(e.target.value)} maxLength={40} /></label>
      </div>
      <details className="rs-zen-files" open>
        <summary className="rs-small">{t('files', { n: preview.files.length + pngNames.length })}</summary>
        <ul className="rs-small rs-mono">
          {preview.files.map((f) => <li key={f.name}><span>{f.name}</span><span className="muted">{kb(f.size, t)}</span></li>)}
          {pngNames.map((n) => <li key={n}><span>{n}</span><span className="muted">PNG 300 dpi</span></li>)}
        </ul>
      </details>
      <label className="rs-check rs-zen-agree">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        {t('agree')}
      </label>
      {error && <p className="rs-error">{error}</p>}
      <div className="rs-row">
        <button type="button" className="btn btn-sm btn-primary" disabled={!agree || !!busy || !title.trim()} onClick={submit}>
          {busy ?? t('publish')}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={onCancel}>{tc('cancel')}</button>
      </div>
    </div>
  );
}
