import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST as postDemos } from '@/app/api/demos/route';

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-data-'));
  // Пустая папка демок — installDemos() должен вернуть пустые списки без
  // запуска реального рендера (playwright), т.к. нет ни одной демки для установки.
  process.env.SHOWMEHOW_DEMOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-demos-'));
});

describe('POST /api/demos', () => {
  it('returns {installed: [], skipped: []} when the demos dir is empty', async () => {
    const res = await postDemos();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ installed: [], skipped: [] });
  });

  it('returns 500 with an error message when installDemos throws', async () => {
    // Папка демок отсутствует полностью — но это не бросает (listBundledDemos
    // возвращает []), поэтому симулируем сбой, указывая на файл вместо каталога:
    // fs.readdirSync на файле бросает ENOTDIR, что и проверяет 500-путь роута.
    const notADir = path.join(os.tmpdir(), `smh-demos-file-${Date.now()}`);
    fs.writeFileSync(notADir, 'not a directory');
    process.env.SHOWMEHOW_DEMOS_DIR = notADir;
    const res = await postDemos();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
