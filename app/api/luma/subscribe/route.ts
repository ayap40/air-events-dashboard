import { type NextRequest, NextResponse } from 'next/server';

import { subscribeToCalendar } from '@/services/lumaService';

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

  const { email, firstName, lastName } = body as Record<string, unknown>;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;

  try {
    await subscribeToCalendar(email.trim(), name);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
