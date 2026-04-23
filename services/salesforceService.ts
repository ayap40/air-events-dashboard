// Uses OAuth 2.0 Client Credentials flow — no user password required.
// Works with SSO orgs. Read-only access is enforced by the "Run As" user's
// profile on the Connected App.

const SF_API_VERSION = 'v59.0';
const BATCH_SIZE = 200;

// -- Types ------------------------------------------------------------------

export interface CustomerStatus {
  isCustomer: boolean;
  arr: number | null;
  tShirtSize: string | null;
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
  // Cache token for 115 minutes (Salesforce default session lifetime is 2h)
  _token = {
    access_token: data.access_token,
    instance_url: data.instance_url ?? instanceUrl,
    expires_at: Date.now() + 115 * 60 * 1000,
  };
  return _token;
}

// -- Query ------------------------------------------------------------------

export async function getCustomerStatuses(
  emails: string[]
): Promise<Map<string, CustomerStatus>> {
  if (emails.length === 0) return new Map();

  const token = await getToken();
  const result = new Map<string, CustomerStatus>();

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const emailList = batch.map(e => `'${e.replace(/'/g, "\\'")}'`).join(',');

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

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Salesforce query failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    for (const record of data.records ?? []) {
      const email = (record.Email ?? '').toLowerCase();
      if (!email) continue;

      const arr: number | null =
        record.Account?.Total_Product_Instance_ARR__c ?? null;
      const tShirtSize: string | null =
        record.Account?.T_Shirt_Size__c ?? null;

      result.set(email, {
        isCustomer: (arr !== null && arr > 0) || tShirtSize !== null,
        arr,
        tShirtSize,
      });
    }
  }

  return result;
}
