-- Рабочее место исследователя: графики из данных, модели по формулам и ссылки на
-- тренажёры, собранные в проекты (статья, грант, доклад). Живёт отдельно от LMS:
-- ни курсов, ни групп — только автор и его материалы.
CREATE TABLE research_projects (
  id           uuid PRIMARY KEY,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  -- Публичная страница проекта (постер, приложение к статье): токен в ссылке, без входа.
  public_token text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_projects_owner ON research_projects (owner_id, updated_at DESC);

CREATE TABLE research_items (
  id           uuid PRIMARY KEY,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Проект удалили — материалы остаются у автора «без проекта».
  project_id   uuid REFERENCES research_projects(id) ON DELETE SET NULL,
  kind         text NOT NULL CHECK (kind IN ('plot', 'model', 'sim')),
  title        text NOT NULL,
  -- Документ целиком: таблица, серии, формулы. Картинка из него строится заново.
  doc          jsonb NOT NULL,
  -- Подпись к рисунку и заметки — то, что пойдёт в статью рядом с графиком.
  caption      text NOT NULL DEFAULT '',
  public_token text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_items_owner ON research_items (owner_id, updated_at DESC);
CREATE INDEX research_items_project ON research_items (project_id, updated_at DESC);
