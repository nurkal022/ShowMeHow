/** Адрес сайта для листа паролей: за прокси — из x-forwarded-*. */
export function siteFromHeaders(get: (name: string) => string | null): string {
  const first = (v: string | null) => v?.split(',')[0].trim() || null;
  const host = first(get('x-forwarded-host')) ?? first(get('host')) ?? 'localhost:3000';
  const proto = first(get('x-forwarded-proto')) ?? 'http';
  return `${proto}://${host}`;
}

export async function siteAddress(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  return siteFromHeaders((name) => h.get(name));
}
