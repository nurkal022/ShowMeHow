import './globals.css';
import NavLinks from '@/components/NavLinks';

export const metadata = { title: 'ShowMeHow' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <nav className="topnav">
          <span className="brand"><span className="brand-mark">🔬</span>ShowMeHow</span>
          <NavLinks />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
