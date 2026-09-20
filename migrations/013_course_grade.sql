-- Для какого класса курс: «8 класс», «колледж». Помощник пишет уроки под этот уровень.
ALTER TABLE courses ADD COLUMN grade text NOT NULL DEFAULT '';
