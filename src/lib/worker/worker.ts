import os from 'node:os';
import crypto from 'node:crypto';
import type { PipelineEvent } from '../types';
import type { ClaimedJob, JobOutcome, JobStore } from '../jobs/store';

export interface JobIO {
  emit(event: PipelineEvent): void;
  cancelled(): boolean;
  markSaved(simulationId: string): Promise<void>;
}

export type Execute = (job: ClaimedJob, io: JobIO) => Promise<JobOutcome>;

export interface WorkerOptions {
  store: JobStore;
  execute: Execute;
  concurrency: number;
  drainMs: number;
  id?: string;
  host?: string;
  pollMs?: number;
  heartbeatMs?: number;
  reapMs?: number;
  onReap?: () => Promise<void>;
  log?: (msg: string, err?: unknown) => void;
}

export interface Worker {
  readonly id: string;
  start(): void;
  fill(): Promise<void>;
  heartbeat(): Promise<void>;
  reap(): Promise<void>;
  stop(): Promise<{ drained: boolean }>;
  running(): number;
  /** Для тестов: ждёт, пока доделаются все задания, взятые на этот момент и позже. */
  idle(): Promise<void>;
}

interface Slot {
  jobId: string;
  cancel: boolean;
  /**
   * Аренду забрал уборщик или задание взято заново: эта попытка ничего не пишет —
   * ни событий, ни сохранения, ни итога — и только доигрывает до ближайшей проверки отмены.
   */
  lost: boolean;
  done: Promise<void>;
}

export const SAVE_FAILED_MESSAGE = 'Не удалось записать результат генерации.';
const STALE_ATTEMPT_MESSAGE = 'Попытка устарела: задание выполняется заново.';

export function makeWorkerId(host: string = os.hostname()): string {
  return `${host}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;
}

function defaultLog(msg: string, err?: unknown): void {
  if (err === undefined) console.log(msg);
  else console.error(msg, err);
}

export function createWorker(opts: WorkerOptions): Worker {
  const host = opts.host ?? os.hostname();
  const id = opts.id ?? makeWorkerId(host);
  const customLog = opts.log ?? defaultLog;
  /** Все идущие попытки, включая устаревшие: они занимают слоты и их ждёт stop. */
  const attempts = new Set<Slot>();
  /** Живая попытка по каждому заданию — только её аренду продлевает сердцебиение. */
  const current = new Map<string, Slot>();
  let started = false;
  let stopping = false;
  let filling: Promise<void> | null = null;
  let fillAgain = false;
  let pollTimer: NodeJS.Timeout | undefined;
  let reapTimer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let unsubscribeQueue: (() => void) | null = null;
  let beating: Promise<void> | null = null;

  // Сломанный журнал не должен ронять цикл и оставлять необработанные отказы.
  function log(msg: string, err?: unknown): void {
    try {
      customLog(msg, err);
    } catch {
      // писать больше некуда
    }
  }

  function markLost(slot: Slot): void {
    slot.lost = true;
    if (current.get(slot.jobId) === slot) current.delete(slot.jobId);
  }

  async function runSlot(job: ClaimedJob, slot: Slot): Promise<void> {
    // Записи событий идут цепочкой: emit синхронный, а порядок seq обязан совпасть
    // с порядком вызовов.
    let chain: Promise<unknown> = Promise.resolve();
    const io: JobIO = {
      emit(event) {
        // done пишет только finish — в одной транзакции со статусом.
        if (event.type === 'done' || slot.lost) return;
        chain = chain
          .then(() => (slot.lost ? null : opts.store.appendEvent(job.id, event, id)))
          .catch((e) => log(`Не удалось записать событие задания ${job.id}:`, e));
      },
      cancelled: () => slot.cancel || slot.lost,
      async markSaved(simulationId) {
        if (slot.lost) {
          log(`Задание ${job.id}: устаревшая попытка сохранила симуляцию ${simulationId}, в задание она не записана.`);
          throw new Error(STALE_ATTEMPT_MESSAGE);
        }
        try {
          await opts.store.markSaved(job.id, id, simulationId);
        } catch (e) {
          // Симуляция уже в хранилище, но задание о ней не знает: попытка кончится ошибкой.
          log(`Не удалось записать сохранённую симуляцию ${simulationId} в задание ${job.id}:`, e);
          throw new Error(SAVE_FAILED_MESSAGE);
        }
      },
    };
    let outcome: JobOutcome;
    try {
      outcome = await opts.execute(job, io);
    } catch (e) {
      outcome = { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    await chain;
    if (slot.lost) {
      log(`Задание ${job.id}: попытка устарела, её результат не записан.`);
      return;
    }
    if (outcome.status === 'error') log(`Задание ${job.id} завершилось ошибкой: ${outcome.message}`);
    try {
      const ok = await opts.store.finish(job.id, id, outcome);
      if (!ok) log(`Задание ${job.id} уже не принадлежит воркеру ${id}.`);
    } catch (e) {
      // Слот освобождается, и сердцебиение перестаёт продлевать аренду: уборщик вернёт
      // задание, а повтор увидит simulation_id, если симуляция успела сохраниться.
      log(`Не удалось завершить задание ${job.id}:`, e);
    }
  }

  async function fillOnce(): Promise<void> {
    while (!stopping && attempts.size < opts.concurrency) {
      let job: ClaimedJob | null;
      try {
        job = await opts.store.claim(id);
      } catch (e) {
        log('Не удалось взять задание из очереди:', e);
        return;
      }
      if (!job) return;
      const claimed = job;
      // Уборщик вернул в очередь задание, которое ещё крутится здесь, и мы же взяли его
      // снова: прежняя попытка устарела и писать ничего не должна.
      const stale = current.get(claimed.id);
      if (stale) markLost(stale);
      const slot: Slot = {
        jobId: claimed.id, cancel: claimed.cancelRequested, lost: false, done: Promise.resolve(),
      };
      attempts.add(slot);
      current.set(claimed.id, slot);
      log(`Воркер ${id} взял задание ${claimed.id} (${claimed.kind}, попытка ${claimed.attempts}).`);
      slot.done = runSlot(claimed, slot)
        .catch((e) => log(`Попытка задания ${claimed.id} упала:`, e))
        .finally(() => {
          attempts.delete(slot);
          if (current.get(claimed.id) === slot) current.delete(claimed.id);
          void fill();
        });
    }
  }

  function fill(): Promise<void> {
    if (filling) {
      fillAgain = true;
      return filling;
    }
    filling = (async () => {
      do {
        fillAgain = false;
        await fillOnce();
      } while (fillAgain && !stopping);
    })().finally(() => { filling = null; });
    return filling;
  }

  function heartbeat(): Promise<void> {
    // Сердцебиения не накладываются: медленная база не должна копить запросы.
    beating ??= beat().finally(() => { beating = null; });
    return beating;
  }

  async function beat(): Promise<void> {
    // Снимок попыток до запроса. После ответа трогаем только эти объекты: задание могли
    // за это время вернуть в очередь и взять заново, новая попытка в снимок не попала.
    const live = [...current.values()].filter((s) => !s.lost);
    try {
      const { leased, cancelRequested } = await opts.store.heartbeat(
        id, host, attempts.size, live.map((s) => s.jobId));
      const leasedSet = new Set(leased);
      const cancelSet = new Set(cancelRequested);
      for (const slot of live) {
        if (cancelSet.has(slot.jobId)) slot.cancel = true;
        if (!leasedSet.has(slot.jobId)) markLost(slot);
      }
    } catch (e) {
      log('Сердцебиение воркера не прошло:', e);
    }
  }

  async function reap(): Promise<void> {
    try {
      const reaped = await opts.store.reap();
      for (const r of reaped) log(`Уборщик: задание ${r.id} — ${r.decision}.`);
      if (reaped.some((r) => r.decision === 'requeue')) void fill();
      await opts.onReap?.();
    } catch (e) {
      log('Уборщик не отработал:', e);
    }
  }

  function drainAll(): Promise<void> {
    return (async () => {
      while (attempts.size > 0) await Promise.all([...attempts].map((s) => s.done));
    })();
  }

  return {
    id,
    start() {
      if (started || stopping) return;
      started = true;
      unsubscribeQueue = opts.store.subscribeQueue(() => { void fill(); });
      // Таймеры держат процесс воркера живым, пока он не остановлен; stop их снимает.
      pollTimer = setInterval(() => { void fill(); }, opts.pollMs ?? 5000);
      heartbeatTimer = setInterval(() => { void heartbeat(); }, opts.heartbeatMs ?? 15000);
      reapTimer = setInterval(() => { void reap(); }, opts.reapMs ?? 30000);
      void heartbeat();
      void fill();
    },
    fill,
    heartbeat,
    reap,
    async stop() {
      stopping = true;
      unsubscribeQueue?.();
      unsubscribeQueue = null;
      clearInterval(pollTimer);
      clearInterval(reapTimer);
      // Сердцебиение продолжается весь срок ожидания: иначе аренды истекут,
      // и другой воркер начнёт те же задания заново.
      let timer: NodeJS.Timeout | undefined;
      const drained = await Promise.race([
        drainAll().then(() => true),
        new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), opts.drainMs); }),
      ]);
      clearTimeout(timer);
      clearInterval(heartbeatTimer);
      if (!drained) {
        // Дальше закрывается браузер, и недоделанные пайплайны упадут с его ошибкой.
        // Потерянные попытки ничего не пишут: задания остаются running, и уборщик
        // вернёт их в очередь, когда истечёт аренда.
        for (const slot of attempts) markLost(slot);
      }
      // Запоздалое сердцебиение после снятия записи вернуло бы воркер в число живых.
      await beating;
      await opts.store.retireWorker(id).catch((e) => log('Не удалось снять запись воркера:', e));
      return { drained };
    },
    running: () => attempts.size,
    async idle() {
      while (attempts.size > 0 || filling) {
        await drainAll();
        await filling;
      }
    },
  };
}
