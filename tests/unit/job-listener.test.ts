import { describe, it, expect, vi, afterEach } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    expect(errSpy).toHaveBeenCalled();
  });

  it('повторяет неудачное подключение', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { factory, made } = factoryOf([new FakeClient(true), new FakeClient(true)]);
    const l = createListener(factory, { retryMs: [0] });
    l.onQueue(() => {});
    await vi.waitFor(() => expect(made[2]?.queries).toHaveLength(2));
    await l.close();
    expect(errSpy).toHaveBeenCalled();
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

  it('повторная отписка не задевает нового подписчика с тем же id задания (I2)', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    const a = vi.fn();
    const offA = l.onJob('x', a);
    await vi.waitFor(() => expect(made[0].queries).toHaveLength(2));
    offA();
    const b = vi.fn();
    l.onJob('x', b);
    // Повторный вызов уже отработавшей отписки — типичный паттерн (обработчик
    // отмены + finally). Он не должен снести набор нового подписчика на тот же id.
    offA();
    made[0].emit('notification', { channel: 'job_events', payload: 'x' });
    expect(b).toHaveBeenCalledTimes(1);
    await l.close();
  });

  it('обрыв во время подключения не оставляет слушателя немым (I1)', async () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let releaseConnect: () => void = () => {};
    class HangingClient extends FakeClient {
      async connect() {
        await new Promise<void>((resolve) => { releaseConnect = resolve; });
      }
    }
    const { factory, made } = factoryOf([new HangingClient(), new FakeClient()]);
    const l = createListener(factory, { retryMs: [0] });
    const q = vi.fn();
    l.onQueue(q);
    expect(made).toHaveLength(1);

    // Обрыв приходит, пока connect() ещё висит; drop() планирует повтор.
    made[0].emit('error', new Error('оборвалось на подключении'));
    // Даём таймеру повтора сработать раньше, чем повиснувший connect() отпустят —
    // именно в этом окне ensure() раньше молча гасил единственную попытку.
    await vi.advanceTimersByTimeAsync(0);
    expect(made).toHaveLength(1);

    releaseConnect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(made[1]?.queries).toHaveLength(2), { timeout: 1000 });
    await vi.waitFor(() => expect(q).toHaveBeenCalled(), { timeout: 1000 });

    await l.close();
    expect(errSpy).toHaveBeenCalled();
  });

  it('синхронный сбой фабрики соединений не оставляет слушателя немым (M2)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const real = new FakeClient();
    const factory = () => {
      calls++;
      if (calls === 1) throw new Error('плохая строка подключения');
      return real;
    };
    const l = createListener(factory, { retryMs: [0] });
    l.onQueue(() => {});
    await vi.waitFor(() => expect(real.queries).toHaveLength(2));
    await l.close();
    expect(errSpy).toHaveBeenCalled();
  });
});
