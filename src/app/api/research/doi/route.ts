import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest } from '@/lib/http/route-kit';
import { fromCrossref, normalizeDoi } from '@/lib/research/article';

/**
 * Источник по DOI через Crossref. Идём с сервера: так браузер автора не ходит
 * к стороннему API, а мы можем подписаться в User-Agent, как просит Crossref.
 * Поиск по названию — запасной путь, когда DOI под рукой нет.
 */
export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return badRequest('Укажите DOI или название.');
  const headers = { 'User-Agent': 'Tesseract/1.0 (research workspace)' };
  const doi = normalizeDoi(q);
  try {
    if (doi) {
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) return NextResponse.json({ error: 'DOI не найден в Crossref.' }, { status: 404 });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { message: Record<string, unknown> };
      return NextResponse.json({ results: [fromCrossref(data.message)] });
    }
    const res = await fetch(`https://api.crossref.org/works?rows=6&query.bibliographic=${encodeURIComponent(q.slice(0, 300))}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as { message: { items: Record<string, unknown>[] } };
    return NextResponse.json({ results: data.message.items.map(fromCrossref) });
  } catch {
    return NextResponse.json({ error: 'Crossref сейчас недоступен. Попробуйте позже или вставьте BibTeX.' }, { status: 502 });
  }
}
