import type { Locale } from '@/i18n/config';
import { speechText } from './speech-text';

/**
 * Озвучка в браузере. Голос браузера бесплатный и мгновенный — берём его, если есть голос языка;
 * нет (казахский почти везде) — просим облачный синтез (/api/learn/tts). Облако недоступно —
 * читаем тем голосом, что есть: лучше с акцентом, чем молча. Только для браузера.
 */

export interface Speech { stop(): void }

const LANG: Record<Locale, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' };
const clips = new Map<string, Promise<string | null>>();

function voices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis?.getVoices() ?? [];
  if (now.length || !window.speechSynthesis) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 600);
  });
}

function cloudClip(text: string, locale: Locale): Promise<string | null> {
  const key = `${locale}\u0000${text}`;
  let p = clips.get(key);
  if (!p) {
    p = fetch('/api/learn/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, locale }) })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    p.then((u) => { if (!u) clips.delete(key); });
    clips.set(key, p);
  }
  return p;
}

export function speak(raw: string, locale: Locale, onEnd: () => void): Speech {
  const text = speechText(raw);
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  const finish = () => { if (!stopped) { stopped = true; onEnd(); } };
  const browser = (voice?: SpeechSynthesisVoice) => {
    if (stopped || !window.speechSynthesis) return finish();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? LANG[locale];
    if (voice) u.voice = voice;
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };
  void (async () => {
    const lang = LANG[locale].slice(0, 2);
    const voice = (await voices()).find((v) => v.lang.toLowerCase().startsWith(lang));
    if (voice) return browser(voice);
    const url = await cloudClip(text, locale);
    if (stopped) return;
    if (!url) return browser();
    audio = new Audio(url);
    audio.onended = finish;
    audio.onerror = () => browser();
    audio.play().catch(() => browser());
  })();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      audio?.pause();
      window.speechSynthesis?.cancel();
    },
  };
}
