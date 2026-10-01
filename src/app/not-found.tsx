import Link from 'next/link';
import SiteChrome from '@/components/SiteChrome';
import { getT } from '@/i18n/server';
import { app } from '@/i18n/messages/app';

export async function generateMetadata() {
  return { title: (await getT(app))('nfMeta') };
}

/** Общий 404: чужой кабинет и несуществующий адрес выглядят одинаково. */
export default async function NotFound() {
  const t = await getT(app);
  return (
    <SiteChrome>
      <div className="not-found">
        <strong>404</strong>
        <h1>{t('nfTitle')}</h1>
        <p className="muted">{t('nfText')}</p>
        <Link href="/" className="btn btn-primary">{t('nfHome')}</Link>
      </div>
    </SiteChrome>
  );
}
