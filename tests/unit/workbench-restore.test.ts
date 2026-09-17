import { describe, it, expect } from 'vitest';
import { restoredJobAction, doneMessage, reconnectDelay } from '@/components/Workbench';

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
