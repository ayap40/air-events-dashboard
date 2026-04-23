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

interface LumaUser {
  api_id: string;
  name: string | null;
  email: string;
  linkedin_handle: string | null;
  avatar_url: string | null;
}

export interface LumaGuest {
  api_id: string;
  event_api_id: string;
  user: LumaUser;
  registered_at: string;
  approval_status: string;
  checked_in_at?: string | null;
  answers?: Array<{ label?: string; question?: string; answer: string }>;
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

function extractLinkedinUrl(guest: LumaGuest): string | null {
  if (guest.user.linkedin_handle) {
    const handle = guest.user.linkedin_handle.trim();
    return handle.startsWith('http') ? handle : `https://linkedin.com/in/${handle}`;
  }

  if (guest.answers && guest.answers.length > 0) {
    const linkedinAnswer = guest.answers.find(
      a => a.answer && a.answer.toLowerCase().includes('linkedin.com')
    );
    if (linkedinAnswer) return linkedinAnswer.answer.trim();

    const labeledAnswer = guest.answers.find(a => {
      const label = (a.label ?? a.question ?? '').toLowerCase();
      return label.includes('linkedin');
    });
    if (labeledAnswer?.answer) return labeledAnswer.answer.trim();
  }

  return null;
}

function extractCompany(guest: LumaGuest): string | null {
  if (!guest.answers || guest.answers.length === 0) return null;
  const answer = guest.answers.find(a => {
    const label = (a.label ?? a.question ?? '').toLowerCase();
    return label.includes('company') || label.includes('organization');
  });
  return answer?.answer?.trim() || null;
}

function buildGuestResult(guest: LumaGuest, attendance: EventAttendance[]): GuestSearchResult {
  const nameParts = (guest.user.name ?? '').trim().split(/\s+/);
  return {
    firstName: nameParts[0] ?? '',
    lastName: nameParts.slice(1).join(' '),
    email: guest.user.email,
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

export async function fetchEventGuests(eventId: string): Promise<LumaGuest[]> {
  const guests: LumaGuest[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ event_id: eventId, pagination_limit: '100' });
    if (cursor) params.set('pagination_cursor', cursor);

    const res = await fetch(`${LUMA_API_BASE}/v1/event/get-guests?${params}`, {
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

  const data = await res.json() as CreatedEvent;
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
          const match = guests.find(g => g.user.email?.toLowerCase() === normalizedEmail);
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
  // email → { firstGuest, attendance[] }
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
        const name = (guest.user.name ?? '').toLowerCase();
        if (!name.includes(normalized)) continue;

        const email = guest.user.email.toLowerCase();
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
