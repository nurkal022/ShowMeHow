import { describe, it, expect } from 'vitest';
import { parseArgs, parseSettingAssignment } from '../../scripts/org';
import { OrgError } from '@/lib/org/types';

describe('разбор аргументов', () => {
  it('команда, флаги и позиционные аргументы', () => {
    expect(parseArgs(['create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school'])).toEqual({
      command: 'create', flags: { slug: 'sch12', name: 'Школа №12', kind: 'school' }, rest: [],
    });
    expect(parseArgs(['set', '--org', 'sch12', 'studentsCanGenerate=true', 'teacherGenerationLimit=50'])).toEqual({
      command: 'set', flags: { org: 'sch12' }, rest: ['studentsCanGenerate=true', 'teacherGenerationLimit=50'],
    });
    expect(parseArgs([])).toEqual({ command: '', flags: {}, rest: [] });
  });

  it('флаг без значения — отказ', () => {
    expect(() => parseArgs(['create', '--slug'])).toThrow(OrgError);
    expect(() => parseArgs(['create', '--slug', '--name', 'X'])).toThrow('У флага --slug нет значения.');
  });
});

describe('разбор настройки', () => {
  it('булевы и числовые значения', () => {
    expect(parseSettingAssignment('studentsCanGenerate=true')).toEqual({ key: 'studentsCanGenerate', value: true });
    expect(parseSettingAssignment('studentLongSessions=false')).toEqual({ key: 'studentLongSessions', value: false });
    expect(parseSettingAssignment('teacherGenerationLimit=250')).toEqual({ key: 'teacherGenerationLimit', value: 250 });
  });

  it('неизвестный ключ, кривое значение и запись без = — отказ', () => {
    expect(() => parseSettingAssignment('hack=1')).toThrow('Неизвестная настройка «hack».');
    expect(() => parseSettingAssignment('studentsCanGenerate=да')).toThrow(OrgError);
    expect(() => parseSettingAssignment('teacherGenerationLimit=-5')).toThrow(OrgError);
    expect(() => parseSettingAssignment('teacherGenerationLimit=true')).toThrow(OrgError);
    expect(() => parseSettingAssignment('studentsCanGenerate')).toThrow(OrgError);
  });
});
