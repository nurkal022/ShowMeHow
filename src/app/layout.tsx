import './globals.css';
import NavLinks from '@/components/NavLinks';
import { currentUserFromCookies } from '@/lib/auth/session';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { IconLogo } from '@/components/icons';

export const metadata = {
  title: 'Tesseract',
  description: 'Интерактивные симуляции по описанию',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();
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
          <NavLinks user={user ? { email: user.email, role: user.role } : undefined} />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
