import fs from 'node:fs/promises';
import path from 'node:path';
import { guardUser } from '@/lib/http/guards';
import { notFound, type IdParams } from '@/lib/http/route-kit';
import { siteFromHeaders } from '@/lib/http/site';
import { learnerCourse } from '@/lib/lms/access';
import { getTopic } from '@/lib/lms/courses';
import { listBlocks } from '@/lib/lms/blocks';
import { toStudentBody } from '@/lib/lms/block-schema';
import { getAsset } from '@/lib/lms/assets';
import { learnTopicHref } from '@/lib/lms/links';
import { offlineFileName, offlineLessonHtml, offlineNeeds } from '@/lib/lms/offline';
import { cdnFetcher, dropFontFallbacks, inlineSimLibs } from '@/lib/lms/offline-libs';
import { getSharedArtifact } from '@/lib/storage';
import { localeFromRequest } from '@/i18n/config';

/** Стиль KaTeX со шрифтами внутри: формулы урока рисуются без сети. */
let katexCss: Promise<string> | null = null;
function loadKatexCss(): Promise<string> {
  katexCss ??= (async () => {
    const dir = path.join(process.cwd(), 'node_modules/katex/dist');
    let css = await fs.readFile(path.join(dir, 'katex.min.css'), 'utf8');
    const fonts = [...new Set([...css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
    for (const f of fonts) {
      const b = await fs.readFile(path.join(dir, f)).catch(() => null);
      if (b) css = css.split(`url(${f})`).join(`url(data:font/woff2;base64,${b.toString('base64')})`);
    }
    return dropFontFallbacks(css);
  })().catch((e) => { katexCss = null; throw e; });
  return katexCss;
}

/** «Скачать урок»: один HTML-файл, который открывается без интернета. Контрольные не отдаём — задания раньше времени. */
export async function GET(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const topic = await getTopic(id);
  const preview = new URL(req.url).searchParams.get('preview') === '1';
  const ctx = topic ? await learnerCourse(user, topic.courseId, preview) : null;
  if (!topic || !ctx || topic.format === 'exam') return notFound();

  const blocks = (await listBlocks(topic.id)).map((b) => toStudentBody(b.body, false));
  const needs = offlineNeeds(blocks);
  const [sims, images, css] = await Promise.all([
    Promise.all(needs.sims.map(async (simId) => {
      const shared = await getSharedArtifact(simId).catch(() => null);
      return shared ? [simId, await inlineSimLibs(shared.html, cdnFetcher)] as const : null;
    })),
    Promise.all(needs.images.map(async (src) => {
      const m = /^\/api\/lms\/assets\/([0-9a-f-]{36})$/i.exec(src);
      const a = m ? await getAsset(m[1]) : null;
      return a ? [src, `data:${a.mime};base64,${a.bytes.toString('base64')}`] as const : null;
    })),
    loadKatexCss(),
  ]);

  const locale = localeFromRequest(req);
  const origin = siteFromHeaders((n) => req.headers.get(n));
  const html = offlineLessonHtml({
    locale, courseTitle: ctx.course.title, topicTitle: topic.title,
    origin, siteHref: origin + learnTopicHref(topic.id, ctx.preview),
    blocks, sims: new Map(sims.filter((s) => s !== null)), images: new Map(images.filter((s) => s !== null)), katexCss: css,
  });
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(offlineFileName(topic.title))}`,
      'Cache-Control': 'no-store',
    },
  });
}
