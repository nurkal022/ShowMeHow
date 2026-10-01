import type { CredentialCard } from '@/lib/org/credentials';
import { IconScissors } from '@/components/icons';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { orgPeople } from '@/i18n/messages/org-people';

export const CARDS_PER_PAGE = 8;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Карточки под печать: по восемь на лист A4, разрезаются по пунктиру и раздаются ученикам. */
export default function CredentialSheet({ cards, site, groupTitle, locale = 'ru' }: {
  cards: CredentialCard[]; site: string; groupTitle: string; locale?: Locale;
}) {
  const t = translator(orgPeople, locale);
  const pages = chunk(cards, CARDS_PER_PAGE);
  return (
    <div className="cred-sheet">
      <p className="cred-sheet-note no-print">
        <IconScissors size={16} />
        {t('cardsNote', { cards: cards.length, pages: pages.length })}
      </p>
      {pages.map((page, i) => (
        <div key={i} className="cred-page">
          {page.map((c) => (
            <div key={c.userId} className="cred-card">
              <span className="cred-card-head">
                <strong>{c.displayName}</strong>
                <span className="muted">{t('cardGroup', { title: groupTitle })}</span>
              </span>
              <span className="cred-line"><span className="cred-key">{t('cardSite')}</span><span className="num">{site}</span></span>
              <span className="cred-line"><span className="cred-key">{t('cardLogin')}</span><span className="num" data-field="login">{c.login}</span></span>
              <span className="cred-line"><span className="cred-key">{t('cardPassword')}</span><span className="num cred-password" data-field="password">{c.password}</span></span>
              <span className="muted cred-foot">{t('cardFoot')}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
