import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { TripSchema } from '../shared/schema.ts';
import type { Trip } from '../shared/types.ts';
import { need, ownerOnly } from './access.ts';
import type { Access, Env } from './access.ts';
import type { Db } from './db.ts';
import type { Notify } from './events.ts';
import { parse, readJson } from './http.ts';
import { unsupportedCurrencies } from './rates.ts';

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

export const tripRoutes = (db: Db, notify: Notify) =>
  new Hono<Env>()
    .put('/:id', async (c) => {
      const { saved, changed } = await putTrip(
        db,
        c.get('access'),
        c.req.param('id'),
        await readJson(c),
      );
      if (changed) notify(saved.id);
      return c.json(saved);
    })
    .post('/:id/invite', (c) => {
      ownerOnly(c.get('access'), 'only the owner can reset invite links');
      const trip = db.getTrip(c.req.param('id'));
      if (!trip || trip.deleted) throw new HTTPException(404, { message: 'trip not found' });
      const code = db.rotateInvite(trip.id);
      notify(trip.id, true);
      return c.json({ code });
    });
