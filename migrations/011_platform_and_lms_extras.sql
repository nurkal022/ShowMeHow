-- Настройки платформы: пока одна — открыта ли самостоятельная регистрация.
CREATE TABLE platform_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

-- Срок сдачи темы: «ДЗ на четверг». Опоздавшие ответы принимаются, но помечаются.
ALTER TABLE topics ADD COLUMN due_at timestamptz;

-- Уведомления: проверили работу, вернули на доработку, пришли новые работы, скоро срок.
-- key склеивает повторы: второе «новые работы» по тому же заданию обновляет первое.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        text NOT NULL,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  href       text NOT NULL,
  count      int  NOT NULL DEFAULT 1,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_unread_key ON notifications (user_id, key) WHERE read_at IS NULL;
CREATE INDEX notifications_user ON notifications (user_id, updated_at DESC);
