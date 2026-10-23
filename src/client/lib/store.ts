import { useSyncExternalStore } from 'react';
import { toHome } from '../../shared/ledger.ts';
import { TRIP_GONE } from '../../shared/types.ts';
import type { Entry, EntryInput, Person, Rates, State, Trip } from '../../shared/types.ts';
import { HttpError, request } from './api.ts';
import { KEY, read, write } from './storage.ts';

export type View = {
  auth: 'unknown' | 'ok' | 'login';
  online: boolean;
  syncing: boolean;
  trips: Trip[];
  trip: Trip | null;
  allEntries: Entry[];
  entries: Entry[];
  pending: Set<string>;
  rates: Record<string, number>;
  me: Person | null;
  owner: boolean;
  invite: string | null;
  joinFailed: boolean;
};

function readCachedState(): State {
  return {
    invites: {},
    owner: false,
    ...read<Omit<State, 'invites' | 'owner'>>(KEY.state, { trips: [], entries: [] }),
  };
}

let server: State = readCachedState();
let outbox: Record<string, EntryInput> = read(KEY.outbox, {});
let rates: Rates = read(KEY.rates, {});
let me: Record<string, Person> = read(KEY.me, {});
let tripId: string | null = read<string | null>(KEY.trip, null);
let auth: View['auth'] = 'unknown';
let online = navigator.onLine;
let syncing = false;
let joinFailed = false;

const listeners = new Set<() => void>();
let view = compute();

function compute(): View {
  const tripsById = new Map(server.trips.map((t) => [t.id, t]));
  const byId = new Map(server.entries.map((e) => [e.id, e]));
  for (const input of Object.values(outbox)) {
    const home = tripsById.get(input.tripId)?.home;
    if (!home) continue;
    const rate =
      input.currency === home
        ? 1
        : (input.rate ?? rates[home]?.[input.currency] ?? byId.get(input.id)?.rate ?? 0);
    byId.set(input.id, { ...input, rate, home: toHome(input.amount, input.currency, rate, home) });
  }
  const allEntries = [...byId.values()]
    .filter((e) => !e.deleted && tripsById.has(e.tripId))
    .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : a.date < b.date ? 1 : -1));
  const trip = (tripId && tripsById.get(tripId)) || server.trips.at(-1) || null;
  const visibleOutbox = Object.values(outbox).filter((i) => tripsById.has(i.tripId));
  return {
    auth,
    online,
    syncing,
    trips: server.trips,
    trip,
    allEntries,
    entries: trip ? allEntries.filter((e) => e.tripId === trip.id) : [],
    pending: new Set(visibleOutbox.map((i) => i.id)),
    rates: (trip && rates[trip.home]) || {},
    me: trip ? (me[trip.id] ?? null) : null,
    owner: server.owner,
    invite: (trip && server.invites[trip.id]) ?? null,
    joinFailed,
  };
}

function emit() {
  view = compute();
  for (const l of listeners) l();
}

export function useStore(): View {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => view,
  );
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await request<T>(method, path, body);
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      auth = 'login';
      emit();
    }
    throw err;
  }
}

let events: EventSource | null = null;

// Every sync revives a closed stream, since EventSource gives up for good on a 401 or an error status.
function listen() {
  if (events && events.readyState !== EventSource.CLOSED) return;
  events = new EventSource('/api/events');
  events.addEventListener('change', () => void sync());
  events.addEventListener('open', () => void sync());
}

let syncQueued: Promise<void> | null = null;
let syncAgain: Promise<void> | null = null;

export function sync(): Promise<void> {
  if (syncQueued)
    return (syncAgain ??= syncQueued.then(() => {
      syncAgain = null;
      return sync();
    }));
  syncQueued = (async () => {
    syncing = true;
    emit();
    try {
      for (const input of Object.values(outbox)) {
        try {
          const saved = await api<Entry>(
            'PUT',
            `/api/entries/${encodeURIComponent(input.id)}`,
            input,
          );
          // Only drop it if the user didn't edit it again while the request was in flight.
          if (outbox[input.id]?.updatedAt === input.updatedAt) delete outbox[input.id];
          server = {
            ...server,
            entries: [...server.entries.filter((e) => e.id !== saved.id), saved],
          };
        } catch (err) {
          if (!(err instanceof HttpError) || err.status === 401) throw err;
          if (err.status === TRIP_GONE) delete outbox[input.id];
          else console.error('Rejected entry', input, err.message);
        }
      }
      server = await api<State>('GET', '/api/state');
      write(KEY.state, server);
      auth = 'ok';
      online = true;
      listen();
      if (server.trips.some((t) => t.locals.length)) {
        rates = await api<Rates>('GET', '/api/rates');
        write(KEY.rates, rates);
      }
    } catch (err) {
      if (!(err instanceof HttpError)) online = false;
    } finally {
      write(KEY.outbox, outbox);
      syncing = false;
      syncQueued = null;
      emit();
    }
  })();
  return syncQueued;
}

export function saveEntry(input: Omit<EntryInput, 'updatedAt'>) {
  outbox[input.id] = { ...input, updatedAt: Date.now() };
  write(KEY.outbox, outbox);
  emit();
  void sync();
}

export function deleteEntry(entry: Entry) {
  const { home: _home, ...rest } = entry;
  saveEntry({ ...rest, rate: null, deleted: true });
}

export async function saveTrip(trip: Omit<Trip, 'updatedAt'>) {
  const saved = await api<Trip>('PUT', `/api/trips/${encodeURIComponent(trip.id)}`, {
    ...trip,
    updatedAt: Date.now(),
  });
  const trips = server.trips.filter((t) => t.id !== saved.id);
  server = { ...server, trips: saved.deleted ? trips : [...trips, saved] };
  write(KEY.state, server);
  if (!saved.deleted) selectTrip(saved.id);
  else emit();
  void sync();
}

export function selectTrip(id: string) {
  tripId = id;
  write(KEY.trip, id);
  emit();
}

export const inviteUrl = (code: string) => `${location.origin}/#join=${code}`;
const inviteCode = (text: string) => text.match(/#join=([\w-]+)/)?.[1];

export async function login(linkCodeOrPasscode: string): Promise<boolean> {
  const code = inviteCode(linkCodeOrPasscode) ?? linkCodeOrPasscode.trim();
  let joined: { tripId: string | null } | null = null;
  try {
    joined = await api<{ tripId: string | null }>('POST', '/api/login', { code });
  } catch (err) {
    const offline = !(err instanceof HttpError);
    if (offline) {
      await sync();
      return false;
    }
  }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (joined) {
    auth = 'ok';
    joinFailed = false;
    events?.close();
    listen();
  }
  await sync();
  if (joined?.tripId) selectTrip(joined.tripId);
  return joined !== null;
}

export async function boot() {
  const code = inviteCode(location.hash);
  if (!code) return sync();
  // Offline keeps #join= for a retry, so only a server rejection counts as failed.
  joinFailed = !(await login(code)) && online;
  emit();
}

export async function rotateInvite(id: string) {
  const { code } = await api<{ code: string }>(
    'POST',
    `/api/trips/${encodeURIComponent(id)}/invite`,
  );
  server = { ...server, invites: { ...server.invites, [id]: code } };
  write(KEY.state, server);
  emit();
}

export function setMe(trip: string, p: Person) {
  me = { ...me, [trip]: p };
  write(KEY.me, me);
  emit();
}

window.addEventListener('online', () => void sync());
window.addEventListener('offline', () => {
  online = false;
  emit();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void sync();
});
setInterval(() => void sync(), 60_000);
