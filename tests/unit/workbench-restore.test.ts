import { describe, it, expect } from 'vitest';
import { restoredJobAction } from '@/components/Workbench';

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
