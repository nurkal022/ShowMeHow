import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST as postDemos } from '@/app/api/demos/route';
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';

// Роут вызывается напрямую, без базы и cookie — резолвер сессии подменяется
// фиксированным пользователем.
const TEST_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@t', role: 'user' as const };
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => TEST_USER,
  currentUserFromCookies: async () => TEST_USER,
}));

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-data-'));
  // Пустая папка демок — installDemos() должен вернуть пустые списки без
  // запуска реального рендера (playwright), т.к. нет ни одной демки для установки.
  process.env.SHOWMEHOW_DEMOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-demos-'));
  __setRepoForTests(createMemoryRepo());
});

describe('POST /api/demos', () => {
  it('returns {installed: [], skipped: []} when the demos dir is empty', async () => {
    const res = await postDemos(new Request('http://t', { method: 'POST' }));
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
    const res = await postDemos(new Request('http://t', { method: 'POST' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
