import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './settings';
import { reinstrument } from './artifact';
import { getRepo } from './db/repo';
import type { SimulationMeta } from './types';

function assertSafe(segment: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(segment) || segment === '.' || segment === '..') {
    throw new Error('invalid path segment');
  }
}

function simsRoot(): string {
  return path.join(dataDir(), 'simulations');
}
function simDir(id: string): string {
  return path.join(simsRoot(), id);
}
function artifactPath(id: string): string {
  return path.join(simDir(id), 'artifact.html');
}

/**
 * Владение проверяется до любого обращения к диску: каталог адресуется по uuid,
 * поэтому единственная защита от чужого id — запись в базе. Отсутствие прав и
 * отсутствие записи неотличимы намеренно (см. спецификацию, раздел 4).
 */
async function owned(ownerId: string, id: string): Promise<boolean> {
  assertSafe(id);
  const rec = await getRepo().get(id);
  return !!rec && rec.ownerId === ownerId;
}

export async function createSimulation(
  ownerId: string,
  input: { title: string; prompt: string; subject: string; tags: string[]; warning?: string; demo?: string },
  html: string,
): Promise<SimulationMeta> {
  const now = new Date().toISOString();
  const meta: SimulationMeta = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...input };
  await getRepo().insert({ ...meta, ownerId });
  fs.mkdirSync(path.join(simDir(meta.id), 'history'), { recursive: true });
  fs.writeFileSync(artifactPath(meta.id), html);
  return meta;
}

export async function getMeta(ownerId: string, id: string): Promise<SimulationMeta | null> {
  assertSafe(id);
  const rec = await getRepo().get(id);
  if (!rec || rec.ownerId !== ownerId) return null;
  const { ownerId: _owner, ...meta } = rec;
  return meta;
}

export async function getArtifact(ownerId: string, id: string): Promise<string | null> {
  if (!(await owned(ownerId, id))) return null;
  try {
    return fs.readFileSync(artifactPath(id), 'utf8');
  } catch {
    // Запись в базе есть, а файла нет — библиотека не должна падать целиком.
    return null;
  }
}

/** HTML для показа/скачивания: всегда со СВЕЖИМ рантаймом (ретроактивно для старых симов). */
export async function getRenderableArtifact(ownerId: string, id: string): Promise<string | null> {
  const html = await getArtifact(ownerId, id);
  return html === null ? null : reinstrument(html);
}

export async function listSimulations(ownerId: string): Promise<SimulationMeta[]> {
  return getRepo().listByOwner(ownerId);
}

export async function updateArtifact(ownerId: string, id: string, html: string): Promise<boolean> {
  if (!(await owned(ownerId, id))) return false;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const historyDir = path.join(simDir(id), 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  let historyFile = path.join(historyDir, `${stamp}.html`);
  let suffix = 2;
  while (fs.existsSync(historyFile)) {
    historyFile = path.join(historyDir, `${stamp}-${suffix}.html`);
    suffix++;
  }
  fs.renameSync(artifactPath(id), historyFile);
  fs.writeFileSync(artifactPath(id), html);
  await getRepo().touch(id, new Date().toISOString());
  return true;
}

export async function listHistory(ownerId: string, id: string): Promise<string[] | null> {
  if (!(await owned(ownerId, id))) return null;
  const dir = path.join(simDir(id), 'history');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().reverse();
}

export async function restoreVersion(ownerId: string, id: string, name: string): Promise<boolean> {
  assertSafe(name);
  if (!(await owned(ownerId, id))) return false;
  const restored = fs.readFileSync(path.join(simDir(id), 'history', name), 'utf8');
  return updateArtifact(ownerId, id, restored);
}

export async function deleteSimulation(ownerId: string, id: string): Promise<void> {
  if (!(await owned(ownerId, id))) return;
  await getRepo().remove(id);
  fs.rmSync(simDir(id), { recursive: true, force: true });
}

export async function saveThumbnail(ownerId: string, id: string, png: Buffer): Promise<boolean> {
  if (!(await owned(ownerId, id))) return false;
  fs.mkdirSync(simDir(id), { recursive: true });
  fs.writeFileSync(path.join(simDir(id), 'thumbnail.png'), png);
  return true;
}

export async function getThumbnailPath(ownerId: string, id: string): Promise<string | null> {
  if (!(await owned(ownerId, id))) return null;
  const p = path.join(simDir(id), 'thumbnail.png');
  return fs.existsSync(p) ? p : null;
}
