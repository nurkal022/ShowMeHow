'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { AiBusy } from '@/components/teach/AiAssist';
import { IconPrint, IconSpark } from '@/components/icons';
import { useT } from '@/i18n/client';
import { org } from '@/i18n/messages/org';

/** «Сформировать отчёт»: помощник читает цифры недели и пишет выводы; страница перечитывается. */
export function WeekReportButton({ slug, weekStart, again }: { slug: string; weekStart: string; again: boolean }) {
  const router = useRouter();
  const t = useT(org);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    const res = await callApi(`/api/org/${slug}/insights`, 'POST', { action: 'week', weekStart });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }
  if (busy) return <AiBusy text={t('buildBusy')} />;
  return (
    <span className="report-actions no-print">
      <button type="button" className={again ? 'btn ai-btn' : 'btn btn-primary ai-btn'} onClick={run}>
        <IconSpark size={16} />{again ? t('rebuild') : t('build')}
      </button>
      {again && <button type="button" className="btn btn-ghost" onClick={() => window.print()}><IconPrint size={16} />{t('print')}</button>}
      {error && <span className="error-box" role="alert">{error}</span>}
    </span>
  );
}
