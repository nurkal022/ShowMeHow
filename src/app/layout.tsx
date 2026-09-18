import './globals.css';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { Brand } from '@/components/SiteChrome';
import { currentUserAllowingPasswordChangeFromCookies } from '@/lib/auth/session';
import { userLabel } from '@/lib/auth/identifier';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

export const metadata = {
  title: 'Tesseract',
  description: 'Интерактивные симуляции по описанию',
};

/**
 * Корень держит только общее: html/body, тему, шрифты и подмену страницы формой
 * смены временного пароля. Шапку сайта рисует (site)/layout, оболочку кабинетов —
 * (cabinet)/layout: это две разные рамки вокруг одних и тех же адресов.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Разрешающий вариант: только layout узнаёт о временном пароле и подменяет страницу.
  const user = await currentUserAllowingPasswordChangeFromCookies();
  const mustChangePassword = !!user?.mustChangePassword;
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
        {user && mustChangePassword ? (
          // С временным паролем нет ни разделов, ни кабинета: только марка и форма.
          <>
            <nav className="topnav"><Brand /></nav>
            <main><ForcePasswordChange label={userLabel(user)} /></main>
          </>
        ) : children}
      </body>
    </html>
  );
}
