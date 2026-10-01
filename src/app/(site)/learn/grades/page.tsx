import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentGrades } from '@/lib/lms/submissions';
import GradesTable from '@/components/learn/GradesTable';
import { getT } from '@/i18n/server';
import { learnMe } from '@/i18n/messages/learn-me';

export default async function GradesPage() {
  const user = await requirePageUser('/learn/grades');
  if (!user) return null;
  const t = await getT(learnMe);
  return (
    <div className="learn-page learn-narrow">
      <header className="learn-head">
        <div>
          <h1>{t('gradesTitle')}</h1>
          <p className="muted">{t('gradesSub')}</p>
        </div>
      </header>
      <GradesTable grades={await listStudentGrades(user.id)} />
    </div>
  );
}
