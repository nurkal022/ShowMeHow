import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSimulation, getMeta, getArtifact, listSimulations, updateArtifact,
  listHistory, restoreVersion, deleteSimulation, saveThumbnail, getThumbnailPath,
} from '@/lib/storage';
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';

const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';

describe('storage', () => {
  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
    __setRepoForTests(createMemoryRepo());
  });

  const input = { title: 'Диффузия', prompt: 'диффузия духов', subject: 'Физика', tags: ['газы'] };

  it('create → get → list', async () => {
    const meta = await createSimulation(OWNER, input, '<html>v1</html>');
    expect(meta.id).toBeTruthy();
    expect((await getMeta(OWNER, meta.id))!.title).toBe('Диффузия');
    expect(await getArtifact(OWNER, meta.id)).toBe('<html>v1</html>');
    expect((await listSimulations(OWNER)).map((m) => m.id)).toEqual([meta.id]);
  });

  it('updateArtifact keeps history and restore works', async () => {
    const meta = await createSimulation(OWNER, input, '<html>v1</html>');
    await updateArtifact(OWNER, meta.id, '<html>v2</html>');
    expect(await getArtifact(OWNER, meta.id)).toBe('<html>v2</html>');
    const hist = (await listHistory(OWNER, meta.id))!;
    expect(hist).toHaveLength(1);
    await restoreVersion(OWNER, meta.id, hist[0]);
    expect(await getArtifact(OWNER, meta.id)).toBe('<html>v1</html>');
    expect(await listHistory(OWNER, meta.id)).toHaveLength(2); // v2 ушла в историю
  });

  it('delete removes simulation', async () => {
    const meta = await createSimulation(OWNER, input, '<html/>');
    await deleteSimulation(OWNER, meta.id);
    expect(await listSimulations(OWNER)).toEqual([]);
    expect(await getMeta(OWNER, meta.id)).toBeNull();
  });

  it('thumbnail save/get', async () => {
    const meta = await createSimulation(OWNER, input, '<html/>');
    expect(await getThumbnailPath(OWNER, meta.id)).toBeNull();
    await saveThumbnail(OWNER, meta.id, Buffer.from([137, 80]));
    expect(await getThumbnailPath(OWNER, meta.id)).toMatch(/thumbnail\.png$/);
  });

  it('updateArtifact with a frozen clock preserves all versions via numeric suffixes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T03:49:12.345Z'));
    try {
      const meta = await createSimulation(OWNER, input, '<html>v1</html>');
      await updateArtifact(OWNER, meta.id, '<html>v2</html>');
      await updateArtifact(OWNER, meta.id, '<html>v3</html>');
      await updateArtifact(OWNER, meta.id, '<html>v4</html>');
      const hist = (await listHistory(OWNER, meta.id))!;
      expect(hist).toHaveLength(3);
      // все три версии выпали на одну и ту же метку времени -> суффиксы -2, -3
      const stamp = '2026-07-07T03-49-12-345Z';
      expect(hist.sort()).toEqual([`${stamp}-2.html`, `${stamp}-3.html`, `${stamp}.html`].sort());
    } finally {
      vi.useRealTimers();
    }
  });

  it('getMeta rejects path traversal in id', async () => {
    await expect(getMeta(OWNER, '../evil')).rejects.toThrow(/invalid path segment/);
  });

  it('restoreVersion rejects path traversal in name', async () => {
    const meta = await createSimulation(OWNER, input, '<html>v1</html>');
    await updateArtifact(OWNER, meta.id, '<html>v2</html>');
    await expect(restoreVersion(OWNER, meta.id, '../../etc/passwd'))
      .rejects.toThrow(/invalid path segment/);
  });

  it('getArtifact возвращает null, если запись есть, а файла нет', async () => {
    const meta = await createSimulation(OWNER, input, '<html>v1</html>');
    fs.rmSync(path.join(process.env.SHOWMEHOW_DATA_DIR!, 'simulations', meta.id),
      { recursive: true, force: true });
    expect(await getArtifact(OWNER, meta.id)).toBeNull();
    expect((await listSimulations(OWNER)).map((m) => m.id)).toEqual([meta.id]);
  });

  it('чужой владелец не видит симуляцию', async () => {
    const meta = await createSimulation(
      OWNER, { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>x</html>');
    expect(await getMeta(STRANGER, meta.id)).toBeNull();
    expect(await getArtifact(STRANGER, meta.id)).toBeNull();
    expect(await listSimulations(STRANGER)).toEqual([]);
    expect(await updateArtifact(STRANGER, meta.id, '<html>y</html>')).toBe(false);
    // Удаление чужой симуляции — не ошибка, но и не действие.
    await deleteSimulation(STRANGER, meta.id);
    expect(await getMeta(OWNER, meta.id)).not.toBeNull();
  });
});
