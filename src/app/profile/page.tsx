import { redirect } from 'next/navigation';
import { currentUserFromCookies } from '@/lib/auth/session';
import { getProfile } from '@/lib/auth/users';
import { quotaStatus } from '@/lib/quota';
import { listMemberships } from '@/lib/org/access';
import { hasStaffRole } from '@/lib/org/policy';
import ProfileView from '@/components/ProfileView';

export default async function ProfilePage() {
  const user = await currentUserFromCookies();
  if (!user) redirect('/login?next=/profile');
  const memberships = await listMemberships(user.id);
  const [profile, quota] = await Promise.all([getProfile(user.id), quotaStatus(user, memberships)]);
  if (!profile) redirect('/login');
  return <ProfileView profile={profile} quota={quota} orgQuota={hasStaffRole(memberships)} />;
}
