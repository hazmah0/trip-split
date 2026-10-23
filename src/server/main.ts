import { createHmac, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { streamSSE } from 'hono/streaming';
import type { z } from 'zod';
import { toHome } from '../shared/ledger.ts';
import { EntryInputSchema, LoginSchema, TripSchema } from '../shared/schema.ts';
import { TRIP_GONE, UNKNOWN_CODE } from '../shared/types.ts';
import type { Entry, EntryInput, Rates, State, Trip } from '../shared/types.ts';
import { openDb } from './db.ts';
import type { Db } from './db.ts';
import { latestRates, rateFor, unsupportedCurrencies } from './rates.ts';

const COOKIE = 'tb_session';
const TRIP_COOKIE = 'tb_t_';

type Access = { owner: true } | { owner: false; trips: ReadonlySet<string> };
type Env = { Variables: { access: Access } };

const can = (a: Access, tripId: string) => a.owner || a.trips.has(tripId);
function need(a: Access, tripId: string) {
  if (!can(a, tripId)) throw new HTTPException(403, { message: 'not a member of this trip' });
}
function ownerOnly(a: Access, why: string) {
  if (!a.owner) throw new HTTPException(403, { message: why });
}

function resolveAccess(
  cookies: Record<string, string>,
  isOwner: boolean,
  tripsForCodes: (codes: string[]) => string[],
): Access {
  if (isOwner) return { owner: true };
  const codes = Object.entries(cookies)
    .filter(([name]) => name.startsWith(TRIP_COOKIE))
    .map(([, code]) => code);
  return { owner: false, trips: new Set(tripsForCodes(codes)) };
}

function parse<T extends z.ZodType<{ id: string }>>(
  what: string,
  schema: T,
  body: unknown,
  id: string,
): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new HTTPException(400, {
      message: `invalid ${what}.${String(r.error.issues[0]!.path[0] ?? 'body')}`,
    });
  if (r.data.id !== id) throw new HTTPException(400, { message: `invalid ${what}.id` });
  return r.data;
}

function authorizeEntryWrite(a: Access, input: EntryInput, stored: Entry | null) {
  need(a, input.tripId);
  if (stored) need(a, stored.tripId);
  if (stored && stored.tripId !== input.tripId)
    throw new HTTPException(409, { message: 'an entry cannot move between trips' });
}

async function putEntry(
  db: Db,
  a: Access,
  id: string,
  body: unknown,
): Promise<{ saved: Entry; changed: boolean }> {
  const input = parse('entry', EntryInputSchema, body, id);
  const stored = db.getEntry(id);
  authorizeEntryWrite(a, input, stored);
  const trip = db.getTrip(input.tripId);
  if (!trip || trip.deleted)
    throw new HTTPException(TRIP_GONE, { message: 'trip not found or deleted' });
  if (input.currency !== trip.home && !trip.locals.includes(input.currency))
    throw new HTTPException(400, { message: 'invalid entry.currency' });
  if (input.paidBy >= trip.names.length)
    throw new HTTPException(400, { message: 'invalid entry.paidBy' });
  if (input.shares.length > trip.names.length)
    throw new HTTPException(400, { message: 'invalid entry.shares' });
  if (stored && stored.updatedAt >= input.updatedAt) return { saved: stored, changed: false };
  const rate =
    input.currency === trip.home
      ? 1
      : (input.rate ??
        (input.deleted
          ? (stored?.rate ?? 1)
          : await rateFor(db, input.date, input.currency, trip.home).catch((err: Error) => {
              throw new HTTPException(502, { message: `rate unavailable: ${err.message}` });
            })));
  db.putEntry({ ...input, rate, home: toHome(input.amount, input.currency, rate, trip.home) });
  return { saved: db.getEntry(id)!, changed: true };
}

async function putTrip(
  db: Db,
  a: Access,
  id: string,
  body: unknown,
): Promise<{ saved: Trip; changed: boolean }> {
  const next = parse('trip', TripSchema, body, id);
  const stored = db.getTrip(id);
  if (stored) need(a, id);
  else ownerOnly(a, 'only the owner can create trips');
  if (stored && next.deleted !== stored.deleted) ownerOnly(a, 'only the owner can delete trips');
  if (stored && stored.updatedAt >= next.updatedAt) return { saved: stored, changed: false };
  if (stored && stored.home !== next.home && db.hasEntries(id))
    throw new HTTPException(409, { message: 'home currency is fixed once the trip has entries' });
  if (stored && next.names.length < stored.names.length && db.hasEntries(id))
    throw new HTTPException(409, {
      message: 'travellers cannot be removed once the trip has entries',
    });
  if (!stored || stored.home !== next.home || next.locals.some((c) => !stored.locals.includes(c))) {
    const bad = await unsupportedCurrencies([next.home, ...next.locals]);
    if (bad.length)
      throw new HTTPException(400, {
        message: `No ECB exchange rates for ${bad.join(', ')}. Pick currencies the ECB publishes.`,
      });
  }
  db.putTrip(next);
  return { saved: db.getTrip(id)!, changed: true };
}

const visibleTrips = (db: Db, a: Access) => db.listTrips().filter((t) => can(a, t.id));

function visibleState(db: Db, a: Access): State {
  const trips = visibleTrips(db, a);
  const invites = db.listInvites();
  return {
    trips,
    entries: db.listEntries().filter((e) => can(a, e.tripId)),
    invites: Object.fromEntries(trips.map((t) => [t.id, invites[t.id]!])),
    owner: a.owner,
  };
}

async function allRates(db: Db, trips: Trip[]): Promise<Rates> {
  const locals = new Map<string, Set<string>>();
  for (const t of trips) locals.set(t.home, new Set([...(locals.get(t.home) ?? []), ...t.locals]));
  return Object.fromEntries(
    await Promise.all(
      [...locals].map(async ([home, ls]) => [home, await latestRates(db, [...ls], home)]),
    ),
  );
}

const readJson = (c: Context) =>
  c.req.json<unknown>().catch(() => {
    throw new HTTPException(400, { message: 'invalid JSON' });
  });

const sha256 = (s: string) => createHmac('sha256', 'trip-split').update(s).digest();
const sessionToken = (passcode: string) =>
  createHmac('sha256', passcode).update('trip-split-session').digest('hex');

export type StartOptions = { port?: number; dataDir?: string; passcode?: string; distDir?: string };

export async function start(opts: StartOptions = {}) {
  const port = opts.port ?? Number(process.env.PORT ?? 8080);
  const passcode = opts.passcode ?? process.env.APP_PASSCODE ?? '';
  const distDir = resolve(opts.distDir ?? resolve(import.meta.dirname, '../../dist'));
  const db = openDb(opts.dataDir ?? process.env.DATA_DIR ?? './data');
  const token = Buffer.from(passcode ? sessionToken(passcode) : '');
  const failures: number[] = [];
  const listeners = new Set<{
    access: Access;
    send: (tripId: string) => Promise<void>;
    end: () => void;
  }>();
  const notify = (tripId: string, endMemberStreams = false) => {
    for (const l of listeners) {
      if (!can(l.access, tripId)) continue;
      const sent = l.send(tripId);
      if (endMemberStreams && !l.access.owner) void sent.then(l.end);
    }
  };
  if (!passcode) console.warn('APP_PASSCODE is not set: authentication is DISABLED');

  const app = new Hono<Env>();
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.use(secureHeaders({ strictTransportSecurity: false }));
  app.use(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: 'body too large' }, 413, { Connection: 'close' }),
    }),
  );
  app.all('/api/health', (c) => c.json({ ok: true }));
  app.post('/api/login', async (c) => {
    const code = LoginSchema.safeParse(await readJson(c)).data?.code ?? '';
    // Global brute-force brake: client IPs are unreliable behind proxies, and only a handful of travellers ever log in.
    const now = Date.now();
    while (failures.length && failures[0]! < now - 10 * 60_000) failures.shift();
    if (failures.length >= 20)
      throw new HTTPException(429, { message: 'too many attempts, wait 10 minutes' });
    const tripId = code ? db.liveTripForCode(code) : null;
    if (!tripId && passcode && !timingSafeEqual(sha256(code), sha256(passcode))) {
      failures.push(now);
      throw new HTTPException(UNKNOWN_CODE, { message: "that link or code didn't work" });
    }
    const secure = c.req.header('x-forwarded-proto') === 'https';
    const attrs = { path: '/', maxAge: 31536000, httpOnly: true, sameSite: 'Lax', secure } as const;
    if (tripId) setCookie(c, TRIP_COOKIE + tripId, code, attrs);
    else setCookie(c, COOKIE, token.toString(), attrs);
    return c.json({ tripId });
  });
  app.use('/api/*', async (c, next) => {
    const got = Buffer.from(getCookie(c, COOKIE) ?? '');
    const isOwner = !passcode || (got.length === token.length && timingSafeEqual(got, token));
    const access = resolveAccess(getCookie(c), isOwner, db.tripsForCodes);
    if (!access.owner && !access.trips.size)
      throw new HTTPException(401, { message: 'login required' });
    c.set('access', access);
    await next();
  });
  app.get('/api/state', (c) => c.json<State>(visibleState(db, c.get('access'))));
  app.get('/api/rates', async (c) => c.json(await allRates(db, visibleTrips(db, c.get('access')))));
  app.get('/api/events', (c) => {
    c.header('X-Accel-Buffering', 'no');
    const res = streamSSE(c, async (stream) => {
      // EventSource's default 3s retry would wake an offline phone's radio over a thousand times an hour.
      await stream.write('retry: 15000\n\n');
      const ping = setInterval(() => void stream.write(': ping\n\n'), 25_000);
      await new Promise<void>((done) => {
        const l = {
          access: c.get('access'),
          send: (tripId: string) => stream.writeSSE({ event: 'change', data: tripId }),
          end: () => {
            listeners.delete(l);
            done();
          },
        };
        listeners.add(l);
        stream.onAbort(l.end);
      });
      clearInterval(ping);
    });
    // An ended stream's socket would otherwise idle in keep-alive and hold up server.close().
    res.headers.set('Connection', 'close');
    return res;
  });
  app.put('/api/trips/:id', async (c) => {
    const { saved, changed } = await putTrip(
      db,
      c.get('access'),
      c.req.param('id'),
      await readJson(c),
    );
    if (changed) notify(saved.id);
    return c.json(saved);
  });
  app.post('/api/trips/:id/invite', (c) => {
    ownerOnly(c.get('access'), 'only the owner can reset invite links');
    const trip = db.getTrip(c.req.param('id'));
    if (!trip || trip.deleted) throw new HTTPException(404, { message: 'trip not found' });
    const code = db.rotateInvite(trip.id);
    notify(trip.id, true);
    return c.json({ code });
  });
  app.put('/api/entries/:id', async (c) => {
    const { saved, changed } = await putEntry(
      db,
      c.get('access'),
      c.req.param('id'),
      await readJson(c),
    );
    if (changed) notify(saved.tripId);
    return c.json(saved);
  });
  app.all('/api/*', (c) => c.notFound());

  const assets = join(distDir, 'assets') + sep;
  const onFound = (path: string, c: Context) =>
    c.header(
      'Cache-Control',
      path.startsWith(assets) ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
  app.get(
    '*',
    serveStatic({ root: distDir, onFound }),
    // A missing asset must 404, not come back as index.html under a JS or image URL.
    (c, next) => (extname(c.req.path) ? c.notFound() : next()),
    serveStatic({ root: distDir, path: 'index.html', onFound }),
    (c) => c.json({ error: 'not built: run pnpm build' }, 404),
  );
  app.all('*', (c) => c.json({ error: 'method not allowed' }, 405));

  const server = serve({ fetch: app.fetch, port });
  await once(server, 'listening');
  const actual = (server.address() as AddressInfo).port;
  console.log(`listening on http://localhost:${actual}`);
  return {
    url: `http://localhost:${actual}`,
    close: () =>
      new Promise<void>((ok) => {
        for (const l of listeners) l.end();
        server.close(() => {
          db.close();
          ok();
        });
      }),
  };
}

if (import.meta.main) {
  const app = await start();
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      console.log(`${sig}: shutting down`);
      void app.close().then(() => process.exit(0));
    });
  }
}
