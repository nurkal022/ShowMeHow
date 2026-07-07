import { NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/settings';
import type { Settings } from '@/lib/types';

const MASK = '••••';

export async function GET() {
  const s = loadSettings();
  return NextResponse.json({
    ...s,
    providers: s.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey.length > 4 ? MASK + p.apiKey.slice(-4) : MASK,
    })),
  });
}

export async function PUT(req: Request) {
  const incoming = (await req.json()) as Settings;
  const current = loadSettings();
  for (const p of incoming.providers) {
    if (p.apiKey.startsWith(MASK) && !current.providers.some((c) => c.id === p.id)) {
      return NextResponse.json(
        { error: `unknown provider id for masked apiKey: ${p.id}` }, { status: 400 });
    }
  }
  incoming.providers = incoming.providers.map((p) => {
    if (p.apiKey.startsWith(MASK)) {
      const old = current.providers.find((c) => c.id === p.id);
      return { ...p, apiKey: old?.apiKey ?? '' };
    }
    return p;
  });
  saveSettings(incoming);
  return NextResponse.json({ ok: true });
}
