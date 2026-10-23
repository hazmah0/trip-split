# Trip Split

Shared travel expenses for couples and groups, in any currency. Each expense is entered in the currency you paid in (or your home currency), converted at that day's ECB rate, and split evenly by default. The app keeps a running "who owes whom" for each trip and suggests the fewest payments to settle it.

One Node service (Hono + Zod) serves both the API and the built web app, and stores everything in a single SQLite file (built-in `node:sqlite`).

## Features

- Multiple trips. Each trip has its own travellers (two or more), home currency, local currencies and optional budget.
- Pick the currency per expense. If your card charged a different amount than the ECB rate gives, enter the real amount instead.
- Splits: evenly across everyone, a subset of people, or uneven shares (e.g. 2:1:1).
- Settle up records a payment between you and brings the balance to zero.
- An invite link per trip. Travellers who join with it see only that trip.
- Stats per trip: by category, by country, day by day, and how much each of you paid versus used.
- Works offline. Expenses added without signal wait on the phone and sync when you're back online.
- Installable PWA: on iOS use Share, then Add to Home Screen.

## Run with Docker

```sh
APP_PASSCODE='a-long-owner-passcode' docker compose up -d --build
```

Then open http://localhost:8080. The database lives in the `trip-split-data` volume at `/data/travel.db`.

Without compose:

```sh
docker build -t trip-split .
docker run -d -p 8080:8080 -e APP_PASSCODE='a-long-owner-passcode' -v trip-split-data:/data trip-split
```

Put it behind HTTPS (Caddy, Traefik, or your host's proxy). Service workers and the Secure session cookie need HTTPS everywhere except localhost.

Open the app and enter `APP_PASSCODE` to sign in as the owner, then create a trip. To invite your group, open the trip's **Trip** tab and tap **Share invite link**. Anyone who opens the link joins that trip and sees only it. If the app is installed on the home screen, copy the link and paste it on the app's Login screen, or in **Join a trip** in the trips sheet. **Reset link** makes a new link, and everyone who joined with the old one needs the new one.

| Env var | Default | Meaning |
|---|---|---|
| `APP_PASSCODE` | unset | The owner's passcode. Travellers never need it; they join with a trip's invite link. The owner sees every trip, creates and deletes trips, and resets invite links. If unset, everyone is the owner and the app is open to anyone; only do that locally. |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | Where `travel.db` lives |

To back up, copy `travel.db` with the server stopped, or take a `VACUUM INTO` snapshot while it runs. See [Back up and restore](docs/DATABASE.md#back-up-and-restore).

## Develop

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev          # client (Vite, :5173) and server (:8080) together; open :5173
```

`pnpm dev` runs `dev:client` (Vite, which proxies `/api` to :8080) and `dev:server` (Node in watch mode) in parallel. Without `APP_PASSCODE` the server skips the login and every request is the owner. Run either half alone with `pnpm dev:client` or `pnpm dev:server`.

Checks:

```sh
pnpm typecheck
pnpm test        # ledger, parsing and API tests (Vitest)
pnpm build
```

Exchange rates come from https://frankfurter.dev (ECB reference rates, no API key) and are cached in the database.

## Docs

- [Architecture](docs/ARCHITECTURE.md): code layout, data model, offline sync, money math, exchange rates, auth.
- [API](docs/API.md): HTTP endpoints, request rules and error codes.
- [Database](docs/DATABASE.md): SQLite schema, queries, backup and restore, schema changes.
- [Product](PRODUCT.md) and [Design](DESIGN.md): who it's for, and the visual system.
