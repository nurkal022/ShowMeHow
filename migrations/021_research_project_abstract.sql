-- Графический абстракт живёт у проекта, а не у статьи: он про рисунки и нужен
-- и без статьи — для постера, гранта, страницы проекта.
ALTER TABLE research_projects ADD COLUMN graphical jsonb;
