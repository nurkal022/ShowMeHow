/**
 * Скользящее окно в памяти процесса. hit() отвечает:
 * 'ok' — в пределах лимита; 'limit' — первое превышение (один раз предупредить);
 * 'over' — дальнейшие превышения (молчать, чтобы не спамить в ответ).
 */
export class RateLimiter {
  private hits = new Map<number, number[]>();
  private warned = new Set<number>();

  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}

  hit(key: number): 'ok' | 'limit' | 'over' {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      if (this.warned.has(key)) return 'over';
      this.warned.add(key);
      return 'limit';
    }
    list.push(t);
    this.hits.set(key, list);
    this.warned.delete(key);
    // Не даём карте расти бесконечно: тысячи разовых гостей не должны жить в памяти вечно.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
    }
    return 'ok';
  }
}
