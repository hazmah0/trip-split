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
