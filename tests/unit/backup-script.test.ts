import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = path.resolve('scripts/backup.sh');
const hasTools = ['bash', 'rsync', 'gzip'].every((t) => spawnSync(t, ['--version']).status === 0);

// Огромный срок хранения: тесты не должны зависеть от того, когда их запускают
// относительно захардкоженных дат ниже. Только тест ротации использует срок по
// умолчанию — там сравнение идёт с реальным «сегодня».
const HUGE_KEEP_DAYS = '36500';

let root: string;
let dest: string;
let bin: string;

/** Подменный docker: печатает «дамп» или падает, если так попросили. */
function fakeDocker(fail: boolean): void {
  fs.writeFileSync(path.join(bin, 'docker'), fail
    ? '#!/bin/sh\necho "no such container" >&2\nexit 3\n'
    : '#!/bin/sh\necho "-- dump for: $*"\n', { mode: 0o755 });
}

function run(stamp: string, keepDays?: string) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TESERACT_ROOT: root,
      TESERACT_BACKUP_DIR: dest,
      TESERACT_BACKUP_STAMP: stamp,
      ...(keepDays !== undefined ? { TESERACT_BACKUP_KEEP_DAYS: keepDays } : {}),
    },
  });
}

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-backup-'));
  root = path.join(base, 'app');
  dest = path.join(base, 'backups');
  bin = path.join(base, 'bin');
  fs.mkdirSync(path.join(root, 'data', 'simulations', 'a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'simulations', 'a', 'artifact.html'), '<html></html>');
  fs.mkdirSync(bin);
});

describe.skipIf(!hasTools)('scripts/backup.sh', () => {
  it('пишет сжатый дамп и копию data/', () => {
    fakeDocker(false);
    const r = run('2026-09-17', HUGE_KEEP_DAYS);
    expect(r.status).toBe(0);
    const dump = path.join(dest, 'db', '2026-09-17.sql.gz');
    expect(spawnSync('gzip', ['-dc', dump], { encoding: 'utf8' }).stdout)
      .toContain('pg_dump -U teseract --no-owner teseract');
    expect(fs.readFileSync(path.join(dest, 'data', '2026-09-17', 'simulations', 'a', 'artifact.html'), 'utf8'))
      .toBe('<html></html>');
    expect(r.stdout).toContain('готово');
  });

  it('неизменённые файлы — жёсткие ссылки на прошлую копию', () => {
    fakeDocker(false);
    expect(run('2026-09-16', HUGE_KEEP_DAYS).status).toBe(0);
    expect(run('2026-09-17', HUGE_KEEP_DAYS).status).toBe(0);
    const file = (d: string) => path.join(dest, 'data', d, 'simulations', 'a', 'artifact.html');
    expect(fs.statSync(file('2026-09-17')).ino).toBe(fs.statSync(file('2026-09-16')).ino);
  });

  it('удаляет копии старше срока хранения', () => {
    fakeDocker(false);
    fs.mkdirSync(path.join(dest, 'db'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'db', '2000-01-01.sql.gz'), '');
    fs.mkdirSync(path.join(dest, 'data', '2000-01-01'), { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    expect(run(today).status).toBe(0);
    expect(fs.existsSync(path.join(dest, 'db', '2000-01-01.sql.gz'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'data', '2000-01-01'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'db', `${today}.sql.gz`))).toBe(true);
  });

  it('сбой дампа — ненулевой код и никакого «готового» файла', () => {
    fakeDocker(true);
    const r = run('2026-09-17', HUGE_KEEP_DAYS);
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(dest, 'db', '2026-09-17.sql.gz'))).toBe(false);
    expect(r.stdout + r.stderr).toContain('ОШИБКА');
  });
});
