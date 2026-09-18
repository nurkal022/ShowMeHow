import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { canManageGroup } from '@/lib/org/access';
import { getGroup } from '@/lib/org/groups';
import { listGroupCredentials } from '@/lib/org/credentials';
import { siteAddress } from '@/lib/http/site';
import CredentialSheet from '@/components/org/CredentialSheet';
import PrintButton from '@/components/org/PrintButton';

export const metadata = { title: 'Лист паролей — Tesseract' };

export default async function CredentialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/org/groups/${id}/credentials`);
  if (!user) return null;
  if (!(await canManageGroup(user, id))) notFound();
  const group = await getGroup(id);
  if (!group) notFound();
  const [cards, site] = await Promise.all([listGroupCredentials(group.id), siteAddress()]);
  const pending = cards.filter((c) => c.password !== null);
  const changed = cards.filter((c) => c.password === null);
  return (
    <>
      <div className="cabinet-head no-print">
        <div className="page-head">
          <Link href={`/org/groups/${group.id}`} className="muted">← Группа {group.title}</Link>
          <h1>Лист паролей: {group.title}</h1>
        </div>
        {pending.length > 0 && <PrintButton />}
      </div>
      <p className="muted no-print">
        Здесь только ученики, которые ещё не сменили временный пароль, и не дольше 30 дней. Разрежьте лист и
        раздайте карточки: при первом входе каждый придумает свой пароль, и его карточка отсюда исчезнет.
      </p>
      {pending.length === 0
        ? <p className="empty-state">Непросмотренных паролей нет. Если ученик забыл пароль, сбросьте его в карточке группы — новая карточка появится здесь.</p>
        : <CredentialSheet cards={pending} site={site} groupTitle={group.title} />}
      {changed.length > 0 && (
        <section className="panel no-print">
          <h2>Уже сменили пароль</h2>
          <p className="muted">{changed.map((c) => c.displayName).join(', ')}</p>
        </section>
      )}
    </>
  );
}
