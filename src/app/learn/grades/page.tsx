import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentGrades } from '@/lib/lms/submissions';
import GradesTable from '@/components/learn/GradesTable';

export default async function GradesPage() {
  const user = await requirePageUser('/learn/grades');
  if (!user) return null;
  return (
    <div className="cabinet">
      <div className="cabinet-head">
        <div className="page-head">
          <Link href="/learn" className="muted">← Мои курсы</Link>
          <h1>Мои оценки</h1>
        </div>
      </div>
      <GradesTable grades={await listStudentGrades(user.id)} />
    </div>
  );
}
