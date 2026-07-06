import { NextResponse } from 'next/server';
import { listSimulations } from '@/lib/storage';

export async function GET() {
  return NextResponse.json(listSimulations());
}
