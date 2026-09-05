import { NextResponse } from 'next/server';
import { listSimulations } from '@/lib/storage';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

export async function GET() {
  return NextResponse.json(await listSimulations(TEMP_OWNER_ID));
}
