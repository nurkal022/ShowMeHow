import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { canManageGroup } from '@/lib/org/access';
import { getGroup } from '@/lib/org/groups';
import { listGroupCredentials } from '@/lib/org/credentials';
import { siteAddress } from '@/lib/http/site';
import CredentialSheet from '@/components/org/CredentialSheet';
import PrintButton from '@/components/org/PrintButton';
import { getLocale, getT } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { orgPeople } from '@/i18n/messages/org-people';

export async function generateMetadata() {
  const t = await getT(orgPeople);
  return { title: `${t('sheet')} — Tesseract` };
}

export default async function CredentialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/org/groups/${id}/credentials`);
  if (!user) return null;
  if (!(await canManageGroup(user, id))) notFound();
  const group = await getGroup(id);
  if (!group) notFound();
  const [cards, site] = await Promise.all([listGroupCredentials(group.id), siteAddress()]);
  const locale = await getLocale();
  const t = translator(orgPeople, locale);
  const pending = cards.filter((c) => c.password !== null);
  const changed = cards.filter((c) => c.password === null);
  return (
    <>
      <div className="cabinet-head no-print">
        <div className="page-head">
          <Link href={`/org/groups/${group.id}`} className="muted">{t('credBack', { title: group.title })}</Link>
          <h1>{t('credTitle', { title: group.title })}</h1>
        </div>
        {pending.length > 0 && <PrintButton />}
      </div>
      <p className="muted no-print">{t('credIntro')}</p>
      {pending.length === 0
        ? <p className="empty-state">{t('credEmpty')}</p>
        : <CredentialSheet cards={pending} site={site} groupTitle={group.title} locale={locale} />}
      {changed.length > 0 && (
        <section className="panel no-print">
          <h2>{t('credChanged')}</h2>
          <p className="muted">{changed.map((c) => c.displayName).join(', ')}</p>
        </section>
      )}
    </>
  );
}
