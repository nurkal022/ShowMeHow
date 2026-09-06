import { redirect } from 'next/navigation';
import { currentUserFromCookies } from '@/lib/auth/session';
import { getProfile } from '@/lib/auth/users';
import { quotaStatus } from '@/lib/quota';
import ProfileView from '@/components/ProfileView';

export default async function ProfilePage() {
  const user = await currentUserFromCookies();
  if (!user) redirect('/login?next=/profile');
  const [profile, quota] = await Promise.all([getProfile(user.id), quotaStatus(user)]);
  if (!profile) redirect('/login');
  return <ProfileView profile={profile} quota={quota} />;
}
