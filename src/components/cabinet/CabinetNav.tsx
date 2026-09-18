'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { withOrgParam } from '@/lib/lms/links';

export interface CabinetNavItem { href: string; label: string; exact?: boolean }

export function isCabinetItemActive(item: CabinetNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Подменю кабинета; выбранная организация (?org=) едет в каждую ссылку. */
export default function CabinetNav({ items }: { items: CabinetNavItem[] }) {
  const pathname = usePathname() ?? '';
  const org = useSearchParams().get('org');
  return (
    <nav className="subnav no-print" aria-label="Разделы кабинета">
      {items.map((item) => (
        <Link key={item.href} href={withOrgParam(item.href, org)}
          className={isCabinetItemActive(item, pathname) ? 'active' : ''}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
