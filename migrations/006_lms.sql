-- Видимая B2B-часть: журнал админки, лист паролей, общий каталог симуляций и курсы.

-- Журнал действий админов платформы. Автор может исчезнуть — запись остаётся.
CREATE TABLE admin_actions (
  id       bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action   text NOT NULL,
  target   text,
  payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_actions_at ON admin_actions (at DESC, id DESC);

-- Временные пароли учеников в открытом виде — только для печати листа.
-- Строка удаляется при смене пароля и живёт не дольше 30 дней (src/lib/org/credentials.ts).
CREATE TABLE pending_credentials (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pending_credentials_created ON pending_credentials (created_at);

ALTER TABLE simulations ADD COLUMN visibility text NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'catalog'));
CREATE INDEX simulations_catalog ON simulations (updated_at DESC) WHERE visibility = 'catalog';

CREATE TABLE courses (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL REFERENCES users(id),
  title       text NOT NULL,
  subject     text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_org ON courses (org_id, updated_at DESC);
CREATE INDEX courses_owner ON courses (owner_id);

CREATE TABLE course_groups (
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  group_id  uuid REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, group_id)
);
CREATE INDEX course_groups_group ON course_groups (group_id);

CREATE TABLE topics (
  id        uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position  int NOT NULL,
  title     text NOT NULL
);
CREATE INDEX topics_course ON topics (course_id, position);

CREATE TABLE blocks (
  id         uuid PRIMARY KEY,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  position   int NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('text', 'simulation', 'lab', 'assignment')),
  payload    jsonb NOT NULL,
  revision   int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blocks_topic ON blocks (topic_id, position);
-- canView ищет курсы, куда вставлена симуляция: блоком или стендом задания.
CREATE INDEX blocks_simulation ON blocks ((payload->>'simulationId')) WHERE kind = 'simulation';
CREATE INDEX blocks_stand_simulation ON blocks ((payload#>>'{stand,simulationId}')) WHERE kind = 'assignment';

CREATE TABLE topic_views (
  topic_id uuid REFERENCES topics(id) ON DELETE CASCADE,
  user_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)
);

-- Одна строка ответа на ученика и задание: повторная сдача перезаписывает её.
CREATE TABLE submissions (
  id             uuid PRIMARY KEY,
  block_id       uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_revision int NOT NULL,
  answer         jsonb NOT NULL,
  status         text NOT NULL CHECK (status IN ('draft', 'submitted', 'returned', 'graded')),
  auto_score     numeric,
  score          numeric,
  comment        text,
  submitted_at   timestamptz,
  graded_at      timestamptz,
  graded_by      uuid REFERENCES users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, student_id)
);
CREATE INDEX submissions_student ON submissions (student_id);
