import { makeCtx, runPipeline } from '@/lib/pipeline/run';
import type { PipelineEvent, QualityMode } from '@/lib/types';

export const maxDuration = 600;

export async function POST(req: Request) {
  const { prompt, imageDataUrl, mode = 'max' } = (await req.json()) as {
    prompt: string; imageDataUrl?: string; mode?: QualityMode;
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PipelineEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const ctx = makeCtx(send);
        await runPipeline(ctx, { prompt, imageDataUrl, mode });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
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
