import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getProfile } from '@/lib/auth/users';
import { listMemberships } from '@/lib/org/access';
import { teacherScorecard } from '@/lib/org/reports';
import { ORG_ROLE_LABELS } from '@/lib/org/types';
import AccountView, { type AccountOrg } from '@/components/cabinet/AccountView';

export const metadata = { title: 'Профиль — Tesseract' };

/** Профиль учителя и администрации — внутри кабинета, со своей работой и настройками помощника. */
export default async function AccountPage() {
  const user = await requirePageUser('/account');
  if (!user) return null;
  const [profile, memberships] = await Promise.all([getProfile(user.id), listMemberships(user.id)]);
  if (!profile) redirect('/login');
  const staff = memberships.filter((m) => m.role !== 'student');
  const orgs: AccountOrg[] = await Promise.all(staff.map(async (m) => {
    const me = (await teacherScorecard(m.orgId, 30)).find((t) => t.userId === user.id) ?? null;
    return {
      slug: m.orgSlug, name: m.orgName, role: m.role, roleLabel: ORG_ROLE_LABELS[m.role],
      work: me && {
        courses: me.courses, published: me.published, students: me.students, graded: me.graded, medianHours: me.medianHours,
        commentShare: me.commentShare, pending: me.pending, debriefs: me.debriefs, avgPercent: me.avgPercent, groups: me.groups,
      },
    };
  }));
  return <AccountView profile={profile} orgs={orgs} platformAdmin={user.role === 'admin'} />;
}
