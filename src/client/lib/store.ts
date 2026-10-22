import { useSyncExternalStore } from 'react';
import { toHome } from '../../shared/ledger.ts';
import type { Entry, EntryInput, Person, Rates, State, Trip } from '../../shared/types.ts';

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
};

export const KEY = {
  state: 'tb:state2',
  outbox: 'tb:outbox2',
  rates: 'tb:rates2',
  me: 'tb:me2',
  trip: 'tb:trip',
  lastCurrency: 'tb:lastCurrency',
};

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

let server: State = read<State>(KEY.state, { trips: [], entries: [] });
let outbox: Record<string, EntryInput> = read(KEY.outbox, {});
let rates: Rates = read(KEY.rates, {});
let me: Record<string, Person> = read(KEY.me, {});
let tripId: string | null = read<string | null>(KEY.trip, null);
let auth: View['auth'] = 'unknown';
let online = navigator.onLine;
let syncing = false;

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
  return {
    auth,
    online,
    syncing,
    trips: server.trips,
    trip,
    allEntries,
    entries: trip ? allEntries.filter((e) => e.tripId === trip.id) : [],
    pending: new Set(Object.keys(outbox)),
    rates: (trip && rates[trip.home]) || {},
    me: trip ? (me[trip.id] ?? null) : null,
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

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    auth = 'login';
    emit();
  }
  if (!res.ok)
    throw new HttpError(
      res.status,
      ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.statusText,
    );
  return (await res.json()) as T;
}

let syncQueued: Promise<void> | null = null;

export function sync(): Promise<void> {
  syncQueued ??= (async () => {
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
          if (err instanceof HttpError && err.status !== 401) {
            console.error('Rejected entry', input, err.message);
          } else throw err;
        }
      }
      server = await api<State>('GET', '/api/state');
      write(KEY.state, server);
      const live = new Set(server.trips.map((t) => t.id));
      for (const [id, input] of Object.entries(outbox))
        if (!live.has(input.tripId)) delete outbox[id];
      auth = 'ok';
      online = true;
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

export async function login(passcode: string): Promise<boolean> {
  try {
    await api('POST', '/api/login', { passcode });
    auth = 'ok';
    await sync();
    return true;
  } catch {
    return false;
  }
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
