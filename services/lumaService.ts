const LUMA_API_BASE = 'https://public-api.luma.com';

// -- Types ------------------------------------------------------------------

export interface LumaEvent {
  api_id: string;
  name: string;
  start_at: string;
  end_at: string | null;
  url: string;
  cover_url: string | null;
}

interface CalendarListResponse {
  entries: Array<{ event: LumaEvent }>;
  has_more: boolean;
  next_cursor: string | null;
}

export interface LumaRegistrationAnswer {
  label: string;
  answer: string;
  question_type: string;
  answer_company?: string;
  answer_job_title?: string;
}

export interface LumaGuest {
  api_id: string;
  approval_status: string;
  registered_at: string;
  checked_in_at: string | null;
  // User fields are flat on the entry (no nested user object)
  name: string | null;
  email: string;
  user_name: string | null;
  user_email: string;
  user_first_name: string | null;
  user_last_name: string | null;
  registration_answers: LumaRegistrationAnswer[];
}

interface GuestsResponse {
  entries: LumaGuest[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface EventAttendance {
  event: LumaEvent;
  guest: LumaGuest;
}

export interface GuestSearchResult {
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  linkedinUrl: string | null;
  events: EventAttendance[];
}

// -- Helpers ----------------------------------------------------------------

function headers(): HeadersInit {
  return {
    'x-luma-api-key': process.env.LUMA_API_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

function guestEmail(guest: LumaGuest): string {
  return guest.email ?? guest.user_email ?? '';
}

function guestName(guest: LumaGuest): string {
  return guest.name ?? guest.user_name ?? '';
}

function normalizeLinkedinUrl(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/in/') || s.startsWith('in/'))
    return `https://www.linkedin.com${s.startsWith('/') ? s : `/${s}`}`;
  if (s.startsWith('linkedin.com') || s.startsWith('www.linkedin.com')) return `https://${s}`;
  return s;
}

function extractLinkedinUrl(guest: LumaGuest): string | null {
  if (!guest.registration_answers || guest.registration_answers.length === 0) return null;

  const byUrl = guest.registration_answers.find(
    a =>
      a.answer &&
      (a.answer.toLowerCase().includes('linkedin.com') ||
        a.answer.toLowerCase().startsWith('/in/') ||
        a.answer.toLowerCase().startsWith('in/'))
  );
  if (byUrl?.answer) return normalizeLinkedinUrl(byUrl.answer);

  const byLabel = guest.registration_answers.find(a =>
    a.label.toLowerCase().includes('linkedin')
  );
  if (byLabel?.answer) return normalizeLinkedinUrl(byLabel.answer);

  return null;
}

function extractCompany(guest: LumaGuest): string | null {
  if (!guest.registration_answers || guest.registration_answers.length === 0) return null;
  const answer = guest.registration_answers.find(a => a.question_type === 'company');
  return answer?.answer_company ?? answer?.answer ?? null;
}

function buildGuestResult(guest: LumaGuest, attendance: EventAttendance[]): GuestSearchResult {
  const firstName =
    guest.user_first_name ?? guestName(guest).split(' ')[0] ?? '';
  const lastName =
    guest.user_last_name ?? guestName(guest).split(' ').slice(1).join(' ') ?? '';
  return {
    firstName,
    lastName,
    email: guestEmail(guest),
    company: extractCompany(guest),
    linkedinUrl: extractLinkedinUrl(guest),
    events: attendance.sort(
      (a, b) => new Date(b.event.start_at).getTime() - new Date(a.event.start_at).getTime()
    ),
  };
}

// -- API calls --------------------------------------------------------------

export async function fetchAllEvents(): Promise<LumaEvent[]> {
  const events: LumaEvent[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ pagination_limit: '100' });
    if (cursor) params.set('pagination_cursor', cursor);

    const res = await fetch(`${LUMA_API_BASE}/v1/calendar/list-events?${params}`, {
      headers: headers(),
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`Failed to list events: ${res.status} ${res.statusText}`);

    const data: CalendarListResponse = await res.json();
    events.push(...data.entries.map(e => e.event));
    cursor = data.next_cursor ?? undefined;
  } while (cursor);

  return events;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;

    const retryAfter = res.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * 2 ** attempt;
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error(`Rate limited by Luma API after ${retries} retries`);
}

export async function fetchEventGuests(eventId: string): Promise<LumaGuest[]> {
  const guests: LumaGuest[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ event_id: eventId, pagination_limit: '100' });
    if (cursor) params.set('pagination_cursor', cursor);

    const res = await fetchWithRetry(`${LUMA_API_BASE}/v1/event/get-guests?${params}`, {
      headers: headers(),
    });

    if (!res.ok) throw new Error(`Failed to fetch guests for ${eventId}: ${res.status}`);

    const data: GuestsResponse = await res.json();
    guests.push(...data.entries);
    cursor = data.next_cursor ?? undefined;
  } while (cursor);

  return guests;
}

// -- Create -----------------------------------------------------------------

export interface CreateEventInput {
  name: string;
  start_at: string;
  end_at?: string;
  timezone: string;
  description_md?: string;
  meeting_url?: string;
  max_capacity?: number;
  require_rsvp_approval?: boolean;
}

export interface CreatedEvent {
  api_id: string;
  url: string;
  name: string;
}

const STANDARD_REGISTRATION_QUESTIONS = [
  { label: 'Company', required: true, type: 'text' },
  { label: 'LinkedIn Profile URL', required: false, type: 'url' },
];

export async function createEvent(input: CreateEventInput): Promise<CreatedEvent> {
  const body = {
    name: input.name,
    start_at: input.start_at,
    timezone: input.timezone,
    ...(input.end_at && { end_at: input.end_at }),
    ...(input.description_md && { description_md: input.description_md }),
    ...(input.meeting_url && { meeting_url: input.meeting_url }),
    ...(input.max_capacity && { max_capacity: input.max_capacity }),
    ...(input.require_rsvp_approval !== undefined && {
      require_rsvp_approval: input.require_rsvp_approval,
    }),
    registration_questions: STANDARD_REGISTRATION_QUESTIONS,
  };

  const res = await fetch(`${LUMA_API_BASE}/v1/event/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create event: ${res.status} ${text}`);
  }

  const data = (await res.json()) as CreatedEvent;
  return { api_id: data.api_id, url: data.url, name: data.name };
}

// -- Subscribe --------------------------------------------------------------

export async function subscribeToCalendar(email: string, name?: string): Promise<void> {
  const res = await fetch(`${LUMA_API_BASE}/v1/calendar/subscribe`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, ...(name && { name }) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to subscribe to calendar: ${res.status} ${text}`);
  }
}

// -- Search -----------------------------------------------------------------

const BATCH_SIZE = 20;

export async function searchGuestByEmail(email: string): Promise<GuestSearchResult | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const allEvents = await fetchAllEvents();
  const matches: EventAttendance[] = [];

  for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
    const batch = allEvents.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async event => {
        try {
          const guests = await fetchEventGuests(event.api_id);
          const match = guests.find(g => guestEmail(g).toLowerCase() === normalizedEmail);
          return match ? { event, guest: match } : null;
        } catch {
          return null;
        }
      })
    );
    matches.push(...results.filter((r): r is EventAttendance => r !== null));
  }

  if (matches.length === 0) return null;
  return buildGuestResult(matches[0].guest, matches);
}

export async function searchGuestsByName(query: string): Promise<GuestSearchResult[]> {
  const normalized = query.toLowerCase().trim();
  const allEvents = await fetchAllEvents();
  const byEmail = new Map<string, { firstGuest: LumaGuest; attendance: EventAttendance[] }>();

  for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
    const batch = allEvents.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async event => {
        try {
          const guests = await fetchEventGuests(event.api_id);
          return { event, guests };
        } catch {
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (!result) continue;
      const { event, guests } = result;
      for (const guest of guests) {
        const name = guestName(guest).toLowerCase();
        if (!name.includes(normalized)) continue;

        const email = guestEmail(guest).toLowerCase();
        const existing = byEmail.get(email);
        if (existing) {
          existing.attendance.push({ event, guest });
        } else {
          byEmail.set(email, { firstGuest: guest, attendance: [{ event, guest }] });
        }
      }
    }
  }

  return Array.from(byEmail.values()).map(({ firstGuest, attendance }) =>
    buildGuestResult(firstGuest, attendance)
  );
}
