import { NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/settings';
import type { Settings } from '@/lib/types';

const MASK = '••••';

export async function GET() {
  const s = loadSettings();
  return NextResponse.json({
    ...s,
    providers: s.providers.map((p) => ({ ...p, apiKey: MASK + p.apiKey.slice(-4) })),
  });
}

export async function PUT(req: Request) {
  const incoming = (await req.json()) as Settings;
  const current = loadSettings();
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
