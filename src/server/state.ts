import { Hono } from 'hono';
import type { Rates, State, Trip } from '../shared/types.ts';
import { can } from './access.ts';
import type { Access, Env } from './access.ts';
import type { Db } from './db.ts';
import { latestRates } from './rates.ts';

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
  for (const t of trips) {
    const ls = locals.get(t.home) ?? new Set();
    for (const c of t.locals) ls.add(c);
    locals.set(t.home, ls);
  }

  return Object.fromEntries(
    await Promise.all(
      [...locals].map(async ([home, ls]) => [home, await latestRates(db, [...ls], home)]),
    ),
  );
}

export const stateRoutes = (db: Db) =>
  new Hono<Env>()
    .get('/state', (c) => c.json<State>(visibleState(db, c.get('access'))))
    .get('/rates', async (c) => c.json(await allRates(db, visibleTrips(db, c.get('access')))));
