'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { IconSpark } from '@/components/icons';
import { AiBusy } from './AiAssist';
import { useFormat, useT } from '@/i18n/client';
import { teachReview } from '@/i18n/messages/teach-review';

/** Кнопки разбора: сделать или обновить разбор; по нему — тема «Работа над ошибками». */
export default function DebriefActions({ topicId, hasDebrief, canRun }: { topicId: string; hasDebrief: boolean; canRun: boolean }) {
  const router = useRouter();
  const t = useT(teachReview);
  const f = useFormat();
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

  if (busy) return <div className="debrief-busy"><AiBusy text={busy === 'debrief' ? t('busyDebrief') : t('busyRemedial')} /></div>;
  return (
    <div className="debrief-actions">
      <button type="button" className={hasDebrief ? 'btn btn-sm ai-btn' : 'btn btn-primary ai-btn'} disabled={!canRun} onClick={() => run('create')}>
        <IconSpark size={16} />{hasDebrief ? t('refreshDebrief') : t('makeDebrief')}
      </button>
      {hasDebrief && (
        <button type="button" className="btn btn-sm" onClick={() => run('remedial')}>{t('remedialLesson')}</button>
      )}
      {!canRun && <span className="muted">{t('needAnswers')}</span>}
      {error && <p className="error-box" role="alert">{f.message(error)}</p>}
    </div>
  );
}
