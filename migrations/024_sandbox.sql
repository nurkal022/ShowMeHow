-- Личный демо-университет: создаётся при регистрации, чтобы новичок сразу видел
-- кабинеты руководства, преподавателя и студента на живых данных. Владелец может
-- смотреть глазами участников своей песочницы (сессия «от имени» с impersonator_id).
ALTER TABLE organizations ADD COLUMN sandbox_owner uuid REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX organizations_sandbox_owner ON organizations (sandbox_owner) WHERE sandbox_owner IS NOT NULL;
