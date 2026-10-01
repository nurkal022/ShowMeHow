import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { acquire, throttled, THROTTLE_MESSAGE } from '@/lib/http/throttle';
import { getArticle } from '@/lib/research/articles-store';
import { figureOrder, normalizeArticleDoc, type ArticleLang } from '@/lib/research/article';
import { getItem, listItems, ResearchError, type ResearchItem } from '@/lib/research/store';
import { withResearchErrors } from '@/lib/research/http';
import {
  abstractDraft, allowedFigures, caption, citationNeeds, draftSection, projectFacts, reviewLogic, rewrite, translate,
  type RewriteMode,
} from '@/lib/research/writer';

const LANGS: ArticleLang[] = ['ru', 'kk', 'en'];
const MODES: RewriteMode[] = ['academic', 'shorter', 'simpler', 'grammar', 'expand', 'clarity'];
const MAX_FRAGMENT = 20_000;
const MAX_DOC = 3_000_000;

/**
 * ИИ-действия над статьёй. Контекст (текущий документ) присылает редактор — в нём
 * могут быть ещё не сохранённые правки; права проверяются по статье в базе,
 * а рисунки и факты берутся только из материалов автора.
 */
export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body || typeof body.action !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  const article = await getArticle(user.id, (await params).id);
  if (!article) return notFound();
  // Документ присылает редактор, и он целиком уходит в запрос к модели — ограничиваем, как и сохранение статьи.
  if (body.doc !== undefined && JSON.stringify(body.doc).length > MAX_DOC) return badRequest('Статья слишком большая для помощника.');
  const doc = body.doc ? normalizeArticleDoc(body.doc) : article.doc;
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : article.title;
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_FRAGMENT) : '';
  const lang = LANGS.find((l) => l === body.lang) ?? doc.lang;

  const items = async (): Promise<ResearchItem[]> => {
    if (article.projectId) return listItems(user.id, { projectId: article.projectId });
    const found = await Promise.all(figureOrder(doc.sections).map((id) => getItem(user.id, id)));
    return found.filter((i): i is ResearchItem => !!i);
  };

  // Потоковый ответ для правки, перевода и черновика: текст появляется по мере генерации.
  // Формат: куски текста подряд, в конце \u0000 и JSON {text} (уже очищенный) или {error}.
  const streamable = body.stream === true && ['rewrite', 'translate', 'draft'].includes(body.action);
  if (streamable) {
    const release = acquire(user.id, 'write');
    if (!release) return NextResponse.json({ error: THROTTLE_MESSAGE }, { status: 429 });
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const onDelta = (chunk: string) => { try { ctrl.enqueue(enc.encode(chunk.replace(/\u0000/g, ''))); } catch { /* клиент ушёл */ } };
        try {
          let out: string;
          if (body.action === 'rewrite') {
            const mode = MODES.find((m) => m === body.mode);
            if (!mode || !text.trim()) throw new ResearchError('Выделите фрагмент текста.');
            out = await rewrite(text, mode, lang, doc.references, onDelta);
          } else if (body.action === 'translate') {
            if (!text.trim()) throw new ResearchError('Нечего переводить.');
            out = await translate(text, lang, doc.references, onDelta);
          } else {
            const section = doc.sections.find((s) => s.id === body.sectionId);
            if (!section) throw new ResearchError('Раздел не найден.');
            const list = await items();
            out = await draftSection({ doc, section, title, facts: await projectFacts(user.id, list), figureIds: allowedFigures(doc, list) }, onDelta);
          }
          ctrl.enqueue(enc.encode(`\u0000${JSON.stringify({ text: out })}`));
        } catch (e) {
          const message = e instanceof ResearchError ? e.message : 'Помощник сейчас недоступен. Попробуйте через минуту.';
          ctrl.enqueue(enc.encode(`\u0000${JSON.stringify({ error: message })}`));
        } finally {
          release();
          ctrl.close();
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  }

  // throttled ждёт NextResponse, а withResearchErrors отдаёт общий Response — по сути это одно и то же.
  return throttled(user.id, 'write', async () => (await withResearchErrors(async () => {
    switch (body.action) {
      case 'rewrite': {
        const mode = MODES.find((m) => m === body.mode);
        if (!mode || !text.trim()) return badRequest('Выделите фрагмент текста.');
        return NextResponse.json({ text: await rewrite(text, mode, lang, doc.references) });
      }
      case 'translate': {
        if (!text.trim()) return badRequest('Нечего переводить.');
        return NextResponse.json({ text: await translate(text, lang, doc.references) });
      }
      case 'logic': {
        if (!text.trim()) return badRequest('Нечего проверять.');
        return NextResponse.json({ issues: await reviewLogic(text, lang, await projectFacts(user.id, await items())) });
      }
      case 'cite': {
        if (!text.trim()) return badRequest('Нечего проверять.');
        return NextResponse.json({ claims: await citationNeeds(text, lang, doc.references) });
      }
      case 'draft': {
        const section = doc.sections.find((s) => s.id === body.sectionId);
        if (!section) return badRequest('Раздел не найден.');
        const list = await items();
        return NextResponse.json({
          text: await draftSection({ doc, section, title, facts: await projectFacts(user.id, list), figureIds: allowedFigures(doc, list) }),
        });
      }
      case 'caption': {
        const item = typeof body.itemId === 'string' ? await getItem(user.id, body.itemId) : null;
        if (!item) return notFound();
        return NextResponse.json({ text: await caption(item, await projectFacts(user.id, [item]), lang) });
      }
      case 'abstract': {
        const langs = Array.isArray(body.langs) ? LANGS.filter((l) => (body.langs as unknown[]).includes(l)) : [doc.lang];
        const limit = typeof body.wordLimit === 'number' ? Math.min(Math.max(body.wordLimit, 80), 500) : 250;
        return NextResponse.json(await abstractDraft(doc, title, langs.length ? langs : [doc.lang], limit));
      }
      default:
        return badRequest('Неизвестное действие.');
    }
  })) as NextResponse);
}
