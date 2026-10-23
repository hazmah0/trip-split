import { afterAll, beforeAll, expect, test } from 'vitest';
import { createHmac } from 'node:crypto';
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
let member = '';
beforeAll(async () => {
  app = await start({ port: 0, dataDir: join(dir, 'data'), passcode: 'hunter2', distDir: dist });
});
afterAll(async () => {
  await app.close();
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

const call = (jar: string, path: string, method = 'GET', body?: unknown, base = app.url) =>
  realFetch(base + path, {
    method,
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const api = (path: string, method = 'GET', body?: unknown) => call(cookie, path, method, body);
const signIn = async (code: string) => {
  const res = await call('', '/api/login', 'POST', { code });
  return {
    res,
    cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
};

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
