-- Лимиты расхода модели. Персональные значения перекрывают общие из platform_settings:
-- generation_limit — сколько тренажёров всего, ai_daily_limit — сколько ИИ-запросов за сутки
-- (доработки, план, помощники статьи и преподавателя). NULL — по общему правилу.
ALTER TABLE users ADD COLUMN generation_limit integer;
ALTER TABLE users ADD COLUMN ai_daily_limit integer;

-- Журнал ИИ-запросов мимо очереди генераций: по нему считается суточный лимит.
CREATE TABLE ai_usage (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_user_time ON ai_usage (user_id, created_at);
