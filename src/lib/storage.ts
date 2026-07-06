import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './settings';
import type { SimulationMeta } from './types';

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
  return JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
}

export function getArtifact(id: string): string {
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
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(artifactPath(id), path.join(simDir(id), 'history', `${stamp}.html`));
  fs.writeFileSync(artifactPath(id), html);
  touch(id);
}

export function listHistory(id: string): string[] {
  return fs.readdirSync(path.join(simDir(id), 'history')).sort().reverse();
}

export function restoreVersion(id: string, name: string): void {
  const restored = fs.readFileSync(path.join(simDir(id), 'history', name), 'utf8');
  updateArtifact(id, restored);
}

export function deleteSimulation(id: string): void {
  fs.rmSync(simDir(id), { recursive: true, force: true });
}

export function saveThumbnail(id: string, png: Buffer): void {
  fs.writeFileSync(path.join(simDir(id), 'thumbnail.png'), png);
}

export function getThumbnailPath(id: string): string | null {
  const p = path.join(simDir(id), 'thumbnail.png');
  return fs.existsSync(p) ? p : null;
}
