import Landing from '@/components/landing/Landing';
import { currentUserAllowingPasswordChangeFromCookies } from '@/lib/auth/session';

/** «/» — лендинг для всех: и гостю, и вошедшему (ему вместо «Войти» — «В кабинет»). */
export default async function Home() {
  const user = await currentUserAllowingPasswordChangeFromCookies();
  return <Landing user={user} />;
}
