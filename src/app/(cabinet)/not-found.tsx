import Link from 'next/link';
import { getT } from '@/i18n/server';
import { cabinet } from '@/i18n/messages/cabinet';

/** 404 внутри кабинета: рамка остаётся, чтобы было куда уйти. */
export default async function CabinetNotFound() {
  const t = await getT(cabinet);
  return (
    <div className="not-found">
      <strong>404</strong>
      <h1>{t('nfTitle')}</h1>
      <p className="muted">{t('nfText')}</p>
      <Link href="/" className="btn btn-primary">{t('toSite')}</Link>
    </div>
  );
}
