'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GuestSearchResult, LumaEvent, LumaGuest } from '@/services/lumaService';

// -- Types -------------------------------------------------------------------

interface CombinedAttendee {
  guest: LumaGuest;
  attendances: Array<{ event: LumaEvent; guest: LumaGuest }>;
}

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

// -- Helpers -----------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

function getGuestCompany(guest: LumaGuest): string | null {
  const answer = guest.registration_answers?.find(a => a.question_type === 'company');
  return answer?.answer_company ?? answer?.answer ?? null;
}

function getGuestLinkedin(guest: LumaGuest): string | null {
  if (!guest.registration_answers) return null;
  const byUrl = guest.registration_answers.find(
    a =>
      a.answer &&
      (a.answer.toLowerCase().includes('linkedin.com') ||
        a.answer.toLowerCase().startsWith('/in/') ||
        a.answer.toLowerCase().startsWith('in/'))
  );
  if (byUrl?.answer) return normalizeLinkedinUrl(byUrl.answer);
  const byLabel = guest.registration_answers.find(a =>
    a.label?.toLowerCase().includes('linkedin')
  );
  if (byLabel?.answer) return normalizeLinkedinUrl(byLabel.answer);
  return null;
}

function bestStatus(attendances: Array<{ event: LumaEvent; guest: LumaGuest }>): string {
  if (attendances.some(a => a.guest.checked_in_at)) return 'checked_in';
  const statuses = attendances.map(a => a.guest.approval_status);
  if (statuses.includes('approved')) return 'approved';
  if (statuses.includes('pending_approval')) return 'pending_approval';
  if (statuses.includes('waitlisted')) return 'waitlisted';
  if (statuses.includes('declined')) return 'declined';
  return statuses[0] ?? 'approved';
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

// -- PersonDetail ------------------------------------------------------------

interface CustomerInfo {
  isCustomer: boolean;
  arr: number | null;
  tShirtSize: string | null;
}

function PersonDetail({
  result,
  customerInfo,
  onBack,
}: {
  result: GuestSearchResult;
  customerInfo?: CustomerInfo | null;
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
          <div className="flex items-center gap-2">
            {customerInfo !== undefined && (
              customerInfo?.isCustomer ? (
                <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-800">
                  Customer
                </span>
              ) : customerInfo === null ? null : (
                <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
                  Not a customer
                </span>
              )
            )}
            <div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
              {result.events.length} event{result.events.length !== 1 ? 's' : ''}
            </div>
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
                  <StatusBadge
                    status={guest.checked_in_at ? 'checked_in' : guest.approval_status}
                  />
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

function SearchTab({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GuestSearchResult[]>([]);
  const [selected, setSelected] = useState<GuestSearchResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerInfoMap, setCustomerInfoMap] = useState<Map<string, CustomerInfo | null>>(new Map());

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;

    setLoading(true);
    setResults([]);
    setSelected(null);
    setSearched(false);
    setError(null);
    setCustomerInfoMap(new Map());

    try {
      const res = await fetch(`/api/luma/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }

      const list: GuestSearchResult[] = data.results ?? [];
      setResults(list);
      setSearched(true);
      if (list.length === 1) setSelected(list[0]);

      // Fetch Salesforce customer status for all results
      if (list.length > 0) {
        const emails = list.map(r => r.email.toLowerCase()).filter(Boolean);
        fetch('/api/salesforce/customer-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails }),
        })
          .then(r => r.json())
          .then(sfData => {
            if (!sfData.statuses) return;
            const map = new Map<string, CustomerInfo | null>();
            for (const r of list) {
              const key = r.email.toLowerCase();
              const s = sfData.statuses[key];
              map.set(key, s ? (s as CustomerInfo) : null);
            }
            setCustomerInfoMap(map);
          })
          .catch(() => {});
      }
    } catch {
      setError('Failed to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) performSearch(initialQuery);
    // Only run on mount — initialQuery is captured via key-based remount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      performSearch(query);
    },
    [query, performSearch]
  );

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleBack = useCallback(() => setSelected(null), []);

  const handleSelect = useCallback((result: GuestSearchResult) => setSelected(result), []);

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

      {!loading && results.length === 1 && selected && (
        <div className="mt-8">
          <PersonDetail
            result={selected}
            customerInfo={customerInfoMap.get(selected.email.toLowerCase())}
          />
        </div>
      )}

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

      {!loading && results.length > 1 && selected && (
        <div className="mt-8">
          <PersonDetail
            result={selected}
            customerInfo={customerInfoMap.get(selected.email.toLowerCase())}
            onBack={handleBack}
          />
        </div>
      )}
    </>
  );
}

// -- Event attendees tab -----------------------------------------------------

function AttendeesTab({ onSearchEmail }: { onSearchEmail?: (email: string) => void }) {
  const [events, setEvents] = useState<LumaEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState('');
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [guestsByEvent, setGuestsByEvent] = useState<Map<string, LumaGuest[]>>(new Map());
  const [loadingForEventIds, setLoadingForEventIds] = useState<Set<string>>(new Set());
  const [guestsError, setGuestsError] = useState<string | null>(null);
  const [attendeeFilter, setAttendeeFilter] = useState('');
  const [customerStatuses, setCustomerStatuses] = useState<
    Map<string, { isCustomer: boolean; arr: number | null; tShirtSize: string | null }>
  >(new Map());
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [sfError, setSfError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/luma/events')
      .then(r => r.json())
      .then(data => {
        if (data.events) setEvents(data.events);
        else setEventsError(data.error ?? 'Failed to load events');
      })
      .catch(() => setEventsError('Failed to load events'))
      .finally(() => setLoadingEvents(false));
  }, []);

  const handleToggleEvent = useCallback(
    async (eventId: string) => {
      if (selectedEventIds.includes(eventId)) {
        setSelectedEventIds(prev => prev.filter(id => id !== eventId));
        setGuestsByEvent(prev => {
          const next = new Map(prev);
          next.delete(eventId);
          return next;
        });
        return;
      }

      setSelectedEventIds(prev => [...prev, eventId]);
      setLoadingForEventIds(prev => new Set([...prev, eventId]));
      setGuestsError(null);

      try {
        const res = await fetch(`/api/luma/guests?event_id=${encodeURIComponent(eventId)}`);
        const data = await res.json();
        if (res.ok) {
          setGuestsByEvent(prev => {
            const next = new Map(prev);
            next.set(eventId, data.guests);
            return next;
          });
        } else {
          setGuestsError(data.error ?? 'Failed to load attendees');
          setSelectedEventIds(prev => prev.filter(id => id !== eventId));
        }
      } catch {
        setGuestsError('Failed to load attendees');
        setSelectedEventIds(prev => prev.filter(id => id !== eventId));
      } finally {
        setLoadingForEventIds(prev => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      }
    },
    [selectedEventIds]
  );

  const handleEventSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEventSearch(e.target.value);
  }, []);

  const handleAttendeeFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAttendeeFilter(e.target.value);
  }, []);

  const filteredEventList = useMemo(() => {
    if (!eventSearch.trim()) return events;
    const q = eventSearch.toLowerCase();
    return events.filter(e => e.name.toLowerCase().includes(q));
  }, [events, eventSearch]);

  const handleSelectAll = useCallback(() => {
    const toAdd = filteredEventList.filter(e => !selectedEventIds.includes(e.api_id));
    if (toAdd.length === 0) return;

    const ids = toAdd.map(e => e.api_id);
    setSelectedEventIds(prev => [...prev, ...ids]);
    setLoadingForEventIds(prev => new Set([...prev, ...ids]));
    setGuestsError(null);

    toAdd.forEach(async event => {
      try {
        const res = await fetch(`/api/luma/guests?event_id=${encodeURIComponent(event.api_id)}`);
        const data = await res.json();
        if (res.ok) {
          setGuestsByEvent(prev => {
            const next = new Map(prev);
            next.set(event.api_id, data.guests);
            return next;
          });
        } else {
          setSelectedEventIds(prev => prev.filter(id => id !== event.api_id));
        }
      } catch {
        setSelectedEventIds(prev => prev.filter(id => id !== event.api_id));
      } finally {
        setLoadingForEventIds(prev => {
          const next = new Set(prev);
          next.delete(event.api_id);
          return next;
        });
      }
    });
  }, [filteredEventList, selectedEventIds]);

  const handleClearAll = useCallback(() => {
    setSelectedEventIds([]);
    setGuestsByEvent(new Map());
    setLoadingForEventIds(new Set());
  }, []);

  // Merge all selected events' guests, deduped by email
  const combinedAttendees = useMemo((): CombinedAttendee[] => {
    const byEmail = new Map<string, CombinedAttendee>();

    for (const eventId of selectedEventIds) {
      const event = events.find(e => e.api_id === eventId);
      const guests = guestsByEvent.get(eventId) ?? [];
      if (!event) continue;

      for (const guest of guests) {
        const key = (guest.email ?? guest.user_email ?? guest.api_id).toLowerCase();
        const existing = byEmail.get(key);
        if (existing) {
          existing.attendances.push({ event, guest });
        } else {
          byEmail.set(key, { guest, attendances: [{ event, guest }] });
        }
      }
    }

    return Array.from(byEmail.values());
  }, [selectedEventIds, guestsByEvent, events]);

  // Fetch Salesforce customer status whenever the attendee list changes
  useEffect(() => {
    if (combinedAttendees.length === 0) {
      setCustomerStatuses(new Map());
      return;
    }

    const emails = combinedAttendees
      .map(({ guest }) => (guest.email ?? guest.user_email ?? '').toLowerCase().trim())
      .filter(Boolean);

    if (emails.length === 0) return;

    setLoadingCustomer(true);
    setSfError(null);
    fetch('/api/salesforce/customer-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `Salesforce HTTP ${r.status}`);
        return data;
      })
      .then(data => {
        if (!data.statuses) return;
        const map = new Map<string, { isCustomer: boolean; arr: number | null; tShirtSize: string | null }>();
        for (const [email, status] of Object.entries(data.statuses)) {
          map.set(email, status as { isCustomer: boolean; arr: number | null; tShirtSize: string | null });
        }
        setCustomerStatuses(map);
      })
      .catch((err: unknown) => {
        setSfError(String(err));
      })
      .finally(() => setLoadingCustomer(false));
  }, [combinedAttendees]);

  const filteredAttendees = useMemo(() => {
    if (!attendeeFilter.trim()) return combinedAttendees;
    const q = attendeeFilter.toLowerCase();
    return combinedAttendees.filter(({ guest }) => {
      const name = (guest.name ?? guest.user_name ?? '').toLowerCase();
      const email = (guest.email ?? guest.user_email ?? '').toLowerCase();
      const company = (getGuestCompany(guest) ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || company.includes(q);
    });
  }, [combinedAttendees, attendeeFilter]);

  const isLoadingGuests = loadingForEventIds.size > 0;
  const multiEvent = selectedEventIds.length > 1;

  if (loadingEvents) return <div className="text-sm text-gray-400">Loading events…</div>;
  if (eventsError) return <ErrorBanner message={eventsError} />;

  return (
    <div className="space-y-6">
      {/* Event picker with checkboxes */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <input
            type="text"
            value={eventSearch}
            onChange={handleEventSearchChange}
            placeholder="Filter events…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={filteredEventList.every(e => selectedEventIds.includes(e.api_id))}
            className="shrink-0 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-300"
          >
            Select all
          </button>
          {selectedEventIds.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filteredEventList.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">No events match</div>
          ) : (
            filteredEventList.map(event => {
              const isSelected = selectedEventIds.includes(event.api_id);
              const isLoadingThis = loadingForEventIds.has(event.api_id);
              return (
                <label
                  key={event.api_id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isLoadingThis}
                    onChange={() => handleToggleEvent(event.api_id)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                  <span className="flex-1 text-sm text-gray-700">{event.name}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {isLoadingThis ? 'Loading…' : formatShortDate(event.start_at)}
                  </span>
                </label>
              );
            })
          )}
        </div>
        {selectedEventIds.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
            {selectedEventIds.length} event{selectedEventIds.length !== 1 ? 's' : ''} selected
            {isLoadingGuests && ' · Loading…'}
          </div>
        )}
      </div>

      {guestsError && <ErrorBanner message={guestsError} />}
      {sfError && <ErrorBanner message={`Salesforce error: ${sfError}`} />}

      {!isLoadingGuests && selectedEventIds.length > 0 && combinedAttendees.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          No attendees found for the selected event{multiEvent ? 's' : ''}.
        </div>
      )}

      {!isLoadingGuests && combinedAttendees.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={attendeeFilter}
              onChange={handleAttendeeFilterChange}
              placeholder="Filter by name, email, or company…"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />
            <span className="shrink-0 text-sm text-gray-400">
              {filteredAttendees.length}
              {filteredAttendees.length !== combinedAttendees.length &&
                ` of ${combinedAttendees.length}`}{' '}
              attendee{filteredAttendees.length !== 1 ? 's' : ''}
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
                  <th className="px-5 py-3">Customer</th>
                  {multiEvent && <th className="px-5 py-3 text-right"># Events</th>}
                  {multiEvent ? (
                    <th className="px-5 py-3">Events attended</th>
                  ) : (
                    <th className="px-5 py-3">Registered</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAttendees.map(({ guest, attendances }) => {
                  const linkedin = getGuestLinkedin(guest);
                  const company = getGuestCompany(guest);
                  const status = bestStatus(attendances);
                  const email = guest.email ?? guest.user_email ?? '';

                  return (
                    <tr key={guest.api_id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5 font-medium text-gray-900">
                        {guest.name ?? guest.user_name ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {email ? (
                          onSearchEmail ? (
                            <button
                              type="button"
                              onClick={() => onSearchEmail(email)}
                              className="text-left hover:text-blue-600 hover:underline"
                            >
                              {email}
                            </button>
                          ) : (
                            <a href={`mailto:${email}`} className="hover:text-gray-700">
                              {email}
                            </a>
                          )
                        ) : (
                          '—'
                        )}
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
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-5 py-3.5">
                        {loadingCustomer ? (
                          <span className="text-xs text-gray-300">…</span>
                        ) : (() => {
                          const cs = customerStatuses.get(email.toLowerCase());
                          if (!cs) return <span className="text-xs text-gray-300">—</span>;
                          return cs.isCustomer ? (
                            <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-800">
                              Yes
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No</span>
                          );
                        })()}
                      </td>
                      {multiEvent && (
                        <td className="px-5 py-3.5 text-right text-sm font-medium text-gray-700">
                          {attendances.length}
                          <span className="font-normal text-gray-400">
                            /{selectedEventIds.length}
                          </span>
                        </td>
                      )}
                      {multiEvent ? (
                        <td className="px-5 py-3.5 text-xs text-gray-500">
                          <div className="space-y-0.5">
                            {attendances.map(a => (
                              <div key={a.event.api_id}>{a.event.name}</div>
                            ))}
                          </div>
                          {attendances.length < selectedEventIds.length && (
                            <div className="mt-0.5 text-gray-300">
                              {attendances.length}/{selectedEventIds.length} events
                            </div>
                          )}
                        </td>
                      ) : (
                        <td className="px-5 py-3.5 text-gray-500">
                          {formatDate(attendances[0]?.guest.registered_at ?? '')}
                        </td>
                      )}
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

// -- Page --------------------------------------------------------------------

type Tab = 'search' | 'attendees';

export default function EventsDashboard() {
  const [tab, setTab] = useState<Tab>('search');
  const [searchEmail, setSearchEmail] = useState('');
  const [searchKey, setSearchKey] = useState(0);

  const handleTabSearch = useCallback(() => setTab('search'), []);
  const handleTabAttendees = useCallback(() => setTab('attendees'), []);

  const handleSearchEmail = useCallback((email: string) => {
    setSearchEmail(email);
    setSearchKey(prev => prev + 1);
    setTab('search');
  }, []);

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
        </div>

        {tab === 'search' && <SearchTab key={searchKey} initialQuery={searchEmail} />}
        {tab === 'attendees' && <AttendeesTab onSearchEmail={handleSearchEmail} />}
      </div>
    </div>
  );
}
