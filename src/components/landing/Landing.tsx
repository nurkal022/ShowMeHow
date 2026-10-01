import Link from 'next/link';
import { listBundledDemos } from '@/lib/demos';
import { labsFor } from '@/lib/labs';
import { getPlatformSettings } from '@/lib/platform-settings';
import { Brand } from '@/components/SiteChrome';
import {
  IconCheck, IconCourses, IconLab, IconOrg, IconPlay, IconSpark, IconTask, IconTeach, IconVr, IconWand,
} from '@/components/icons';
import LandingHeroSwitcher from './LandingHeroSwitcher';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { landing } from '@/i18n/messages/landing';

const HERO_DEMOS = ['pendulum', 'interference', 'kepler', 'refraction'];

const FEATURES = [
  { icon: IconWand, key: 'f1' },
  { icon: IconCourses, key: 'f2' },
  { icon: IconTask, key: 'f3' },
  { icon: IconSpark, key: 'f4' },
  { icon: IconVr, key: 'f5' },
  { icon: IconOrg, key: 'f6' },
] as const;

const STEPS = [
  { n: '1', key: 's1' },
  { n: '2', key: 's2' },
  { n: '3', key: 's3' },
] as const;

/** Первая страница для гостя: показывает продукт, а не форму входа. */
export default async function Landing() {
  const demos = listBundledDemos().filter((d) => HERO_DEMOS.includes(d.slug))
    .sort((a, b) => HERO_DEMOS.indexOf(a.slug) - HERO_DEMOS.indexOf(b.slug));
  const gallery = listBundledDemos();
  const { registrationOpen } = await getPlatformSettings();
  const locale = await getLocale();
  const t = translator(landing, locale);

  return (
    <div className="land">
      <header className="land-nav">
        <Brand />
        <nav>
          <a href="#features">{t('navFeatures')}</a>
          <a href="#how">{t('navHow')}</a>
          <Link href="/labs">{t('navLabs')}</Link>
        </nav>
        <span className="spacer" />
        <LanguageSwitcher compact label={t('languageAria')} />
        <Link className="btn btn-ghost" href="/login">{t('login')}</Link>
        {registrationOpen && <Link className="btn btn-primary" href="/register">{t('tryIt')}</Link>}
      </header>

      <section className="land-hero">
        <div className="land-hero-bg" aria-hidden="true"><i /><i /><i /></div>
        <div className="land-hero-text">
          <span className="land-pill"><IconSpark size={14} />{t('pill')}</span>
          <h1>{t('heroBefore')}<em>{t('heroEm')}</em>{t('heroAfter')}</h1>
          <p>{t('heroText')}</p>
          <div className="land-cta">
            <Link className="btn btn-primary land-big" href={registrationOpen ? '/register' : '/login'}>
              {registrationOpen ? t('ctaCreate') : t('ctaSchool')}
            </Link>
            <Link className="btn land-big" href="/labs"><IconLab size={18} />{t('ctaLab')}</Link>
          </div>
          <ul className="land-proof">
            <li><IconCheck size={15} />{t('proof1')}</li>
            <li><IconCheck size={15} />{t('proof2')}</li>
            <li><IconCheck size={15} />{t('proof3')}</li>
          </ul>
        </div>
        <LandingHeroSwitcher demos={demos.map((d) => ({ slug: d.slug, title: d.title, subject: d.subject }))} />
      </section>

      <section className="land-section" id="features">
        <h2>{t('featuresTitle')}</h2>
        <p className="land-lead">{t('featuresLead')}</p>
        <div className="land-features">
          {FEATURES.map(({ icon: Icon, key }) => (
            <article key={key} className="land-feature">
              <span className="land-feature-icon"><Icon size={22} /></span>
              <h3>{t(`${key}Title`)}</h3>
              <p>{t(`${key}Text`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section land-how" id="how">
        <h2>{t('howTitle')}</h2>
        <ol className="land-steps">
          {STEPS.map((s) => (
            <li key={s.n}><span className="land-step-n">{s.n}</span><h3>{t(`${s.key}Title`)}</h3><p>{t(`${s.key}Text`)}</p></li>
          ))}
        </ol>
      </section>

      <section className="land-section">
        <h2>{t('galleryTitle')}</h2>
        <p className="land-lead">{t('galleryLead')}</p>
        <div className="land-gallery">
          {gallery.map((d) => (
            <a key={d.slug} className="land-card" href={`/api/public/demos/${d.slug}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/public/demos/${d.slug}/thumb`} alt="" loading="lazy" />
              <span className="land-card-text"><small>{d.subject}</small><strong>{d.title}</strong></span>
              <span className="land-card-play" aria-hidden="true"><IconPlay size={16} /></span>
            </a>
          ))}
        </div>
      </section>

      <section className="land-section">
        <h2>{t('labsTitle')}</h2>
        <p className="land-lead">{t('labsLead')}</p>
        <div className="land-labs">
          {labsFor(locale).map((l) => (
            <Link key={l.slug} className="land-lab" href={`/lab/${l.slug}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/labs/${l.slug}.png`} alt="" loading="lazy" />
              <span><small>{l.subject}</small><strong>{l.title}</strong></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="land-final">
        <h2>{t('schoolTitle')}</h2>
        <p>{t('schoolText')}</p>
        <div className="land-roles">
          <span><IconTeach size={18} />{t('roleTeacher')}</span>
          <span><IconCourses size={18} />{t('roleStudent')}</span>
          <span><IconOrg size={18} />{t('roleDirector')}</span>
        </div>
        <Link className="btn btn-primary land-big" href={registrationOpen ? '/register' : '/login'}>{registrationOpen ? t('startFree') : t('login')}</Link>
      </section>

      <footer className="land-foot"><Brand /><span className="muted">{t('footer')}</span></footer>
    </div>
  );
}
