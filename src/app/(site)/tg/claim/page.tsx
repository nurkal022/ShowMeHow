import { currentUserFromCookies, impersonatorFromCookies } from '@/lib/auth/session';
import { userLabel } from '@/lib/auth/identifier';
import { peekClaim, userStatus } from '@/lib/telegram/store';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { tgClaim } from '@/i18n/messages/tg-claim';
import ClaimForm from './ClaimForm';

export default async function TgClaimPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const raw = (await searchParams).t;
  // ?t=a&t=b приходит массивом — такую ссылку бот не выдаёт, считаем её недействительной.
  const token = typeof raw === 'string' ? raw.slice(0, 200) : '';
  const acc = token ? await peekClaim(token) : null;
  const t = translator(tgClaim, await getLocale());
  if (!acc) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>{t('expiredTitle')}</h1>
          <p className="muted">{t('expired')}</p>
        </div>
      </div>
    );
  }
  if ((await userStatus(acc.userId)) === 'disabled') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>{t('blockedTitle')}</h1>
          <p className="muted">{t('blocked')}</p>
        </div>
      </div>
    );
  }
  if (await impersonatorFromCookies()) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>{t('title')}</h1>
          <p className="muted">{t('impersonating')}</p>
        </div>
      </div>
    );
  }
  const user = await currentUserFromCookies();
  const tgName = acc.username ? `@${acc.username}` : (acc.firstName ?? '');
  return (
    <div className="auth-page">
      <ClaimForm token={token} tgName={tgName} who={user ? userLabel(user) : null} />
    </div>
  );
}
