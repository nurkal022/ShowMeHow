-- Статьи исследователя: текст по разделам вокруг рисунков проекта, литература,
-- журнал ИИ-правок (из него собирается заявление об использовании ИИ).
CREATE TABLE research_articles (
  id          uuid PRIMARY KEY,
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES research_projects(id) ON DELETE SET NULL,
  title       text NOT NULL,
  doc         jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_articles_owner ON research_articles (owner_id, updated_at DESC);
CREATE INDEX research_articles_project ON research_articles (project_id);

-- Постоянный DOI через Zenodo: у материала и у проекта своя запись.
-- {doi, conceptDoi, recordId, url, sandbox, version, publishedAt}
ALTER TABLE research_items ADD COLUMN zenodo jsonb;
ALTER TABLE research_projects ADD COLUMN zenodo jsonb;

-- Подключённые внешние сервисы автора. Токен хранится зашифрованным (AES-GCM),
-- публикация в Zenodo идёт от имени автора, а не платформы.
CREATE TABLE research_integrations (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('zenodo')),
  secret      text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
