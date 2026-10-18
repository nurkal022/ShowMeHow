import NavLinks from '@/components/NavLinks';
import Link from 'next/link';
import TesseractMark from '@/components/TesseractMark';
import { currentUserFromCookies } from '@/lib/auth/session';
import { userContact } from '@/lib/auth/identifier';
import { listMemberships } from '@/lib/org/access';
import { GUEST_NAV_SECTIONS, navSections } from '@/lib/org/policy';
import { getPlatformSettings } from '@/lib/platform-settings';

/** Марка в шапке: одна и та же на сайте, в форме смены пароля и на странице 404. Ведёт на главную. */
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Tesseract">
      <span className="brand-mark"><TesseractMark size={22} /></span><span className="brand-name">Tesseract</span>
    </Link>
  );
}

/**
 * Оболочка публичного сайта: верхняя шапка с разделами и <main>.
 * Разделы считаются на сервере по членствам; гостю (без сессии) видны только
 * «Лаборатории» — их список открыт без входа, остальное — нет. Пользователь с
 * временным паролем сюда не попадает: корневой layout подменяет ему страницу раньше.
 */
export default async function SiteChrome({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();
  const memberships = user ? await listMemberships(user.id) : [];
  const sections = user ? navSections(user, memberships) : [...GUEST_NAV_SECTIONS];
  const student = memberships.some((m) => m.role === 'student');
  const { registrationOpen } = await getPlatformSettings();
  return (
    <>
      <nav className="topnav">
        <Brand />
        <NavLinks sections={sections} student={student} registrationOpen={registrationOpen}
          user={user ? { label: userContact(user), role: user.role } : undefined} />
      </nav>
      <main>{children}</main>
    </>
  );
}
