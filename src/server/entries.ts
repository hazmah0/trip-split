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
import { parse, readJson } from './http.ts';
import type { Push } from './push.ts';
import { rateFor } from './rates.ts';

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
): Promise<{ saved: Entry; changed: boolean; created: boolean }> {
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
  if (stored && stored.updatedAt >= input.updatedAt)
    return { saved: stored, changed: false, created: false };

  const rate =
    input.currency === trip.home
      ? 1
      : (input.rate ??
        (input.deleted
          ? (stored?.rate ?? 1)
          : await rateFor(db, input.date, input.currency, trip.home).catch((err: Error) => {
              throw new HTTPException(502, { message: `rate unavailable: ${err.message}` });
            })));
  const { changed, created } = db.putEntry({
    ...input,
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
