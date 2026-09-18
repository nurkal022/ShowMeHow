/** searchParams серверных страниц Next 15. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
