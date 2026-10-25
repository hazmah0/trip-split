import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { toHome } from '../shared/ledger.ts';
import { EntryInputSchema } from '../shared/schema.ts';
import { TRIP_GONE } from '../shared/types.ts';
import type { Entry, EntryInput } from '../shared/types.ts';
import { need } from './access.ts';
import type { Access, Env } from './access.ts';
import type { Db } from './db.ts';
import type { Notify } from './events.ts';
import { parseWithId, readJson } from './http.ts';
import type { Push } from './push.ts';
import { rateFor } from './rates.ts';

function authorizeEntryWrite(a: Access, input: EntryInput, stored: Entry | null) {
  need(a, input.tripId);
  if (stored) need(a, stored.tripId);
  if (stored && stored.tripId !== input.tripId)
    throw new HTTPException(409, { message: 'an entry cannot move between trips' });
}

async function rateOf(db: Db, input: EntryInput, stored: Entry | null, home: string) {
  if (input.currency === home) return 1;
  if (input.rate !== null) return input.rate;
  if (input.deleted) return stored?.rate ?? 1;
  return rateFor(db, input.date, input.currency, home).catch((err: Error) => {
    throw new HTTPException(502, { message: `rate unavailable: ${err.message}` });
  });
}

async function putEntry(
  db: Db,
  a: Access,
  id: string,
  body: unknown,
): Promise<{ saved: Entry; changed: boolean; created: boolean }> {
  const input = parseWithId('entry', EntryInputSchema, body, id);
  const stored = db.getEntry(id);
  authorizeEntryWrite(a, input, stored);

  const trip = db.getTrip(input.tripId);
  if (!trip || trip.deleted)
    throw new HTTPException(TRIP_GONE, { message: 'trip not found or deleted' });
  if (input.currency !== trip.home && !trip.locals.includes(input.currency))
    throw new HTTPException(400, { message: 'invalid entry.currency' });
  for (const field of ['paidBy', 'addedBy', 'editedBy'] as const)
    if ((input[field] ?? 0) >= trip.travellers.length)
      throw new HTTPException(400, { message: `invalid entry.${field}` });
  if (input.shares.length > trip.travellers.length)
    throw new HTTPException(400, { message: 'invalid entry.shares' });

  if (stored && stored.updatedAt >= input.updatedAt)
    return { saved: stored, changed: false, created: false };

  const rate = await rateOf(db, input, stored, trip.home);
  const { changed, created } = db.putEntry({
    ...input,
    addedBy: stored ? stored.addedBy : input.addedBy,
    rate,
    home: toHome(input.amount, input.currency, rate, trip.home),
  });
  return { saved: db.getEntry(id)!, changed, created: created && !input.deleted };
}

export const entryRoutes = (db: Db, notify: Notify, announce: Push['created']) =>
  new Hono<Env>().put('/:id', async (c) => {
    const { saved, changed, created } = await putEntry(
      db,
      c.get('access'),
      c.req.param('id'),
      await readJson(c),
    );
    if (changed) notify(saved.tripId);
    if (created) announce(saved, c);
    return c.json(saved);
  });
