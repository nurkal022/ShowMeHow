import './globals.css';
import NavLinks from '@/components/NavLinks';
import { currentUserFromCookies } from '@/lib/auth/session';

export const metadata = { title: 'ShowMeHow' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();
  return (
    <html lang="ru">
      <body>
        <nav className="topnav">
          <span className="brand"><span className="brand-mark">🔬</span>ShowMeHow</span>
          <NavLinks user={user ? { email: user.email, role: user.role } : undefined} />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
