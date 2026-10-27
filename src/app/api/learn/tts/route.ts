import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { activeProvider } from '@/lib/settings';
import { chargeAi } from '@/lib/quota';
import { speechText } from '@/lib/lms/speech-text';
import { isLocale } from '@/i18n/config';

const LANG = { ru: 'русском', kk: 'казахском', en: 'английском' } as const;

/**
 * Облачная озвучка ответа наставника — запасной путь, когда у браузера нет голоса языка
 * (почти везде так с казахским). Только для провайдера OpenAI; ИИ-запрос списывается из суточного лимита.
 * 501 — облака нет, клиент читает голосом браузера, какой есть.
 */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const text = speechText(typeof body?.text === 'string' ? body.text : '').slice(0, 1500);
  const locale = isLocale(body?.locale) ? body.locale : 'ru';
  if (!text) return badRequest(INVALID_BODY_MESSAGE);
  const provider = activeProvider();
  if (!provider || !/api\.openai\.com/.test(provider.baseURL)) return new Response(null, { status: 501 });
  const over = await chargeAi(user, 'tts');
  if (over) return over;
  const res = await fetch(`${provider.baseURL.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.SHOWMEHOW_TTS_MODEL || 'gpt-4o-mini-tts', voice: 'alloy', input: text, response_format: 'mp3',
      instructions: `Говори на ${LANG[locale]} языке, спокойно и дружелюбно, как учитель, объясняющий ученику.`,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res?.ok || !res.body) return new Response(null, { status: 502 });
  return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}
