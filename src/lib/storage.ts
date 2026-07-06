import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './settings';
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
function metaPath(id: string): string {
  return path.join(simDir(id), 'meta.json');
}
function artifactPath(id: string): string {
  return path.join(simDir(id), 'artifact.html');
}

export function createSimulation(
  input: { title: string; prompt: string; subject: string; tags: string[]; warning?: string },
  html: string,
): SimulationMeta {
  const now = new Date().toISOString();
  const meta: SimulationMeta = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...input };
  fs.mkdirSync(path.join(simDir(meta.id), 'history'), { recursive: true });
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
  fs.writeFileSync(artifactPath(meta.id), html);
  return meta;
}

export function getMeta(id: string): SimulationMeta {
  assertSafe(id);
  return JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
}

export function getArtifact(id: string): string {
  assertSafe(id);
  return fs.readFileSync(artifactPath(id), 'utf8');
}

export function listSimulations(): SimulationMeta[] {
  if (!fs.existsSync(simsRoot())) return [];
  return fs.readdirSync(simsRoot())
    .filter((d) => fs.existsSync(metaPath(d)))
    .map((d) => getMeta(d))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function touch(id: string): void {
  const meta = getMeta(id);
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
}

export function updateArtifact(id: string, html: string): void {
  assertSafe(id);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const historyDir = path.join(simDir(id), 'history');
  let historyFile = path.join(historyDir, `${stamp}.html`);

  // Handle collision: if file exists, append numeric suffix until unique
  let suffix = 2;
  while (fs.existsSync(historyFile)) {
    historyFile = path.join(historyDir, `${stamp}-${suffix}.html`);
    suffix++;
  }

  fs.renameSync(artifactPath(id), historyFile);
  fs.writeFileSync(artifactPath(id), html);
  touch(id);
}

export function listHistory(id: string): string[] {
  assertSafe(id);
  return fs.readdirSync(path.join(simDir(id), 'history')).sort().reverse();
}

export function restoreVersion(id: string, name: string): void {
  assertSafe(id);
  assertSafe(name);
  const restored = fs.readFileSync(path.join(simDir(id), 'history', name), 'utf8');
  updateArtifact(id, restored);
}

export function deleteSimulation(id: string): void {
  assertSafe(id);
  fs.rmSync(simDir(id), { recursive: true, force: true });
}

export function saveThumbnail(id: string, png: Buffer): void {
  assertSafe(id);
  fs.writeFileSync(path.join(simDir(id), 'thumbnail.png'), png);
}

export function getThumbnailPath(id: string): string | null {
  assertSafe(id);
  const p = path.join(simDir(id), 'thumbnail.png');
  return fs.existsSync(p) ? p : null;
}
