// Uses OAuth 2.0 Client Credentials flow — no user password required.
// Looks up customer status by matching email domain against Account.Website.
// Requires only Account read access on the Run As user's profile.

const SF_API_VERSION = 'v59.0';
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

  const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salesforce auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const instanceUrl = (process.env.SALESFORCE_INSTANCE_URL ?? '').replace(/\/$/, '');
  return {
    access_token: data.access_token,
    instance_url: data.instance_url ?? instanceUrl,
    expires_at: 0,
  };
}

// -- Public API -------------------------------------------------------------

export async function getCustomerStatuses(
  emails: string[]
): Promise<Map<string, CustomerStatus>> {
  if (emails.length === 0) return new Map();

  const token = await getToken();
  const result = new Map<string, CustomerStatus>();

  // Extract unique non-free domains from the email list
  const domains = [
    ...new Set(
      emails
        .map(e => e.split('@')[1] ?? '')
        .filter(d => d && !FREE_EMAIL_DOMAINS.has(d))
    ),
  ];

  if (domains.length === 0) return result;

  // Query Account by Website domain in batches
  for (let i = 0; i < domains.length; i += DOMAIN_BATCH_SIZE) {
    const batch = domains.slice(i, i + DOMAIN_BATCH_SIZE);

    // Match Website ending with the domain or domain followed by /
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

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Salesforce query failed: ${res.status} ${text}`);
    }

    const data = await res.json();

    // Build domain → best CustomerStatus map (prefer accounts with ARR)
    const domainStatus = new Map<string, CustomerStatus>();

    for (const record of (data.records ?? []) as Record<string, unknown>[]) {
      const website = ((record.Website as string) ?? '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]; // strip path, keep hostname

      for (const domain of batch) {
        if (website === domain || website.endsWith(`.${domain}`)) {
          const arr = (record.Total_Product_Instance_ARR__c as number | null) ?? null;
          const tShirtSize = (record.T_Shirt_Size__c as string | null) ?? null;
          const status: CustomerStatus = {
            isCustomer: (arr !== null && arr > 0) || tShirtSize !== null,
            arr,
            tShirtSize,
          };
          // Keep the record that looks most like a customer
          const existing = domainStatus.get(domain);
          if (!existing || (!existing.isCustomer && status.isCustomer)) {
            domainStatus.set(domain, status);
          }
        }
      }
    }

    // Map matched domain statuses back to emails
    for (const email of emails) {
      const domain = email.split('@')[1] ?? '';
      const status = domainStatus.get(domain);
      if (status) result.set(email, status);
    }
  }

  return result;
}
