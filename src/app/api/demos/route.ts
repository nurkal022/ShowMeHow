import { NextResponse } from 'next/server';
import { installDemos } from '@/lib/demos';

export const maxDuration = 600;

export async function POST() {
  try {
    return NextResponse.json(await installDemos());
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) },
      { status: 500 });
  }
}
