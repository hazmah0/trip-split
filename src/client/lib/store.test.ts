import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EntryInput, State, Trip } from '../../shared/types.ts';
import { start } from '../../server/main.ts';

const realFetch = globalThis.fetch;
const storage = new Map<string, string>();
const jar = new Map<string, string>();
const dir = mkdtempSync(join(tmpdir(), 'trip-split-store-'));
let app: Awaited<ReturnType<typeof start>>;
let store: typeof import('./store.ts');
const streams: FakeEventSource[] = [];
class FakeEventSource extends EventTarget {
  static CLOSED = 2;
  readyState = 1;
  url: string;
  constructor(url: string) {
    super();
    this.url = url;
    streams.push(this);
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

beforeAll(async () => {
  app = await start({ port: 0, dataDir: join(dir, 'data'), passcode: 'hunter2', distDir: dir });
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    if (path.startsWith('https://')) throw new TypeError('fetch failed');
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await realFetch(app.url + path, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), cookie },
    });
    for (const c of res.headers.getSetCookie()) {
      const [name, value] = c.split(';')[0]!.split('=') as [string, string];
      jar.set(name, value);
    }
    return res;
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
  vi.stubGlobal('location', {
    hash: '',
    pathname: '/',
    search: '',
    origin: 'https://trips.example',
  });
  store = await import('./store.ts');
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const entry = (id: string, currency: string, tripId = 't'): Omit<EntryInput, 'updatedAt'> => ({
  id,
  tripId,
  kind: 'expense',
  date: '2026-08-01',
  title: id,
  category: 'food',
  amount: 10000,
  currency,
  rate: null,
  rateManual: false,
  paidBy: 0,
  shares: [1, 1],
  deleted: false,
});
const trip = (id: string): Omit<Trip, 'updatedAt'> => ({
  id,
  name: 'Seoul',
  names: ['Ada', 'Bo'],
  home: 'SEK',
  locals: ['KRW'],
  budget: null,
  deleted: false,
});
const outbox = () => Object.keys(JSON.parse(storage.get('tb:outbox2')!) as object).sort();
const cached = () => JSON.parse(storage.get('tb:state2')!) as State;
const queued = (id: string) =>
  (JSON.parse(storage.get('tb:outbox2')!) as Record<string, EntryInput>)[id];

test('without a session (401), sync leaves the outbox and the cached state alone', async () => {
  store.saveEntry(entry('early', 'SEK', 'old'));
  await store.sync();
  expect(outbox()).toStrictEqual(['early']);
  expect(storage.has('tb:state2')).toBe(false);
});

test('an entry whose trip does not exist (410) is dropped once signed in', async () => {
  expect(await store.login('hunter2')).toBe(true);
  expect(outbox()).toStrictEqual([]);
  expect(cached().owner).toBe(true);
});

test('an entry the server cannot price stays queued without blocking the rest of the sync', async () => {
  await store.saveTrip(trip('t'));
  store.saveEntry(entry('krw', 'KRW'));
  store.saveEntry(entry('sek', 'SEK'));
  await store.sync();
  await store.sync();

  const server = (await (await fetch('/api/state')).json()) as State;
  expect(server.entries.map((e) => e.id)).toStrictEqual(['sek']);
  expect(outbox()).toStrictEqual(['krw']);
  expect(
    cached().entries.map((e) => e.id),
    'state was pulled after the failed entry',
  ).toStrictEqual(['sek']);
});

test('a pasted invite link joins its trip, and an entry for another trip (403) stays queued', async () => {
  await store.saveTrip(trip('u'));
  const code = cached().invites.t!;
  jar.clear();
  const link = store.inviteUrl(code);
  expect(new URL(link).hash, 'the code stays out of the request URL').toBe(`#join=${code}`);
  expect(await store.login(`  ${link}\n`)).toBe(true);
  expect(cached().trips.map((t) => t.id)).toStrictEqual(['t']);
  expect(cached().owner).toBe(false);
  store.saveEntry(entry('other', 'SEK', 'u'));
  await store.sync();
  expect(outbox()).toStrictEqual(['krw', 'other']);
});

test('a sync requested while one is running runs again afterwards', async () => {
  const running = store.sync();
  store.saveEntry(entry('late', 'SEK'));
  await store.sync();
  await running;
  expect(outbox(), 'the entry saved mid-sync was sent').not.toContain('late');
});

const asOwner = async (path: string, init: RequestInit = {}) => {
  const login = await realFetch(`${app.url}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ code: 'hunter2' }),
  });
  const cookie = login.headers.getSetCookie()[0]!.split(';')[0]!;
  return realFetch(app.url + path, { ...init, headers: { cookie } });
};

test('a change pushed by the server pulls in what another traveller saved', async () => {
  await asOwner('/api/entries/elsewhere', {
    method: 'PUT',
    body: JSON.stringify({ ...entry('elsewhere', 'SEK'), updatedAt: Date.now() }),
  });
  const live = streams.at(-1)!;
  expect(live.url).toBe('/api/events');
  live.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(cached().entries.map((e) => e.id)).toContain('elsewhere'));
});

test('joining another trip reopens the live stream, so it covers the new trip', async () => {
  const { invites } = (await (await asOwner('/api/state')).json()) as State;
  const opened = streams.length;
  const before = streams.at(-1)!;
  expect(await store.login(invites.u!)).toBe(true);
  expect(before.readyState, 'the stream opened with the old cookies is closed').toBe(
    FakeEventSource.CLOSED,
  );
  expect(streams.length, 'exactly one new stream').toBe(opened + 1);
  expect(streams.at(-1)!.readyState).not.toBe(FakeEventSource.CLOSED);
});

test('saving stamps who added an entry, and an edit keeps that and stamps the editor', async () => {
  store.setMe('u', 1);
  store.saveEntry(entry('mine', 'SEK', 'u'));
  expect(queued('mine')).toMatchObject({ addedBy: 1 });
  expect(queued('mine')).not.toHaveProperty('editedBy');
  await store.sync();
  expect(
    cached().entries.find((e) => e.id === 'mine'),
    'synced',
  ).toMatchObject({ addedBy: 1 });

  store.setMe('u', 0);
  store.saveEntry({ ...entry('mine', 'SEK', 'u'), title: 'edited' });
  expect(queued('mine')).toMatchObject({ addedBy: 1, editedBy: 0 });
});
