-- Организации, членства с ролью, группы и учителя групп.
-- Ученик группы обязан быть членом той же организации; этот инвариант держит
-- единственная функция записи addToGroup (src/lib/org/groups.ts), а не внешний ключ.
CREATE TABLE organizations (
  id          uuid PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('school','college','university')),
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('org_admin','teacher','student')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user ON memberships (user_id);

CREATE TABLE groups (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title       text NOT NULL,
  join_code   text UNIQUE,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX groups_org ON groups (org_id);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user ON group_members (user_id);

CREATE TABLE group_teachers (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Вход по логину: у ученика почты может не быть, но хоть один идентификатор обязан быть.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN login text UNIQUE;
ALTER TABLE users ADD CONSTRAINT users_has_identifier
  CHECK (email IS NOT NULL OR login IS NOT NULL);
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN disabled_at timestamptz;

-- Короткие сессии учеников не продлеваются; прежние сессии остаются скользящими.
ALTER TABLE sessions ADD COLUMN sliding boolean NOT NULL DEFAULT true;
