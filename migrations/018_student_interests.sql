-- Интересы ученика: чем увлекается, кем хочет стать и как ему понятнее объясняют.
-- Лежат в jsonb рядом с prefs: набор полей будет меняться, а отдельной таблице тут
-- нечего хранить — одна строка на пользователя. Пустой объект — валидные «интересы
-- не заполнены», поэтому старые строки читаются без переноса значений.
ALTER TABLE users ADD COLUMN interests jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Персональный разбор ошибки: помощник объясняет заново то, что ученик не сдал,
-- и даёт свои мини-задания. Разбор принадлежит ученику и живёт дольше блока и темы:
-- курс могут переписать, а разбор ученик должен дочитать, поэтому ссылки — SET NULL.
CREATE TABLE remedial_lessons (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id   uuid REFERENCES topics(id) ON DELETE SET NULL,
  block_id   uuid REFERENCES blocks(id) ON DELETE SET NULL,
  title      text NOT NULL,
  -- Почему разбор появился: в чём была ошибка, словами помощника.
  reason     text NOT NULL,
  body       jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Список разборов ученика — единственный частый запрос.
CREATE INDEX remedial_user ON remedial_lessons (user_id, created_at DESC);
-- По блоку ищем, разобрана ли уже эта ошибка: кнопка «Разобрать» не должна плодить копии.
CREATE INDEX remedial_block ON remedial_lessons (user_id, block_id);
