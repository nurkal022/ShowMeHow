import { describe, it, expect, vi } from 'vitest';
import {
  restoredJobAction, doneMessage, reconnectDelay, nextReconnect, pauseUnlessAborted,
} from '@/components/Workbench';

// Регрессия: задание в статусе 'queued' (стоит в очереди, ещё не стартовало) раньше
// проваливалось в ветку "иначе" при восстановлении из localStorage и трактовалось как
// ошибка — хотя job на сервере жив, слот пользователя занят, и повторное «Создать»
// вернуло бы 409. 'queued' должен обрабатываться как 'running': переподключение к SSE.
describe('restoredJobAction', () => {
  it('reconnects to the SSE stream for a running job', () => {
    expect(restoredJobAction('running')).toBe('reconnect');
  });

  it('reconnects to the SSE stream for a queued job instead of treating it as an error', () => {
    expect(restoredJobAction('queued')).toBe('reconnect');
  });

  it('opens the simulation for a done job', () => {
    expect(restoredJobAction('done')).toBe('open');
  });

  it('reports cancellation for a cancelled job', () => {
    expect(restoredJobAction('cancelled')).toBe('cancelled');
  });

  it('falls back to an error for any other status', () => {
    expect(restoredJobAction('error')).toBe('error');
  });
});

describe('doneMessage', () => {
  it('генерация и доработка завершаются разными фразами', () => {
    expect(doneMessage('generate')).toBe('Готово. Симуляция справа — можно показывать или дорабатывать.');
    expect(doneMessage('refine')).toBe('Готово, обновил.');
  });
});

describe('reconnectDelay', () => {
  it('растёт и через полторы минуты сдаётся', () => {
    expect(reconnectDelay(0)).toBe(1000);
    const delays: number[] = [];
    for (let i = 0; reconnectDelay(i) !== null; i++) delays.push(reconnectDelay(i)!);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(90_000);
    expect(reconnectDelay(delays.length)).toBeNull();
  });
});

describe('nextReconnect', () => {
  const fail = { planned: false, received: 0 };

  it('обрывы без нового прогресса расходуют попытки и в конце сдаются', () => {
    let state = { attempt: 0, seen: 0 };
    const delays: (number | null)[] = [];
    for (;;) {
      const next = nextReconnect(state, fail);
      delays.push(next.delay);
      if (next.delay === null) break;
      state = next;
    }
    expect(delays.slice(0, -1)).toEqual(
      Array.from({ length: delays.length - 1 }, (_, i) => reconnectDelay(i)));
    expect(delays.at(-1)).toBeNull();
  });

  it('новый прогресс начинает счёт попыток заново', () => {
    const next = nextReconnect({ attempt: 5, seen: 3 }, { planned: false, received: 4 });
    expect(next).toEqual({ attempt: 1, seen: 4, delay: reconnectDelay(0) });
    // Реплей того же журнала прогрессом не считается.
    expect(nextReconnect({ attempt: 5, seen: 4 }, { planned: false, received: 4 }))
      .toEqual({ attempt: 6, seen: 4, delay: reconnectDelay(5) });
  });

  it('плановое закрытие не расходует попытки и переподключает через 250–1000 мс', () => {
    for (const r of [0, 0.5, 0.999999]) {
      const next = nextReconnect({ attempt: 9, seen: 7 }, { planned: true, received: 7 }, () => r);
      expect(next.attempt).toBe(0);
      expect(next.seen).toBe(7);
      expect(next.delay).toBeGreaterThanOrEqual(250);
      expect(next.delay).toBeLessThanOrEqual(1000);
    }
    expect(nextReconnect({ attempt: 0, seen: 0 }, { planned: true, received: 0 }, () => 0).delay).toBe(250);
    expect(nextReconnect({ attempt: 0, seen: 0 }, { planned: true, received: 0 }, () => 0.999999).delay)
      .toBe(1000);
    // Долгое задание с плановыми закрытиями каждые пять минут не упирается в бюджет попыток.
    let state = { attempt: 0, seen: 2 };
    for (let i = 0; i < 50; i++) {
      state = nextReconnect(state, { planned: true, received: 2 });
    }
    expect(nextReconnect(state, fail).delay).toBe(reconnectDelay(0));
  });
});

describe('pauseUnlessAborted', () => {
  it('после паузы не оставляет слушателя отмены', async () => {
    vi.useFakeTimers();
    try {
      const abort = new AbortController();
      const add = vi.spyOn(abort.signal, 'addEventListener');
      const remove = vi.spyOn(abort.signal, 'removeEventListener');
      for (let i = 0; i < 3; i++) {
        const p = pauseUnlessAborted(100, abort.signal);
        await vi.advanceTimersByTimeAsync(100);
        await p;
      }
      expect(add).toHaveBeenCalledTimes(3);
      expect(remove).toHaveBeenCalledTimes(3);
      expect(remove.mock.calls.map((c) => c[1])).toEqual(add.mock.calls.map((c) => c[1]));
    } finally {
      vi.useRealTimers();
    }
  });

  it('отмена прерывает паузу сразу', async () => {
    vi.useFakeTimers();
    try {
      const abort = new AbortController();
      let done = false;
      const p = pauseUnlessAborted(10_000, abort.signal).then(() => { done = true; });
      abort.abort();
      await p;
      expect(done).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('уже отменённый сигнал не ждёт', async () => {
    const abort = new AbortController();
    abort.abort();
    await pauseUnlessAborted(60_000, abort.signal);
  });
});
