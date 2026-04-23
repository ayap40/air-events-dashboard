import { type NextRequest, NextResponse } from 'next/server';

import { fetchEventGuests } from '@/services/lumaService';

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('event_id')?.trim();

  if (!eventId) {
    return NextResponse.json({ error: 'event_id query param is required' }, { status: 400 });
  }

  if (!process.env.LUMA_API_KEY) {
    return NextResponse.json({ error: 'LUMA_API_KEY is not configured' }, { status: 500 });
  }

  try {
    const guests = await fetchEventGuests(eventId);
    return NextResponse.json({ guests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
