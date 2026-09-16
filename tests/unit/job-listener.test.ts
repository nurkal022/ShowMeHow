import { describe, it, expect, vi } from 'vitest';
import { createListener, type ListenClient } from '@/lib/jobs/listener';

class FakeClient implements ListenClient {
  handlers = new Map<string, ((arg?: unknown) => void)[]>();
  queries: string[] = [];
  ended = false;
  constructor(private readonly failConnect = false) {}
  async connect() { if (this.failConnect) throw new Error('нет связи'); }
  async query(sql: string) { this.queries.push(sql); }
  on(event: string, cb: (arg?: unknown) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
    return this;
  }
  async end() { this.ended = true; }
  emit(event: string, arg?: unknown) {
    for (const cb of this.handlers.get(event) ?? []) cb(arg);
  }
}

function factoryOf(clients: FakeClient[]) {
  const made: FakeClient[] = [];
  const factory = () => {
    const c = clients[made.length] ?? new FakeClient();
    made.push(c);
    return c;
  };
  return { factory, made };
}

describe('listener', () => {
  it('одно соединение на все подписки, слушает оба канала', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    l.onJob('a', () => {});
    l.onJob('b', () => {});
    l.onQueue(() => {});
    await vi.waitFor(() => expect(made[0].queries).toEqual(['LISTEN job_events', 'LISTEN job_queue']));
    expect(made).toHaveLength(1);
    await l.close();
    expect(made[0].ended).toBe(true);
  });

  it('раздаёт уведомления по id задания и по очереди', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    const a = vi.fn();
    const b = vi.fn();
    const q = vi.fn();
    l.onJob('a', a);
    l.onJob('b', b);
    l.onQueue(q);
    await vi.waitFor(() => expect(made[0].queries).toHaveLength(2));
    a.mockClear(); b.mockClear(); q.mockClear();
    made[0].emit('notification', { channel: 'job_events', payload: 'a' });
    made[0].emit('notification', { channel: 'job_queue', payload: 'x' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(q).toHaveBeenCalledTimes(1);
    await l.close();
  });

  it('после обрыва переподключается и будит всех подписчиков дочитать пропущенное', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    const a = vi.fn();
    l.onJob('a', a);
    await vi.waitFor(() => expect(made[0].queries).toHaveLength(2));
    a.mockClear();
    made[0].emit('error', new Error('соединение сброшено'));
    await vi.waitFor(() => expect(made[1]?.queries).toHaveLength(2));
    expect(made[0].ended).toBe(true);
    await vi.waitFor(() => expect(a).toHaveBeenCalled());
    await l.close();
  });

  it('повторяет неудачное подключение', async () => {
    const { factory, made } = factoryOf([new FakeClient(true), new FakeClient(true)]);
    const l = createListener(factory, { retryMs: [0] });
    l.onQueue(() => {});
    await vi.waitFor(() => expect(made[2]?.queries).toHaveLength(2));
    await l.close();
  });

  it('отписка прекращает доставку', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    const a = vi.fn();
    const off = l.onJob('a', a);
    await vi.waitFor(() => expect(made[0].queries).toHaveLength(2));
    off();
    a.mockClear();
    made[0].emit('notification', { channel: 'job_events', payload: 'a' });
    expect(a).not.toHaveBeenCalled();
    await l.close();
  });
});
