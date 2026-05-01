// Uses OAuth 2.0 Client Credentials flow — no user password required.
// Looks up customer status by:
//   1. Direct Contact email lookup → related Account (primary path, works for all emails)
//   2. Domain-based Account.Website matching (fallback for corporate emails with no Contact record)
// Requires Account and Contact read access on the Run As user's profile.

const SF_API_VERSION = 'v59.0';
const BATCH_SIZE = 50;

// Free/personal email providers — skip domain fallback for these
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'live.com',
  'msn.com', 'ymail.com', 'googlemail.com',
]);

// -- Types ------------------------------------------------------------------

export interface CustomerStatus {
  isCustomer: boolean;
  arr: number | null;
  tShirtSize: string | null;
}

// -- Token ------------------------------------------------------------------

interface TokenCache {
  access_token: string;
  instance_url: string;
  expires_at: number;
}

async function getToken(): Promise<TokenCache> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SALESFORCE_CLIENT_ID ?? '',
    client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
  });

  const instanceUrl = (process.env.SALESFORCE_INSTANCE_URL ?? '').replace(/\/$/, '');

  const res = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salesforce auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    instance_url: data.instance_url ?? instanceUrl,
    expires_at: 0,
  };
}

function statusFromAccount(account: Record<string, unknown>): CustomerStatus {
  const arr = (account.Total_Product_Instance_ARR__c as number | null) ?? null;
  const tShirtSize = (account.T_Shirt_Size__c as string | null) ?? null;
  return {
    isCustomer: (arr !== null && arr > 0) || tShirtSize !== null,
    arr,
    tShirtSize,
  };
}

// -- Public API -------------------------------------------------------------

export async function getCustomerStatuses(
  emails: string[]
): Promise<Map<string, CustomerStatus>> {
  if (emails.length === 0) return new Map();

  const token = await getToken();
  const result = new Map<string, CustomerStatus>();

  // Step 1: Contact email lookup → related Account.
  // This is the primary path — directly matches any email stored on a Contact record,
  // including personal emails (gmail etc.) for known customers.
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const emailList = batch.map(e => `'${e.replace(/'/g, "\\'")}'`).join(', ');

    const soql = [
      'SELECT Email, Account.Total_Product_Instance_ARR__c, Account.T_Shirt_Size__c',
      'FROM Contact',
      `WHERE Email IN (${emailList})`,
      'AND AccountId != null',
    ].join(' ');

    const res = await fetch(
      `${token.instance_url}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );

    if (!res.ok) continue; // best effort — fall through to domain lookup

    const data = await res.json();

    for (const record of (data.records ?? []) as Record<string, unknown>[]) {
      const email = ((record.Email as string) ?? '').toLowerCase();
      const account = record.Account as Record<string, unknown> | null;
      if (!email || !account) continue;
      result.set(email, statusFromAccount(account));
    }
  }

  // Step 2: Domain-based Account.Website lookup for corporate emails with no Contact record.
  // Catches people from customer companies who haven't been added to Salesforce yet.
  const unmatchedCorporateEmails = emails.filter(e => {
    if (result.has(e)) return false;
    const domain = e.split('@')[1] ?? '';
    return domain && !FREE_EMAIL_DOMAINS.has(domain);
  });

  const domains = [
    ...new Set(unmatchedCorporateEmails.map(e => e.split('@')[1] ?? '').filter(Boolean)),
  ];

  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const batch = domains.slice(i, i + BATCH_SIZE);

    const conditions = batch
      .map(d => {
        const safe = d.replace(/'/g, "\\'");
        return `Website LIKE '%.${safe}' OR Website LIKE '%.${safe}/%' OR Website LIKE '//${safe}' OR Website LIKE '//${safe}/%'`;
      })
      .join(' OR ');

    const soql = [
      'SELECT Website, Total_Product_Instance_ARR__c, T_Shirt_Size__c',
      'FROM Account',
      `WHERE (${conditions})`,
    ].join(' ');

    const res = await fetch(
      `${token.instance_url}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );

    if (!res.ok) continue;

    const data = await res.json();

    const domainStatus = new Map<string, CustomerStatus>();

    for (const record of (data.records ?? []) as Record<string, unknown>[]) {
      const website = ((record.Website as string) ?? '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];

      for (const domain of batch) {
        if (website === domain || website.endsWith(`.${domain}`)) {
          const status = statusFromAccount(record);
          const existing = domainStatus.get(domain);
          if (!existing || (!existing.isCustomer && status.isCustomer)) {
            domainStatus.set(domain, status);
          }
        }
      }
    }

    for (const email of unmatchedCorporateEmails) {
      const domain = email.split('@')[1] ?? '';
      const status = domainStatus.get(domain);
      if (status) result.set(email, status);
    }
  }

  return result;
}
