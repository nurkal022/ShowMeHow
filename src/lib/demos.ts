import fs from 'node:fs';
import path from 'node:path';
import { instrument } from './artifact';
import { renderArtifact, type RenderFn } from './renderer';
import { createSimulation, listSimulations, saveThumbnail } from './storage';

export interface DemoEntry {
  slug: string;
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  html: string;
  /** Метаданные для подбора эталона (см. src/lib/exemplars.ts). */
  mode?: '2d' | '3d';
  libs?: string[];
  keywords?: string[];
  techniques?: string[];
  /** Эталон уровня SimUI 2.0 — к нему применяется строгий гейт качества. */
  exemplar?: boolean;
}

interface DemoMetaFile {
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  mode?: '2d' | '3d';
  libs?: string[];
  keywords?: string[];
  techniques?: string[];
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
      mode: meta.mode, libs: meta.libs, keywords: meta.keywords,
      techniques: meta.techniques, exemplar: meta.exemplar, html,
    });
  }
  return demos;
}

let installPromise: Promise<{ installed: string[]; skipped: string[] }> | null = null;

/**
 * Конкурентные вызовы (например, несколько вкладок, открытых одновременно на старте)
 * должны разделять один запуск установки демок, а не гонять listBundledDemos()/createSimulation()
 * параллельно и рисковать дублями в библиотеке.
 */
export function installDemos(
  render: RenderFn = renderArtifact,
): Promise<{ installed: string[]; skipped: string[] }> {
  installPromise ??= runInstallDemos(render).finally(() => { installPromise = null; });
  return installPromise;
}

async function runInstallDemos(
  render: RenderFn,
): Promise<{ installed: string[]; skipped: string[] }> {
  const installed: string[] = [];
  const skipped: string[] = [];
  const existing = listSimulations();
  for (const demo of listBundledDemos()) {
    if (existing.some((m) => m.demo === demo.slug)) {
      skipped.push(demo.slug);
      continue;
    }
    const html = instrument(demo.html);
    const report = await render(html);
    const meta = createSimulation(
      { title: demo.title, prompt: demo.prompt, subject: demo.subject, tags: demo.tags, demo: demo.slug },
      html,
    );
    const thumbnail = report.screenshots[1] ?? report.screenshots[0];
    if (thumbnail) saveThumbnail(meta.id, thumbnail);
    installed.push(demo.slug);
  }
  return { installed, skipped };
}
