import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/http/page-guards';
import { getUserCard } from '@/lib/admin/users';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { ORG_ROLE_LABELS } from '@/lib/org/types';
import { formatDate } from '@/lib/lms/format';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatusPill, { personStatus } from '@/components/cabinet/StatusPill';
import UserActions from '@/components/admin/UserActions';

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage('/admin/users');
  if (!admin) return null;
  const { id } = await params;
  const card = await getUserCard(id);
  if (!card) notFound();
  const status = personStatus(card);
  return (
    <>
      <CabinetHeader title={userLabel(card)} subtitle={`Входит как ${userContact(card)} · создан ${formatDate(card.createdAt)}`}>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        {card.role === 'admin' && <StatusPill tone="accent">админ платформы</StatusPill>}
      </CabinetHeader>
      <section className="panel">
        <h2>Действия</h2>
        <UserActions userId={card.id} label={userLabel(card)} disabled={card.disabled}
          isAdmin={card.role === 'admin'} isSelf={card.id === admin.id} />
      </section>
      <section className="panel">
        <h2>Членства</h2>
        {card.memberships.length === 0
          ? <p className="muted">Не состоит ни в одной организации — пользуется продуктом как частное лицо.</p>
          : (
            <ul className="topic-toc">
              {card.memberships.map((m) => (
                <li key={m.orgId}>
                  <Link href={`/admin/orgs/${m.orgId}`}>{m.orgName}</Link>
                  <StatusPill tone="neutral">{ORG_ROLE_LABELS[m.role]}</StatusPill>
                  {m.archived && <StatusPill tone="warn">организация в архиве</StatusPill>}
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
