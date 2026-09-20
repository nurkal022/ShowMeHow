-- Прохождение урока по шагам: какие блоки ученик открыл. Прогресс темы теперь считается
-- по шагам, а не только по факту открытия темы.
CREATE TABLE block_views (
  block_id uuid REFERENCES blocks(id) ON DELETE CASCADE,
  user_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (block_id, user_id)
);
CREATE INDEX block_views_user ON block_views (user_id, last_at DESC);

-- Обсуждение под уроком: вопросы учеников и ответы учителя. Ответ на ответ — один уровень.
CREATE TABLE lesson_comments (
  id         uuid PRIMARY KEY,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES lesson_comments(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX lesson_comments_topic ON lesson_comments (topic_id, created_at);

-- Диалог с наставником: хранится, чтобы ученик вернулся к нему, а учитель видел,
-- что именно было непонятно классу.
CREATE TABLE tutor_messages (
  id         uuid PRIMARY KEY,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  block_id   uuid REFERENCES blocks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('student', 'tutor')),
  text       text NOT NULL,
  -- Номер подсказки к заданию: 1, 2, 3 — дальше наставник отправляет к учителю.
  hint_level int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutor_messages_thread ON tutor_messages (user_id, topic_id, created_at);
CREATE INDEX tutor_messages_topic ON tutor_messages (topic_id, created_at DESC);
