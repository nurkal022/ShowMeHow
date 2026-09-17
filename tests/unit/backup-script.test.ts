import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const SCRIPT = path.resolve('scripts/backup.sh');
const which = (t: string) => {
  const r = spawnSync('sh', ['-c', `command -v ${t}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
// На сервере flock из util-linux; где его нет (macOS), тест ставит замену на perl
// с той же семантикой: блокировка висит на открытом дескрипторе вызывающей оболочки.
const REAL_FLOCK = which('flock');
const REAL_RSYNC = which('rsync');
const hasTools = ['bash', 'gzip'].every((t) => which(t) !== null)
  && REAL_RSYNC !== null && (REAL_FLOCK !== null || which('perl') !== null);

// Огромный срок хранения: тесты не должны зависеть от того, когда их запускают
// относительно захардкоженных дат ниже. Только тест ротации использует срок по
// умолчанию — там сравнение идёт с реальным «сегодня».
const HUGE_KEEP_DAYS = '36500';

let base: string;
let root: string;
let dest: string;
let bin: string;

/** Подменный docker: печатает «дамп» или падает, если так попросили. */
function fakeDocker(fail: boolean): void {
  fs.writeFileSync(path.join(bin, 'docker'), fail
    ? '#!/bin/sh\necho "no such container" >&2\nexit 3\n'
    : '#!/bin/sh\necho "-- dump for: $*"\n', { mode: 0o755 });
}

/** Подменный rsync: копирует настоящим и выходит с заданным кодом. */
function fakeRsync(code: number): void {
  fs.writeFileSync(path.join(bin, 'rsync'),
    `#!/bin/sh\n"${REAL_RSYNC}" "$@" || exit $?\nexit ${code}\n`, { mode: 0o755 });
}

const scriptEnv = () => ({ ...process.env, PATH: `${bin}:${process.env.PATH}` });

function run(stamp: string, keepDays?: string) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...scriptEnv(),
      TESERACT_ROOT: root,
      TESERACT_BACKUP_DIR: dest,
      TESERACT_BACKUP_STAMP: stamp,
      ...(keepDays !== undefined ? { TESERACT_BACKUP_KEEP_DAYS: keepDays } : {}),
    },
  });
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-backup-'));
  root = path.join(base, 'app');
  dest = path.join(base, 'backups');
  bin = path.join(base, 'bin');
  fs.mkdirSync(path.join(root, 'data', 'simulations', 'a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'simulations', 'a', 'artifact.html'), '<html></html>');
  fs.mkdirSync(bin);
  if (!REAL_FLOCK) {
    fs.writeFileSync(path.join(bin, 'flock'), [
      '#!/bin/sh',
      '[ "$1" = "-n" ] || exit 2',
      'exec perl -MFcntl=:flock -e \'open(my $fh, ">&=", $ARGV[0]) or exit 2; flock($fh, LOCK_EX | LOCK_NB) or exit 1\' "$2"',
      '',
    ].join('\n'), { mode: 0o755 });
  }
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

const file = (...p: string[]) => path.join(dest, ...p);

/** Бэкапы, которые уже лежат в каталоге и не должны пострадать. */
function existingBackups(): void {
  fs.mkdirSync(file('db'), { recursive: true });
  fs.writeFileSync(file('db', '2026-09-16.sql.gz'), 'old dump');
  fs.mkdirSync(file('data', '2026-09-16'), { recursive: true });
  fs.writeFileSync(file('data', '2026-09-16', 'keep.txt'), 'keep');
}

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

  it.each(['../..', '..', '2026-9-17', '2026-09-17/../x', 'x', '2026-09-17 '])(
    'метка даты «%s» отклоняется, и ничего не трогается', (stamp) => {
      fakeDocker(false);
      existingBackups();
      const r = run(stamp, HUGE_KEEP_DAYS);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toContain('ГГГГ-ММ-ДД');
      expect(fs.readdirSync(file('db'))).toEqual(['2026-09-16.sql.gz']);
      expect(fs.readdirSync(file('data'))).toEqual(['2026-09-16']);
      expect(fs.readFileSync(file('data', '2026-09-16', 'keep.txt'), 'utf8')).toBe('keep');
    });

  it.each(['-5', '0', 'abc', '1.5', '7d'])('срок хранения «%s» отклоняется до любых действий', (keep) => {
    fakeDocker(false);
    existingBackups();
    const today = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(file('data', today));
    const r = run(today, keep);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('срок хранения');
    expect(fs.readdirSync(file('db'))).toEqual(['2026-09-16.sql.gz']);
    expect(fs.readdirSync(file('data')).sort()).toEqual(['2026-09-16', today].sort());
  });

  it('ротация удаляет только записи с датой в имени и не ходит по ссылкам', () => {
    fakeDocker(false);
    const outside = path.join(base, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'precious.txt'), 'не трогать');
    fs.mkdirSync(file('db'), { recursive: true });
    fs.mkdirSync(file('data'), { recursive: true });
    for (const name of ['0old', '-x', '1.bak', '1999-01-01.sql.gz.bak']) {
      fs.writeFileSync(file('db', name), '');
    }
    for (const name of ['0old', '-x', '1999-1-1']) fs.mkdirSync(file('data', name));
    fs.symlinkSync(outside, file('data', '1999-01-01'));
    fs.symlinkSync(path.join(outside, 'precious.txt'), file('db', '1999-01-02.sql.gz'));
    fs.mkdirSync(file('data', '2000-01-01'));
    const today = new Date().toISOString().slice(0, 10);
    const r = run(today);
    expect(r.status).toBe(0);
    expect(fs.readdirSync(file('db')).sort())
      .toEqual(['-x', '0old', '1.bak', '1999-01-01.sql.gz.bak', '1999-01-02.sql.gz', `${today}.sql.gz`].sort());
    expect(fs.readdirSync(file('data')).sort()).toEqual(['-x', '0old', '1999-01-01', '1999-1-1', today].sort());
    expect(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8')).toBe('не трогать');
    // Старая копия успела послужить «прошлой» для жёстких ссылок и только потом ушла.
    expect(r.stdout).toContain(`ссылки на ${file('data', '2000-01-01')}`);
  });

  it('прошлая копия для жёстких ссылок — последняя по дате, а не любой каталог', () => {
    fakeDocker(false);
    expect(run('2026-09-16', HUGE_KEEP_DAYS).status).toBe(0);
    // Каталог без даты сортируется после дат и раньше сбивал выбор.
    fs.cpSync(file('data', '2026-09-16'), file('data', 'zzz'), { recursive: true, preserveTimestamps: true });
    expect(run('2026-09-17', HUGE_KEEP_DAYS).status).toBe(0);
    const art = (d: string) => file('data', d, 'simulations', 'a', 'artifact.html');
    expect(fs.statSync(art('2026-09-17')).ino).toBe(fs.statSync(art('2026-09-16')).ino);
  });

  it('недописанные файлы прошлых запусков удаляются', () => {
    fakeDocker(false);
    fs.mkdirSync(file('db'), { recursive: true });
    fs.writeFileSync(file('db', '2026-09-10.sql.gz.part'), 'обрывок');
    fs.writeFileSync(file('db', 'notes.part'), 'чужое');
    fs.mkdirSync(file('data', '2026-09-10.part', 'x'), { recursive: true });
    fs.mkdirSync(file('data', 'mine.part'));
    const r = run('2026-09-17', HUGE_KEEP_DAYS);
    expect(r.status).toBe(0);
    expect(fs.readdirSync(file('db')).sort()).toEqual(['2026-09-17.sql.gz', 'notes.part']);
    expect(fs.readdirSync(file('data')).sort()).toEqual(['2026-09-17', 'mine.part']);
  });

  it('второй запуск, пока идёт первый, отказывается и ничего не пишет', async () => {
    fakeDocker(false);
    fs.mkdirSync(dest, { recursive: true });
    const holder = spawn('bash', ['-c', 'exec 9>>"$1"; flock -n 9 && echo locked && exec sleep 30', '_',
      file('.lock')], { env: scriptEnv() });
    try {
      await new Promise<void>((resolve, reject) => {
        holder.stdout.on('data', (d: Buffer) => { if (d.toString().includes('locked')) resolve(); });
        holder.on('exit', (code) => reject(new Error(`держатель блокировки вышел: ${code}`)));
      });
      const r = run('2026-09-17', HUGE_KEEP_DAYS);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toContain('другой запуск бэкапа');
      expect(fs.readdirSync(file('db'))).toEqual([]);
      expect(fs.readdirSync(file('data'))).toEqual([]);
    } finally {
      holder.kill('SIGKILL');
      await new Promise((resolve) => holder.once('close', resolve));
    }
    // Блокировка освободилась вместе с процессом.
    expect(run('2026-09-17', HUGE_KEEP_DAYS).status).toBe(0);
  });

  it('rsync с кодом 24 (файлы исчезли по ходу) — предупреждение, а не сбой', () => {
    fakeDocker(false);
    fakeRsync(24);
    const r = run('2026-09-17', HUGE_KEEP_DAYS);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('предупреждение: часть файлов исчезла');
    expect(fs.readdirSync(file('data'))).toEqual(['2026-09-17']);
    expect(r.stdout).toContain('готово');
  });

  it('другие ошибки rsync — сбой запуска', () => {
    fakeDocker(false);
    fakeRsync(23);
    const r = run('2026-09-17', HUGE_KEEP_DAYS);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('ОШИБКА');
    expect(fs.existsSync(file('data', '2026-09-17'))).toBe(false);
  });

  it('сбой дампа — ненулевой код и никакого «готового» файла', () => {
    fakeDocker(true);
    const r = run('2026-09-17', HUGE_KEEP_DAYS);
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(dest, 'db', '2026-09-17.sql.gz'))).toBe(false);
    expect(r.stdout + r.stderr).toContain('ОШИБКА');
  });
});
