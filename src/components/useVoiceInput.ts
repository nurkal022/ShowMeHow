'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Голосовой ввод через встроенное в браузер распознавание речи (Web Speech API).
 * Ничего никуда не отправляем сами: распознаёт браузер, мы получаем готовый текст.
 * В Firefox и части мобильных браузеров API нет — тогда supported === false и
 * кнопка микрофона просто не показывается.
 */

interface SpeechAlternative { transcript: string }
interface SpeechResult { 0: SpeechAlternative; isFinal: boolean; length: number }
interface SpeechEvent { resultIndex: number; results: { length: number; [i: number]: SpeechResult } }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Человекочитаемая причина отказа: коды Web Speech API мало кому что говорят. */
export function voiceErrorText(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Нет доступа к микрофону';
  if (code === 'no-speech') return 'Не расслышал — попробуйте ещё раз';
  if (code === 'audio-capture') return 'Микрофон не найден';
  if (code === 'network') return 'Распознавание недоступно без сети';
  return 'Не удалось распознать речь';
}

export function useVoiceInput(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  // Колбэк держим в ref: пересоздавать распознаватель на каждый рендер нельзя,
  // он в этот момент уже слушает микрофон.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setSupported(true);
    const rec = new Ctor();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text.trim()) onTextRef.current(text.trim());
    };
    rec.onerror = (e) => { setError(voiceErrorText(e.error)); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.stop(); } catch { /* уже остановлен */ } };
  }, []);

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    setError(null);
    if (listening) { rec.stop(); setListening(false); return; }
    try { rec.start(); setListening(true); }
    catch { /* повторный start до onend — распознаватель уже слушает */ }
  }, [listening]);

  return { supported, listening, error, toggle };
}
