-- Заметки и закладки ученика на шаге урока. Одна запись на шаг: можно оставить
-- заметку, поставить закладку — или и то, и другое. Пустая запись удаляется кодом.
CREATE TABLE lesson_notes (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_id   uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  body       text NOT NULL DEFAULT '',
  bookmarked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, block_id)
);
CREATE INDEX lesson_notes_user ON lesson_notes (user_id, updated_at DESC);
CREATE INDEX lesson_notes_topic ON lesson_notes (topic_id);
