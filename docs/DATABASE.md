# Database

Trip Split keeps everything in one SQLite file, `travel.db`, which `src/server/db.ts` opens with Node's built-in `node:sqlite`. This page covers the schema, the queries, backups and schema changes. For the data model, tombstones and last-write-wins, see [Data model in ARCHITECTURE.md](ARCHITECTURE.md#data-model).

## Where the file lives

`openDb(dataDir)` opens `<dataDir>/travel.db` and creates the directory if it is missing. The server takes `dataDir` from `DATA_DIR`, or `./data` when `DATA_DIR` is unset.

| Where | Path |
|---|---|
| Docker | `/data/travel.db`. The `Dockerfile` sets `DATA_DIR=/data`, and `docker-compose.yml` mounts the `trip-split-data` volume there. Compose prefixes the volume name with the project name, for example `trip-split_trip-split-data`. |
| Local | `./data/travel.db`, relative to the directory you start the server from. `.gitignore` lists `data`, so the file is never committed. |
| Tests | A folder that `mkdtempSync` makes in the OS temp directory (`trip-split-test-*` and `trip-split-store-*`). Each test file deletes it when it finishes. |

### WAL mode

`openDb` sets `PRAGMA journal_mode = WAL`. While the server runs, two more files sit next to `travel.db`:

- `travel.db-wal` holds committed writes that SQLite has not copied into `travel.db` yet.
- `travel.db-shm` is the shared-memory index of the WAL file.

On `SIGTERM` or `SIGINT`, `main.ts` stops the HTTP server and then calls `db.close()`. Closing the last connection copies the WAL into `travel.db` and deletes both files. `docker stop` and `docker compose stop` send `SIGTERM`. After a crash or a `SIGKILL`, `travel.db-wal` stays behind with committed data in it, and SQLite applies it on the next open. Keep it with `travel.db` until then.

## Schema

`openDb` runs this on every start:

```sql
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
-- Its own table, not trips.json, so /api/state never serves a code by accident. Rows are never deleted.
CREATE TABLE IF NOT EXISTS invites (trip_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS push (
  trip_id TEXT NOT NULL, device TEXT NOT NULL, code TEXT,
  endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  PRIMARY KEY (trip_id, device)
);
```

`trips` and `entries` store the whole validated object as JSON in `json`, and the server reads it back from there. The other columns copy the fields that SQL itself needs: the last-write-wins `WHERE` in the upsert, the sort order, and the join and index on `trip_id`. Any other field is read with `json ->> '<field>'`. For example, `json ->> 'deleted' = 0` keeps the rows that are not deleted, because `->>` turns JSON `false` into `0`.

| Table | Column | Contents |
|---|---|---|
| `trips` | `id` | The client-generated trip id, 1 to 64 characters that match `/^[\w-]{1,64}$/` |
| | `updated_at` | Copy of `updatedAt`, for the last-write-wins check |
| | `json` | The whole `Trip` |
| `entries` | `id` | The client-generated entry id |
| | `trip_id` | Copy of `tripId`, for the join to `trips`, the `hasEntries` check and the `entries_trip_id` index |
| | `date` | Copy of `date`, for sorting newest first |
| | `updated_at` | Copy of `updatedAt`, for the last-write-wins check and the second sort key |
| | `json` | The whole `Entry`, including the `rate` and `home` that the server calculated |
| `rates` | `date`, `currency`, `home` | The ECB date, the local currency and the home currency. Together they are the primary key. |
| | `rate` | Home units per 1 unit of `currency`. Past dates are fetched once and kept. The hourly latest refresh stores its rates under the date that frankfurter returns. |
| `invites` | `trip_id` | The trip this code joins. One row per trip. |
| | `code` | The current invite code: 16 random bytes in base64url, 22 characters. `UNIQUE`, which also gives the index that login lookups use. |
| `push` | `trip_id`, `device` | One row per browser that wants notifications for a trip. `device` is the `tb_device` cookie. Together they are the primary key. |
| | `code` | The invite code the member's cookie held when they subscribed, or `NULL` for the owner |
| | `endpoint`, `p256dh`, `auth` | The browser's `PushSubscription`. One endpoint belongs to one device. |

Invite codes are secrets. Anyone who has one can join its trip, so treat a copy of `travel.db` like a password file. A `push` row, together with the VAPID private key, lets its holder send notifications to that browser.

### Why `push` stores the invite code

A member's push row is valid only while its `code` is the trip's current code. `hasPush` and `pushTargets` join `invites` and drop the other rows, so a link reset turns off every member's notifications without a write to `push`. Deleting member rows on reset would also work, but every later path that changes a code would have to remember it. And `PUT /api/push/:tripId` checks access before it reads the body, so a subscribe that runs during a reset could still insert a row after the delete and keep notifying a member who lost the trip. Rows with a stale code stay in the table, a few per reset. They are harmless, and `DELETE FROM push WHERE code IS NOT NULL AND code NOT IN (SELECT code FROM invites)` clears them.

### Invite backfill on start

After the `CREATE` statements, `openDb` finds every trip without an `invites` row, tombstones included, and gives each one a new code. That is how a `travel.db` from before invites gets a code for every trip on its first start. `db.putTrip` also runs `addInvite` after each trip upsert, and `INSERT OR IGNORE` keeps the code that a trip already has. Rows are never deleted. Resetting a link replaces the code in place.

## Queries

`openDb` prepares each statement once and returns an object of functions, the `Db` type. Nothing outside `db.ts` writes SQL.

| Statement | What it does | Called from |
|---|---|---|
| `getTrip` | One trip by id, tombstones included | `putTrip` in `trips.ts`, `putEntry` in `entries.ts`, and `POST /api/trips/:id/invite` |
| `listTrips` | Live trips, ordered by `rowid`. An upsert keeps the `rowid`, so this is creation order. | `visibleTrips`, for `GET /api/state` and `GET /api/rates` |
| `putTrip` | Last-write-wins upsert: `ON CONFLICT (id) DO UPDATE … WHERE excluded.updated_at > trips.updated_at` | `db.putTrip`, from `PUT /api/trips/:id` |
| `hasEntries` | Whether the trip has a live entry | The two 409 checks in `putTrip` |
| `getEntry` | One entry by id, tombstones included | `putEntry`, for the access and stale-write checks and for the response. `db.putEntry`, just before its upsert, to tell a new entry from an update. Push bursts, to re-read their entries. |
| `listEntries` | Live entries of live trips, newest `date` first, then newest `updated_at` | `visibleState`, for `GET /api/state` |
| `putEntry` | Last-write-wins upsert, the same shape as `putTrip` | `putEntry`, from `PUT /api/entries/:id` |
| `getRate` | The cached rate for one date and pair | `rateFor` in `rates.ts`, for past dates |
| `latestRate` | The newest cached rate for a pair | `rateFor` when a fetch fails, and `latestRates` |
| `putRate` | `INSERT OR REPLACE` of one rate | `rateFor` after a fetch, and `latestRates` after a refresh |
| `addInvite` | `INSERT OR IGNORE` of a new code | The startup backfill and `db.putTrip` |
| `listInvites` | Every trip id and its code | `visibleState`, which keeps only the trips the session can see |
| `liveTripForCode` | The live trip that a code belongs to | `POST /api/login` |
| `tripsForCodes` | The trips whose current code is in a JSON array of codes, read with `json_each`. Tombstones are included. | The auth gate, through `resolveAccess` |
| `rotateInvite` | Replace a trip's code | `POST /api/trips/:id/invite` |
| `tripsWithoutInvite` | Trips, tombstones included, that have no `invites` row | The startup backfill in `openDb` |
| `putPush`, `movePush`, `dropOtherDevices` | Upsert the device's row for the trip, copy the new endpoint and keys to the device's other rows, and delete that endpoint from any other device | `db.putPush`, from `PUT /api/push/:tripId` |
| `dropPush` | Delete one device's row for a trip | `DELETE /api/push/:tripId` |
| `dropEndpoint` | Delete every row with an endpoint | A push service answered 404 or 410 |
| `hasPush` | Whether the device has a valid row for the trip (owner, or current invite code) | All three `/api/push/:tripId` routes |
| `pushTargets` | Every valid row for the trip | Sending a push burst |

## Inspect the database

To look at a local database, open it with the `sqlite3` CLI. The `->>` operator needs SQLite 3.38 or later.

```sh
sqlite3 -readonly data/travel.db
```

`-readonly` needs the `travel.db-shm` file, which exists while the server runs. With the server stopped, leave out `-readonly` and run only `SELECT` statements.

Some read-only queries:

```sql
-- Live trips, in creation order
SELECT id, json ->> 'name' AS name, json ->> 'home' AS home
FROM trips WHERE json ->> 'deleted' = 0 ORDER BY rowid;

-- Live entries of one trip, newest first
SELECT date, json ->> 'title' AS title, json ->> 'amount' AS amount,
  json ->> 'currency' AS currency, json ->> 'home' AS home
FROM entries WHERE trip_id = 'k3j2' AND json ->> 'deleted' = 0 ORDER BY date DESC;

-- Money spent per trip, in home minor units (transfers left out)
SELECT trip_id, sum(json ->> 'home') AS spent
FROM entries WHERE json ->> 'deleted' = 0 AND json ->> 'kind' = 'expense'
GROUP BY trip_id;

-- Each trip's invite code
SELECT t.json ->> 'name' AS name, i.code
FROM invites i JOIN trips t ON t.id = i.trip_id;

-- The newest cached rates
SELECT * FROM rates ORDER BY date DESC LIMIT 20;
```

The Docker image, built on `node:24-slim`, has no `sqlite3` CLI. Use `node:sqlite` in the running container instead:

```sh
docker compose exec trip-split node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/data/travel.db', { readOnly: true }); console.table(db.prepare(\"SELECT id, json ->> 'name' AS name FROM trips\").all())"
```

## Back up and restore

The safest backup is a copy of `travel.db` made while the server is stopped. A clean stop leaves no `travel.db-wal`. If one is still there after a crash, copy it too and keep its name. While the server runs, `VACUUM INTO` writes a consistent snapshot to a new file instead.

`docker compose` refuses to run any command unless `APP_PASSCODE` is set, in the shell or in a `.env` file, because `docker-compose.yml` requires it.

### With Docker Compose

To back up with the server stopped:

```sh
docker compose stop trip-split
docker compose run --rm -v "$PWD:/backup" trip-split cp /data/travel.db /backup/travel.db
docker compose start trip-split
```

To back up while the server runs:

```sh
docker compose exec trip-split node -e "new (require('node:sqlite').DatabaseSync)('/data/travel.db').exec(\"VACUUM INTO '/tmp/travel.db'\")"
docker compose cp trip-split:/tmp/travel.db ./travel.db
docker compose exec trip-split rm /tmp/travel.db
```

`VACUUM INTO` fails if the target file exists, so the last command deletes it.

To restore `./travel.db`:

```sh
docker compose stop trip-split
docker compose run --rm -v "$PWD:/backup" trip-split sh -c 'rm -f /data/travel.db-wal /data/travel.db-shm && cp /backup/travel.db /data/travel.db'
docker compose start trip-split
```

The restore deletes any leftover `-wal` and `-shm` files, because they belong to the old database and SQLite would apply them to the restored file.

### With plain Docker

These commands use the `trip-split` image and the `trip-split-data` volume from the `docker run` example in the [README](../README.md#run-with-docker). Find the container name with `docker ps`.

```sh
docker stop <container>
docker run --rm -v trip-split-data:/data -v "$PWD:/backup" trip-split cp /data/travel.db /backup/travel.db
docker start <container>
```

To restore, stop the container the same way and run:

```sh
docker run --rm -v trip-split-data:/data -v "$PWD:/backup" trip-split sh -c 'rm -f /data/travel.db-wal /data/travel.db-shm && cp /backup/travel.db /data/travel.db'
```

### Locally

```sh
sqlite3 data/travel.db "VACUUM INTO 'travel-backup.db'"
```

This works while the server runs. To restore, stop the server, delete `data/travel.db-wal` and `data/travel.db-shm` if they exist, and copy the backup to `data/travel.db`.

## Schema changes

The schema has no version number and no migration step. `openDb` runs only `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, and `PRAGMA user_version` is still 0. What that means depends on the change:

- **A new field on `Trip` or `Entry`.** No schema change. The field goes into `json`. Rows written before the change don't have it, and `db.ts` parses `json` without validating it, so the code that reads the field must handle it missing.
- **A new table or index.** Add a `CREATE … IF NOT EXISTS` statement to `openDb`. Existing databases get it on their next start. If existing rows need matching data, backfill it in `openDb` so that a second run changes nothing, as the invite backfill does.
- **A new or changed column on an existing table.** Editing the `CREATE TABLE` text does nothing to an existing database, because the table already exists. Tests always start from an empty folder, so they pass, and production then fails with `no such column`. A change like this needs a migration. One way is to read `PRAGMA user_version`, run the `ALTER TABLE` and the backfill, and set the new version in one transaction:

  ```ts
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version < 1)
    db.exec(`BEGIN;
      ALTER TABLE entries ADD COLUMN kind TEXT;
      UPDATE entries SET kind = json ->> 'kind';
      PRAGMA user_version = 1;
    COMMIT;`);
  ```

Invite codes are in their own `invites` table, not in a new `trips` column or in `trips.json`. The comment in `db.ts` gives one reason: with codes kept out of `trips.json`, `/api/state` never serves a code by accident. A new table also needed no migration. On its first start with this code, an existing `travel.db` gets the table from `CREATE TABLE IF NOT EXISTS` and its codes from the backfill.

Back up `travel.db` before you deploy a schema change.
