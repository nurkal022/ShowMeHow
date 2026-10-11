-- Привязка с сайта: кнопка «Подключить Telegram» в профиле даёт ссылку t.me/<бот>?start=link_<токен>.
-- Обратное направление к telegram_claims: здесь известен аккаунт, а Telegram — ещё нет.
CREATE TABLE telegram_site_links (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_site_links_user ON telegram_site_links (user_id);
