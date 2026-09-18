import { describe, it, expect } from 'vitest';
import { parseSeedArgs, refuseInProduction } from '../../scripts/seed-school';

describe('seed:school', () => {
  it('в продакшне отказывается', () => {
    expect(() => refuseInProduction({ NODE_ENV: 'production' }))
      .toThrow('seed:school заводит тестовые аккаунты с известными паролями и в продакшне не запускается.');
    expect(() => refuseInProduction({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('разбирает флаги существующей организации', () => {
    expect(parseSeedArgs([])).toBeNull();
    expect(parseSeedArgs(['--org', 'demo', '--teacher', 'teacher.demo']))
      .toEqual({ orgSlug: 'demo', teacher: 'teacher.demo' });
    expect(() => parseSeedArgs(['--org', 'demo'])).toThrow('оба флага');
  });
});
