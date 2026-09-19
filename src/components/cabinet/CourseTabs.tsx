'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Вкладки одного курса. Разделы кабинета — в боковой панели, здесь только курс. */
export default function CourseTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname() ?? '';
  const root = `/teach/courses/${courseId}`;
  const tabs = [
    { href: root, label: 'Редактор', active: pathname === root },
    { href: `${root}/journal`, label: 'Журнал', active: pathname.startsWith(`${root}/journal`) },
    { href: `${root}/progress`, label: 'Прогресс', active: pathname.startsWith(`${root}/progress`) },
    { href: `${root}/answers`, label: 'Ответы', active: pathname.startsWith(`${root}/answers`) },
    { href: `${root}/analytics`, label: 'Аналитика', active: pathname.startsWith(`${root}/analytics`) || pathname.startsWith(`${root}/students`) },
  ];
  return (
    <nav className="cab-tabs no-print" aria-label="Разделы курса">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.active ? 'active' : ''}
          aria-current={t.active ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
