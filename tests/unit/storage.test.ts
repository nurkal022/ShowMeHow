import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSimulation, getMeta, getArtifact, listSimulations, updateArtifact,
  listHistory, restoreVersion, deleteSimulation, saveThumbnail, getThumbnailPath,
} from '@/lib/storage';

describe('storage', () => {
  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  });

  const input = { title: 'Диффузия', prompt: 'диффузия духов', subject: 'Физика', tags: ['газы'] };

  it('create → get → list', () => {
    const meta = createSimulation(input, '<html>v1</html>');
    expect(meta.id).toBeTruthy();
    expect(getMeta(meta.id).title).toBe('Диффузия');
    expect(getArtifact(meta.id)).toBe('<html>v1</html>');
    expect(listSimulations().map((m) => m.id)).toEqual([meta.id]);
  });

  it('updateArtifact keeps history and restore works', () => {
    const meta = createSimulation(input, '<html>v1</html>');
    updateArtifact(meta.id, '<html>v2</html>');
    expect(getArtifact(meta.id)).toBe('<html>v2</html>');
    const hist = listHistory(meta.id);
    expect(hist).toHaveLength(1);
    restoreVersion(meta.id, hist[0]);
    expect(getArtifact(meta.id)).toBe('<html>v1</html>');
    expect(listHistory(meta.id)).toHaveLength(2); // v2 ушла в историю
  });

  it('delete removes simulation', () => {
    const meta = createSimulation(input, '<html/>');
    deleteSimulation(meta.id);
    expect(listSimulations()).toEqual([]);
    expect(() => getMeta(meta.id)).toThrow();
  });

  it('thumbnail save/get', () => {
    const meta = createSimulation(input, '<html/>');
    expect(getThumbnailPath(meta.id)).toBeNull();
    saveThumbnail(meta.id, Buffer.from([137, 80]));
    expect(getThumbnailPath(meta.id)).toMatch(/thumbnail\.png$/);
  });

  it('updateArtifact with a frozen clock preserves all versions via numeric suffixes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T03:49:12.345Z'));
    try {
      const meta = createSimulation(input, '<html>v1</html>');
      updateArtifact(meta.id, '<html>v2</html>');
      updateArtifact(meta.id, '<html>v3</html>');
      updateArtifact(meta.id, '<html>v4</html>');
      const hist = listHistory(meta.id);
      expect(hist).toHaveLength(3);
      // все три версии выпали на одну и ту же метку времени -> суффиксы -2, -3
      const stamp = '2026-07-07T03-49-12-345Z';
      expect(hist.sort()).toEqual([`${stamp}-2.html`, `${stamp}-3.html`, `${stamp}.html`].sort());
    } finally {
      vi.useRealTimers();
    }
  });

  it('getMeta rejects path traversal in id', () => {
    expect(() => getMeta('../evil')).toThrow(/invalid path segment/);
  });

  it('restoreVersion rejects path traversal in name', () => {
    const meta = createSimulation(input, '<html>v1</html>');
    updateArtifact(meta.id, '<html>v2</html>');
    expect(() => restoreVersion(meta.id, '../../etc/passwd')).toThrow(/invalid path segment/);
  });

  it('listSimulations skips entries with corrupt meta.json instead of throwing', () => {
    const meta = createSimulation(input, '<html>v1</html>');
    const corruptDir = path.join(process.env.SHOWMEHOW_DATA_DIR!, 'simulations', 'corrupt-id');
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, 'meta.json'), '{ not valid json');
    const list = listSimulations();
    expect(list.map((m) => m.id)).toEqual([meta.id]);
  });
});
