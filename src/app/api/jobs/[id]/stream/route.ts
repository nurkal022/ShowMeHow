import { getJob, subscribe } from '@/lib/jobs';
import type { PipelineEvent } from '@/lib/types';

export const maxDuration = 600;

type P = { params: Promise<{ id: string }> };

function isTerminal(e: PipelineEvent): boolean {
  return e.type === 'done' || e.type === 'error' || e.type === 'cancelled';
}

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  if (!getJob(id)) return new Response(null, { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: PipelineEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
          return;
        }
        if (isTerminal(e)) {
          // Терминальное событие всегда закрывает поток — done/error/cancelled
          // навсегда завершают job, дальнейших событий не будет.
          closed = true;
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            // уже закрыт
          }
        }
      };

      // Инвариант «не теряем и не дублируем события»: подписываемся ПЕРЕД чтением
      // снапшота job.events. Пока идёт реплей снапшота (см. ниже), любые события,
      // прилетевшие через subscribe-колбэк, складываются в буфер `live`, а не
      // отправляются немедленно. После того как снапшот полностью реплеен,
      // добираем из `live` только «хвост» — события с индексом ≥ длины снапшота
      // (то, что уже попало в снапшот, в live не дублируем). Дальше live-события
      // отправляются сразу же по мере появления.
      const live: PipelineEvent[] = [];
      let replaying = true;
      unsubscribe = subscribe(id, (e) => {
        if (replaying) {
          live.push(e);
        } else {
          send(e);
        }
      });

      const snapshot = getJob(id)?.events ?? [];
      for (const e of snapshot) send(e);
      replaying = false;
      for (let i = snapshot.length; i < live.length; i++) send(live[i]);
    },
    cancel() {
      // Клиент отключился (например, вкладка закрыта до конца генерации) —
      // просто отписываемся, job продолжает жить и завершится независимо от стрима.
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
