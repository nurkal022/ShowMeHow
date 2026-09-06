-- Имя для отображения и пользовательские настройки.
-- Настройки лежат одним jsonb: их набор меняется вместе с интерфейсом,
-- и колонка на каждую галочку означала бы миграцию на каждую мелочь.
ALTER TABLE users ADD COLUMN display_name text;
ALTER TABLE users ADD COLUMN prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
