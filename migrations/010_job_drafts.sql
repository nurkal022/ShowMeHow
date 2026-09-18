-- Черновики генерации: версии симуляции, которые человек видит и пробует, пока идёт полировка.
-- Отменённое задание с черновиком можно открыть из истории и сохранить.
CREATE TABLE job_drafts (
  job_id     uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version    int  NOT NULL,
  label      text NOT NULL,
  html       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, version)
);
-- История сессий человека: последние задания сверху.
CREATE INDEX jobs_owner_created ON jobs (owner_id, created_at DESC);
