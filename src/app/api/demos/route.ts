import { NextResponse } from 'next/server';
import { installDemos } from '@/lib/demos';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

export const maxDuration = 600;

export async function POST() {
  try {
    return NextResponse.json(await installDemos(TEMP_OWNER_ID));
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) },
      { status: 500 });
  }
}
