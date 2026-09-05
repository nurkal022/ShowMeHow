CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE simulations (
  id         uuid PRIMARY KEY,
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  prompt     text NOT NULL,
  subject    text NOT NULL,
  tags       text[] NOT NULL DEFAULT '{}',
  warning    text,
  demo       text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX simulations_owner_updated ON simulations (owner_id, updated_at DESC);
CREATE UNIQUE INDEX simulations_owner_demo ON simulations (owner_id, demo) WHERE demo IS NOT NULL;

CREATE TABLE jobs (
  id            uuid PRIMARY KEY,
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL,
  request       jsonb NOT NULL,
  events        jsonb NOT NULL DEFAULT '[]',
  simulation_id uuid,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_owner_status ON jobs (owner_id, status);
