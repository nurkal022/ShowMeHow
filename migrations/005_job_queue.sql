-- Очередь заданий в базе: воркер берёт задания сам, веб только создаёт их и читает журнал.

-- Задания, которые вело прежнее поколение кода в памяти процесса, после перехода
-- продолжить некому. Помечаем их так же, как прежний код помечал их при чтении,
-- и заодно снимаем возможные дубли перед созданием уникальных индексов ниже.
UPDATE jobs SET status = 'error', error = 'Сервер был перезапущен'
WHERE status IN ('queued', 'running');

ALTER TABLE jobs ADD COLUMN kind text NOT NULL DEFAULT 'generate'
  CHECK (kind IN ('generate', 'refine'));
ALTER TABLE jobs ADD COLUMN priority int NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN target_simulation_id uuid;      -- для refine
ALTER TABLE jobs ADD COLUMN image_data_url text;            -- вход генерации; стирается по завершении
ALTER TABLE jobs ADD COLUMN locked_by text;
ALTER TABLE jobs ADD COLUMN locked_until timestamptz;
ALTER TABLE jobs ADD COLUMN attempts int NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN cancel_requested_at timestamptz;
ALTER TABLE jobs ADD COLUMN started_at timestamptz;
ALTER TABLE jobs ADD COLUMN finished_at timestamptz;

CREATE INDEX jobs_queue ON jobs (priority DESC, created_at) WHERE status = 'queued';
CREATE INDEX jobs_leases ON jobs (locked_until) WHERE status = 'running';

-- Одна активная генерация и одна активная доработка на человека — правилом базы,
-- а не резервацией в памяти.
CREATE UNIQUE INDEX jobs_one_active_generate ON jobs (owner_id)
  WHERE kind = 'generate' AND status IN ('queued', 'running');
CREATE UNIQUE INDEX jobs_one_active_refine ON jobs (owner_id)
  WHERE kind = 'refine' AND status IN ('queued', 'running');

-- Журнал событий. jobs.events остаётся для старых записей и больше не пишется.
CREATE TABLE job_events (
  job_id uuid  NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seq    int   NOT NULL,
  event  jsonb NOT NULL,
  at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, seq)
);

CREATE TABLE workers (
  id         text PRIMARY KEY,           -- host:pid:случайный суффикс
  host       text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  seen_at    timestamptz NOT NULL DEFAULT now(),
  running    int NOT NULL DEFAULT 0
);

CREATE TABLE login_attempts (
  key text NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_key_at ON login_attempts (key, at);
