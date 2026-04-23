'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GuestSearchResult, LumaEvent, LumaGuest } from '@/services/lumaService';

// -- Constants ---------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending_approval: 'Pending',
  declined: 'Declined',
  waitlisted: 'Waitlisted',
  checked_in: 'Checked in',
};

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  declined: 'bg-red-100 text-red-800',
  waitlisted: 'bg-gray-100 text-gray-600',
  checked_in: 'bg-blue-100 text-blue-800',
};

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

// -- Helpers -----------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toIso(localDatetime: string): string {
  return new Date(localDatetime).toISOString();
}

function getGuestCompany(guest: LumaGuest): string | null {
  if (!guest.answers) return null;
  const answer = guest.answers.find(a =>
    (a.label ?? a.question ?? '').toLowerCase().includes('company')
  );
  return answer?.answer?.trim() || null;
}

function getGuestLinkedin(guest: LumaGuest): string | null {
  if (guest.user?.linkedin_handle) {
    const h = guest.user.linkedin_handle.trim();
    return h.startsWith('http') ? h : `https://linkedin.com/in/${h}`;
  }
  if (!guest.answers) return null;
  const byUrl = guest.answers.find(a => a.answer?.toLowerCase().includes('linkedin.com'));
  if (byUrl) return byUrl.answer.trim();
  const byLabel = guest.answers.find(a =>
    (a.label ?? a.question ?? '').toLowerCase().includes('linkedin')
  );
  return byLabel?.answer?.trim() || null;
}

function tabClass(active: boolean) {
  return `px-4 py-2 text-sm font-medium transition-colors ${
    active
      ? 'border-b-2 border-gray-900 text-gray-900'
      : 'text-gray-400 hover:text-gray-600'
  }`;
}

// -- Shared components -------------------------------------------------------

function LinkedInIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

// -- PersonDetail (shared between search results) ----------------------------

function PersonDetail({
  result,
  onBack,
}: {
  result: GuestSearchResult;
  onBack?: () => void;
}) {
  return (
    <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to results
        </button>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {result.firstName} {result.lastName}
            </h2>
            <a
              href={`mailto:${result.email}`}
              className="mt-0.5 block text-sm text-gray-500 hover:text-gray-700"
            >
              {result.email}
            </a>
            {result.company && (
              <p className="mt-0.5 text-sm text-gray-500">{result.company}</p>
            )}
            {result.linkedinUrl && (
              <a
                href={result.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
              >
                <LinkedInIcon />
                LinkedIn Profile
              </a>
            )}
          </div>
          <div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
            {result.events.length} event{result.events.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">Event</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">RSVP date</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {result.events.map(({ event, guest }) => (
              <tr key={guest.api_id} className="hover:bg-gray-50">
                <td className="px-5 py-3.5 font-medium text-gray-900">
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 hover:underline"
                  >
                    {event.name}
                  </a>
                </td>
                <td className="px-5 py-3.5 text-gray-500">{formatDate(event.start_at)}</td>
                <td className="px-5 py-3.5 text-gray-500">{formatDate(guest.registered_at)}</td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={guest.approval_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -- Search tab --------------------------------------------------------------

function SearchTab() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GuestSearchResult[]>([]);
  const [selected, setSelected] = useState<GuestSearchResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;

      setLoading(true);
      setResults([]);
      setSelected(null);
      setSearched(false);
      setError(null);

      try {
        const res = await fetch(`/api/luma/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? 'Something went wrong');
          return;
        }

        const list: GuestSearchResult[] = data.results ?? [];
        setResults(list);
        setSearched(true);
        if (list.length === 1) setSelected(list[0]);
      } catch {
        setError('Failed to reach the server. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleBack = useCallback(() => setSelected(null), []);

  const handleSelect = useCallback((result: GuestSearchResult) => {
    setSelected(result);
  }, []);

  return (
    <>
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder="Search by name or email…"
          required
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {loading && (
        <div className="mt-10 text-center text-sm text-gray-400">
          Searching across all events — this may take a moment…
        </div>
      )}

      {error && <div className="mt-6"><ErrorBanner message={error} /></div>}

      {searched && !loading && results.length === 0 && (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          No attendees found for{' '}
          <span className="font-medium text-gray-600">{query}</span>
        </div>
      )}

      {/* Single result — show detail directly */}
      {!loading && results.length === 1 && selected && (
        <div className="mt-8">
          <PersonDetail result={selected} />
        </div>
      )}

      {/* Multiple results — show picker list */}
      {!loading && results.length > 1 && !selected && (
        <div className="mt-8 space-y-3">
          <p className="text-sm text-gray-500">
            {results.length} people found — click to view their event history
          </p>
          {results.map(result => (
            <button
              key={result.email}
              type="button"
              onClick={() => handleSelect(result)}
              className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-gray-900">
                    {result.firstName} {result.lastName}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-500">{result.email}</div>
                  {result.company && (
                    <div className="mt-0.5 text-sm text-gray-400">{result.company}</div>
                  )}
                </div>
                <div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                  {result.events.length} event{result.events.length !== 1 ? 's' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Multiple results — drill into one person */}
      {!loading && results.length > 1 && selected && (
        <div className="mt-8">
          <PersonDetail result={selected} onBack={handleBack} />
        </div>
      )}
    </>
  );
}

// -- Event attendees tab -----------------------------------------------------

function AttendeesTab() {
  const [events, setEvents] = useState<LumaEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [guests, setGuests] = useState<LumaGuest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [guestsError, setGuestsError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/luma/events')
      .then(r => r.json())
      .then(data => {
        if (data.events) {
          setEvents(data.events);
        } else {
          setEventsError(data.error ?? 'Failed to load events');
        }
      })
      .catch(() => setEventsError('Failed to load events'))
      .finally(() => setLoadingEvents(false));
  }, []);

  const handleEventChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedEventId(id);
    setGuests([]);
    setFilter('');
    setGuestsError(null);
    if (!id) return;

    setLoadingGuests(true);
    try {
      const res = await fetch(`/api/luma/guests?event_id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        setGuestsError(data.error ?? 'Failed to load attendees');
      } else {
        setGuests(data.guests);
      }
    } catch {
      setGuestsError('Failed to load attendees');
    } finally {
      setLoadingGuests(false);
    }
  }, []);

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(e.target.value);
  }, []);

  const filteredGuests = useMemo(() => {
    if (!filter.trim()) return guests;
    const q = filter.toLowerCase();
    return guests.filter(g => {
      const name = (g.user?.name ?? '').toLowerCase();
      const email = (g.user?.email ?? '').toLowerCase();
      const company = (getGuestCompany(g) ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || company.includes(q);
    });
  }, [guests, filter]);

  if (loadingEvents) {
    return <div className="text-sm text-gray-400">Loading events…</div>;
  }

  if (eventsError) {
    return <ErrorBanner message={eventsError} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <label
          className="mb-1.5 block text-sm font-medium text-gray-700"
          htmlFor="event-select"
        >
          Select event
        </label>
        <select
          id="event-select"
          value={selectedEventId}
          onChange={handleEventChange}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
        >
          <option value="">— Choose an event —</option>
          {events.map(event => (
            <option key={event.api_id} value={event.api_id}>
              {formatDate(event.start_at)} · {event.name}
            </option>
          ))}
        </select>
      </div>

      {guestsError && <ErrorBanner message={guestsError} />}

      {loadingGuests && (
        <div className="text-sm text-gray-400">Loading attendees…</div>
      )}

      {!loadingGuests && selectedEventId && guests.length === 0 && !guestsError && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          No attendees found for this event.
        </div>
      )}

      {!loadingGuests && guests.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={filter}
              onChange={handleFilterChange}
              placeholder="Filter by name, email, or company…"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />
            <span className="shrink-0 text-sm text-gray-400">
              {filteredGuests.length}{' '}
              {filteredGuests.length !== guests.length && `of ${guests.length} `}
              attendee{filteredGuests.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">LinkedIn</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredGuests.map(guest => {
                  const linkedin = getGuestLinkedin(guest);
                  const company = getGuestCompany(guest);
                  return (
                    <tr key={guest.api_id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5 font-medium text-gray-900">
                        {guest.user?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {guest.user?.email ? (
                          <a
                            href={`mailto:${guest.user.email}`}
                            className="hover:text-gray-700"
                          >
                            {guest.user.email}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">{company ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        {linkedin ? (
                          <a
                            href={linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800"
                          >
                            <LinkedInIcon className="h-3.5 w-3.5" />
                            <span className="text-xs">Profile</span>
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={guest.approval_status} />
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {formatDate(guest.registered_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// -- Create event tab --------------------------------------------------------

interface CreateEventFields {
  name: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  description: string;
  meetingUrl: string;
  maxCapacity: string;
  requireApproval: boolean;
}

const EMPTY_FORM: CreateEventFields = {
  name: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  timezone: 'America/Los_Angeles',
  description: '',
  meetingUrl: '',
  maxCapacity: '',
  requireApproval: false,
};

interface CreatedEventResult {
  api_id: string;
  url: string;
  name: string;
}

function CreateEventTab() {
  const [fields, setFields] = useState<CreateEventFields>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedEventResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value, type } = e.target;
      const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
      setFields(prev => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setCreated(null);
      setError(null);

      try {
        const startIso = toIso(`${fields.startDate}T${fields.startTime}`);
        const endIso =
          fields.endDate && fields.endTime
            ? toIso(`${fields.endDate}T${fields.endTime}`)
            : undefined;

        const body: Record<string, unknown> = {
          name: fields.name,
          start_at: startIso,
          timezone: fields.timezone,
          require_rsvp_approval: fields.requireApproval,
        };
        if (endIso) body.end_at = endIso;
        if (fields.description.trim()) body.description_md = fields.description.trim();
        if (fields.meetingUrl.trim()) body.meeting_url = fields.meetingUrl.trim();
        if (fields.maxCapacity) body.max_capacity = parseInt(fields.maxCapacity, 10);

        const res = await fetch('/api/luma/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Something went wrong');
          return;
        }

        setCreated(data);
        setFields(EMPTY_FORM);
      } catch {
        setError('Failed to reach the server. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [fields]
  );

  const handleReset = useCallback(() => {
    setCreated(null);
    setError(null);
  }, []);

  if (created) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500">
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium text-green-900">{created.name} created</p>
            <a
              href={created.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-sm text-green-700 underline hover:text-green-900"
            >
              Open in Luma
            </a>
            <div className="mt-4 rounded-lg border border-green-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Verify registration questions in Luma
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {['First name', 'Last name', 'Email', 'Company', 'LinkedIn Profile URL'].map(
                  field => (
                    <li key={field} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                      {field}
                    </li>
                  )
                )}
              </ul>
              <p className="mt-3 text-xs text-gray-400">
                First name, last name, and email are always collected by Luma. Company and
                LinkedIn were sent via API — confirm they appear on the Registration tab.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="mt-4 text-sm text-green-700 underline hover:text-green-900"
            >
              Create another event
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <ErrorBanner message={error} />}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="name">
          Event name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={fields.name}
          onChange={handleChange}
          required
          placeholder="Air Community Meetup"
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="startDate">
            Start date <span className="text-red-500">*</span>
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            value={fields.startDate}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="startTime">
            Start time <span className="text-red-500">*</span>
          </label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            value={fields.startTime}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="endDate">
            End date
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            value={fields.endDate}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="endTime">
            End time
          </label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            value={fields.endTime}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="timezone">
          Timezone <span className="text-red-500">*</span>
        </label>
        <select
          id="timezone"
          name="timezone"
          value={fields.timezone}
          onChange={handleChange}
          required
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
        >
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="meetingUrl">
          Virtual meeting URL
        </label>
        <input
          id="meetingUrl"
          name="meetingUrl"
          type="url"
          value={fields.meetingUrl}
          onChange={handleChange}
          placeholder="https://zoom.us/j/…"
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="description">
          Description{' '}
          <span className="font-normal text-gray-400">(Markdown supported)</span>
        </label>
        <textarea
          id="description"
          name="description"
          value={fields.description}
          onChange={handleChange}
          rows={4}
          placeholder="Tell attendees what to expect…"
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="maxCapacity">
          Max capacity
        </label>
        <input
          id="maxCapacity"
          name="maxCapacity"
          type="number"
          min="1"
          value={fields.maxCapacity}
          onChange={handleChange}
          placeholder="Leave blank for unlimited"
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          name="requireApproval"
          type="checkbox"
          checked={fields.requireApproval}
          onChange={handleChange}
          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
        />
        <span className="text-sm text-gray-700">Require RSVP approval</span>
      </label>

      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        Standard registration questions (first name, last name, email, company, LinkedIn) will be
        added automatically.
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create event'}
      </button>
    </form>
  );
}

// -- Page --------------------------------------------------------------------

type Tab = 'search' | 'attendees' | 'create';

export default function EventsDashboard() {
  const [tab, setTab] = useState<Tab>('search');

  const handleTabSearch = useCallback(() => setTab('search'), []);
  const handleTabAttendees = useCallback(() => setTab('attendees'), []);
  const handleTabCreate = useCallback(() => setTab('create'), []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Air Events Dashboard</h1>
        </div>

        <div className="mb-8 flex gap-1 border-b border-gray-200">
          <button type="button" onClick={handleTabSearch} className={tabClass(tab === 'search')}>
            Search attendees
          </button>
          <button
            type="button"
            onClick={handleTabAttendees}
            className={tabClass(tab === 'attendees')}
          >
            Event attendees
          </button>
          <button type="button" onClick={handleTabCreate} className={tabClass(tab === 'create')}>
            Create event
          </button>
        </div>

        {tab === 'search' && <SearchTab />}
        {tab === 'attendees' && <AttendeesTab />}
        {tab === 'create' && <CreateEventTab />}
      </div>
    </div>
  );
}
