-- Разбор урока помощником: цифры по заданиям темы и выводы (ошибки, что повторить).
-- Хранится, чтобы учитель вернулся к нему, а администратор видел работу учителя.
CREATE TABLE lesson_debriefs (
  id         uuid PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  stats      jsonb NOT NULL,
  summary    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_debriefs_topic ON lesson_debriefs (topic_id, created_at DESC);
CREATE INDEX lesson_debriefs_org ON lesson_debriefs (org_id, created_at DESC);

-- Еженедельный отчёт организации: цифры недели и текст помощника. Одна строка на неделю,
-- повторная сборка перезаписывает её.
CREATE TABLE org_reports (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  facts      jsonb NOT NULL,
  summary    jsonb,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, week_start)
);
