# Tesseract: службы и выкладка

Машина общая. Трогаем только своё: `/home/user/teseract`, `/home/user/showmehow`
(прежняя версия, откат), службы `showmehow` и `teseract-*`, контейнер `teseract-pg`
и блок сайта Tesseract в Caddy. Ничего за пределами этих каталогов, служб и
контейнера не трогаем. **`git reset --hard` на сервере не выполнять никогда.**

## Процессы

| Служба | Что | Порт |
|---|---|---|
| `showmehow` | веб (`npm start`), имя историческое | `127.0.0.1:3100` |
| `teseract-worker` | воркер очереди генераций | — |
| `teseract-backup.timer` | бэкап в 03:00 | — |
| `teseract-pg` (Docker) | Postgres 16 | `127.0.0.1:5435` |
| Caddy | HTTPS для `<домен>` → `127.0.0.1:3100` | 443 |

## Переменные

Все лежат в `/home/user/teseract/.env.local` (вне git), обе службы читают их через
`EnvironmentFile`.

| Переменная | Кто читает | Значение на боевом |
|---|---|---|
| `DATABASE_URL` | веб, воркер, миграции | `postgres://teseract:…@127.0.0.1:5435/teseract` |
| `SHOWMEHOW_ADMIN_EMAIL` | веб | почта администратора |
| `SHOWMEHOW_TRUST_PROXY` | веб | `1` — только когда перед вебом Caddy |
| `SHOWMEHOW_EMBEDDED_WORKER` | веб | не задавать (в продакшне выключен) |
| `WORKER_CONCURRENCY` | воркер | `2` |
| `WORKER_DRAIN_SECONDS` | воркер | `600` |

`SHOWMEHOW_TRUST_PROXY=1` включать только тогда, когда перед вебом уже стоит Caddy,
который слушает 443, а сам веб слушает только `127.0.0.1` и снаружи напрямую недоступен. Без Caddy заголовку
`x-forwarded-for` верить нельзя (его подделает кто угодно), поэтому `clientIp()`
без этой переменной возвращает `null` и **счётчик неудачных входов по IP не
ведётся** — работает только счётчик по идентификатору аккаунта. Включать
`SHOWMEHOW_TRUST_PROXY=1` раньше, чем Caddy встанет перед вебом, нельзя: тогда
клиент сам подставит любой `x-forwarded-for` и обойдёт лимит.

Ключ провайдера лежит в `/home/user/teseract/data/settings.json`.

## Юнит воркера

Текст юнита — `ops/systemd/teseract-worker.service`. `ExecStart` там с `/usr/bin/node`; при установке путь заменяется на настоящий (см. «Установка»).

## Веб за Caddy

Дополнение к `showmehow` ставится в `/etc/systemd/system/showmehow.service.d/override.conf`: веб слушает только `127.0.0.1`, `x-forwarded-for` доверяется, `TimeoutStopSec=20`.

По SIGTERM веб закрывает открытые потоки прогресса (мастерская переподключается сама),
и `systemctl restart showmehow` занимает секунды. Без этого `next start` ждал бы, пока
закроется каждая открытая мастерская, — до 90 секунд по умолчанию systemd. Если
что-то всё же держит соединение, через 20 секунд systemd пошлёт SIGKILL; это безопасно:
генерацию ведёт воркер.
Текст — `ops/systemd/showmehow-override.conf`; `ExecStart` там с `/usr/bin/npm`, при установке заменяется на путь из `systemctl cat showmehow`.

Блок сайта добавляется в конфигурацию Caddy, остальные сайты не трогаются. Текст — `ops/caddy/teseract.caddy`, домен в нём — `TESERACT_DOMAIN`, при установке заменяется на настоящий. **Домен для сайта должен дать владелец** — в репозитории его нет и быть не должно.

`flush_interval -1` отключает буферизацию — без него SSE прогресса приходит пачками.
Cookie получает `Secure` сама: `isSecureRequest` смотрит на `x-forwarded-proto`.

## Бэкап

Юниты — `ops/systemd/teseract-backup.service` и `ops/systemd/teseract-backup.timer`.

Копии: `~/teseract-backups/db/<дата>.sql.gz` и `~/teseract-backups/data/<дата>/`,
хранятся 14 дней. Скрипт удаляет только записи с датой в имени (не символические
ссылки), убирает недописанные `.part` прошлых запусков и не запускается, пока идёт
предыдущий запуск (`flock` на `~/teseract-backups/.lock`). Журнал: `journalctl -u teseract-backup`. Копии лежат на том же
диске, что и боевые данные, — при отказе диска они пропадут вместе. **Внешнюю
(off-site) площадку для копирования бэкапов должен дать владелец**; пока её нет,
это открытая слабость (см. `docs/ops/restore.md` и журнал проверок там же).

## Установка

Выполняется один раз, только с подтверждения владельца (задача 16 плана цикла 1).

```bash
cd /home/user/teseract
NODE=$(which node); NPM=$(which npm)        # под пользователем user
sed "s#/usr/bin/node#$NODE#" ops/systemd/teseract-worker.service \
  | sudo tee /etc/systemd/system/teseract-worker.service > /dev/null
sudo cp ops/systemd/teseract-backup.service ops/systemd/teseract-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teseract-worker teseract-backup.timer

# только когда есть домен (даёт владелец) и Caddy проксирует его:
sed "s#TESERACT_DOMAIN#<домен>#" ops/caddy/teseract.caddy     # дописать в конфигурацию Caddy
sudo caddy validate --config <Caddyfile> --adapter caddyfile && sudo systemctl reload caddy
sudo mkdir -p /etc/systemd/system/showmehow.service.d
sed "s#/usr/bin/npm#$NPM#" ops/systemd/showmehow-override.conf \
  | sudo tee /etc/systemd/system/showmehow.service.d/override.conf > /dev/null
sudo systemctl daemon-reload && sudo systemctl restart showmehow
```

## Выкладка

```bash
cd /home/user/teseract
git fetch origin <ветка>
git merge --ff-only origin/<ветка>        # остановится, если на сервере свои коммиты
npm ci                                     # только если менялся package-lock.json
set -a; . ./.env.local; set +a
npm run migrate                            # миграции совместимы с работающим кодом
npm run build
sudo systemctl restart showmehow
sudo systemctl restart teseract-worker     # ждёт текущие генерации до 10 минут
curl -s http://127.0.0.1:3100/api/health
```

На сервере никогда не выполнять `git reset --hard` — только `git fetch` и
`git merge --ff-only`; если сервер разошёлся с веткой, останавливаемся и
разбираемся руками, а не отбрасываем историю.

Рестарт веба генерации не прерывает: их ведёт воркер, мастерская переподключается
сама.

**Рестарт воркера останавливает очередь для всех.** `systemctl restart teseract-worker`
ждёт текущие генерации до 10 минут. Всё это время старый воркер новых заданий не берёт,
а новый ещё не запущен: очередь стоит, у каждого в мастерской «В очереди». Недоделанные
за 10 минут задания подберёт уборщик после старта. Поэтому воркер выкладывают в тихий
час — или сначала запускают второй воркер (два воркера безопасны), а потом
останавливают старый.

**Миграция 005** помечает ошибкой задания, которые вёл в памяти старый код. Выкладывать
её лучше, когда `SELECT count(*) FROM jobs WHERE status IN ('queued','running')` даёт 0.
Генерация, которую старый веб начал уже после миграции (пока идёт `npm run build`),
останется `running` без аренды; уборщик вернёт её в очередь через 15 минут после
начала, а до тех пор у этого человека будет «У вас уже идёт генерация».

## Проверка

- `curl -s https://<домен>/api/health` — `200`, `workersAlive` ≥ 1;
- `systemctl status teseract-worker` — `active (running)`;
- `journalctl -u teseract-worker -n 50` — «Воркер … запущен», «…взял задание…»;
- `systemctl list-timers teseract-backup.timer` — следующий запуск в 03:00;
- `curl -N` через Caddy на поток идущего задания (с cookie сессии):
  `curl -N -b 'showmehow_session=…' https://<домен>/api/jobs/<id>/stream` — события
  приходят по одному по мере генерации, а не пачкой в конце (`encode gzip` и
  буферизация не мешают);
- с открытой мастерской, где идёт генерация, засечь `time sudo systemctl restart showmehow`
  — должно уложиться в несколько секунд и никогда не дольше 20; мастерская после этого
  продолжает показывать прогресс.
