import { type NextRequest, NextResponse } from 'next/server';

const CLAY_CHECKIN_WEBHOOK_URL =
  process.env.CLAY_CHECKIN_WEBHOOK_URL ??
  'https://api.clay.com/v3/sources/webhook/pull-in-data-from-a-webhook-c82bacc3-a5ea-480f-b688-51f4a12ddb2f';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse('OK', { status: 200 });
  }

  const payload = body as Record<string, unknown>;

  if (payload.type !== 'guest.updated') {
    return new NextResponse('OK', { status: 200 });
  }

  const data = payload.data as Record<string, unknown> | undefined;
  if (!data?.checked_in_at) {
    return new NextResponse('OK', { status: 200 });
  }

  await fetch(CLAY_CHECKIN_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return new NextResponse('OK', { status: 200 });
}
