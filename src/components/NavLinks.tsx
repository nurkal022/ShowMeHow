'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Создать' },
  { href: '/library', label: 'Библиотека' },
];

interface NavUser {
  email: string;
  role: string;
}

export default function NavLinks({ user }: { user?: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="navlinks">
      {LINKS.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname?.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
            {l.label}
          </Link>
        );
      })}
      {user && (
        <span className="nav-user">
          <span className="nav-user-email">{user.email}</span>
          <button type="button" className="link-btn" onClick={logout}>Выйти</button>
        </span>
      )}
    </div>
  );
}
