import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { decimals, toMajor } from '../shared/ledger.ts';
import { TravellerAddSchema, TravellerPatchSchema, TripSchema } from '../shared/schema.ts';
import { active, isRemoved, removalProblem } from '../shared/travellers.ts';
import { MAX_PEOPLE, MAX_SLOTS } from '../shared/types.ts';
import type { Traveller, Trip } from '../shared/types.ts';
import { need, ownerOnly } from './access.ts';
import type { Access, Env } from './access.ts';
import type { Db } from './db.ts';
import type { Notify } from './events.ts';
import { parse, parseBody, readJson } from './http.ts';
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

const tooMany = `A trip can have at most ${MAX_PEOPLE} travellers.`;

function liveTrip(db: Db, id: string): Trip {
  const trip = db.getTrip(id);
  if (!trip || trip.deleted) throw new HTTPException(404, { message: 'trip not found' });
  return trip;
}

function addTraveller(db: Db, id: string, body: unknown): Trip {
  const trip = liveTrip(db, id);
  const { name } = parseBody('traveller', TravellerAddSchema, body);
  if (active(trip).length >= MAX_PEOPLE) throw new HTTPException(409, { message: tooMany });
  if (trip.travellers.length >= MAX_SLOTS)
    throw new HTTPException(409, { message: 'This trip has used all its traveller slots.' });
  db.setTravellers(id, [...trip.travellers, { name }]);
  return db.getTrip(id)!;
}

function patchTraveller(db: Db, id: string, body: unknown): { trip: Trip; changed: boolean } {
  const trip = liveTrip(db, id);
  const { person, name, removed, swish } = parseBody('traveller', TravellerPatchSchema, body);
  const was = trip.travellers[person];
  if (!was) throw new HTTPException(400, { message: 'invalid traveller.person' });
  const wasRemoved = isRemoved(trip, person);
  const nowRemoved = removed ?? wasRemoved;
  if (nowRemoved && swish !== undefined)
    throw new HTTPException(409, { message: 'traveller is removed' });
  if (nowRemoved && !wasRemoved) {
    const fmt = (minor: number) =>
      `${toMajor(minor, trip.home).toFixed(decimals(trip.home))} ${trip.home}`;
    const problem = removalProblem(trip, db.tripEntries(id), person, fmt);
    if (problem) throw new HTTPException(409, { message: problem });
  }
  if (!nowRemoved && wasRemoved && active(trip).length >= MAX_PEOPLE)
    throw new HTTPException(409, { message: tooMany });
  const number = swish ?? was.swish;
  const next: Traveller = nowRemoved
    ? { name: name ?? was.name, removed: true }
    : { name: name ?? was.name, ...(number ? { swish: number } : {}) };
  if (next.name === was.name && next.removed === was.removed && next.swish === was.swish)
    return { trip, changed: false };
  db.setTravellers(
    id,
    trip.travellers.map((t, i) => (i === person ? next : t)),
  );
  return { trip: db.getTrip(id)!, changed: true };
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
    .post('/:id/travellers', async (c) => {
      const id = c.req.param('id');
      need(c.get('access'), id);
      const trip = addTraveller(db, id, await readJson(c));
      notify(id);
      return c.json(trip);
    })
    .patch('/:id/travellers', async (c) => {
      const id = c.req.param('id');
      need(c.get('access'), id);
      const { trip, changed } = patchTraveller(db, id, await readJson(c));
      if (changed) notify(id);
      return c.json(trip);
    })
    .post('/:id/invite', (c) => {
      ownerOnly(c.get('access'), 'only the owner can reset invite links');
      const trip = db.getTrip(c.req.param('id'));
      if (!trip || trip.deleted) throw new HTTPException(404, { message: 'trip not found' });
      const code = db.rotateInvite(trip.id);
      notify(trip.id, true);
      return c.json({ code });
    });
