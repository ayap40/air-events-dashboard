import { type NextRequest, NextResponse } from 'next/server';

import { searchGuestByEmail, searchGuestsByName } from '@/services/lumaService';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json({ error: 'q query param is required' }, { status: 400 });
  }

  if (!process.env.LUMA_API_KEY) {
    return NextResponse.json({ error: 'LUMA_API_KEY is not configured' }, { status: 500 });
  }

  try {
    if (q.includes('@')) {
      const result = await searchGuestByEmail(q);
      return NextResponse.json({ results: result ? [result] : [] });
    } else {
      const results = await searchGuestsByName(q);
      return NextResponse.json({ results });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
