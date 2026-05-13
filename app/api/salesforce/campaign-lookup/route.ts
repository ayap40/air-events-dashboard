import { type NextRequest, NextResponse } from 'next/server';

import { lookupCampaignByName } from '@/services/salesforceService';

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  try {
    const campaigns = await lookupCampaignByName(name);
    return NextResponse.json({ campaigns });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
