import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session-cookie';

// /lab/ и /labs/ — сцены лабораторий: они открыты без входа, потому что их
// открывают в VR-очках, где вводить пароль мучительно, а секретов в них нет.
// Список лабораторий (/labs без файла) тоже открыт — на него ссылаются те же
// сцены и очки, и список без входа не раскрывает ничего личного.
// /api/health — для мониторинга; отдаёт только счётчики очереди.
const PUBLIC_PREFIXES = ['/login', '/register', '/api/auth/', '/api/health', '/lab/', '/labs/'];
// Ровно «/labs» без хвоста: префикс '/labs/' его не ловит (нет слэша), а прибавлять
// его в PUBLIC_PREFIXES опасно опечаткой вида '/labs' — та поймала бы и '/labsxyz'.
const PUBLIC_EXACT = new Set(['/labs']);

/**
 * Публичен ли путь — чистая функция без cookie и Request, чтобы решение можно
 * было проверить юнит-тестом отдельно от Edge-рантайма.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Дешёвый фильтр, а не гарантия: middleware исполняется в Edge-рантайме и не может
 * обратиться к Postgres, поэтому проверяет только наличие cookie. Настоящая проверка
 * сессии живёт в каждом роуте и серверном компоненте (currentUserFrom*).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
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
