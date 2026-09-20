import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentCourses } from '@/lib/lms/courses';
import { continueTopicId, courseTeacherNames, listTopicProgress, progressTotals } from '@/lib/lms/learn';
import Catalog, { type CatalogItem } from '@/components/learn/Catalog';
import { IconCourses } from '@/components/icons';

/** Каталог курсов ученика: всё, что ему открыли, с поиском и фильтрами. */
export default async function CatalogPage() {
  const user = await requirePageUser('/learn/catalog');
  if (!user) return null;
  const cards = await listStudentCourses(user.id);
  const [teachers, progress] = await Promise.all([
    courseTeacherNames(cards.map((c) => c.course.id)),
    Promise.all(cards.map((c) => listTopicProgress(c.course.id, user.id))),
  ]);
  const items: CatalogItem[] = cards.map((c, i) => ({
    course: c.course, teacher: teachers.get(c.course.id) ?? null,
    totals: progressTotals(progress[i]), continueId: continueTopicId(progress[i]), topics: c.topicsTotal,
  }));

  return (
    <div className="learn-page cat-page">
      <header className="learn-head">
        <div>
          <h1>Каталог курсов</h1>
          <p className="muted">Все курсы, открытые вашей группе. Темы внутри доступны в любом порядке.</p>
        </div>
      </header>
      {items.length === 0
        ? (
          <div className="learn-empty">
            <span className="learn-empty-icon"><IconCourses size={28} /></span>
            <h2>Каталог пуст</h2>
            <p>Курсы появятся здесь, как только учитель откроет их вашей группе.</p>
          </div>
        )
        : <Catalog items={items} />}
    </div>
  );
}
