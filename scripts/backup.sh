#!/usr/bin/env bash
# Ежесуточный бэкап Tesseract: дамп базы и копия data/ с жёсткими ссылками.
# Трогает только свои каталоги. При любой ошибке выходит с ненулевым кодом —
# systemd помечает запуск сбоем.
set -Eeuo pipefail

ROOT="${TESERACT_ROOT:-/home/user/teseract}"
DEST="${TESERACT_BACKUP_DIR:-$HOME/teseract-backups}"
CONTAINER="${TESERACT_PG_CONTAINER:-teseract-pg}"
DB_USER="${TESERACT_PG_USER:-teseract}"
DB_NAME="${TESERACT_PG_DB:-teseract}"
KEEP_DAYS="${TESERACT_BACKUP_KEEP_DAYS:-14}"
STAMP="${TESERACT_BACKUP_STAMP:-$(date +%F)}"

log() { echo "[backup $(date '+%F %T')] $*"; }
fail() { log "ОШИБКА: $*"; exit 1; }
trap 'fail "команда в строке $LINENO завершилась с кодом $?"' ERR

[ -d "$ROOT/data" ] || fail "нет каталога $ROOT/data"
mkdir -p "$DEST/db" "$DEST/data"

# 1. База. Пишем во временный файл: оборванный дамп не должен выглядеть готовым.
dump="$DEST/db/$STAMP.sql.gz"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" --no-owner "$DB_NAME" | gzip > "$dump.part"
gzip -t < "$dump.part"
mv "$dump.part" "$dump"
log "дамп базы: $dump ($(du -h "$dump" | cut -f1))"

# 2. Файлы. Неизменённые файлы становятся жёсткими ссылками на предыдущую копию.
target="$DEST/data/$STAMP"
prev="$(find "$DEST/data" -mindepth 1 -maxdepth 1 -type d ! -name "$STAMP" ! -name '*.part' | sort | tail -n 1)"
rm -rf "$target.part"
if [ -n "$prev" ]; then
  rsync -a --delete --link-dest="$prev" "$ROOT/data/" "$target.part/"
else
  rsync -a --delete "$ROOT/data/" "$target.part/"
fi
rm -rf "$target"
mv "$target.part" "$target"
log "копия data/: $target${prev:+ (ссылки на $prev)}"

# 3. Ротация по дате в имени: время изменения каталога rsync берёт из источника.
cutoff="$(date -d "$KEEP_DAYS days ago" +%F 2>/dev/null || date -v-"$KEEP_DAYS"d +%F)"
for f in "$DEST"/db/*.sql.gz; do
  [ -e "$f" ] || continue
  name="$(basename "$f" .sql.gz)"
  if [[ "$name" < "$cutoff" ]]; then rm -f "$f"; log "удалён старый дамп $name"; fi
done
for d in "$DEST"/data/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  if [[ "$name" < "$cutoff" ]]; then rm -rf "$d"; log "удалена старая копия $name"; fi
done

log "готово"
