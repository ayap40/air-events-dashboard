import { type NextRequest, NextResponse } from 'next/server';

import { getCampaignMembers } from '@/services/salesforceService';

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get('campaign_id')?.trim();
  if (!campaignId) return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });

  try {
    const members = await getCampaignMembers(campaignId);
    return NextResponse.json({ members });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
