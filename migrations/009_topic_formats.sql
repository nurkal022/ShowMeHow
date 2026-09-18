-- Формат темы: обычный урок, слайды для проектора или контрольная с таймером.
ALTER TABLE topics ADD COLUMN format text NOT NULL DEFAULT 'lesson' CHECK (format IN ('lesson', 'slides', 'exam'));
ALTER TABLE topics ADD COLUMN time_limit_min int CHECK (time_limit_min IS NULL OR time_limit_min BETWEEN 1 AND 300);
