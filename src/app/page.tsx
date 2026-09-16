import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Workbench from '@/components/Workbench';
import { currentUserFromCookies } from '@/lib/auth/session';
import { listMemberships } from '@/lib/org/access';
import { homeRedirect } from '@/lib/org/policy';

export default async function Home() {
  // Строгий вариант: без сессии (или с временным паролем — тогда layout покажет
  // форму смены) страницу не трогаем, как и раньше. Гостя на /login уводит middleware.
  const user = await currentUserFromCookies();
  const target = user ? homeRedirect(user, await listMemberships(user.id)) : null;
  if (target) redirect(target);
  return (
    <Suspense>
      <Workbench />
    </Suspense>
  );
}
