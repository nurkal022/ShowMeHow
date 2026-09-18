import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Workbench from '@/components/Workbench';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listMemberships } from '@/lib/org/access';
import { homeRedirect } from '@/lib/org/policy';

export default async function Home() {
  // requirePageUser сам уводит на /login при протухшей или отсутствующей сессии;
  // null здесь означает временный пароль — тогда layout подменяет страницу
  // формой смены, и ниже просто ничего лишнего не запрашиваем.
  const user = await requirePageUser('/');
  const target = user ? homeRedirect(user, await listMemberships(user.id)) : null;
  if (target) redirect(target);
  return (
    <Suspense>
      <Workbench />
    </Suspense>
  );
}
