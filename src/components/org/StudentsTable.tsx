import type { GroupStudent } from '@/lib/org/groups';
import StatusPill, { personStatus, personStatusKey } from '@/components/cabinet/StatusPill';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { orgPeople } from '@/i18n/messages/org-people';
import { cabinet } from '@/i18n/messages/cabinet';

export default function StudentsTable({ students, actions, locale = 'ru' }: {
  students: GroupStudent[];
  actions?: (s: GroupStudent) => React.ReactNode;
  locale?: Locale;
}) {
  const t = translator(orgPeople, locale);
  const tk = translator(cabinet, locale);
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead>
          <tr><th className="cf-col-n">{t('num')}</th><th>{t('student')}</th><th>{t('login')}</th><th>{t('status')}</th>
            {actions && <th><span className="visually-hidden">{t('actions')}</span></th>}</tr>
        </thead>
        <tbody>
          {students.map((s, i) => {
            const status = { ...personStatus(s), label: tk(personStatusKey(s)) };
            return (
              <tr key={s.userId}>
                <td data-label={t('num')} className="cf-col-n"><span className="num muted">{i + 1}</span></td>
                <td data-label={t('student')}><strong>{s.displayName}</strong></td>
                <td data-label={t('login')}><span className="num">{s.login ?? '—'}</span></td>
                <td data-label={t('status')}><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                {actions && <td className="actions">{actions(s)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
