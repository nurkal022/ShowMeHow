-- Живой график в ответе наставника: формулы и параметры-ползунки (см. src/lib/lms/tutor-plot.ts).
ALTER TABLE tutor_messages ADD COLUMN plot jsonb;
