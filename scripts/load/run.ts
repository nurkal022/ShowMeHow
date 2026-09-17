import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { SESSION_COOKIE } from '../../src/lib/auth/session-cookie';
import { REQUEUE_WARNING } from '../../src/lib/jobs/store';
import type { PipelineEvent } from '../../src/lib/types';
import { isNonIncreasing, reportSection, summarize, type Summary } from './stats';

/**
 * Нагрузочный прогон по разделу 10 спецификации. Запуск:
 *   npm run load -- --base <адрес> --scenario pages|logins|generations|kill-worker|restart-web
 * Код выхода 1 — цель сценария не достигнута.
 */

interface Args {
  base: string; scenario: string; users: number; sessions: number; rounds: number;
  generations: number; ip: string;
  out?: string; killCmd?: string; restartCmd?: string;
}

interface LoadUser { email: string; cookie: string; simId: string }

type Result = [title: string, rows: [string, string][], passed: boolean];

const PASSWORD = 'load-test-pass-123';
const PAGE_P95_TARGET_MS = 500;
const LOGINS_TOTAL = 300;
const LOGINS_WINDOW_MS = 60_000;

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const base = get('base');
  const scenario = get('scenario');
  if (!base || !scenario) {
    throw new Error('Нужны --base <адрес> и --scenario pages|logins|generations|kill-worker|restart-web.');
  }
  return {
    base: base.replace(/\/$/, ''),
    scenario,
    users: Number(get('users') ?? 30),
    sessions: Number(get('sessions') ?? 300),
    rounds: Number(get('rounds') ?? 3),
    generations: Number(get('generations') ?? 20),
    // «Один IP»: веб за прокси (SHOWMEHOW_TRUST_PROXY=1) берёт адрес из этого заголовка.
    ip: get('ip') ?? '198.51.100.7',
    out: get('out'),
    killCmd: get('kill-cmd'),
    restartCmd: get('restart-cmd'),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ms = (v: number) => `${Math.round(v)} мс`;

function sessionCookie(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) throw new Error(`Сервер не выдал cookie сессии (код ${res.status}).`);
  return raw.split(';')[0];
}

function jsonHeaders(a: Args, cookie?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Forwarded-For': a.ip };
  if (cookie) h.cookie = cookie;
  return h;
}

function login(a: Args, identifier: string, password: string): Promise<Response> {
  return fetch(`${a.base}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(a), body: JSON.stringify({ identifier, password }),
  });
}

async function signIn(a: Args, email: string): Promise<string> {
  const reg = await fetch(`${a.base}/api/auth/register`, {
    method: 'POST', headers: jsonHeaders(a), body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (reg.ok) return sessionCookie(reg);
  await reg.arrayBuffer();
  const res = await login(a, email, PASSWORD);
  if (!res.ok) throw new Error(`Не удалось войти как ${email}: ${res.status}`);
  return sessionCookie(res);
}

async function inPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** Подготовка не входит в замеры: первый заход раскладывает примеры. */
async function prepareUsers(a: Args, count = a.users): Promise<LoadUser[]> {
  const emails = Array.from({ length: count }, (_, i) => `load-${i}@example.test`);
  const users: LoadUser[] = [];
  await inPool(emails, 2, async (email) => {
    const cookie = await signIn(a, email);
    const res = await fetch(`${a.base}/api/simulations`, { headers: { cookie } });
    const list = (await res.json()) as { id: string }[];
    if (!list[0]) throw new Error(`У ${email} пустая библиотека: примеры не разложились.`);
    users.push({ email, cookie, simId: list[0].id });
  });
  // Порядок как у адресов: сценарии берут первых N пользователей.
  users.sort((x, y) => emails.indexOf(x.email) - emails.indexOf(y.email));
  console.log(`Подготовлено пользователей: ${users.length}.`);
  return users;
}

/** Сессии делятся между пользователями поровну; каждая — отдельный вход со своей cookie. */
async function openSessions(a: Args, users: LoadUser[]): Promise<LoadUser[]> {
  const perUser = Math.ceil(a.sessions / users.length);
  const sessions: LoadUser[] = [];
  for (const u of users) {
    for (let i = 0; i < perUser && sessions.length < a.sessions; i++) {
      sessions.push({ ...u, cookie: sessionCookie(await login(a, u.email, PASSWORD)) });
    }
  }
  console.log(`Открыто сессий: ${sessions.length}.`);
  return sessions;
}

const PAGE_PATHS: [label: string, path: (simId: string) => string][] = [
  ['/library', () => '/library'],
  ['/api/simulations', () => '/api/simulations'],
  ['/api/simulations/[id]', (id) => `/api/simulations/${id}`],
  ['/?id=[id]', (id) => `/?id=${id}`],
];

interface PageLoad { total: Summary; byPath: Map<string, Summary> }

/** Все сессии разом открывают библиотеку и страницу симуляции. */
async function measurePages(a: Args, sessions: LoadUser[], rounds: number): Promise<PageLoad> {
  const latencies = new Map<string, number[]>(PAGE_PATHS.map(([label]) => [label, []]));
  let errors = 0;
  for (let r = 0; r < rounds; r++) {
    await Promise.all(sessions.map(async (s) => {
      for (const [label, path] of PAGE_PATHS) {
        const t0 = performance.now();
        try {
          const res = await fetch(`${a.base}${path(s.simId)}`, { headers: { cookie: s.cookie } });
          await res.arrayBuffer();
          if (!res.ok) errors++;
        } catch {
          errors++;
        }
        latencies.get(label)!.push(performance.now() - t0);
      }
    }));
  }
  return {
    total: summarize([...latencies.values()].flat(), errors),
    byPath: new Map([...latencies].map(([label, v]) => [label, summarize(v)])),
  };
}

function pathRows(load: PageLoad): [string, string][] {
  return [...load.byPath].map(([label, s]) => [`p50 / p95 ${label}`, `${ms(s.p50)} / ${ms(s.p95)}`]);
}

async function pages(a: Args): Promise<Result> {
  const sessions = await openSessions(a, await prepareUsers(a));
  const load = await measurePages(a, sessions, a.rounds);
  const s = load.total;
  return [`${sessions.length} сессий: библиотека и страница симуляции`, [
    ['раундов', String(a.rounds)],
    ['запросов', String(s.count)], ['ошибок', String(s.errors)],
    ['p50', ms(s.p50)], ['p95', ms(s.p95)], ['максимум', ms(s.max)],
    ...pathRows(load),
  ], s.p95 < PAGE_P95_TARGET_MS && s.errors === 0];
}

/**
 * 300 входов за минуту с одного адреса, каждый десятый — с неверным паролем.
 * Неверные раскладываются по разным аккаунтам: по одному на человека, как опечатки,
 * а не подбор; иначе счётчик идентификатора закрыл бы аккаунт на пятнадцать минут.
 */
async function logins(a: Args): Promise<Result> {
  const users = await prepareUsers(a);
  let correct = 0;
  let correct429 = 0;
  let correctOther = 0;
  let wrong = 0;
  let wrong401 = 0;
  const latencies: number[] = [];
  const pending: Promise<void>[] = [];
  const t0 = performance.now();
  for (let i = 0; i < LOGINS_TOTAL; i++) {
    const isWrong = i % 10 === 9;
    const u = isWrong ? users[Math.floor(i / 10) % users.length] : users[i % users.length];
    pending.push((async () => {
      const started = performance.now();
      const res = await login(a, u.email, isWrong ? 'неверный-пароль' : PASSWORD);
      await res.arrayBuffer();
      latencies.push(performance.now() - started);
      if (isWrong) {
        wrong++;
        if (res.status === 401) wrong401++;
      } else {
        correct++;
        if (res.status === 429) correct429++;
        else if (res.status !== 200) correctOther++;
      }
    })());
    await sleep(LOGINS_WINDOW_MS / LOGINS_TOTAL);
  }
  await Promise.all(pending);
  const s = summarize(latencies);
  return [`${LOGINS_TOTAL} входов за минуту с одного IP`, [
    ['длительность', `${Math.round((performance.now() - t0) / 1000)} с`],
    ['верных', String(correct)], ['с ошибкой', String(wrong)],
    ['401 на неверный пароль', String(wrong401)],
    ['429 для верных', String(correct429)], ['иные отказы верным', String(correctOther)],
    ['p95 ответа', ms(s.p95)],
  ], correct429 === 0 && correctOther === 0 && wrong401 === wrong];
}

interface Followed { status: string; events: PipelineEvent[]; positions: number[]; reconnects: number }

/** Идёт за заданием как мастерская: при обрыве переподключается и читает журнал заново. */
async function follow(
  a: Args, cookie: string, jobId: string, onEvent?: (e: PipelineEvent) => void,
): Promise<Followed> {
  const positions: number[] = [];
  let reconnects = 0;
  let longest = 0;
  for (let attempt = 0; attempt < 120; attempt++) {
    const events: PipelineEvent[] = [];
    try {
      const res = await fetch(`${a.base}/api/jobs/${jobId}/stream`, { headers: { cookie } });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop()!;
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            const e = JSON.parse(part.slice(6)) as PipelineEvent;
            // Позиции приходят только при живом соединении и в журнал не пишутся.
            if (e.type === 'queued') positions.push(e.position);
            else events.push(e);
            onEvent?.(e);
            if (e.type === 'done' || e.type === 'error' || e.type === 'cancelled') {
              if (events.length < longest) throw new Error(`Журнал ${jobId} после переподключения короче.`);
              return { status: e.type, events, positions, reconnects };
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Журнал')) throw e;
    }
    longest = Math.max(longest, events.length);
    reconnects++;
    await sleep(3000);
  }
  return { status: 'lost', events: [], positions, reconnects };
}

async function startGeneration(a: Args, u: LoadUser): Promise<string> {
  const res = await fetch(`${a.base}/api/generate`, {
    method: 'POST', headers: jsonHeaders(a, u.cookie),
    body: JSON.stringify({ prompt: 'диффузия духов в комнате', mode: 'fast' }),
  });
  if (!res.ok) throw new Error(`Генерация для ${u.email} не принята: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { jobId: string }).jobId;
}

async function generations(a: Args): Promise<Result> {
  const users = await prepareUsers(a);
  if (users.length < a.generations) {
    throw new Error(`Для ${a.generations} генераций нужно столько же пользователей (--users).`);
  }
  const sessions = await openSessions(a, users);
  const baseline = (await measurePages(a, sessions, a.rounds)).total;
  console.log(`p95 страниц без генераций: ${ms(baseline.p95)}.`);
  const runners = users.slice(0, a.generations);
  const t0 = performance.now();
  const jobs = await Promise.all(runners.map((u) => startGeneration(a, u)));
  const following = Promise.all(jobs.map((id, i) => follow(a, runners[i].cookie, id)));
  // Страницы меряем, когда воркеры уже заняты: планировщик отвечает сразу, дальше Chromium.
  await sleep(5000);
  const loaded = (await measurePages(a, sessions, a.rounds)).total;
  const followed = await following;
  const elapsed = (performance.now() - t0) / 1000;
  const done = followed.filter((f) => f.status === 'done').length;
  const honest = followed.every((f) => isNonIncreasing(f.positions));
  const maxPos = Math.max(0, ...followed.flatMap((f) => f.positions));
  const ratio = loaded.p95 / baseline.p95;
  return [`${jobs.length} генераций при двух воркерах по два слота`, [
    ['завершено', `${done} из ${jobs.length}`],
    ['итоги', Object.entries(countBy(followed.map((f) => f.status))).map(([k, v]) => `${k}: ${v}`).join(', ')],
    ['все генерации заняли', `${Math.round(elapsed)} с`],
    ['позиции только убывали', honest ? 'да' : 'нет'],
    ['наибольшая позиция', String(maxPos)],
    ['сессий', String(sessions.length)],
    ['p95 страниц без генераций', ms(baseline.p95)],
    ['p95 страниц с генерациями', ms(loaded.p95)],
    ['ошибок страниц (без / с генерациями)', `${baseline.errors} / ${loaded.errors}`],
    ['отношение p95', ratio.toFixed(2)],
  ], done === jobs.length && honest && ratio <= 2 && baseline.errors + loaded.errors === 0];
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/** Одна генерация; как только план готов (задание в работе у воркера), выполняется команда. */
async function interrupted(
  a: Args, title: string, cmd: string | undefined, flag: string,
  check: (f: Followed) => boolean,
): Promise<Result> {
  if (!cmd) throw new Error(`Для этого сценария нужен ${flag} "<команда>".`);
  const [u] = await prepareUsers(a, 1);
  const jobId = await startGeneration(a, u);
  const t0 = performance.now();
  let fired = false;
  const f = await follow(a, u.cookie, jobId, (e) => {
    if (!fired && e.type === 'plan-ready') {
      fired = true;
      console.log(`Выполняю: ${cmd}`);
      execSync(cmd, { stdio: 'inherit' });
    }
  });
  const requeued = f.events.some((e) => e.type === 'warning' && e.message === REQUEUE_WARNING);
  return [title, [
    ['задание', jobId],
    ['команда выполнена', fired ? 'да' : 'нет'],
    ['итог задания', f.status],
    ['от старта до итога', `${Math.round((performance.now() - t0) / 1000)} с`],
    ['переподключений', String(f.reconnects)],
    ['событий в журнале', String(f.events.length)],
    ['предупреждение о перезапуске', requeued ? 'да' : 'нет'],
  ], fired && f.status === 'done' && check(f)];
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const scenarios: Record<string, () => Promise<Result>> = {
    pages: () => pages(a),
    logins: () => logins(a),
    generations: () => generations(a),
    'kill-worker': () => interrupted(a, 'kill -9 воркера посреди генерации', a.killCmd, '--kill-cmd',
      (f) => f.events.some((e) => e.type === 'warning' && e.message === REQUEUE_WARNING)),
    'restart-web': () => interrupted(a, 'Рестарт веба посреди генерации', a.restartCmd, '--restart-cmd',
      (f) => f.reconnects >= 1),
  };
  const run = scenarios[a.scenario];
  if (!run) throw new Error(`Неизвестный сценарий ${a.scenario}.`);
  const [title, rows, passed] = await run();
  const section = reportSection(`${title} (${new Date().toISOString().slice(0, 16)})`, rows, passed);
  console.log(section);
  if (a.out) fs.appendFileSync(a.out, `\n${section}`);
  process.exitCode = passed ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
