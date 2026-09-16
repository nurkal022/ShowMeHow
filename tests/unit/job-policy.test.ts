import { describe, it, expect } from 'vitest';
import {
  jobPriority, reapDecision, needsRun, healthCode, HIGH_PRIORITY,
} from '@/lib/jobs/policy';
import type { AuthUser } from '@/lib/auth/users';
import type { Membership, OrgRole } from '@/lib/org/types';
import { DEFAULT_ORG_SETTINGS } from '@/lib/org/settings';

function user(role: AuthUser['role']): AuthUser {
  return {
    id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com', login: null,
    displayName: null, role, mustChangePassword: false,
  };
}

function member(role: OrgRole): Membership {
  return {
    orgId: 'o1', orgSlug: 'sch12', orgName: 'Школа №12', orgKind: 'school', role,
    settings: { ...DEFAULT_ORG_SETTINGS },
  };
}

describe('jobPriority', () => {
  it('платформенный админ, учитель и админ организации идут раньше', () => {
    expect(jobPriority(user('admin'), [])).toBe(HIGH_PRIORITY);
    expect(jobPriority(user('user'), [member('teacher')])).toBe(HIGH_PRIORITY);
    expect(jobPriority(user('user'), [member('org_admin')])).toBe(HIGH_PRIORITY);
  });

  it('человек без членств и ученик — обычный приоритет', () => {
    expect(jobPriority(user('user'), [])).toBe(0);
    expect(jobPriority(user('user'), [member('student')])).toBe(0);
  });

  it('ученик в одной организации и учитель в другой — высокий приоритет', () => {
    expect(jobPriority(user('user'), [member('student'), member('teacher')])).toBe(HIGH_PRIORITY);
  });
});

describe('reapDecision', () => {
  it('первая потеря возвращает задание в очередь', () => {
    expect(reapDecision({ attempts: 1, cancelRequested: false })).toBe('requeue');
  });

  it('вторая потеря — ошибка', () => {
    expect(reapDecision({ attempts: 2, cancelRequested: false })).toBe('fail');
    expect(reapDecision({ attempts: 5, cancelRequested: false })).toBe('fail');
  });

  it('потерянное задание, которое просили отменить, отменяется', () => {
    expect(reapDecision({ attempts: 1, cancelRequested: true })).toBe('cancel');
    expect(reapDecision({ attempts: 2, cancelRequested: true })).toBe('cancel');
  });
});

describe('needsRun', () => {
  it('сохранённое задание не генерируется заново', () => {
    expect(needsRun({ simulationId: null })).toBe(true);
    expect(needsRun({ simulationId: '55555555-5555-5555-5555-555555555555' })).toBe(false);
  });
});

describe('healthCode', () => {
  it('503, когда очередь не пуста и живых воркеров нет', () => {
    expect(healthCode({ queued: 1, workersAlive: 0 })).toBe(503);
  });

  it('200 при пустой очереди или живом воркере', () => {
    expect(healthCode({ queued: 0, workersAlive: 0 })).toBe(200);
    expect(healthCode({ queued: 3, workersAlive: 1 })).toBe(200);
  });
});
