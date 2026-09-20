'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { IconSpark } from '@/components/icons';
import { AiBusy } from './AiAssist';

/** Кнопки разбора: сделать или обновить разбор; по нему — тема «Работа над ошибками». */
export default function DebriefActions({ topicId, hasDebrief, canRun }: { topicId: string; hasDebrief: boolean; canRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'' | 'debrief' | 'remedial'>('');
  const [error, setError] = useState('');

  async function run(action: 'create' | 'remedial') {
    setBusy(action === 'create' ? 'debrief' : 'remedial');
    setError('');
    const res = await callApi<{ href?: string }>('/api/teach/debrief', 'POST', { action, topicId });
    setBusy('');
    if (!res.ok) return setError(res.error);
    if (action === 'remedial' && res.data.href) return router.push(res.data.href);
    // Тема закрепляется в адресе: иначе после обновления страница открыла бы следующую неразобранную.
    router.replace(`${window.location.pathname}?topic=${topicId}`, { scroll: false });
    router.refresh();
  }

  if (busy) return <div className="debrief-busy"><AiBusy text={busy === 'debrief' ? 'Помощник читает ответы класса…' : 'Помощник пишет урок по ошибкам…'} /></div>;
  return (
    <div className="debrief-actions">
      <button type="button" className={hasDebrief ? 'btn btn-sm ai-btn' : 'btn btn-primary ai-btn'} disabled={!canRun} onClick={() => run('create')}>
        <IconSpark size={16} />{hasDebrief ? 'Обновить разбор' : 'Сделать разбор'}
      </button>
      {hasDebrief && (
        <button type="button" className="btn btn-sm" onClick={() => run('remedial')}>Урок «Работа над ошибками»</button>
      )}
      {!canRun && <span className="muted">Нужны сданные ответы</span>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </div>
  );
}
