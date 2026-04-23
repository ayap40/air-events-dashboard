import { type NextRequest, NextResponse } from 'next/server';

import { createEvent } from '@/services/lumaService';

export async function POST(request: NextRequest) {
  if (!process.env.LUMA_API_KEY) {
    return NextResponse.json({ error: 'LUMA_API_KEY is not configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    name,
    start_at,
    end_at,
    timezone,
    description_md,
    meeting_url,
    max_capacity,
    require_rsvp_approval,
  } = body as Record<string, unknown>;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!start_at || typeof start_at !== 'string') {
    return NextResponse.json({ error: 'start_at is required' }, { status: 400 });
  }
  if (!timezone || typeof timezone !== 'string') {
    return NextResponse.json({ error: 'timezone is required' }, { status: 400 });
  }

  try {
    const event = await createEvent({
      name: name.trim(),
      start_at,
      timezone,
      ...(end_at && typeof end_at === 'string' ? { end_at } : {}),
      ...(description_md && typeof description_md === 'string' ? { description_md } : {}),
      ...(meeting_url && typeof meeting_url === 'string' ? { meeting_url } : {}),
      ...(max_capacity && typeof max_capacity === 'number' ? { max_capacity } : {}),
      ...(typeof require_rsvp_approval === 'boolean' ? { require_rsvp_approval } : {}),
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
