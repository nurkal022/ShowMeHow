'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/i18n/client';
import { cabinet } from '@/i18n/messages/cabinet';

/** Вкладки одного курса. Разделы кабинета — в боковой панели, здесь только курс. */
export default function CourseTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname() ?? '';
  const t = useT(cabinet);
  const root = `/teach/courses/${courseId}`;
  const tabs = [
    { href: `${root}/settings`, label: t('tab_settings'), active: pathname.startsWith(`${root}/settings`) },
    { href: root, label: t('tab_editor'), active: pathname === root },
    { href: `${root}/journal`, label: t('tab_journal'), active: pathname.startsWith(`${root}/journal`) },
    { href: `${root}/progress`, label: t('tab_progress'), active: pathname.startsWith(`${root}/progress`) },
    { href: `${root}/answers`, label: t('tab_answers'), active: pathname.startsWith(`${root}/answers`) },
    { href: `${root}/debrief`, label: t('tab_debrief'), active: pathname.startsWith(`${root}/debrief`) },
    { href: `${root}/analytics`, label: t('tab_analytics'), active: pathname.startsWith(`${root}/analytics`) || pathname.startsWith(`${root}/students`) },
  ];
  return (
    <nav className="cab-tabs no-print" aria-label={t('courseSections')}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.active ? 'active' : ''}
          aria-current={t.active ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
