import NavLinks from '@/components/NavLinks';
import { IconLogo } from '@/components/icons';
import { currentUserFromCookies } from '@/lib/auth/session';
import { userContact } from '@/lib/auth/identifier';
import { listMemberships } from '@/lib/org/access';
import { GUEST_NAV_SECTIONS, navSections } from '@/lib/org/policy';

/** Марка в шапке: одна и та же на сайте, в форме смены пароля и на странице 404. */
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark"><IconLogo size={15} /></span>Tesseract
    </span>
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
  return (
    <>
      <nav className="topnav">
        <Brand />
        <NavLinks sections={sections} student={student}
          user={user ? { label: userContact(user), role: user.role } : undefined} />
      </nav>
      <main>{children}</main>
    </>
  );
}
