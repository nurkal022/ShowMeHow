import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session-cookie';

const PUBLIC_PREFIXES = ['/login', '/register', '/api/auth/'];

/**
 * Дешёвый фильтр, а не гарантия: middleware исполняется в Edge-рантайме и не может
 * обратиться к Postgres, поэтому проверяет только наличие cookie. Настоящая проверка
 * сессии живёт в каждом роуте и серверном компоненте (currentUserFrom*).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Требуется вход в систему.' }, { status: 401 });
  }
  const to = req.nextUrl.clone();
  to.pathname = '/login';
  to.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
