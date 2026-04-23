import { NextResponse } from 'next/server';

import { fetchAllEvents } from '@/services/lumaService';

export async function GET() {
  if (!process.env.LUMA_API_KEY) {
    return NextResponse.json({ error: 'LUMA_API_KEY is not configured' }, { status: 500 });
  }

  try {
    const events = await fetchAllEvents();
    events.sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
    return NextResponse.json({ events });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
