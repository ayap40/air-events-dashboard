import { type NextRequest, NextResponse } from 'next/server';

import { getCustomerStatuses } from '@/services/salesforceService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emails: unknown = body.emails;

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const normalized = (emails as string[]).map(e => e.toLowerCase().trim()).filter(Boolean);
    const map = await getCustomerStatuses(normalized);

    const statuses: Record<string, { isCustomer: boolean; arr: number | null; tShirtSize: string | null }> =
      {};
    for (const [email, status] of map) {
      statuses[email] = status;
    }

    return NextResponse.json({ statuses });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
