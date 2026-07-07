'use client';
import { useEffect, useState } from 'react';

interface SimError { id: number; message: string }

let nextId = 0;

export default function PreviewFrame({ html }: { html: string | null }) {
  const [errors, setErrors] = useState<SimError[]>([]);

  useEffect(() => {
    setErrors([]);
  }, [html]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'sim-error') return;
      const message = String(e.data.message ?? '');
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
