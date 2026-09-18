-- Вход админа платформы «от имени» другого человека: сессия помнит, кто в неё вошёл.
-- Такая сессия считается действующей, только пока автор остаётся админом платформы.
ALTER TABLE sessions ADD COLUMN impersonator_id uuid REFERENCES users(id) ON DELETE CASCADE;
