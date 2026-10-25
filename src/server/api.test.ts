import { afterAll, beforeAll, expect, test } from 'vitest';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { transferShares } from '../shared/ledger.ts';
import type { EntryInput, State, Trip } from '../shared/types.ts';
import { start } from './main.ts';
import {
  dir,
  dist,
  entry,
  frankfurter,
  jarOf,
  people,
  realFetch,
  request,
  trip,
} from './testing.ts';

let app: Awaited<ReturnType<typeof start>>;
let cookie = '';
let member = '';
beforeAll(async () => {
  app = await start({
    port: 0,
    dataDir: join(dir, 'data'),
    passcode: 'hunter2',
    distDir: dist,
    push: null,
  });
});
afterAll(() => app.close());

const call = (jar: string, path: string, method = 'GET', body?: unknown, base = app.url) =>
  request(base, jar, path, method, body);
const api = (path: string, method = 'GET', body?: unknown) => call(cookie, path, method, body);
const signIn = async (code: string) => {
  const res = await call('', '/api/login', 'POST', { code });
  return { res, cookie: jarOf('', res) };
};

const state = async () => (await (await api('/api/state')).json()) as State;

test('health needs no auth', async () => {
  expect((await api('/api/health')).status).toBe(200);
});

test('auth gate: 401 without cookie, wrong code is 404, the passcode sets an owner session cookie', async () => {
  expect((await api('/api/state')).status).toBe(401);
  expect((await api('/api/login', 'POST', { code: 'nope' })).status).toBe(404);
  const res = await api('/api/login', 'POST', { code: 'hunter2' });
  expect(res.status).toBe(200);
  expect(await res.clone().json()).toStrictEqual({ tripId: null });
  const setCookie = res.headers.get('set-cookie') ?? '';
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/SameSite=Lax/);
  expect(setCookie).not.toMatch(/hunter2/);
  cookie = setCookie.split(';')[0]!;
  expect((await api('/api/state')).status).toBe(200);
});

test('a trip saves and comes back in state, with its name trimmed', async () => {
  expect(await state()).toStrictEqual({ trips: [], entries: [], invites: {}, owner: true });
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
  expect(frankfurter.calls).toContain(
    'https://api.frankfurter.dev/v1/2026-10-20?base=SEK&symbols=KRW',
  );
  expect((await state()).entries).toStrictEqual([stored]);
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
  await api(
    '/api/entries/e4b',
    'PUT',
    entry({ id: 'e4b', date: '2026-10-21', currency: 'SEK', amount: 100, updatedAt: 1001 }),
  );
  const ids = (await state()).entries.map((e) => e.id);
  expect(ids.slice(0, 2)).toStrictEqual(['e4b', 'e4']);
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

test('an entry keeps who added it, and a later edit stores who edited it', async () => {
  const added = await api('/api/entries/by', 'PUT', entry({ id: 'by', addedBy: 0 }));
  expect((await added.json()).addedBy).toBe(0);
  const edited = await api(
    '/api/entries/by',
    'PUT',
    entry({ id: 'by', addedBy: 1, editedBy: 1, updatedAt: 1001 }),
  );
  expect(await edited.json(), 'an edit cannot rewrite who added it').toMatchObject({
    addedBy: 0,
    editedBy: 1,
  });
  await api('/api/entries/by', 'PUT', entry({ id: 'by', deleted: true, updatedAt: 1002 }));
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
    { addedBy: 2 },
    { editedBy: 2 },
    { rate: -1 },
    { note: 'x'.repeat(1001) },
    { tripId: 1 as never },
  ];
  for (const c of cases) {
    const res = await api('/api/entries/bad', 'PUT', entry({ id: 'bad', ...c }));
    expect(res.status, JSON.stringify(c)).toBe(400);
  }
  const tripCases: Partial<Trip>[] = [
    { id: 'other' },
    { name: '   ' },
    { name: 'x'.repeat(81) },
    { travellers: people('Ada', '') },
    { travellers: people('Ada') },
    { travellers: [{ name: 'Ada' }, { name: 'Bo', removed: true }] },
    { travellers: people(...Array.from({ length: 21 }, (_, i) => `P${i}`)) },
    { home: 'sek' },
    { locals: ['SEK'] },
    { locals: ['KRW', 'KRW'] },
    { budget: -1 },
    { updatedAt: 1.5 },
    { deleted: 'no' as never },
    { travellers: [{ name: 'Ada', swish: '0701234567' }, { name: 'Bo' }] },
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

test('an entry needs a live trip: unknown or deleted trip is 410', async () => {
  expect((await api('/api/entries/x1', 'PUT', entry({ id: 'x1', tripId: 'nope' }))).status).toBe(
    410,
  );
  await api('/api/trips/gone', 'PUT', trip({ id: 'gone', deleted: true }));
  expect((await api('/api/entries/x1', 'PUT', entry({ id: 'x1', tripId: 'gone' }))).status).toBe(
    410,
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
  frankfurter.down = true;
  try {
    const res = await api(
      '/api/entries/t1',
      'PUT',
      entry({ id: 't1', currency: 'JPY', date: '2026-08-01', deleted: true }),
    );
    expect(res.status).toBe(200);
  } finally {
    frankfurter.down = false;
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
  expect(frankfurter.calls).toContain(
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
    trip({ id: 'g', name: 'Tokyo crew', travellers: people('Ada', 'Bo', 'Cy', 'Di') }),
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

const crew = (p: Partial<Trip> = {}) =>
  trip({ id: 'tr', name: 'Crew', travellers: people('Ada', 'Bo', 'Cy'), locals: [], ...p });
const travellersOf = async (id = 'tr') =>
  (await state()).trips.find((t) => t.id === id)!.travellers;
const addTraveller = (name: string, id = 'tr') =>
  api(`/api/trips/${id}/travellers`, 'POST', { name });
const patchTraveller = (body: object, id = 'tr') =>
  api(`/api/trips/${id}/travellers`, 'PATCH', body);
const settle = (id: string, from: number, to: number, amount: number) =>
  api(
    `/api/entries/${id}`,
    'PUT',
    entry({
      id,
      tripId: 'tr',
      kind: 'transfer',
      currency: 'SEK',
      amount,
      paidBy: from,
      shares: transferShares(to),
    }),
  );

test('adding a traveller appends them, so two adds never share a spot', async () => {
  await api('/api/trips/tr', 'PUT', crew());
  const res = await addTraveller('Di');
  expect(res.status).toBe(200);
  expect(((await res.json()) as Trip).travellers).toStrictEqual(people('Ada', 'Bo', 'Cy', 'Di'));
  await addTraveller('Ed');
  expect(await travellersOf()).toStrictEqual(people('Ada', 'Bo', 'Cy', 'Di', 'Ed'));
  expect((await addTraveller('')).status).toBe(400);
  expect((await addTraveller('Zed', 'nope')).status).toBe(404);
});

test('a trip save never changes travellers, so a stale list cannot drop or reorder anyone', async () => {
  const res = await api(
    '/api/trips/tr',
    'PUT',
    crew({ name: 'Crew 2', travellers: people('Cy', 'Ada'), updatedAt: 1001 }),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    name: 'Crew 2',
    travellers: people('Ada', 'Bo', 'Cy', 'Di', 'Ed'),
  });
});

test('a traveller change keeps the trip version, so the next trip save from a phone still lands', async () => {
  const before = (await state()).trips.find((t) => t.id === 'tr')!.updatedAt;
  await patchTraveller({ person: 4, name: 'Eddie' });
  expect((await state()).trips.find((t) => t.id === 'tr')!.updatedAt).toBe(before);
  const res = await api('/api/trips/tr', 'PUT', crew({ name: 'Crew 2', updatedAt: before + 1 }));
  expect(((await res.json()) as Trip).updatedAt).toBe(before + 1);
  await patchTraveller({ person: 4, name: 'Ed' });
});

test('a rename keeps the Swish number', async () => {
  expect((await patchTraveller({ person: 1, swish: '46701740605' })).status).toBe(200);
  const res = await patchTraveller({ person: 1, name: 'Bob' });
  expect(res.status).toBe(200);
  expect(((await res.json()) as Trip).travellers[1]).toStrictEqual({
    name: 'Bob',
    swish: '46701740605',
  });
  await patchTraveller({ person: 1, swish: '' });
  expect((await travellersOf())[1], 'an empty number clears it').toStrictEqual({ name: 'Bob' });
  await patchTraveller({ person: 1, swish: '46701740605' });
});

test('removing someone needs their balance settled, and drops their Swish number', async () => {
  await api(
    '/api/entries/tr1',
    'PUT',
    entry({ id: 'tr1', tripId: 'tr', currency: 'SEK', amount: 30000, shares: [1, 1, 1] }),
  );
  const owes = await patchTraveller({ person: 1, removed: true });
  expect(owes.status).toBe(409);
  expect((await owes.json()).error).toBe('Bob still owes 100.00 SEK. Settle up first.');
  const owed = await patchTraveller({ person: 0, removed: true });
  expect((await owed.json()).error).toBe('Ada is still owed 200.00 SEK. Settle up first.');

  await settle('tr2', 1, 0, 10000);
  const res = await patchTraveller({ person: 1, removed: true });
  expect(res.status).toBe(200);
  expect(((await res.json()) as Trip).travellers[1]).toStrictEqual({ name: 'Bob', removed: true });
  const again = await patchTraveller({ person: 1, removed: true });
  expect(again.status, 'repeating a removal is a no-op').toBe(200);
  expect(((await again.json()) as Trip).travellers[1]).toStrictEqual({
    name: 'Bob',
    removed: true,
  });
});

test('a trip keeps at least two travellers', async () => {
  await api('/api/trips/duo', 'PUT', trip({ id: 'duo', name: 'Duo', locals: [] }));
  const res = await patchTraveller({ person: 0, removed: true }, 'duo');
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe('A trip needs at least two travellers.');
});

test('an entry naming a removed traveller is accepted, and they stay removed', async () => {
  const res = await api(
    '/api/entries/tr3',
    'PUT',
    entry({ id: 'tr3', tripId: 'tr', currency: 'SEK', paidBy: 1, shares: [1, 1, 1] }),
  );
  expect(res.status).toBe(200);
  expect((await travellersOf())[1]).toStrictEqual({ name: 'Bob', removed: true });
});

test('a restore brings the traveller back without their Swish number', async () => {
  const res = await patchTraveller({ person: 1, removed: false });
  expect(res.status).toBe(200);
  expect(((await res.json()) as Trip).travellers[1]).toStrictEqual({ name: 'Bob' });
});

test('traveller updates reject a removed, unknown or missing traveller', async () => {
  expect((await patchTraveller({ person: 3, removed: true })).status).toBe(200);
  const swish = await patchTraveller({ person: 3, swish: '46701740605' });
  expect(swish.status).toBe(409);
  expect((await swish.json()).error).toBe('traveller is removed');
  expect((await patchTraveller({ person: 5, name: 'Fi' })).status, 'past the end').toBe(400);
  expect((await patchTraveller({ person: 0 })).status, 'nothing to change').toBe(400);
  expect((await patchTraveller({ person: 0, swish: '0701234567' })).status).toBe(400);
  expect((await patchTraveller({ person: 0, name: 'Ada' }, 'nope')).status).toBe(404);
  expect((await addTraveller('Fi', 'gone')).status, 'a deleted trip').toBe(404);
});

test('a trip holds at most 20 active travellers', async () => {
  await api(
    '/api/trips/big',
    'PUT',
    trip({
      id: 'big',
      name: 'Big',
      locals: [],
      travellers: [
        ...people(...Array.from({ length: 20 }, (_, i) => `P${i}`)),
        { name: 'Gone', removed: true },
      ],
    }),
  );
  const add = await addTraveller('P20', 'big');
  expect(add.status).toBe(409);
  expect((await add.json()).error).toBe('A trip can have at most 20 travellers.');
  const restore = await patchTraveller({ person: 20, removed: false }, 'big');
  expect(restore.status).toBe(409);
  expect((await restore.json()).error).toBe('A trip can have at most 20 travellers.');
});

test('a trip whose 50 slots are used, mostly by removed travellers, takes no one new', async () => {
  const gone = Array.from({ length: 48 }, (_, i) => ({ name: `G${i}`, removed: true as const }));
  await api(
    '/api/trips/full',
    'PUT',
    trip({ id: 'full', name: 'Full', locals: [], travellers: [...people('Ada', 'Bo'), ...gone] }),
  );
  const res = await addTraveller('Cy', 'full');
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe('This trip has used all its traveller slots.');
});

test('rate lookup falls back to the cache, and fails with 502 when nothing is cached', async () => {
  frankfurter.down = true;
  try {
    const cached = await api('/api/entries/e5', 'PUT', entry({ id: 'e5', date: '2026-09-01' }));
    expect((await cached.json()).rate).toBe(1 / 133.57);
    expect((await api('/api/entries/e6', 'PUT', entry({ id: 'e6', currency: 'JPY' }))).status).toBe(
      502,
    );
  } finally {
    frankfurter.down = false;
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
  const calls = frankfurter.calls.length;
  await api('/api/rates');
  expect(frankfurter.calls.length).toBe(calls);
});

test('a member joined by invite code sees only that trip, its invite and its rates', async () => {
  await api('/api/trips/m', 'PUT', trip({ id: 'm', name: 'Osaka', locals: ['JPY'] }));
  await api('/api/entries/m1', 'PUT', entry({ id: 'm1', tripId: 'm', currency: 'SEK' }));
  const code = (await state()).invites.m!;
  expect(code).toMatch(/^[\w-]{22}$/);
  const joined = await signIn(code);
  expect(await joined.res.json()).toStrictEqual({ tripId: 'm' });
  member = joined.cookie;
  const s = (await (await call(member, '/api/state')).json()) as State;
  expect(s.trips.map((t) => t.id)).toStrictEqual(['m']);
  expect(s.entries.map((e) => e.id)).toStrictEqual(['m1']);
  expect(s.invites).toStrictEqual({ m: code });
  expect(s.owner).toBe(false);
  expect(await (await call(member, '/api/rates')).json()).toStrictEqual({
    SEK: { JPY: 1 / 15.836 },
  });
});

test('a member writes only their own trip: other, new and deleted trips are 403', async () => {
  const own = entry({ id: 'm2', tripId: 'm', currency: 'SEK' });
  expect((await call(member, '/api/entries/m2', 'PUT', own)).status).toBe(200);
  const rename = trip({ id: 'm', name: 'Osaka!', locals: ['JPY'], updatedAt: 1001 });
  expect((await call(member, '/api/trips/m', 'PUT', rename)).status).toBe(200);
  const drop = trip({ id: 'm', locals: ['JPY'], deleted: true, updatedAt: 2000 });
  const denied = await call(member, '/api/trips/m', 'PUT', drop);
  expect(denied.status).toBe(403);
  expect((await denied.json()).error).toBe('only the owner can delete trips');
  expect((await state()).trips.map((t) => t.id)).toContain('m');

  const other = entry({ id: 'x9', tripId: 'a' });
  expect((await call(member, '/api/entries/x9', 'PUT', other)).status).toBe(403);
  const tripAEntry = 'e2';
  const stale = entry({ id: tripAEntry, tripId: 'm', currency: 'SEK', updatedAt: 1 });
  const echo = await call(member, `/api/entries/${tripAEntry}`, 'PUT', stale);
  expect(echo.status).toBe(403);
  expect(await echo.json(), 'no echo of the stored entry').not.toHaveProperty('id');
  expect((await call(member, '/api/trips/n1', 'PUT', trip({ id: 'n1' }))).status).toBe(403);
  const add = await call(member, '/api/trips/tr/travellers', 'POST', { name: 'Mo' });
  expect(add.status).toBe(403);
  const patch = await call(member, '/api/trips/tr/travellers', 'PATCH', { person: 0, name: 'Mo' });
  expect(patch.status).toBe(403);
  expect((await travellersOf())[0]!.name).toBe('Ada');
  const undelete = trip({ id: 'gone', updatedAt: 5000 });
  expect((await call(member, '/api/trips/gone', 'PUT', undelete)).status).toBe(403);
  expect((await state()).trips.map((t) => t.id)).not.toContain('n1');
  expect((await state()).trips.map((t) => t.id)).not.toContain('gone');
});

test('a session cookie from before invites is still an owner session', async () => {
  const old = `tb_session=${createHmac('sha256', 'hunter2').update('trip-split-session').digest('hex')}`;
  const s = (await (await call(old, '/api/state')).json()) as State;
  expect(s.owner).toBe(true);
  expect(s.trips.map((t) => t.id)).toContain('a');
  expect(s.trips.map((t) => t.id)).toContain('m');
});

test('only the owner resets a link; old cookies stop working and the new link joins', async () => {
  expect((await call(member, '/api/trips/m/invite', 'POST')).status).toBe(403);
  const old = (await state()).invites.m!;
  const { code } = (await (await api('/api/trips/m/invite', 'POST')).json()) as { code: string };
  expect(code).not.toBe(old);
  expect((await state()).invites.m).toBe(code);
  expect((await call(member, '/api/state')).status, 'm was its only trip').toBe(401);
  expect((await signIn(old)).res.status).toBe(404);
  const fresh = await signIn(code);
  expect(await fresh.res.json()).toStrictEqual({ tripId: 'm' });
  member = fresh.cookie;
  expect((await call(member, '/api/state')).status).toBe(200);
});

test('only the cookie value grants access: a code under another trip name still opens just its trip', async () => {
  const code = (await state()).invites.m!;
  const res = await call(`tb_t_a=${code}`, '/api/state');
  expect(res.status, 'a valid code is accepted under any cookie name').toBe(200);
  expect(((await res.json()) as State).trips.map((t) => t.id)).toStrictEqual(['m']);
  expect((await call('tb_t_m=not-a-code', '/api/state')).status).toBe(401);
});

test('a member of a deleted trip gets 410 for its entries and stays signed in', async () => {
  await api(
    '/api/trips/m',
    'PUT',
    trip({ id: 'm', locals: ['JPY'], deleted: true, updatedAt: 3000 }),
  );
  const late = entry({ id: 'm3', tripId: 'm', currency: 'SEK' });
  expect((await call(member, '/api/entries/m3', 'PUT', late)).status).toBe(410);
  const s = await call(member, '/api/state');
  expect(s.status).toBe(200);
  expect(((await s.json()) as State).trips).toStrictEqual([]);
  const revive = trip({ id: 'm', locals: ['JPY'], updatedAt: 4000 });
  expect((await call(member, '/api/trips/m', 'PUT', revive)).status, 'no undelete').toBe(403);
  expect((await state()).trips.map((t) => t.id)).not.toContain('m');
});

const subscribe = async (jar: string, base = app.url) => {
  const res = await call(jar, '/api/events', 'GET', undefined, base);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  const nextChange = async (): Promise<string | null> => {
    for (;;) {
      const end = buf.indexOf('\n\n');
      if (end >= 0) {
        const block = buf.slice(0, end);
        buf = buf.slice(end + 2);
        const change = block.match(/^event: change\ndata: (.*)$/);
        if (change) return change[1]!;
        continue;
      }
      const { value, done } = await reader.read();
      if (done) return null;
      buf += value;
    }
  };
  return { res, nextChange, close: () => reader.cancel() };
};

test('events: a member hears about changes to their trip only, the owner hears about all', async () => {
  await api('/api/trips/live1', 'PUT', trip({ id: 'live1', locals: [] }));
  await api('/api/trips/live2', 'PUT', trip({ id: 'live2', locals: [] }));
  const joined = await signIn((await state()).invites.live1!);
  const owner = await subscribe(cookie);
  const traveller = await subscribe(joined.cookie);
  try {
    expect(traveller.res.status).toBe(200);
    expect(traveller.res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(traveller.res.headers.get('x-accel-buffering')).toBe('no');
    const sek = { currency: 'SEK', updatedAt: 1000 };
    await api('/api/entries/live2-1', 'PUT', entry({ id: 'live2-1', tripId: 'live2', ...sek }));
    await api('/api/entries/live1-1', 'PUT', entry({ id: 'live1-1', tripId: 'live1', ...sek }));
    expect(await traveller.nextChange(), 'the live2 write never reached the member').toBe('live1');
    expect([await owner.nextChange(), await owner.nextChange()]).toStrictEqual(['live2', 'live1']);

    await api('/api/entries/live1-1', 'PUT', entry({ id: 'live1-1', tripId: 'live1', ...sek }));
    await api('/api/trips/live1', 'PUT', trip({ id: 'live1', locals: [], updatedAt: 999 }));
    await api('/api/trips/live2', 'PUT', trip({ id: 'live2', locals: [], updatedAt: 1001 }));
    expect(await owner.nextChange(), 'stale writes to live1 sent nothing').toBe('live2');

    await api('/api/trips/live1/invite', 'POST');
    expect(await owner.nextChange()).toBe('live1');
    expect(await traveller.nextChange(), 'the reset is announced to the member').toBe('live1');
    expect(await traveller.nextChange(), 'then their stream ends').toBeNull();
  } finally {
    await Promise.all([owner.close(), traveller.close()]);
  }
});

test('events: adding or changing a traveller is announced, a no-op change is not', async () => {
  const owner = await subscribe(cookie);
  try {
    await addTraveller('Fy');
    expect(await owner.nextChange()).toBe('tr');
    await patchTraveller({ person: 0, name: 'Ada' });
    await patchTraveller({ person: 0, name: 'Adah' });
    expect(await owner.nextChange(), 'the no-op rename sent nothing').toBe('tr');
    await api('/api/trips/live2', 'PUT', trip({ id: 'live2', locals: [], updatedAt: 1002 }));
    expect(await owner.nextChange(), 'only one change for the two renames').toBe('live2');
  } finally {
    await owner.close();
  }
});

test('events tell the browser to wait 15 seconds before reconnecting', async () => {
  const res = await call(cookie, '/api/events');
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  try {
    expect((await reader.read()).value).toBe('retry: 15000\n\n');
  } finally {
    await reader.cancel();
  }
});

test('events need a session', async () => {
  expect((await call('', '/api/events')).status).toBe(401);
});

test('the server shuts down while an events stream is open', async () => {
  const other = await start({ port: 0, dataDir: join(dir, 'events'), passcode: '', distDir: dist });
  const open = await subscribe('', other.url);
  expect(open.res.status).toBe(200);
  await other.close();
  expect(await open.nextChange(), 'the stream ends on shutdown').toBeNull();
});

test('wrong codes count toward the login brake', async () => {
  const other = await start({
    port: 0,
    dataDir: join(dir, 'brake'),
    passcode: 'pw',
    distDir: dist,
  });
  const login = (code: string) => call('', '/api/login', 'POST', { code }, other.url);
  try {
    for (let i = 0; i < 20; i++) expect((await login('nope')).status).toBe(404);
    expect((await login('pw')).status, 'braked even for the right passcode').toBe(429);
  } finally {
    await other.close();
  }
});

test('with no passcode everyone is the owner, as before invites', async () => {
  const open = await start({ port: 0, dataDir: join(dir, 'open'), passcode: '', distDir: dist });
  const req = (path: string, method = 'GET', body?: unknown) =>
    call('', path, method, body, open.url);
  try {
    expect((await req('/api/trips/a', 'PUT', trip())).status).toBe(200);
    const s = (await (await req('/api/state')).json()) as State;
    expect(s.owner).toBe(true);
    expect(s.trips).toStrictEqual([trip()]);
    expect(await (await req('/api/login', 'POST', { code: 'anything' })).json()).toStrictEqual({
      tripId: null,
    });
  } finally {
    await open.close();
  }
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

test('every response carries security headers, but HSTS is left to the HTTPS proxy', async () => {
  for (const res of [await realFetch(`${app.url}/`), await realFetch(`${app.url}/api/state`)]) {
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('strict-transport-security')).toBe(null);
  }
});

test('push is off without VAPID keys', async () => {
  expect((await api('/api/push/a')).status).toBe(404);
});
