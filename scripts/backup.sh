#!/usr/bin/env bash
# Ежесуточный бэкап Tesseract: дамп базы и копия data/ с жёсткими ссылками.
# Трогает только свои записи — с датой в имени, не символические ссылки. При любой
# ошибке выходит с ненулевым кодом — systemd помечает запуск сбоем.
set -Eeuo pipefail
shopt -s nullglob

ROOT="${TESERACT_ROOT:-/home/user/teseract}"
DEST="${TESERACT_BACKUP_DIR:-$HOME/teseract-backups}"
CONTAINER="${TESERACT_PG_CONTAINER:-teseract-pg}"
DB_USER="${TESERACT_PG_USER:-teseract}"
DB_NAME="${TESERACT_PG_DB:-teseract}"
KEEP_DAYS="${TESERACT_BACKUP_KEEP_DAYS:-14}"
STAMP="${TESERACT_BACKUP_STAMP:-$(date +%F)}"

DATE_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'

log() { echo "[backup $(date '+%F %T')] $*"; }
fail() { log "ОШИБКА: $*"; exit 1; }
trap 'fail "команда в строке $LINENO завершилась с кодом $?"' ERR

# Имя копии становится путём, который потом удаляется: пустая или чужая метка
# указала бы на весь каталог бэкапов или за его пределы.
[[ "$STAMP" =~ $DATE_RE ]] || fail "метка даты «${STAMP}» не в формате ГГГГ-ММ-ДД"
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && (( 10#$KEEP_DAYS >= 1 )) \
  || fail "срок хранения «${KEEP_DAYS}» должен быть целым числом дней не меньше 1"
KEEP_DAYS=$(( 10#$KEEP_DAYS ))

[ -d "$ROOT/data" ] || fail "нет каталога $ROOT/data"
mkdir -p "$DEST/db" "$DEST/data"

# Два запуска сразу (таймер и ручной) испортили бы друг другу .part-файлы.
command -v flock > /dev/null || fail "нет утилиты flock"
exec 9>>"$DEST/.lock"
flock -n 9 || fail "другой запуск бэкапа ещё не закончился"

# Недописанное прошлыми запусками. Под блокировкой чужих запусков нет, значит всё это — мусор.
for f in "$DEST"/db/*.sql.gz.part; do
  name="${f##*/}"
  [[ ! -L "$f" && -f "$f" && "${name%.sql.gz.part}" =~ $DATE_RE ]] || continue
  rm -f -- "$f"
  log "удалён недописанный дамп $name"
done
for d in "$DEST"/data/*.part; do
  name="${d##*/}"
  [[ ! -L "$d" && -d "$d" && "${name%.part}" =~ $DATE_RE ]] || continue
  rm -rf -- "$d"
  log "удалена недописанная копия $name"
done

# 1. База. Пишем во временный файл: оборванный дамп не должен выглядеть готовым.
dump="$DEST/db/$STAMP.sql.gz"
# Прежний недописанный файл убираем до записи: если это ссылка, rm удаляет саму ссылку,
# а запись через неё ушла бы за пределы бэкапов.
rm -f -- "$dump.part"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" --no-owner "$DB_NAME" | gzip > "$dump.part"
gzip -t < "$dump.part"
mv "$dump.part" "$dump"
log "дамп базы: $dump ($(du -h "$dump" | cut -f1))"

# 2. Файлы. Неизменённые файлы становятся жёсткими ссылками на предыдущую копию —
# последнюю по дате настоящую копию (не ссылку и не .part).
target="$DEST/data/$STAMP"
prev=""
for d in "$DEST"/data/*; do
  name="${d##*/}"
  [[ ! -L "$d" && -d "$d" && "$name" =~ $DATE_RE && "$name" != "$STAMP" ]] || continue
  prev="$d"
done
# То же для каталога: rsync --delete через ссылку стёр бы чужие файлы. Путь без
# завершающего «/», поэтому rm удаляет ссылку, а не содержимое её цели.
rm -rf -- "$target.part"
rsync_args=(-a --delete)
[ -n "$prev" ] && rsync_args+=(--link-dest="$prev")
# Воркер пишет в data/ в любое время: исчезнувший во время копирования файл (код 24) —
# обычное дело, а не сбой.
rsync_rc=0
rsync "${rsync_args[@]}" "$ROOT/data/" "$target.part/" || rsync_rc=$?
if [ "$rsync_rc" -eq 24 ]; then
  log "предупреждение: часть файлов исчезла во время копирования"
elif [ "$rsync_rc" -ne 0 ]; then
  fail "rsync завершился с кодом $rsync_rc"
fi
rm -rf -- "$target"
mv "$target.part" "$target"
log "копия data/: $target${prev:+ (ссылки на $prev)}"

# 3. Ротация по дате в имени: время изменения каталога rsync берёт из источника.
cutoff="$(date -d "$KEEP_DAYS days ago" +%F 2>/dev/null || date -v-"$KEEP_DAYS"d +%F)"
for f in "$DEST"/db/*.sql.gz; do
  name="${f##*/}"
  day="${name%.sql.gz}"
  [[ ! -L "$f" && -f "$f" && "$day" =~ $DATE_RE ]] || continue
  if [[ "$day" < "$cutoff" ]]; then rm -f -- "$f"; log "удалён старый дамп $day"; fi
done
for d in "$DEST"/data/*; do
  name="${d##*/}"
  [[ ! -L "$d" && -d "$d" && "$name" =~ $DATE_RE ]] || continue
  if [[ "$name" < "$cutoff" ]]; then rm -rf -- "$d"; log "удалена старая копия $name"; fi
done

log "готово"
