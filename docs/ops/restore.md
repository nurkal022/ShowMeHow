# Tesseract: восстановление из бэкапа

Процедура поднимает копию рядом с боевой и ничего боевого не трогает: отдельный
контейнер, отдельный порт, отдельный каталог данных.

## Шаги

```bash
DATE=2026-09-18                                   # дата копии
WORK=$HOME/teseract-restore-check

# 1. Чистый Postgres на свободном локальном порту.
docker run -d --name teseract-restore-pg -e POSTGRES_USER=teseract \
  -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=teseract \
  -p 127.0.0.1:5437:5432 postgres:16-alpine
until docker exec teseract-restore-pg pg_isready -U teseract; do sleep 1; done

# 2. Дамп.
gunzip -c ~/teseract-backups/db/$DATE.sql.gz | docker exec -i teseract-restore-pg psql -U teseract -d teseract -v ON_ERROR_STOP=1

# 3. Данные — копией, а не ссылками: проверка не должна менять бэкап.
mkdir -p $WORK && cp -a ~/teseract-backups/data/$DATE $WORK/data

# 4. Приложение на копии.
cd /home/user/teseract
export DATABASE_URL=postgres://teseract:restore@127.0.0.1:5437/teseract
export SHOWMEHOW_DATA_DIR=$WORK/data
npm run migrate                                   # «Новых миграций нет»
npx next start -H 127.0.0.1 -p 3199 &

# 5. Вход: временный пароль администратору в копии базы (адрес ниже — пример,
# подставить реальный логин администратора в копии).
npm run org -- reset-password --user admin@example.com
```

Дальше через ssh-туннель (`ssh -L 3199:127.0.0.1:3199 user@<сервер>`) открыть
`http://localhost:3199`, войти с временным паролем, сменить его, открыть библиотеку и любую
симуляцию, убедиться, что превью и сама симуляция показываются.

## Уборка

```bash
kill %1
docker rm -f teseract-restore-pg
rm -rf $WORK
```

## Внешняя копия

Бэкапы `~/teseract-backups` живут на том же диске, что и боевые данные — при
отказе диска пропадут вместе с ними. Off-site площадку (второй сервер, объектное
хранилище — что угодно, куда можно синхронизировать `~/teseract-backups` за
пределы этой машины) должен дать владелец; до тех пор эта процедура проверяет
только целостность локальной копии, а не защиту от отказа диска.

## Журнал проверок

| Дата | Копия | Размер дампа | Время восстановления | Результат | Кто |
|---|---|---|---|---|---|
