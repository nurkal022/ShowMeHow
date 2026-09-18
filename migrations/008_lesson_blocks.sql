-- Новые форматы блоков урока и загруженные учителем картинки.
ALTER TABLE blocks DROP CONSTRAINT blocks_kind_check;
ALTER TABLE blocks ADD CONSTRAINT blocks_kind_check CHECK (kind IN (
  'text', 'simulation', 'lab', 'assignment',
  'callout', 'formula', 'image', 'video', 'spoiler', 'code', 'divider'));

-- Картинки уроков лежат в базе: отдельного файлового хранилища у платформы нет,
-- а бэкап базы так забирает и их. Размер ограничен в src/lib/lms/assets.ts.
CREATE TABLE lms_assets (
  id         uuid PRIMARY KEY,
  owner_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  mime       text NOT NULL,
  bytes      bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
