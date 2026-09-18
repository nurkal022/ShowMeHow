import type { CredentialCard } from '@/lib/org/credentials';

export const CARDS_PER_PAGE = 8;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Карточки под печать: по восемь на лист A4, разрезаются и раздаются ученикам. */
export default function CredentialSheet({ cards, site, groupTitle }: {
  cards: CredentialCard[]; site: string; groupTitle: string;
}) {
  return (
    <div>
      {chunk(cards, CARDS_PER_PAGE).map((page, i) => (
        <div key={i} className="cred-page">
          {page.map((c) => (
            <div key={c.userId} className="cred-card">
              <strong>{c.displayName}</strong>
              <span className="muted">Группа {groupTitle}</span>
              <span>Логин: <span className="num" data-field="login">{c.login}</span></span>
              <span>Пароль: <span className="num" data-field="password">{c.password}</span></span>
              <span>Сайт: <span className="num">{site}</span></span>
              <span className="muted">При первом входе придумайте свой пароль.</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
