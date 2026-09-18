'use client';
import { usePathname, useRouter } from 'next/navigation';
import type { OrgChoice } from '@/lib/org/cabinet';

/** Переключатель организации: виден, только если их больше одной. Выбор — в адресе. */
export default function OrgSwitcher({ current, choices }: { current: string; choices: OrgChoice[] }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  if (choices.length < 2) return null;
  return (
    <label className="org-switcher no-print">
      Организация
      <select className="select" value={current}
        onChange={(e) => router.push(`${pathname}?org=${encodeURIComponent(e.target.value)}`)}>
        {choices.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
    </label>
  );
}
