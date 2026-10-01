import type { RosterPreviewRow } from '@/lib/org/bulk';
import StatusPill from '@/components/cabinet/StatusPill';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { orgPeople } from '@/i18n/messages/org-people';

/** Предпросмотр списка: строки с пометкой подсвечены, у остальных виден итоговый логин. */
export default function RosterPreviewTable({ rows, locale = 'ru' }: { rows: RosterPreviewRow[]; locale?: Locale }) {
  const t = translator(orgPeople, locale);
  return (
    <div className="table-wrap cf-preview-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>{t('line')}</th><th>{t('lastName')}</th><th>{t('firstName')}</th><th>{t('login')}</th><th>{t('mark')}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className={r.issue ? (r.issue === 'duplicate' || r.issue === 'in_group' ? 'cf-row-warn' : 'cf-row-bad') : undefined}>
              <td data-label={t('line')}><span className="num">{r.line}</span></td>
              <td data-label={t('lastName')}>{r.lastName || '—'}</td>
              <td data-label={t('firstName')}>{r.firstName || '—'}</td>
              <td data-label={t('login')}><span className="num">{r.login ?? '—'}</span></td>
              <td data-label={t('mark')}>
                {r.issue
                  ? <StatusPill tone={r.issue === 'duplicate' || r.issue === 'in_group' ? 'warn' : 'danger'}>{t(`issue_${r.issue}`)}</StatusPill>
                  : <StatusPill tone="ok">{t('willBeCreated')}</StatusPill>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
