import './globals.css';
import NavLinks from '@/components/NavLinks';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { currentUserAllowingPasswordChangeFromCookies } from '@/lib/auth/session';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { listMemberships } from '@/lib/org/access';
import { ALL_NAV_SECTIONS, navSections } from '@/lib/org/policy';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { IconLogo } from '@/components/icons';

export const metadata = {
  title: 'Tesseract',
  description: 'Интерактивные симуляции по описанию',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Разрешающий вариант: только layout узнаёт о временном пароле и подменяет страницу.
  const user = await currentUserAllowingPasswordChangeFromCookies();
  const mustChangePassword = !!user?.mustChangePassword;
  // Разделы считаются на сервере по членствам; без входа видны все, как раньше.
  const sections = user && !mustChangePassword
    ? navSections(user, await listMemberships(user.id))
    : [...ALL_NAV_SECTIONS];
  return (
    // data-theme проставляет скрипт ниже до отрисовки, поэтому значение на сервере
    // и на клиенте расходится намеренно — предупреждение о гидрации здесь ложное.
    <html lang="ru" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Тема применяется до первой отрисовки — иначе тёмная тема моргает белым. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
      </head>
      <body>
        <nav className="topnav">
          <span className="brand">
            <span className="brand-mark"><IconLogo size={15} /></span>Tesseract
          </span>
          {!mustChangePassword && (
            <NavLinks sections={sections}
              user={user ? { label: userContact(user), role: user.role } : undefined} />
          )}
        </nav>
        <main>
          {user && mustChangePassword ? <ForcePasswordChange label={userLabel(user)} /> : children}
        </main>
      </body>
    </html>
  );
}
