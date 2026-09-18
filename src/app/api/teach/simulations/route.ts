import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { notFound } from '@/lib/http/route-kit';
import { listMemberships } from '@/lib/org/access';
import { hasStaffRole, isPlatformAdmin } from '@/lib/org/policy';
import { listSimulations } from '@/lib/storage';
import { listCatalog } from '@/lib/admin/catalog';
import { userLabel } from '@/lib/auth/identifier';

export interface PickerItem {
  id: string;
  title: string;
  subject: string;
  ownerLabel: string;
}

/** Диалог выбора тренажёра: «Моя библиотека» или «Общий каталог». */
export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  if (!isPlatformAdmin(user) && !hasStaffRole(await listMemberships(user.id))) return notFound();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (url.searchParams.get('source') === 'catalog') {
    const items: PickerItem[] = (await listCatalog(q)).map((s) => ({
      id: s.id, title: s.title, subject: s.subject, ownerLabel: s.ownerLabel,
    }));
    return NextResponse.json({ items });
  }
  const needle = q.toLowerCase();
  const items: PickerItem[] = (await listSimulations(user.id))
    .filter((s) => !needle || `${s.title} ${s.subject}`.toLowerCase().includes(needle))
    .slice(0, 60)
    .map((s) => ({ id: s.id, title: s.title, subject: s.subject, ownerLabel: userLabel(user) }));
  return NextResponse.json({ items });
}
