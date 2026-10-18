'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/i18n/client';
import { showcase } from '@/i18n/messages/showcase';

export interface ShowcaseItem {
  key: string; kind: 'sim' | 'vr'; href: string; img: string; title: string; subject: string; text: string;
  phases: boolean; mode: '2d' | '3d';
}

/** Витрина: фильтр по виду и предмету, поиск, сетка карточек в стиле «Космос». */
export default function ShowcaseView({ items, makeHref, heroArt, initialSubject }: {
  items: ShowcaseItem[]; makeHref: string; heroArt: string; initialSubject?: string;
}) {
  const t = useT(showcase);
  const [kind, setKind] = useState<'all' | 'sim' | 'vr' | 'phases'>('all');
  const [q, setQ] = useState('');
  const subjects = useMemo(() => [...new Set(items.map((i) => i.subject.split(/\s*[·,]\s*/)[0]))].sort(), [items]);
  // ?subject= с главной — начало названия предмета, без учёта регистра; не нашёлся — без фильтра.
  const [subject, setSubject] = useState<string | null>(() => {
    const want = initialSubject?.trim().toLowerCase();
    return (want && subjects.find((s) => s.toLowerCase().startsWith(want))) || null;
  });
  const shown = items.filter((i) =>
    (kind === 'all' || (kind === 'phases' ? i.phases : i.kind === kind)) &&
    (!subject || i.subject.startsWith(subject)) &&
    (!q.trim() || (i.title + ' ' + i.subject + ' ' + i.text).toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space">
      <div className="sp-wrap">
        <header className="sp-page-head sp-page-head-art" style={{ ['--art' as string]: `url(${heroArt})` }}>
          <span className="sp-kicker">{t('kicker')}</span>
          <h1 className="sp-title">{t('title')}</h1>
          <p>{t('lead')}</p>
        </header>
        <div className="sp-toolbar">
          <div className="sp-chips">
            {([['all', t('all')], ['sim', t('sims')], ['phases', t('phases')], ['vr', t('vr')]] as const).map(([k, label]) => (
              <button key={k} type="button" className={kind === k ? 'sp-chip on' : 'sp-chip'} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
          <label className="sp-search">
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
          </label>
        </div>
        <div className="sp-chips sp-subjects">
          {subjects.map((s) => (
            <button key={s} type="button" className={subject === s ? 'sp-chip on' : 'sp-chip'} onClick={() => setSubject(subject === s ? null : s)}>{s}</button>
          ))}
        </div>
        <p className="sp-count">{t('count', { n: shown.length })}</p>
        {shown.length === 0 ? <p className="sp-empty">{t('empty')}</p> : (
          <div className="sp-grid">
            {shown.map((i, n) => (
              <a key={i.key} href={i.href} className="sp-card" style={{ animationDelay: `${Math.min(n, 12) * 40}ms` }}
                {...(i.kind === 'sim' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <div className="sp-card-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.img} alt="" loading="lazy" decoding="async" />
                  <span className="sp-card-badge">{i.kind === 'vr' ? 'VR' : i.phases ? t('phases') : i.mode.toUpperCase()}</span>
                  <span className="sp-card-go">→</span>
                </div>
                <div className="sp-card-body">
                  <small>{i.subject}</small>
                  <strong>{i.title}</strong>
                  <p>{i.text}</p>
                </div>
              </a>
            ))}
          </div>
        )}
        <section className="sp-make sp-glass">
          <div><h2>{t('makeTitle')}</h2><p>{t('makeLead')}</p></div>
          <Link href={makeHref} className="sp-btn sp-btn-primary">{t('make')} →</Link>
        </section>
      </div>
    </div>
  );
}
