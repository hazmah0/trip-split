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
import type { z } from 'zod';
import { toHome } from '../shared/ledger.ts';
import { EntryInputSchema, LoginSchema, TripSchema } from '../shared/schema.ts';
import type { Entry, Rates, State, Trip } from '../shared/types.ts';
import { openDb } from './db.ts';
import type { Db } from './db.ts';
import { latestRates, rateFor, unsupportedCurrencies } from './rates.ts';

const COOKIE = 'tb_session';

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

async function putEntry(db: Db, id: string, body: unknown): Promise<Entry> {
  const input = parse('entry', EntryInputSchema, body, id);
  const trip = db.getTrip(input.tripId);
  if (!trip || trip.deleted) throw new HTTPException(409, { message: 'trip not found or deleted' });
  if (input.currency !== trip.home && !trip.locals.includes(input.currency))
    throw new HTTPException(400, { message: 'invalid entry.currency' });
  if (input.paidBy >= trip.names.length)
    throw new HTTPException(400, { message: 'invalid entry.paidBy' });
  if (input.shares.length > trip.names.length)
    throw new HTTPException(400, { message: 'invalid entry.shares' });
  const stored = db.getEntry(id);
  if (stored && stored.updatedAt >= input.updatedAt) return stored;
  if (stored && stored.tripId !== input.tripId)
    throw new HTTPException(409, { message: 'an entry cannot move between trips' });
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
  return db.getEntry(id)!;
}

async function putTrip(db: Db, id: string, body: unknown): Promise<Trip> {
  const next = parse('trip', TripSchema, body, id);
  const stored = db.getTrip(id);
  if (stored && stored.updatedAt >= next.updatedAt) return stored;
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
  return db.getTrip(id)!;
}

async function allRates(db: Db): Promise<Rates> {
  const locals = new Map<string, Set<string>>();
  for (const t of db.listTrips())
    locals.set(t.home, new Set([...(locals.get(t.home) ?? []), ...t.locals]));
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
  if (!passcode) console.warn('APP_PASSCODE is not set: authentication is DISABLED');

  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not found' }, 404));
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
    const given = LoginSchema.safeParse(await readJson(c)).data?.passcode ?? '';
    // Global brute-force brake: client IPs are unreliable behind proxies, and only a handful of travellers ever log in.
    const now = Date.now();
    while (failures.length && failures[0]! < now - 10 * 60_000) failures.shift();
    if (failures.length >= 20)
      throw new HTTPException(429, { message: 'too many attempts, wait 10 minutes' });
    if (passcode && !timingSafeEqual(sha256(given), sha256(passcode))) {
      failures.push(now);
      throw new HTTPException(401, { message: 'wrong passcode' });
    }
    const secure = c.req.header('x-forwarded-proto') === 'https';
    setCookie(c, COOKIE, token.toString(), {
      path: '/',
      maxAge: 31536000,
      httpOnly: true,
      sameSite: 'Lax',
      secure,
    });
    return c.json({ ok: true });
  });
  app.use('/api/*', async (c, next) => {
    const got = Buffer.from(getCookie(c, COOKIE) ?? '');
    if (passcode && (got.length !== token.length || !timingSafeEqual(got, token)))
      throw new HTTPException(401, { message: 'login required' });
    await next();
  });
  app.get('/api/state', (c) => c.json<State>({ trips: db.listTrips(), entries: db.listEntries() }));
  app.get('/api/rates', async (c) => c.json(await allRates(db)));
  app.put('/api/trips/:id', async (c) =>
    c.json(await putTrip(db, c.req.param('id'), await readJson(c))),
  );
  app.put('/api/entries/:id', async (c) =>
    c.json(await putEntry(db, c.req.param('id'), await readJson(c))),
  );
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
      new Promise<void>((ok) =>
        server.close(() => {
          db.close();
          ok();
        }),
      ),
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
