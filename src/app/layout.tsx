import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'ShowMeHow' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <nav className="topnav">
          <span className="brand">ShowMeHow</span>
          <Link href="/">Создать</Link>
          <Link href="/library">Библиотека</Link>
          <Link href="/settings">Настройки</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
