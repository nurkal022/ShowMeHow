'use client';
import { useState } from 'react';
import { callApi } from '@/components/cabinet/api';
import Dialog from '@/components/lms/ui/Dialog';
import { IconSpark } from '@/components/icons';

/** Пока помощник пишет — живая плашка поверх редактора: ответ модели занимает до минуты. */
export function AiBusy({ text }: { text: string }) {
  return (
    <div className="ai-busy" role="status" aria-live="polite">
      <span className="ai-busy-orb" aria-hidden="true"><i /><i /><i /></span>
      <div><strong>{text}</strong><span>Обычно 20–60 секунд. Блоки появятся в теме, их можно будет править.</span></div>
    </div>
  );
}

/** «Урок с помощником»: тема, класс, пожелания → объяснение, формула, пример, тренажёр и задания. */
export function AiLessonButton({ topicId, topicTitle, subject, empty, onDone }: {
  topicId: string; topicTitle: string; subject: string; empty: boolean;
  onDone: (firstId: string | undefined, created: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(topicTitle);
  const [grade, setGrade] = useState('7 класс');
  const [wishes, setWishes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    const res = await callApi<{ created: number; firstId?: string }>('/api/teach/ai', 'POST', { action: 'lesson', topicId, topic, grade, wishes });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    onDone(res.data.firstId, res.data.created);
  }

  return (
    <>
      <button type="button" className={empty ? 'btn btn-primary ai-btn' : 'btn btn-sm ai-btn'} onClick={() => setOpen(true)}>
        <IconSpark size={16} />{empty ? 'Собрать урок с помощником' : 'Дополнить с помощником'}
      </button>
      {open && (
        <Dialog title="Урок с помощником" subtitle={subject ? `Предмет: ${subject}` : undefined} icon={<IconSpark size={20} />}
          onClose={() => !busy && setOpen(false)}
          footer={busy ? null : (
            <>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Отмена</button>
              <button type="button" className="btn btn-primary" disabled={!topic.trim()} onClick={run}><IconSpark size={16} />Собрать</button>
            </>
          )}>
          {busy ? <AiBusy text="Помощник пишет урок…" /> : (
            <div className="cf-dialog-form">
              <p className="cf-dialog-text">
                Помощник напишет объяснение, ключевую формулу или определение, пример с решением и 4–5 заданий разных типов,
                а если в вашей библиотеке или каталоге есть подходящий тренажёр — вставит и его. Всё добавится в конец темы.
              </p>
              <label className="field"><span>О чём урок</span>
                <input value={topic} maxLength={300} onChange={(e) => setTopic(e.target.value)} />
              </label>
              <label className="field"><span>Для кого</span>
                <input value={grade} maxLength={40} list="ai-grades" onChange={(e) => setGrade(e.target.value)} />
                <datalist id="ai-grades">{['5 класс', '6 класс', '7 класс', '8 класс', '9 класс', '10 класс', '11 класс', 'колледж', 'первый курс вуза'].map((g) => <option key={g} value={g} />)}</datalist>
              </label>
              <label className="field"><span>Пожелания (необязательно)</span>
                <textarea className="input cf-textarea" rows={3} value={wishes} maxLength={800}
                  placeholder="Например: «больше задач на расчёт», «пример из спорта», «без производных»"
                  onChange={(e) => setWishes(e.target.value)} />
              </label>
              {error && <p className="error-box" role="alert">{error}</p>}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

/** Задания по тексту блока или варианты задания — пункт меню блока. */
export async function aiBlockAction(action: 'tasks' | 'variants', blockId: string, count = 3) {
  return callApi<{ created: number; firstId?: string }>('/api/teach/ai', 'POST', { action, blockId, count });
}
