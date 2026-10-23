import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Entry, PushTarget, Trip } from '../shared/types.ts';

export type Db = ReturnType<typeof openDb>;

const json = <T>(row: unknown): T | null =>
  row ? (JSON.parse((row as { json: string }).json) as T) : null;
const rate = (row: unknown): number | null => (row ? (row as { rate: number }).rate : null);
export const newCode = () => randomBytes(16).toString('base64url');

export function openDb(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'travel.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, date TEXT NOT NULL, updated_at INTEGER NOT NULL, json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS entries_trip_id ON entries (trip_id);
    CREATE TABLE IF NOT EXISTS rates (
      date TEXT NOT NULL, currency TEXT NOT NULL, home TEXT NOT NULL, rate REAL NOT NULL,
      PRIMARY KEY (date, currency, home)
    );
    CREATE TABLE IF NOT EXISTS invites (trip_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS push (
      trip_id TEXT NOT NULL, device TEXT NOT NULL, code TEXT,
      endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      PRIMARY KEY (trip_id, device)
    );
  `);
  const livePush = `push p LEFT JOIN invites i ON i.trip_id = p.trip_id
    WHERE p.trip_id = ? AND (p.code IS NULL OR p.code = i.code)`;

  const q = {
    getTrip: db.prepare('SELECT json FROM trips WHERE id = ?'),
    // rowid survives the upsert, so this is creation order and trips never jump around on edit.
    listTrips: db.prepare("SELECT json FROM trips WHERE json ->> 'deleted' = 0 ORDER BY rowid"),
    putTrip: db.prepare(`
      INSERT INTO trips (id, updated_at, json) VALUES (?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, json = excluded.json
      WHERE excluded.updated_at > trips.updated_at
    `),
    hasEntries: db.prepare(
      "SELECT EXISTS (SELECT 1 FROM entries WHERE trip_id = ? AND json ->> 'deleted' = 0) AS yes",
    ),
    getEntry: db.prepare('SELECT json FROM entries WHERE id = ?'),
    listEntries: db.prepare(`
      SELECT e.json FROM entries e JOIN trips t ON t.id = e.trip_id
      WHERE e.json ->> 'deleted' = 0 AND t.json ->> 'deleted' = 0
      ORDER BY e.date DESC, e.updated_at DESC
    `),
    // Last-write-wins in one statement, so concurrent PUTs of the same id cannot interleave.
    putEntry: db.prepare(`
      INSERT INTO entries (id, trip_id, date, updated_at, json) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        trip_id = excluded.trip_id, date = excluded.date, updated_at = excluded.updated_at, json = excluded.json
      WHERE excluded.updated_at > entries.updated_at
    `),
    getRate: db.prepare('SELECT rate FROM rates WHERE date = ? AND currency = ? AND home = ?'),
    latestRate: db.prepare(
      'SELECT rate FROM rates WHERE currency = ? AND home = ? ORDER BY date DESC LIMIT 1',
    ),
    putRate: db.prepare(
      'INSERT OR REPLACE INTO rates (date, currency, home, rate) VALUES (?, ?, ?, ?)',
    ),
    addInvite: db.prepare('INSERT OR IGNORE INTO invites (trip_id, code) VALUES (?, ?)'),
    listInvites: db.prepare('SELECT trip_id, code FROM invites'),
    liveTripForCode: db.prepare(
      "SELECT i.trip_id FROM invites i JOIN trips t ON t.id = i.trip_id WHERE i.code = ? AND t.json ->> 'deleted' = 0",
    ),
    tripsForCodes: db.prepare(
      'SELECT trip_id FROM invites WHERE code IN (SELECT value FROM json_each(?))',
    ),
    rotateInvite: db.prepare('UPDATE invites SET code = ? WHERE trip_id = ?'),
    tripsWithoutInvite: db.prepare(
      'SELECT id FROM trips WHERE id NOT IN (SELECT trip_id FROM invites)',
    ),
    putPush: db.prepare(`
      INSERT INTO push (trip_id, device, code, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (trip_id, device) DO UPDATE SET
        code = excluded.code, endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth
    `),
    movePush: db.prepare('UPDATE push SET endpoint = ?, p256dh = ?, auth = ? WHERE device = ?'),
    dropOtherDevices: db.prepare('DELETE FROM push WHERE endpoint = ? AND device <> ?'),
    dropPush: db.prepare('DELETE FROM push WHERE trip_id = ? AND device = ?'),
    dropEndpoint: db.prepare('DELETE FROM push WHERE endpoint = ?'),
    hasPush: db.prepare(`SELECT EXISTS (SELECT 1 FROM ${livePush} AND p.device = ?) AS yes`),
    pushTargets: db.prepare(`SELECT p.device, p.endpoint, p.p256dh, p.auth FROM ${livePush}`),
  };
  function backfillInvites() {
    for (const { id } of q.tripsWithoutInvite.all() as { id: string }[])
      q.addInvite.run(id, newCode());
  }
  backfillInvites();

  return {
    getTrip: (id: string) => json<Trip>(q.getTrip.get(id)),
    listTrips: () => q.listTrips.all().map((r) => json<Trip>(r)!),
    putTrip: (t: Trip) => {
      q.putTrip.run(t.id, t.updatedAt, JSON.stringify(t));
      q.addInvite.run(t.id, newCode());
    },
    hasEntries: (tripId: string) => (q.hasEntries.get(tripId) as { yes: number }).yes === 1,
    getEntry: (id: string) => json<Entry>(q.getEntry.get(id)),
    listEntries: () => q.listEntries.all().map((r) => json<Entry>(r)!),
    putEntry: (e: Entry) => {
      const existed = q.getEntry.get(e.id) !== undefined;
      const changed =
        q.putEntry.run(e.id, e.tripId, e.date, e.updatedAt, JSON.stringify(e)).changes > 0;
      return { changed, created: changed && !existed };
    },
    getRate: (date: string, currency: string, home: string) =>
      rate(q.getRate.get(date, currency, home)),
    latestRate: (currency: string, home: string) => rate(q.latestRate.get(currency, home)),
    putRate: (date: string, currency: string, home: string, r: number) =>
      void q.putRate.run(date, currency, home, r),
    listInvites: () =>
      Object.fromEntries(
        (q.listInvites.all() as { trip_id: string; code: string }[]).map((r) => [
          r.trip_id,
          r.code,
        ]),
      ),
    liveTripForCode: (code: string) =>
      (q.liveTripForCode.get(code) as { trip_id: string } | undefined)?.trip_id ?? null,
    tripsForCodes: (codes: string[]) =>
      (q.tripsForCodes.all(JSON.stringify(codes)) as { trip_id: string }[]).map((r) => r.trip_id),
    rotateInvite: (tripId: string) => {
      const code = newCode();
      q.rotateInvite.run(code, tripId);
      return code;
    },
    putPush: (p: { tripId: string; device: string; code: string | null } & PushTarget) => {
      q.putPush.run(p.tripId, p.device, p.code, p.endpoint, p.keys.p256dh, p.keys.auth);
      q.movePush.run(p.endpoint, p.keys.p256dh, p.keys.auth, p.device);
      q.dropOtherDevices.run(p.endpoint, p.device);
    },
    dropPush: (tripId: string, device: string) => void q.dropPush.run(tripId, device),
    dropEndpoint: (endpoint: string) => void q.dropEndpoint.run(endpoint),
    hasPush: (tripId: string, device: string) =>
      (q.hasPush.get(tripId, device) as { yes: number }).yes === 1,
    pushTargets: (tripId: string) =>
      q.pushTargets.all(tripId) as {
        device: string;
        endpoint: string;
        p256dh: string;
        auth: string;
      }[],
    close: () => db.close(),
  };
}
