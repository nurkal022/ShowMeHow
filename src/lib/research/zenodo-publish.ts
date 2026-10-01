import { NextResponse } from 'next/server';
import { badRequest } from '../http/route-kit';
import { getRenderableArtifact } from '../storage';
import type { SimDoc } from './doc';
import { getZenodoToken } from './integrations';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';
import { getItem, getProject, listItems, ResearchError, setItemZenodo, setProjectZenodo, type ResearchItem } from './store';
import {
  buildItemFiles, buildMetadata, buildProjectFiles, createZenodoClient, creatorName, fileSize, nextVersion, publishDeposit,
  uploadTypeFor, ZenodoError, type FileSource, type FilesContext, type ZenodoFile, type ZenodoInfo, type ZenodoUploadType,
} from './zenodo';

/**
 * Серверная часть публикации в Zenodo: что именно уходит (материал или проект),
 * предпросмотр файлов для формы и сама публикация с сохранением DOI.
 */

export type TargetKind = 'item' | 'project';

interface Target {
  title: string;
  description: string;
  keywords: string[];
  uploadType: ZenodoUploadType;
  zenodo: ZenodoInfo | null;
  /** Живая страница /r/<token>: ссылка на неё уходит в описание записи. */
  liveUrl: string | null;
  build: (ctx: FilesContext) => ZenodoFile[];
  save: (info: ZenodoInfo) => Promise<void>;
}

const live = (site: string, token: string | null) => (token ? `${site}/r/${token}` : null);

async function source(ownerId: string, it: ResearchItem, liveUrl: string | null): Promise<FileSource> {
  const simHtml = it.kind === 'sim'
    ? await getRenderableArtifact(ownerId, (it.doc as SimDoc).simulationId).catch(() => null) : undefined;
  return { kind: it.kind, title: it.title, caption: it.caption, doc: it.doc, liveUrl, simHtml };
}

const KIND_KEYWORD = { plot: 'kwPlot', model: 'kwModel', sim: 'kwSim' } as const;

/** Только своё: чужой и несуществующий id неотличимы (null → 404). */
export async function loadTarget(ownerId: string, kind: TargetKind, id: string, site: string, locale: Locale = 'ru'): Promise<Target | null> {
  // Ключевые слова по умолчанию — на языке интерфейса: человек видит их в форме и может поправить.
  const kw = (k: ResearchItem['kind']) => translator(researchFigure, locale)(KIND_KEYWORD[k]);
  if (kind === 'item') {
    const it = await getItem(ownerId, id);
    if (!it) return null;
    const project = it.projectId ? await getProject(ownerId, it.projectId) : null;
    const src = await source(ownerId, it, live(site, it.publicToken) ?? live(site, project?.publicToken ?? null));
    return {
      title: it.title, description: it.caption, keywords: [kw(it.kind)], uploadType: uploadTypeFor(it.kind), zenodo: it.zenodo, liveUrl: src.liveUrl,
      build: (ctx) => buildItemFiles(src, ctx),
      save: (info) => setItemZenodo(ownerId, it.id, info),
    };
  }
  const p = await getProject(ownerId, id);
  if (!p) return null;
  // Нумерация файлов — по порядку создания: у новой версии «01-…» останется тем же материалом.
  const items = (await listItems(ownerId, { projectId: p.id })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const projectUrl = live(site, p.publicToken);
  const sources = await Promise.all(items.map((it) => source(ownerId, it, projectUrl ?? live(site, it.publicToken))));
  return {
    title: p.title, description: p.description, keywords: [...new Set(items.map((i) => kw(i.kind)))],
    uploadType: uploadTypeFor('project'), zenodo: p.zenodo, liveUrl: projectUrl,
    build: (ctx) => buildProjectFiles({ title: p.title, description: p.description, liveUrl: projectUrl }, sources, ctx),
    save: (info) => setProjectZenodo(ownerId, p.id, info),
  };
}

const figureKey = (name: string) => (name.endsWith('figure.svg') ? name.replace(/\.svg$/, '.png') : null);

/** Для формы: список файлов, SVG рисунков (PNG рендерит браузер) и значения по умолчанию. */
export function preview(t: Target, author: string) {
  const files = t.build({ author, year: new Date().getFullYear(), version: '1', license: 'cc-by-4.0' });
  const figures: Record<string, string> = {};
  files.forEach((f) => { const k = figureKey(f.name); if (k && typeof f.data === 'string') figures[k] = f.data; });
  return {
    files: files.map((f) => ({ name: f.name, size: fileSize(f) })),
    figures,
    defaults: {
      title: t.title, description: t.description, keywords: t.keywords,
      creators: author ? [{ name: creatorName(author), affiliation: '', orcid: '' }] : [],
      version: t.zenodo ? nextVersion(t.zenodo.version) : '1',
    },
    zenodo: t.zenodo,
  };
}

const MAX_PNG = 8 * 1024 * 1024;
const MAX_PNG_TOTAL = 40 * 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** PNG от браузера: только под имена существующих рисунков, только настоящие PNG и в пределах размера. */
function decodePngs(raw: unknown, allowed: Set<string>): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ResearchError('Некорректные PNG.');
  let total = 0;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(name) || typeof value !== 'string') continue;
    const buf = Buffer.from(value.replace(/^data:image\/png;base64,/, ''), 'base64');
    if (buf.length > MAX_PNG || !PNG_MAGIC.every((b, i) => buf[i] === b)) continue;
    total += buf.length;
    if (total > MAX_PNG_TOTAL) throw new ResearchError('Слишком большие PNG — опубликуйте без них.');
    out.set(name, new Uint8Array(buf));
  }
  return out;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function readMetadata(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ResearchError('Заполните данные публикации.');
  const m = raw as Record<string, unknown>;
  const creators = Array.isArray(m.creators) ? m.creators.slice(0, 50).map((c) => {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    return { name: str(x.name), affiliation: str(x.affiliation), orcid: str(x.orcid) };
  }) : [];
  const keywords = Array.isArray(m.keywords) ? m.keywords.filter((k): k is string => typeof k === 'string') : [];
  return {
    title: str(m.title), description: str(m.description).slice(0, 20000), creators, keywords, license: str(m.license),
    relatedDoi: str(m.relatedDoi) || null, version: str(m.version).slice(0, 40) || null,
  };
}

/**
 * Публикация: новая запись или новая версия прошлой (если сервер тот же — запись из
 * sandbox не продолжить на боевом Zenodo). DOI сохраняется у материала/проекта.
 */
export async function publishTarget(ownerId: string, t: Target, body: Record<string, unknown>, fetchImpl?: typeof fetch): Promise<ZenodoInfo> {
  const auth = await getZenodoToken(ownerId);
  if (!auth) throw new ResearchError('Сначала подключите Zenodo: вставьте персональный токен.');
  const input = readMetadata(body.metadata);
  const version = input.version ?? (t.zenodo ? nextVersion(t.zenodo.version) : '1');
  const metadata = buildMetadata({ ...input, version, uploadType: t.uploadType, liveUrl: t.liveUrl });
  const ctx: Omit<FilesContext, 'doi'> = {
    author: metadata.creators.map((c) => c.name).join('; '), year: new Date().getFullYear(), version, license: metadata.license,
  };
  const client = createZenodoClient({ token: auth.token, sandbox: auth.sandbox, fetch: fetchImpl });
  const recordId = t.zenodo && t.zenodo.sandbox === auth.sandbox ? t.zenodo.recordId : null;
  // Файлы собираем заранее: битый материал должен остановить публикацию до создания черновика.
  const probe = t.build({ ...ctx, doi: null });
  const pngs = decodePngs(body.pngs, new Set(probe.map((f) => figureKey(f.name)).filter((k): k is string => !!k)));
  const done = await publishDeposit(client, {
    recordId,
    metadata,
    files: (doi) => t.build({ ...ctx, doi }).flatMap((f) => {
      const k = figureKey(f.name);
      const png = k ? pngs.get(k) : undefined;
      return png ? [f, { name: k!, data: png }] : [f];
    }),
  });
  const info: ZenodoInfo = {
    ...done, sandbox: auth.sandbox, version, publishedAt: new Date().toISOString(),
    title: metadata.title, creators: metadata.creators.map((c) => c.name), uploadType: t.uploadType,
  };
  await t.save(info);
  return info;
}

/** Отказы Zenodo и проверки формы — 400 с текстом; сбой самого Zenodo — 502. */
export async function withZenodoErrors(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZenodoError) {
      return e.status >= 500 ? NextResponse.json({ error: e.message }, { status: 502 }) : badRequest(e.message);
    }
    if (e instanceof ResearchError) return badRequest(e.message);
    throw e;
  }
}
