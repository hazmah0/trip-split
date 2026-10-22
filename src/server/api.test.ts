import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EntryInput, State, Trip } from '../shared/types.ts';
import { start } from './main.ts';

const FX: Record<string, Record<string, number>> = {
  SEK: { KRW: 133.57, JPY: 15.836 },
  EUR: { KRW: 1580.2, JPY: 172.4 },
};
const realFetch = globalThis.fetch;
const frankfurterCalls: string[] = [];
let frankfurterDown = false;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('https://api.frankfurter.dev/')) return realFetch(input, init);
  frankfurterCalls.push(url);
  if (frankfurterDown) throw new TypeError('fetch failed');
  if (url.endsWith('/currencies'))
    return Response.json({
      EUR: 'Euro',
      JPY: 'Japanese Yen',
      KRW: 'South Korean Won',
      SEK: 'Swedish Krona',
    });
  const base = new URL(url).searchParams.get('base')!;
  return Response.json({ amount: 1, base, date: '2026-10-22', rates: FX[base] });
};

const dir = mkdtempSync(join(tmpdir(), 'trip-split-test-'));
const dist = join(dir, 'dist');
mkdirSync(join(dist, 'assets'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<!doctype html>app');
writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
writeFileSync(join(dir, 'secret.txt'), 'secret');

let app: Awaited<ReturnType<typeof start>>;
let cookie = '';
beforeAll(async () => {
  app = await start({ port: 0, dataDir: join(dir, 'data'), passcode: 'hunter2', distDir: dist });
});
afterAll(async () => {
  await app.close();
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

const api = (path: string, method = 'GET', body?: unknown) =>
  realFetch(app.url + path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const trip = (p: Partial<Trip> = {}): Trip => ({
  id: 'a',
  name: 'Korea & Japan',
  names: ['Ada', 'Bo'],
  home: 'SEK',
  locals: ['KRW', 'JPY'],
  budget: 5000000,
  updatedAt: 1000,
  deleted: false,
  ...p,
});
const state = async () => (await (await api('/api/state')).json()) as State;
const entry = (p: Partial<EntryInput> = {}): EntryInput => ({
  id: 'e1',
  tripId: 'a',
  kind: 'expense',
  date: '2026-10-20',
  title: 'bibimbap',
  category: 'food',
  amount: 15000,
  currency: 'KRW',
  rate: null,
  rateManual: false,
  paidBy: 0,
  shares: [1, 1],
  updatedAt: 1000,
  deleted: false,
  ...p,
});

test('health needs no auth', async () => {
  expect((await api('/api/health')).status).toBe(200);
});

test('auth gate: 401 without cookie, wrong passcode rejected, right passcode sets a session cookie', async () => {
  expect((await api('/api/state')).status).toBe(401);
  expect((await api('/api/login', 'POST', { passcode: 'nope' })).status).toBe(401);
  const res = await api('/api/login', 'POST', { passcode: 'hunter2' });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/SameSite=Lax/);
  expect(setCookie).not.toMatch(/hunter2/);
  cookie = setCookie.split(';')[0]!;
  expect((await api('/api/state')).status).toBe(200);
});

test('a trip saves and comes back in state, with its name trimmed', async () => {
  expect(await state()).toStrictEqual({ trips: [], entries: [] });
  const res = await api('/api/trips/a', 'PUT', trip({ name: '  Korea & Japan ' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toStrictEqual(trip());
  expect((await state()).trips).toStrictEqual([trip()]);
});

test('a stale or repeated trip updatedAt returns the stored trip unchanged', async () => {
  expect(
    (await (await api('/api/trips/a', 'PUT', trip({ name: 'old', updatedAt: 999 }))).json()).name,
  ).toBe('Korea & Japan');
  expect((await (await api('/api/trips/a', 'PUT', trip({ name: 'retry' }))).json()).name).toBe(
    'Korea & Japan',
  );
  expect((await state()).trips).toStrictEqual([trip()]);
});

test('KRW entry gets the inverted ECB rate for its date and the right home amount', async () => {
  const res = await api('/api/entries/e1', 'PUT', entry());
  expect(res.status).toBe(200);
  const stored = await res.json();
  expect(stored.rate).toBe(1 / 133.57);
  expect(stored.home).toBe(11230);
  expect(frankfurterCalls).toContain(
    'https://api.frankfurter.dev/v1/2026-10-20?base=SEK&symbols=KRW',
  );
  expect((await state()).entries).toStrictEqual([stored]);
  expect(stored.tripId).toBe('a');
});

test('a home-currency entry has rate 1 and a manual rate is kept', async () => {
  const sek = await (
    await api(
      '/api/entries/e2',
      'PUT',
      entry({ id: 'e2', currency: 'SEK', amount: 9900, rate: 0.5 }),
    )
  ).json();
  expect([sek.rate, sek.home]).toStrictEqual([1, 9900]);
  const manual = await (
    await api('/api/entries/e3', 'PUT', entry({ id: 'e3', rate: 0.008, rateManual: true }))
  ).json();
  expect([manual.rate, manual.home]).toStrictEqual([0.008, 12000]);
});

test('state lists entries by date desc, then updatedAt desc', async () => {
  await api(
    '/api/entries/e4',
    'PUT',
    entry({ id: 'e4', date: '2026-10-21', currency: 'SEK', amount: 100 }),
  );
  const ids = (await state()).entries.map((e) => e.id);
  expect(ids.slice(0, 1)).toStrictEqual(['e4']);
  expect(new Set(ids)).toStrictEqual(new Set(['e1', 'e2', 'e3', 'e4']));
});

test('a stale or repeated updatedAt returns the stored entry unchanged', async () => {
  const stale = await api('/api/entries/e1', 'PUT', entry({ title: 'old', updatedAt: 999 }));
  expect((await stale.json()).title).toBe('bibimbap');
  const retry = await api('/api/entries/e1', 'PUT', entry({ title: 'retry', updatedAt: 1000 }));
  expect((await retry.json()).title).toBe('bibimbap');
  const newer = await api('/api/entries/e1', 'PUT', entry({ title: 'new', updatedAt: 1001 }));
  expect((await newer.json()).title).toBe('new');
});

test('a note is stored, and leaving it out on a later write clears it', async () => {
  const noted = await api(
    '/api/entries/e5',
    'PUT',
    entry({ id: 'e5', note: 'Card declined, Bo paid cash' }),
  );
  expect((await noted.json()).note).toBe('Card declined, Bo paid cash');
  const cleared = await api('/api/entries/e5', 'PUT', entry({ id: 'e5', updatedAt: 1001 }));
  expect((await cleared.json()).note).toBeUndefined();
  await api('/api/entries/e5', 'PUT', entry({ id: 'e5', deleted: true, updatedAt: 1002 }));
});

test('delete keeps a tombstone and drops the entry from state', async () => {
  const res = await api('/api/entries/e1', 'PUT', entry({ deleted: true, updatedAt: 2000 }));
  expect((await res.json()).deleted).toBe(true);
  const ids = (await state()).entries.map((e) => e.id);
  expect(ids).not.toContain('e1');
  const resurrect = await api('/api/entries/e1', 'PUT', entry({ updatedAt: 1500 }));
  expect((await resurrect.json()).deleted, 'an older write cannot undelete').toBe(true);
});

test('invalid input is rejected with 400', async () => {
  const cases: Partial<EntryInput>[] = [
    { id: 'other' },
    { amount: 0 },
    { amount: 1.5 },
    { currency: 'USD' },
    { shares: [] },
    { shares: [0, 0] },
    { shares: [1, 1, 1] },
    { shares: [1.5, 1] },
    { date: '2026-02-30' },
    { category: 'bribes' as never },
    { paidBy: 2 as never },
    { rate: -1 },
    { note: 'x'.repeat(1001) },
  ];
  for (const c of cases) {
    const res = await api('/api/entries/bad', 'PUT', entry({ id: 'bad', ...c }));
    expect(res.status, JSON.stringify(c)).toBe(400);
  }
  expect(
    (await api('/api/entries/bad', 'PUT', entry({ id: 'bad', tripId: 1 as never }))).status,
  ).toBe(400);
  const tripCases: Partial<Trip>[] = [
    { id: 'other' },
    { name: '   ' },
    { name: 'x'.repeat(81) },
    { names: ['Ada', ''] },
    { names: ['Ada'] },
    { home: 'sek' },
    { locals: ['SEK'] },
    { locals: ['KRW', 'KRW'] },
    { budget: -1 },
    { updatedAt: 1.5 },
    { deleted: 'no' as never },
  ];
  for (const c of tripCases) {
    const res = await api('/api/trips/bad', 'PUT', trip({ id: 'bad', ...c }));
    expect(res.status, JSON.stringify(c)).toBe(400);
  }
  const raw = await realFetch(`${app.url}/api/entries/bad`, {
    method: 'PUT',
    headers: { cookie },
    body: '{',
  });
  expect(raw.status).toBe(400);
});

test('home currency cannot change once the trip has entries, but can before', async () => {
  expect((await api('/api/trips/a', 'PUT', trip({ home: 'EUR', updatedAt: 1100 }))).status).toBe(
    409,
  );
  expect((await state()).trips[0]!.home).toBe('SEK');
  expect((await api('/api/trips/a', 'PUT', trip({ budget: null, updatedAt: 1100 }))).status).toBe(
    200,
  );
  await api('/api/trips/b', 'PUT', trip({ id: 'b', name: 'Tokyo', locals: ['JPY'] }));
  const moved = await api(
    '/api/trips/b',
    'PUT',
    trip({ id: 'b', name: 'Tokyo', home: 'EUR', locals: ['JPY'], updatedAt: 1001 }),
  );
  expect(moved.status).toBe(200);
  expect((await moved.json()).home).toBe('EUR');
});

test('an entry needs a live trip: unknown or deleted trip is 409', async () => {
  expect((await api('/api/entries/x1', 'PUT', entry({ id: 'x1', tripId: 'nope' }))).status).toBe(
    409,
  );
  await api('/api/trips/gone', 'PUT', trip({ id: 'gone', deleted: true }));
  expect((await api('/api/entries/x1', 'PUT', entry({ id: 'x1', tripId: 'gone' }))).status).toBe(
    409,
  );
});

test('entry currency is checked against its own trip', async () => {
  await api('/api/trips/k', 'PUT', trip({ id: 'k', name: 'Seoul', locals: ['KRW'] }));
  expect(
    (await api('/api/entries/k1', 'PUT', entry({ id: 'k1', tripId: 'k', currency: 'JPY' }))).status,
  ).toBe(400);
  expect(
    (await api('/api/entries/k1', 'PUT', entry({ id: 'k1', tripId: 'k', currency: 'KRW' }))).status,
  ).toBe(200);
});

test('a trip currency without ECB rates is rejected, so its expenses can never get stuck', async () => {
  const res = await api('/api/trips/v', 'PUT', trip({ id: 'v', name: 'Hanoi', locals: ['VND'] }));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/VND/);
});

test('a tombstone needs no rate lookup, even for an entry the server never saw', async () => {
  frankfurterDown = true;
  try {
    const res = await api(
      '/api/entries/t1',
      'PUT',
      entry({ id: 't1', currency: 'JPY', date: '2026-08-01', deleted: true }),
    );
    expect(res.status).toBe(200);
  } finally {
    frankfurterDown = false;
  }
});

test('trip tombstone hides the trip and its entries from state', async () => {
  await api(
    '/api/trips/k',
    'PUT',
    trip({ id: 'k', name: 'Seoul', locals: ['KRW'], deleted: true, updatedAt: 2000 }),
  );
  const s = await state();
  expect(s.trips.map((t) => t.id)).not.toContain('k');
  expect(s.entries.map((e) => e.id)).not.toContain('k1');
  expect(
    s.entries.map((e) => e.tripId),
    'other trips keep their entries',
  ).toContain('a');
  const undelete = await api(
    '/api/trips/k',
    'PUT',
    trip({ id: 'k', name: 'Seoul', locals: ['KRW'], updatedAt: 1500 }),
  );
  expect((await undelete.json()).deleted, 'an older write cannot undelete').toBe(true);
});

test('trips with different homes price entries in their own home', async () => {
  await api('/api/trips/e', 'PUT', trip({ id: 'e', name: 'Busan', home: 'EUR', locals: ['KRW'] }));
  const krw = await (
    await api('/api/entries/eur1', 'PUT', entry({ id: 'eur1', tripId: 'e' }))
  ).json();
  expect(krw.rate).toBe(1 / 1580.2);
  expect(krw.home).toBe(949);
  expect(frankfurterCalls).toContain(
    'https://api.frankfurter.dev/v1/2026-10-20?base=EUR&symbols=KRW',
  );
  const eur = await (
    await api(
      '/api/entries/eur2',
      'PUT',
      entry({ id: 'eur2', tripId: 'e', currency: 'EUR', amount: 500 }),
    )
  ).json();
  expect([eur.rate, eur.home]).toStrictEqual([1, 500]);
  expect(
    (await api('/api/entries/eur3', 'PUT', entry({ id: 'eur3', tripId: 'e', currency: 'SEK' })))
      .status,
  ).toBe(400);
});

test('a group trip takes entries paid by and split across any traveller', async () => {
  await api(
    '/api/trips/g',
    'PUT',
    trip({ id: 'g', name: 'Tokyo crew', names: ['Ada', 'Bo', 'Cy', 'Di'] }),
  );
  const res = await api(
    '/api/entries/g1',
    'PUT',
    entry({ id: 'g1', tripId: 'g', currency: 'SEK', paidBy: 3, shares: [1, 0, 2, 1] }),
  );
  expect(res.status).toBe(200);
  expect((await res.json()).shares).toStrictEqual([1, 0, 2, 1]);
  expect(
    (await api('/api/entries/g2', 'PUT', entry({ id: 'g2', tripId: 'g', paidBy: 4 }))).status,
  ).toBe(400);
});

test('travellers can be added any time, but removed only while the trip has no entries', async () => {
  const grow = await api(
    '/api/trips/g',
    'PUT',
    trip({ id: 'g', name: 'Tokyo crew', names: ['Ada', 'Bo', 'Cy', 'Di', 'Ed'], updatedAt: 1001 }),
  );
  expect(grow.status).toBe(200);
  const shrink = await api(
    '/api/trips/g',
    'PUT',
    trip({ id: 'g', name: 'Tokyo crew', names: ['Ada', 'Bo', 'Cy', 'Di'], updatedAt: 1002 }),
  );
  expect(shrink.status).toBe(409);
  await api('/api/trips/h', 'PUT', trip({ id: 'h', name: 'Empty', names: ['Ada', 'Bo', 'Cy'] }));
  expect(
    (await api('/api/trips/h', 'PUT', trip({ id: 'h', name: 'Empty', updatedAt: 1001 }))).status,
  ).toBe(200);
});

test('rate lookup falls back to the cache, and fails with 502 when nothing is cached', async () => {
  frankfurterDown = true;
  try {
    const cached = await api('/api/entries/e5', 'PUT', entry({ id: 'e5', date: '2026-09-01' }));
    expect((await cached.json()).rate).toBe(1 / 133.57);
    expect((await api('/api/entries/e6', 'PUT', entry({ id: 'e6', currency: 'JPY' }))).status).toBe(
      502,
    );
  } finally {
    frankfurterDown = false;
  }
});

test('rates returns latest home units per local, per home, over the union of live trips', async () => {
  expect(await (await api('/api/rates')).json()).toStrictEqual({
    SEK: { KRW: 1 / 133.57, JPY: 1 / 15.836 },
    EUR: { JPY: 1 / 172.4, KRW: 1 / 1580.2 },
  });
});

test('latest rates are fetched once and shared across syncs', async () => {
  await api('/api/rates');
  const calls = frankfurterCalls.length;
  await api('/api/rates');
  expect(frankfurterCalls.length).toBe(calls);
});

test('static: immutable assets, SPA fallback, no traversal', async () => {
  const asset = await realFetch(`${app.url}/assets/index-abc123.js`);
  expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  expect(asset.headers.get('content-type') ?? '').toMatch(/javascript/);
  const page = await realFetch(`${app.url}/trip/today`);
  expect(page.headers.get('cache-control')).toBe('no-cache');
  expect(await page.text()).toBe('<!doctype html>app');
  expect((await realFetch(`${app.url}/assets/missing.js`)).status).toBe(404);
  const escape = await realFetch(`${app.url}/assets/..%2f..%2fsecret.txt`);
  expect(escape.status).toBe(404);
  expect((await realFetch(`${app.url}/api/nope`)).status).toBe(401);
});
