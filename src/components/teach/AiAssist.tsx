'use client';
import { callApi } from '@/components/cabinet/api';

/** Пока помощник пишет — живая плашка поверх редактора: ответ модели занимает до минуты. */
export function AiBusy({ text }: { text: string }) {
  return (
    <div className="ai-busy" role="status" aria-live="polite">
      <span className="ai-busy-orb" aria-hidden="true"><i /><i /><i /></span>
      <div><strong>{text}</strong><span>Обычно 20–60 секунд. Блоки появятся в теме, их можно будет править.</span></div>
    </div>
  );
}

/** Задания по тексту блока или варианты задания — пункт меню блока. */
export async function aiBlockAction(action: 'tasks' | 'variants', blockId: string, count = 3) {
  return callApi<{ created: number; firstId?: string }>('/api/teach/ai', 'POST', { action, blockId, count });
}
