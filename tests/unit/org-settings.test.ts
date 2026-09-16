import { describe, it, expect } from 'vitest';
import {
  sanitizeOrgSettings, mergeOrgSettings, resolveOrgSettings, DEFAULT_ORG_SETTINGS, ORG_SETTING_KEYS,
} from '@/lib/org/settings';

describe('настройки организации', () => {
  it('значения по умолчанию', () => {
    expect(DEFAULT_ORG_SETTINGS).toEqual({
      studentsCanGenerate: false, studentLongSessions: false, teacherGenerationLimit: 100,
    });
    expect([...ORG_SETTING_KEYS]).toEqual(['studentsCanGenerate', 'studentLongSessions', 'teacherGenerationLimit']);
  });

  it('белый список: неизвестные ключи и неверные типы отбрасываются', () => {
    expect(sanitizeOrgSettings({
      studentsCanGenerate: true, studentLongSessions: 'да', teacherGenerationLimit: 50, hack: 1,
    })).toEqual({ studentsCanGenerate: true, teacherGenerationLimit: 50 });
    expect(sanitizeOrgSettings(null)).toEqual({});
    expect(sanitizeOrgSettings([true])).toEqual({});
    expect(sanitizeOrgSettings('x')).toEqual({});
  });

  it('лимит учителя — целое от 0 до 100000', () => {
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 0 })).toEqual({ teacherGenerationLimit: 0 });
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 100000 })).toEqual({ teacherGenerationLimit: 100000 });
    expect(sanitizeOrgSettings({ teacherGenerationLimit: -1 })).toEqual({});
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 2.5 })).toEqual({});
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 100001 })).toEqual({});
    expect(sanitizeOrgSettings({ teacherGenerationLimit: Number.NaN })).toEqual({});
  });

  it('слияние перекрывает пришедшие ключи и сохраняет остальные', () => {
    expect(mergeOrgSettings({ studentsCanGenerate: true, junk: 1 }, { teacherGenerationLimit: 5, other: 2 }))
      .toEqual({ studentsCanGenerate: true, teacherGenerationLimit: 5 });
    expect(mergeOrgSettings({ studentsCanGenerate: true }, { studentsCanGenerate: false }))
      .toEqual({ studentsCanGenerate: false });
  });

  it('разрешённые настройки дополняются значениями по умолчанию', () => {
    expect(resolveOrgSettings({ studentLongSessions: true })).toEqual({
      studentsCanGenerate: false, studentLongSessions: true, teacherGenerationLimit: 100,
    });
    expect(resolveOrgSettings(undefined)).toEqual(DEFAULT_ORG_SETTINGS);
  });
});
