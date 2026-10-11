-- Telegram-бот сообщества: кто пришёл из Telegram, к какому аккаунту привязан,
-- одноразовые ссылки привязки/входа и служебное состояние бота (группа, темы, offset).
CREATE TABLE telegram_accounts (
  tg_user_id  bigint PRIMARY KEY,
  -- Аккаунт платформы. NULL — человек прошёл анкету, но ещё не открыл ссылку.
  user_id     uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  username    text,
  first_name  text,
  lang        text,
  -- Кем человек себя назвал в анкете: teacher | student | researcher.
  persona     text,
  linked_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_claims (
  token_hash  text PRIMARY KEY,
  tg_user_id  bigint NOT NULL REFERENCES telegram_accounts(tg_user_id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_claims_user ON telegram_claims (tg_user_id);

CREATE TABLE telegram_state (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
