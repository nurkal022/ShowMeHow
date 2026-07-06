import { getMeta, getArtifact } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = getMeta(id);
  return new Response(getArtifact(id), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition':
        `attachment; filename*=UTF-8''${encodeURIComponent(meta.title)}.html`,
    },
  });
}
