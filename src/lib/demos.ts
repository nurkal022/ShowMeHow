import fs from 'node:fs';
import path from 'node:path';
import { instrument } from './artifact';
import { renderArtifact, type RenderFn } from './renderer';
import { createSimulation, saveThumbnail } from './storage';
import { getRepo } from './db/repo';

export interface DemoEntry {
  slug: string;
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  html: string;
  /** Метаданные для подбора эталона (см. src/lib/exemplars.ts). */
  mode?: '2d' | '3d';
  keywords?: string[];
  /** Эталон уровня SimUI 2.0 — к нему применяется строгий гейт качества. */
  exemplar?: boolean;
}

interface DemoMetaFile {
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  mode?: '2d' | '3d';
  keywords?: string[];
  exemplar?: boolean;
}

export function demosRoot(): string {
  return process.env.SHOWMEHOW_DEMOS_DIR ?? path.join(process.cwd(), 'demos');
}

export function listBundledDemos(): DemoEntry[] {
  const root = demosRoot();
  if (!fs.existsSync(root)) return [];
  const demos: DemoEntry[] = [];
  for (const slug of fs.readdirSync(root)) {
    const dir = path.join(root, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    const metaPath = path.join(dir, 'meta.json');
    const artifactPath = path.join(dir, 'artifact.html');
    if (!fs.existsSync(metaPath) || !fs.existsSync(artifactPath)) continue;
    let meta: DemoMetaFile;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      // повреждённый meta.json — демку пропускаем, не роняем весь список
      continue;
    }
    const html = fs.readFileSync(artifactPath, 'utf8');
    demos.push({
      slug, title: meta.title, prompt: meta.prompt, subject: meta.subject, tags: meta.tags,
      mode: meta.mode, keywords: meta.keywords, exemplar: meta.exemplar, html,
    });
  }
  return demos;
}

const installPromises = new Map<string, Promise<{ installed: string[]; skipped: string[] }>>();

/**
 * Конкурентные вызовы (например, несколько вкладок, открытых одновременно на старте)
 * должны разделять один запуск установки демок, а не гонять listBundledDemos()/createSimulation()
 * параллельно и рисковать дублями в библиотеке. Запуск кэшируется по владельцу: два
 * разных пользователя, нажавшие кнопку одновременно, обязаны получить каждый свой прогон.
 */
export function installDemos(
  ownerId: string,
  render: RenderFn = renderArtifact,
): Promise<{ installed: string[]; skipped: string[] }> {
  let pending = installPromises.get(ownerId);
  if (!pending) {
    pending = runInstallDemos(ownerId, render).finally(() => { installPromises.delete(ownerId); });
    installPromises.set(ownerId, pending);
  }
  return pending;
}

async function runInstallDemos(
  ownerId: string,
  render: RenderFn,
): Promise<{ installed: string[]; skipped: string[] }> {
  const installed: string[] = [];
  const skipped: string[] = [];
  for (const demo of listBundledDemos()) {
    if (await getRepo().hasDemo(ownerId, demo.slug)) {
      skipped.push(demo.slug);
      continue;
    }
    const html = instrument(demo.html);
    const report = await render(html);
    const meta = await createSimulation(
      ownerId,
      { title: demo.title, prompt: demo.prompt, subject: demo.subject, tags: demo.tags, demo: demo.slug },
      html,
    );
    const thumbnail = report.screenshots[1] ?? report.screenshots[0];
    if (thumbnail) await saveThumbnail(ownerId, meta.id, thumbnail);
    installed.push(demo.slug);
  }
  return { installed, skipped };
}
