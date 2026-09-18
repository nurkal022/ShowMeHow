import type { CredentialCard } from '@/lib/org/credentials';
import { IconScissors } from '@/components/icons';

export const CARDS_PER_PAGE = 8;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Карточки под печать: по восемь на лист A4, разрезаются по пунктиру и раздаются ученикам. */
export default function CredentialSheet({ cards, site, groupTitle }: {
  cards: CredentialCard[]; site: string; groupTitle: string;
}) {
  const pages = chunk(cards, CARDS_PER_PAGE);
  return (
    <div className="cred-sheet">
      <p className="cred-sheet-note no-print">
        <IconScissors size={16} />
        {`Карточек: ${cards.length}, листов A4: ${pages.length}. Режьте по пунктиру. На печати останутся только карточки.`}
      </p>
      {pages.map((page, i) => (
        <div key={i} className="cred-page">
          {page.map((c) => (
            <div key={c.userId} className="cred-card">
              <span className="cred-card-head">
                <strong>{c.displayName}</strong>
                <span className="muted">Группа {groupTitle}</span>
              </span>
              <span className="cred-line"><span className="cred-key">Сайт</span><span className="num">{site}</span></span>
              <span className="cred-line"><span className="cred-key">Логин</span><span className="num" data-field="login">{c.login}</span></span>
              <span className="cred-line"><span className="cred-key">Пароль</span><span className="num cred-password" data-field="password">{c.password}</span></span>
              <span className="muted cred-foot">При первом входе придумайте свой пароль и никому его не говорите.</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
