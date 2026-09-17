import { getJobStore, getOwnedJob } from '@/lib/jobs/current';
import { isTerminalEvent, terminalEventFor, type JobStatus } from '@/lib/jobs/store';
import { currentUserFromRequest } from '@/lib/auth/session';
import { RECONNECT_FRAME, STREAM_MAX_MS, registerStream } from '@/lib/jobs/open-streams';
import type { PipelineEvent } from '@/lib/types';

export const maxDuration = 600;

/** Сверка с базой на случай потерянного NOTIFY; заодно держит соединение живым. */
const RECONCILE_MS = 5000;
/** Как часто ожидающее задание узнаёт своё место в очереди. */
const POSITION_MS = 3000;

type P = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: P) {
  // Поток отдаёт весь журнал пайплайна: нет сессии — 401, чужое задание — 404.
  const user = await currentUserFromRequest(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Требуется вход в систему.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const { id } = await params;
  const job = await getOwnedJob(user.id, id);
  if (!job) return new Response(null, { status: 404 });

  const store = getJobStore();
  const encoder = new TextEncoder();
  const cleanups: (() => void)[] = [];
  let closed = false;
  let lastSeq = 0;
  let lastStatus: JobStatus = job.status;
  let lastPosition = 0;
  let pulling: Promise<void> | null = null;
  let pullAgain = false;

  function cleanup(): void {
    closed = true;
    for (const c of cleanups.splice(0)) c();
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const shutdown = () => {
        if (closed) return;
        cleanup();
        try { controller.close(); } catch { /* уже закрыт */ }
      };
      const write = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { cleanup(); }
      };
      const send = (e: PipelineEvent) => {
        write(`data: ${JSON.stringify(e)}\n\n`);
        if (isTerminalEvent(e)) shutdown();
      };
      // Плановое закрытие: клиент увидит `: reconnect` и сразу подключится снова.
      const closeForReconnect = () => {
        write(RECONNECT_FRAME);
        shutdown();
      };

      // Рестарт веба ждёт, пока закроются все соединения: поток должен уметь закрыться
      // по команде процесса. Если процесс уже останавливается — закрываемся сразу.
      const unregister = registerStream(closeForReconnect);
      if (!unregister) {
        closeForReconnect();
        return;
      }
      cleanups.push(unregister);
      const lifetime = setTimeout(closeForReconnect, STREAM_MAX_MS);
      cleanups.push(() => clearTimeout(lifetime));

      // Дочитывает журнал после lastSeq. Инвариант «без потерь и дублей» держит seq:
      // уведомления, сверка и реплей сходятся в одну очередь чтений.
      async function pullOnce(): Promise<void> {
        const readTail = async () => {
          for (const r of await store.events(id, lastSeq)) {
            if (closed) return;
            lastSeq = r.seq;
            send(r.event);
          }
        };
        await readTail();
        if (closed) return;
        const current = await store.get(id);
        if (!current) { shutdown(); return; }
        lastStatus = current.status;
        const fallback = terminalEventFor(current);
        if (fallback) {
          // Статус и терминальное событие пишутся одной транзакцией: если статус
          // терминальный, событие уже в журнале. Его нет только у старых записей.
          await readTail();
          if (!closed) send(fallback);
        }
      }

      function pull(): Promise<void> {
        if (pulling) { pullAgain = true; return pulling; }
        pulling = (async () => {
          do {
            pullAgain = false;
            try { await pullOnce(); } catch (e) { console.error(`Поток задания ${id}:`, e); }
          } while (pullAgain && !closed);
        })().finally(() => { pulling = null; });
        return pulling;
      }

      async function reportPosition(): Promise<void> {
        if (closed || lastStatus !== 'queued') return;
        try {
          const position = await store.position(id);
          if (position > 0 && position !== lastPosition) send({ type: 'queued', position });
          lastPosition = position;
        } catch (e) {
          console.error(`Позиция задания ${id}:`, e);
        }
      }

      // Подписка до реплея: всё, что появится во время чтения, дочитает pullAgain.
      cleanups.push(store.subscribe(id, () => { void pull(); }));
      const reconcile = setInterval(() => { write(': ping\n\n'); void pull(); }, RECONCILE_MS);
      const position = setInterval(() => { void reportPosition(); }, POSITION_MS);
      cleanups.push(() => clearInterval(reconcile), () => clearInterval(position));
      void pull().then(reportPosition);
    },
    cancel() {
      // Клиент ушёл — задание живёт дальше, просто перестаём читать.
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Для прокси, которые смотрят на этот заголовок; Caddy настроен flush_interval -1.
      'X-Accel-Buffering': 'no',
    },
  });
}
