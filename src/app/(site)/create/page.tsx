import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Workbench from '@/components/Workbench';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listMemberships } from '@/lib/org/access';
import { homeRedirect } from '@/lib/org/policy';

/** Мастерская «Создать». Раньше жила на «/», теперь там лендинг для всех. */
export default async function CreatePage() {
  // requirePageUser сам уводит на /login при протухшей или отсутствующей сессии;
  // null здесь означает временный пароль — тогда layout подменяет страницу формой смены.
  const user = await requirePageUser('/create');
  const target = user ? homeRedirect(user, await listMemberships(user.id)) : null;
  if (target) redirect(target);
  return (
    <div className="space space-app">
      <Suspense>
        <Workbench />
      </Suspense>
    </div>
  );
}
