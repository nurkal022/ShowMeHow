import fs from 'node:fs';
import path from 'node:path';
import { db, closeDb } from '../src/lib/db/client';
import { applyMigrations } from './migrate';
import { createUser, findUserByEmail } from '../src/lib/auth/users';
import { dataDir } from '../src/lib/settings';
import type { SimulationMeta } from '../src/lib/types';

/**
 * Владелец переносимых симуляций: до аккаунтов у данных не было хозяина, поэтому
 * все старые meta.json записываются на админа из окружения. Если пользователь уже
 * существует (например, самим собой зарегистрировался ранее) — используем его id.
 */
async function ensureAdmin(): Promise<string> {
  const email = process.env.SHOWMEHOW_ADMIN_EMAIL;
  const password = process.env.SHOWMEHOW_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Задайте SHOWMEHOW_ADMIN_EMAIL и SHOWMEHOW_ADMIN_PASSWORD');
  }
  const existing = await findUserByEmail(email);
  if (existing) return existing.id;
  return (await createUser(email, password)).id;
}

async function main(): Promise<void> {
  await applyMigrations(db());
  const ownerId = await ensureAdmin();
  const root = path.join(dataDir(), 'simulations');
  if (!fs.existsSync(root)) {
    console.log('Каталог симуляций пуст — переносить нечего');
    return;
  }
  let moved = 0, skipped = 0, broken = 0;
  for (const id of fs.readdirSync(root)) {
    const metaPath = path.join(root, id, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    let meta: SimulationMeta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      broken++;
      continue;
    }
    const { rowCount } = await db().query('SELECT 1 FROM simulations WHERE id = $1', [meta.id]);
    if (rowCount) { skipped++; continue; }
    await db().query(
      `INSERT INTO simulations (id, owner_id, title, prompt, subject, tags, warning, demo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [meta.id, ownerId, meta.title, meta.prompt, meta.subject, meta.tags,
        meta.warning ?? null, meta.demo ?? null, meta.createdAt, meta.updatedAt]);
    moved++;
  }
  console.log(`Перенесено: ${moved}, уже было: ${skipped}, повреждённых meta.json: ${broken}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());
