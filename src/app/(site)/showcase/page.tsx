import { listBundledDemos } from '@/lib/demos';
import { labsFor } from '@/lib/labs';
import { getLocale, getT } from '@/i18n/server';
import { showcase } from '@/i18n/messages/showcase';
import { currentUserFromCookies } from '@/lib/auth/session';
import { getPlatformSettings } from '@/lib/platform-settings';
import ShowcaseView, { type ShowcaseItem } from '@/components/ShowcaseView';
import { landingAsset } from '@/lib/public-assets';

export async function generateMetadata() {
  return { title: (await getT(showcase))('meta') };
}

/** Витрина открыта без входа (middleware): демо и лаборатории и так публичны. */
export default async function ShowcasePage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const locale = await getLocale();
  const user = await currentUserFromCookies();
  const { registrationOpen } = await getPlatformSettings();
  const items: ShowcaseItem[] = [
    ...listBundledDemos().map((d) => ({
      key: 'demo:' + d.slug, kind: 'sim' as const, href: `/api/public/demos/${d.slug}`, img: `/api/public/demos/${d.slug}/thumb`,
      title: d.title, subject: d.subject, text: d.prompt, phases: /фаз|стади|phase/i.test(d.title + ' ' + d.prompt), mode: d.mode ?? '2d',
    })),
    ...labsFor(locale).map((l) => ({
      key: 'lab:' + l.slug, kind: 'vr' as const, href: `/lab/${l.slug}`, img: `/labs/${l.slug}.png`,
      title: l.title, subject: l.subject, text: l.blurb, phases: false, mode: '3d' as const,
    })),
  ];
  const makeHref = user ? '/create' : registrationOpen ? '/register' : '/login';
  return <ShowcaseView items={items} makeHref={makeHref} heroArt={landingAsset('showcase-hero.webp') ?? '/landing/pano-nebula.webp'} initialSubject={subject} />;
}
