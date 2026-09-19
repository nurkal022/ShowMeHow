'use client';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';

interface SimError { id: number; message: string }

let nextId = 0;

export default function PreviewFrame({ html, frameRef, onSimError }: {
  html: string | null;
  /** Ошибка внутри симуляции — вызывающий может откатиться на прошлую рабочую версию. */
  onSimError?: (message: string) => void;
  /** Кому нужен сам iframe: задание «Состояние симуляции» спрашивает у него значения контролов. */
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
}) {
  const [errors, setErrors] = useState<SimError[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onSimErrorRef = useRef(onSimError);
  onSimErrorRef.current = onSimError;

  useEffect(() => {
    setErrors([]);
  }, [html]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Игнорируем сообщения не из нашего iframe — window слушает все message-события на
      // странице, включая от посторонних источников (расширения, другие фреймы).
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type !== 'sim-error') return;
      const message = String(e.data.message ?? '');
      if (onSimErrorRef.current) { onSimErrorRef.current(message); return; }
      setErrors((prev) => [...prev, { id: nextId++, message }].slice(-3));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function dismiss(id: number) {
    setErrors((prev) => prev.filter((err) => err.id !== id));
  }

  if (!html) {
    return <div className="preview-empty">Здесь появится симуляция</div>;
  }
  return (
    <div className="preview-wrap">
      <iframe
        ref={(el) => { iframeRef.current = el; if (frameRef) frameRef.current = el; }}
        className="preview-frame"
        sandbox="allow-scripts"
        srcDoc={html}
        title="Симуляция"
      />
      {errors.length > 0 && (
        <div className="sim-error-overlay">
          {errors.map((err) => (
            <div key={err.id} className="sim-error-item">
              <span>Ошибка в симуляции: {err.message}</span>
              <button onClick={() => dismiss(err.id)} aria-label="Закрыть">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
