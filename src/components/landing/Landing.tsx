import { listBundledDemos } from '@/lib/demos';
import { labsFor } from '@/lib/labs';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getLocale } from '@/i18n/server';
import type { AuthUser } from '@/lib/auth/users';
import { listMemberships } from '@/lib/org/access';
import { GUEST_NAV_SECTIONS, navSections } from '@/lib/org/policy';
import LandingView, { type LandingCard } from './LandingView';
import { landingAsset } from '@/lib/public-assets';

/** Первая страница для гостя: интерактивные сцены, лаборатории и призыв начать. */
export default async function Landing({ user }: { user: AuthUser | null }) {
  const signedIn = !!user;
  // Меню то же, что в шапке остального сайта: те же разделы для той же роли.
  const sections = user ? navSections(user, await listMemberships(user.id)) : [...GUEST_NAV_SECTIONS];
  const { registrationOpen } = await getPlatformSettings();
  const locale = await getLocale();
  const cards: LandingCard[] = [
    ...labsFor(locale).map((l) => ({ href: `/lab/${l.slug}`, img: `/labs/${l.slug}.png`, title: l.title, tag: 'vr', external: false })),
    ...listBundledDemos().map((d) => ({
      href: `/api/public/demos/${d.slug}`, img: `/api/public/demos/${d.slug}/thumb`, title: d.title, tag: d.subject, external: true,
    })),
  ];
  const startHref = signedIn ? '/create' : registrationOpen ? '/register' : '/login';
  const roleImgs = ['uni-teacher', 'uni-student', 'uni-researcher', 'uni-university'].map((n) => landingAsset(`${n}.webp`));
  return <LandingView cards={cards} roleImgs={roleImgs} startHref={startHref} registrationOpen={registrationOpen} signedIn={signedIn}
    sections={sections.map(({ key, href }) => ({ key, href }))} />;
}
