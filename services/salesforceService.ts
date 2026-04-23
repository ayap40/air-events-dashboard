// Uses OAuth 2.0 Client Credentials flow — no user password required.
// Works with SSO orgs. Read-only access is enforced by the "Run As" user's
// profile on the Connected App.

const SF_API_VERSION = 'v59.0';
const BATCH_SIZE = 200;
const DOMAIN_BATCH_SIZE = 50;

// Free/personal email providers — skip domain lookup for these
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
  matchedBy?: 'email' | 'domain';
}

// -- Token cache ------------------------------------------------------------

interface TokenCache {
  access_token: string;
  instance_url: string;
  expires_at: number;
}

let _token: TokenCache | null = null;

async function getToken(): Promise<TokenCache> {
  if (_token && Date.now() < _token.expires_at) return _token;

  const instanceUrl = (process.env.SALESFORCE_INSTANCE_URL ?? '').replace(/\/$/, '');

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SALESFORCE_CLIENT_ID ?? '',
    client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
  });

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
  _token = {
    access_token: data.access_token,
    instance_url: data.instance_url ?? instanceUrl,
    expires_at: Date.now() + 115 * 60 * 1000,
  };
  return _token;
}

async function soqlQuery(token: TokenCache, soql: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `${token.instance_url}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salesforce query failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return (data.records ?? []) as Record<string, unknown>[];
}

function statusFromRecord(record: Record<string, unknown>, accountKey = 'Account'): CustomerStatus {
  const account = (record[accountKey] ?? record) as Record<string, unknown>;
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

  // Pass 1: exact Contact email match
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const emailList = batch.map(e => `'${e.replace(/'/g, "\\'")}'`).join(',');

    const soql = [
      'SELECT Email, Account.Total_Product_Instance_ARR__c, Account.T_Shirt_Size__c',
      'FROM Contact',
      `WHERE Email IN (${emailList})`,
      'AND AccountId != null',
    ].join(' ');

    const records = await soqlQuery(token, soql);
    for (const record of records) {
      const email = ((record.Email as string) ?? '').toLowerCase();
      if (!email) continue;
      result.set(email, { ...statusFromRecord(record), matchedBy: 'email' });
    }
  }

  // Pass 2: domain-based Account Website match for unresolved emails
  const unmatched = emails.filter(e => !result.has(e));
  const domains = [
    ...new Set(
      unmatched
        .map(e => e.split('@')[1] ?? '')
        .filter(d => d && !FREE_EMAIL_DOMAINS.has(d))
    ),
  ];

  for (let i = 0; i < domains.length; i += DOMAIN_BATCH_SIZE) {
    const batch = domains.slice(i, i + DOMAIN_BATCH_SIZE);

    // Match Website containing the domain string (handles https://www.harvey.ai, harvey.ai, etc.)
    const conditions = batch
      .map(d => `Website LIKE '%${d.replace(/'/g, "\\'")}'` +
                ` OR Website LIKE '%${d.replace(/'/g, "\\'")}/%'`)
      .join(' OR ');

    const soql = [
      'SELECT Website, Total_Product_Instance_ARR__c, T_Shirt_Size__c',
      'FROM Account',
      `WHERE (${conditions})`,
      'AND (Total_Product_Instance_ARR__c > 0 OR T_Shirt_Size__c != null)',
    ].join(' ');

    const records = await soqlQuery(token, soql);

    // Build domain → status map from results
    const domainStatus = new Map<string, CustomerStatus>();
    for (const record of records) {
      const website = ((record.Website as string) ?? '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '');

      for (const domain of batch) {
        if (website === domain || website.endsWith(`.${domain}`) || website.startsWith(`${domain}/`)) {
          if (!domainStatus.has(domain)) {
            domainStatus.set(domain, { ...statusFromRecord(record, 'self'), matchedBy: 'domain' });
          }
        }
      }
    }

    // Apply domain status to unmatched emails
    for (const email of unmatched) {
      const domain = email.split('@')[1] ?? '';
      const status = domainStatus.get(domain);
      if (status) result.set(email, status);
    }
  }

  return result;
}
