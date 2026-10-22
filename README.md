# Trip Split

Shared travel expenses for couples and groups, in any currency. Each expense is entered in the currency you paid in (or your home currency), converted at that day's ECB rate, and split evenly by default. The app keeps a running "who owes whom" for each trip and suggests the fewest payments to settle it.

One Node service (Hono + Zod) serves both the API and the built web app, and stores everything in a single SQLite file (built-in `node:sqlite`).

## Features

- Multiple trips. Each trip has its own travellers (two or more), home currency, local currencies and optional budget.
- Pick the currency per expense. If your card charged a different amount than the ECB rate gives, enter the real amount instead.
- Splits: evenly across everyone, a subset of people, or uneven shares (e.g. 2:1:1).
- Settle up records a payment between you and brings the balance to zero.
- Stats per trip: by category, by country, day by day, and how much each of you paid versus used.
- Works offline. Expenses added without signal wait on the phone and sync when you're back online.
- Installable PWA: on iOS use Share, then Add to Home Screen.

## Run with Docker

```sh
APP_PASSCODE='a-long-shared-passcode' docker compose up -d --build
```

Then open http://localhost:8080. The database lives in the `trip-split-data` volume at `/data/travel.db`.

Without compose:

```sh
docker build -t trip-split .
docker run -d -p 8080:8080 -e APP_PASSCODE='a-long-shared-passcode' -v trip-split-data:/data trip-split
```

Put it behind HTTPS (Caddy, Traefik, or your host's proxy). Service workers and the Secure session cookie need HTTPS everywhere except localhost.

| Env var | Default | Meaning |
|---|---|---|
| `APP_PASSCODE` | unset | Shared passcode. If unset, the app is open to anyone; only do that locally. |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | Where `travel.db` lives |

Back up by copying `travel.db` from the volume. With the app idle is fine; the DB uses WAL mode.

## Develop

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev          # client (Vite, :5173) and server (:8080) together; open :5173
```

`pnpm dev` runs `dev:client` (Vite, which proxies `/api` to :8080) and `dev:server` (Node in watch mode) in parallel. Without `APP_PASSCODE` the server skips the login. Run either half alone with `pnpm dev:client` or `pnpm dev:server`.

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
- [Product](PRODUCT.md) and [Design](DESIGN.md): who it's for, and the visual system.
