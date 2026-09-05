import { describe, it, expect, beforeEach } from 'vitest';
import {
  submit, finish, hasActive, queuePosition, setQueueListener,
  __resetLimitsForTests, MAX_CONCURRENT,
} from '@/lib/limits';

beforeEach(() => { __resetLimitsForTests(); });

describe('ограничители параллелизма', () => {
  it('первые MAX_CONCURRENT заданий стартуют сразу', () => {
    const started: string[] = [];
    expect(submit('a', 'u1', () => started.push('a'))).toBe('running');
    expect(submit('b', 'u2', () => started.push('b'))).toBe('running');
    expect(started).toEqual(['a', 'b']);
    expect(MAX_CONCURRENT).toBe(2);
  });

  it('сверх лимита задание встаёт в очередь и стартует при освобождении места', () => {
    const started: string[] = [];
    submit('a', 'u1', () => started.push('a'));
    submit('b', 'u2', () => started.push('b'));
    expect(submit('c', 'u3', () => started.push('c'))).toBe('queued');
    expect(queuePosition('c')).toBe(1);
    expect(started).toEqual(['a', 'b']);
    finish('a');
    expect(started).toEqual(['a', 'b', 'c']);
    expect(queuePosition('c')).toBe(0);
  });

  it('рассылает новую позицию всем ожидающим после сдвига очереди', () => {
    const seen: [string, number][] = [];
    setQueueListener((jobId, position) => seen.push([jobId, position]));
    submit('a', 'u1', () => {});
    submit('b', 'u2', () => {});
    submit('c', 'u3', () => {});
    submit('d', 'u4', () => {});
    seen.length = 0;
    finish('a');           // 'c' стартует, 'd' сдвигается на первое место
    expect(seen).toEqual([['d', 1]]);
  });

  it('знает, есть ли активное задание у пользователя', () => {
    expect(hasActive('u1')).toBe(false);
    submit('a', 'u1', () => {});
    expect(hasActive('u1')).toBe(true);
    finish('a');
    expect(hasActive('u1')).toBe(false);
  });

  it('ожидающее задание тоже считается активным для своего пользователя', () => {
    submit('a', 'u1', () => {});
    submit('b', 'u2', () => {});
    submit('c', 'u3', () => {});
    expect(hasActive('u3')).toBe(true);
  });
});
