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
  cancel: boolean;
  /** Аренду забрал уборщик: результат этой попытки никуда не пишется. */
  lost: boolean;
  done: Promise<void>;
}

export const SAVE_FAILED_MESSAGE = 'Не удалось записать результат генерации.';

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
  const log = opts.log ?? defaultLog;
  const slots = new Map<string, Slot>();
  let stopping = false;
  let filling: Promise<void> | null = null;
  let fillAgain = false;
  let pollTimer: NodeJS.Timeout | undefined;
  let reapTimer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let unsubscribeQueue: (() => void) | null = null;
  let beating: Promise<void> | null = null;

  async function runSlot(job: ClaimedJob, slot: Slot): Promise<void> {
    // Записи событий идут цепочкой: emit синхронный, а порядок seq обязан совпасть
    // с порядком вызовов.
    let chain: Promise<unknown> = Promise.resolve();
    const io: JobIO = {
      emit(event) {
        // done пишет только finish — в одной транзакции со статусом.
        if (event.type === 'done') return;
        chain = chain
          .then(() => opts.store.appendEvent(job.id, event, id))
          .catch((e) => log(`Не удалось записать событие задания ${job.id}:`, e));
      },
      cancelled: () => slot.cancel || slot.lost,
      async markSaved(simulationId) {
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
    if (outcome.status === 'error') log(`Задание ${job.id} завершилось ошибкой: ${outcome.message}`);
    await chain;
    if (slot.lost) {
      log(`Задание ${job.id}: аренду забрал уборщик, результат попытки не записан.`);
      return;
    }
    try {
      const ok = await opts.store.finish(job.id, id, outcome);
      if (!ok) log(`Задание ${job.id} уже не принадлежит воркеру ${id}.`);
    } catch (e) {
      // Задание останется running; уборщик вернёт его, а повтор увидит simulation_id.
      log(`Не удалось завершить задание ${job.id}:`, e);
    }
  }

  async function fillOnce(): Promise<void> {
    while (!stopping && slots.size < opts.concurrency) {
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
      const stale = slots.get(claimed.id);
      if (stale) stale.lost = true;
      const slot: Slot = { cancel: claimed.cancelRequested, lost: false, done: Promise.resolve() };
      slots.set(claimed.id, slot);
      log(`Воркер ${id} взял задание ${claimed.id} (${claimed.kind}, попытка ${claimed.attempts}).`);
      slot.done = runSlot(claimed, slot).finally(() => {
        if (slots.get(claimed.id) === slot) slots.delete(claimed.id);
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
    // Задания, взятые после снимка, могли не попасть в UPDATE — их не считаем потерянными.
    const known = [...slots.keys()];
    try {
      const { leased, cancelRequested } = await opts.store.heartbeat(id, host, slots.size);
      const leasedSet = new Set(leased);
      for (const jobId of cancelRequested) {
        const s = slots.get(jobId);
        if (s) s.cancel = true;
      }
      for (const jobId of known) {
        const s = slots.get(jobId);
        if (s && !leasedSet.has(jobId)) s.lost = true;
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

  return {
    id,
    start() {
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
      clearInterval(pollTimer);
      clearInterval(reapTimer);
      // Сердцебиение продолжается весь срок ожидания: иначе аренды истекут,
      // и другой воркер начнёт те же задания заново.
      const all = (async () => {
        while (slots.size > 0) await Promise.all([...slots.values()].map((s) => s.done));
      })();
      let timer: NodeJS.Timeout | undefined;
      const drained = await Promise.race([
        all.then(() => true),
        new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), opts.drainMs); }),
      ]);
      clearTimeout(timer);
      clearInterval(heartbeatTimer);
      // Запоздалое сердцебиение после снятия записи вернуло бы воркер в число живых.
      await beating;
      await opts.store.retireWorker(id).catch((e) => log('Не удалось снять запись воркера:', e));
      return { drained };
    },
    running: () => slots.size,
    async idle() {
      while (slots.size > 0 || filling) {
        await Promise.all([...slots.values()].map((s) => s.done));
        await filling;
      }
    },
  };
}
