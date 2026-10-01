import { guardUser } from '@/lib/http/guards';
import { notFound, type IdParams } from '@/lib/http/route-kit';
import { staffCourse } from '@/lib/lms/access';
import { courseJournal } from '@/lib/lms/grading';
import { journalCsv, journalFileName } from '@/lib/lms/journal';
import { localeFromRequest } from '@/i18n/config';

/** «Скачать CSV»: журнал курса, открывается в Excel с верной кодировкой (BOM). */
export async function GET(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffCourse(user, id);
  if (!staff) return notFound();
  const locale = localeFromRequest(req);
  const csv = journalCsv(await courseJournal(staff.course.id), locale);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(journalFileName(staff.course.title, locale))}.csv`,
      'Cache-Control': 'no-store',
    },
  });
}
