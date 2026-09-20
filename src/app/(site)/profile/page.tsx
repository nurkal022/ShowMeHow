import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getProfile } from '@/lib/auth/users';
import { quotaStatus } from '@/lib/quota';
import { listMemberships } from '@/lib/org/access';
import { hasStaffRole } from '@/lib/org/policy';
import ProfileView from '@/components/ProfileView';

export default async function ProfilePage() {
  const user = await requirePageUser('/profile');
  // Временный пароль — layout уже подменяет страницу формой смены, здесь рендерить нечего.
  if (!user) return null;
  const memberships = await listMemberships(user.id);
  // У учителей и администрации профиль живёт в кабинете — со своей работой и настройками помощника.
  if (user.role === 'admin' || hasStaffRole(memberships)) redirect('/account');
  const [profile, quota] = await Promise.all([getProfile(user.id), quotaStatus(user, memberships)]);
  if (!profile) redirect('/login');
  return <ProfileView profile={profile} quota={quota} orgQuota={hasStaffRole(memberships)} />;
}
