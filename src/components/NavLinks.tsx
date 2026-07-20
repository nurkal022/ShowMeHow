'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Создать' },
  { href: '/library', label: 'Библиотека' },
  { href: '/settings', label: 'Настройки' },
];

export default function NavLinks() {
  const pathname = usePathname();
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
    </div>
  );
}
