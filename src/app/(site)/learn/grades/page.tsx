import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentGrades } from '@/lib/lms/submissions';
import GradesTable from '@/components/learn/GradesTable';

export default async function GradesPage() {
  const user = await requirePageUser('/learn/grades');
  if (!user) return null;
  return (
    <div className="learn-page learn-narrow">
      <header className="learn-head">
        <div>
          <h1>Мои оценки</h1>
          <p className="muted">Балл появляется после проверки учителем.</p>
        </div>
      </header>
      <GradesTable grades={await listStudentGrades(user.id)} />
    </div>
  );
}
