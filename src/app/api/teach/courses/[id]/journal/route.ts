import { guardUser } from '@/lib/http/guards';
import { notFound, type IdParams } from '@/lib/http/route-kit';
import { staffCourse } from '@/lib/lms/access';
import { courseJournal } from '@/lib/lms/grading';
import { journalCsv } from '@/lib/lms/journal';

/** «Скачать CSV»: журнал курса, открывается в Excel с верной кодировкой (BOM). */
export async function GET(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffCourse(user, id);
  if (!staff) return notFound();
  const csv = journalCsv(await courseJournal(staff.course.id));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`Журнал — ${staff.course.title}`)}.csv`,
      'Cache-Control': 'no-store',
    },
  });
}
