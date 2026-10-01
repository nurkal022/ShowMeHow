import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/http/page-guards';
import { getUserCard } from '@/lib/admin/users';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { formatDate } from '@/lib/lms/format';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatusPill, { personStatus, personStatusKey } from '@/components/cabinet/StatusPill';
import UserActions from '@/components/admin/UserActions';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { admin as adminDict } from '@/i18n/messages/admin';
import { cabinet } from '@/i18n/messages/cabinet';

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage('/admin/users');
  if (!admin) return null;
  const { id } = await params;
  const card = await getUserCard(id);
  if (!card) notFound();
  const locale = await getLocale();
  const t = translator(adminDict, locale);
  const tk = translator(cabinet, locale);
  const status = { ...personStatus(card), label: tk(personStatusKey(card)) };
  return (
    <>
      <CabinetHeader title={userLabel(card)} subtitle={t('userSub', { contact: userContact(card), date: formatDate(card.createdAt, locale) })}>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        {card.role === 'admin' && <StatusPill tone="accent">{t('platformAdmin')}</StatusPill>}
      </CabinetHeader>
      <section className="panel">
        <h2>{t('userActions')}</h2>
        <UserActions userId={card.id} label={userLabel(card)} disabled={card.disabled}
          isAdmin={card.role === 'admin'} isSelf={card.id === admin.id} />
      </section>
      <section className="panel">
        <h2>{t('memberships')}</h2>
        {card.memberships.length === 0
          ? <p className="muted">{t('noMemberships')}</p>
          : (
            <ul className="topic-toc">
              {card.memberships.map((m) => (
                <li key={m.orgId}>
                  <Link href={`/admin/orgs/${m.orgId}`}>{m.orgName}</Link>
                  <StatusPill tone="neutral">{tk(`role_${m.role}`)}</StatusPill>
                  {m.archived && <StatusPill tone="warn">{t('orgArchived')}</StatusPill>}
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
