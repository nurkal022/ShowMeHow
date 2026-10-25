import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/http/page-guards';
import { getUserCard } from '@/lib/admin/users';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { formatDate } from '@/lib/lms/format';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatusPill, { personStatus, personStatusKey } from '@/components/cabinet/StatusPill';
import UserActions from '@/components/admin/UserActions';
import LimitFields from '@/components/admin/LimitFields';
import { aiAllowance, quotaStatus } from '@/lib/quota';
import { listMemberships } from '@/lib/org/access';
import { db } from '@/lib/db/client';
import type { AuthUser } from '@/lib/auth/users';
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
  const asUser = card as unknown as AuthUser;
  const [quota, ai, personal] = await Promise.all([
    listMemberships(card.id).then((ms) => quotaStatus(asUser, ms)), aiAllowance(asUser),
    db().query<{ generation_limit: number | null; ai_daily_limit: number | null }>(
      'SELECT generation_limit, ai_daily_limit FROM users WHERE id = $1', [card.id]).then((r) => r.rows[0]),
  ]);
  const shown = (n: number | null) => (n === null ? t('unlimited') : String(n));
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
        <h2>{t('limitsTitle')}</h2>
        <LimitFields endpoint={`/api/admin/users/${card.id}`} method="POST" extra={{ action: 'set-limits' }} fields={[
          { key: 'generationLimit', label: t('userGen'), optional: true, value: personal?.generation_limit ?? null,
            hint: t('userGenHint', { used: quota.used, limit: shown(quota.limit) }) },
          { key: 'aiDailyLimit', label: t('userAi'), optional: true, value: personal?.ai_daily_limit ?? null,
            hint: t('userAiHint', { used: ai.used, limit: shown(ai.limit) }) },
        ]} />
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
