import { requireAdminPage } from '@/lib/http/page-guards';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import AnnounceForm from '@/components/community/AnnounceForm';
import RevokeButton from '@/components/community/RevokeButton';
import { botToken } from '@/lib/telegram/api';
import { getGroup } from '@/lib/telegram/group';
import { joinedSince, listAccounts, stats } from '@/lib/telegram/store';
import { botUsername } from '@/lib/telegram/community';
import { getLocale } from '@/i18n/server';
import { formatDate, formatNumber, translator } from '@/i18n/core';
import { LOCALE_SHORT } from '@/i18n/config';
import { community } from '@/i18n/messages/community';

/** Сообщество в Telegram: состояние бота и группы, анонсы, люди. */
export default async function AdminCommunityPage() {
  const admin = await requireAdminPage('/admin/community');
  if (!admin) return null;
  const locale = await getLocale();
  const t = translator(community, locale);
  const on = !!botToken();
  const [group, s, week, people, bot] = await Promise.all([
    getGroup(), stats(), joinedSince(7), listAccounts(), on ? botUsername().catch(() => null) : null,
  ]);
  const fmt = (n: number) => formatNumber(n, locale);
  return (
    <>
      <CabinetHeader title={t('title')} subtitle={t('sub')} />
      {!on && <p className="error-box">{t('botOff')}</p>}
      <div className="kpi-row community-kpis">
        <div className="kpi"><b>{fmt(s.total)}</b><span>{t('statTotal')}</span></div>
        <div className="kpi"><b>{fmt(s.linked)}</b><span>{t('statLinked')}</span></div>
        <div className="kpi"><b>{fmt(week)}</b><span>{t('statWeek')}</span></div>
      </div>
      <section className="panel">
        <h2>{t('group')}</h2>
        {group ? (
          <ul className="community-facts">
            <li><strong>{group.title ?? group.chatId}</strong> · {t('topics', { n: Object.keys(group.topics).length })}</li>
            {group.inviteLink && <li>{t('invite')}: <a href={group.inviteLink} target="_blank" rel="noreferrer">{group.inviteLink}</a></li>}
            {bot && <li>{t('bot')}: <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">@{bot}</a></li>}
          </ul>
        ) : <p className="muted">{t('groupNone')}</p>}
      </section>
      {group && on && (
        <section className="panel">
          <h2>{t('announce')}</h2>
          <p className="muted">{t('announceHint')}</p>
          <AnnounceForm />
        </section>
      )}
      <section className="cab-card">
        <header className="cab-card-head"><div><h2>{t('people')}</h2></div></header>
        {people.length === 0 ? <p className="muted cab-empty">{t('empty')}</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('c_tg')}</th><th>{t('c_account')}</th><th>{t('c_role')}</th><th>{t('c_lang')}</th><th>{t('c_when')}</th><th /></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.tgUserId}>
                    <td data-label={t('c_tg')}>
                      {p.username
                        ? <a href={`https://t.me/${p.username}`} target="_blank" rel="noreferrer">@{p.username}</a>
                        : (p.firstName ?? p.tgUserId)}
                    </td>
                    <td data-label={t('c_account')}>
                      {p.userId
                        ? <a href={`/admin/users/${p.userId}`}>{p.displayName || p.email || p.login}</a>
                        : <span className="muted">{t('notLinked')}</span>}
                      {p.disabled && <span className="muted"> · {t('blocked')}</span>}
                    </td>
                    <td data-label={t('c_role')}>{p.persona ? t(p.persona) : '—'}</td>
                    <td data-label={t('c_lang')}>{p.lang ? LOCALE_SHORT[p.lang] : '—'}</td>
                    <td data-label={t('c_when')}>{formatDate(p.createdAt, locale)}</td>
                    <td>{p.userId && <RevokeButton userId={p.userId} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
