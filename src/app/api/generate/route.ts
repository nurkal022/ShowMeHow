import { makeCtx, runPipeline } from '@/lib/pipeline/run';
import { resolveMode } from '@/lib/settings';
import type { PipelineEvent, QualityMode } from '@/lib/types';

export const maxDuration = 600;

export async function POST(req: Request) {
  const { prompt, imageDataUrl, mode: bodyMode } = (await req.json()) as {
    prompt: string; imageDataUrl?: string; mode?: QualityMode;
  };
  const mode = resolveMode(bodyMode);
  const encoder = new TextEncoder();
  // Клиент может отключиться (закрыть вкладку, уйти со страницы) до того, как
  // пайплайн завершится. `closed` гасит дальнейшую отправку событий в мёртвый
  // controller, но НЕ прерывает runPipeline — генерация должна доработать и
  // сохранить симуляцию даже без слушателя на другом конце SSE.
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PipelineEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const ctx = makeCtx(send);
        await runPipeline(ctx, { prompt, imageDataUrl, mode });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            closed = true;
          }
        }
      }
    },
    cancel() {
      // Клиент отключился — просто помечаем поток закрытым, runPipeline
      // (запущенный в start()) продолжает работать до конца и сохраняет результат.
      closed = true;
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
