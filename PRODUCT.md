# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Vite + React + TypeScript frontend, bundled and served by a Node 24 HTTP server using the built-in `node:sqlite`. One Docker image, SQLite file on a mounted volume. Chosen to keep it a single deployable service with zero native dependencies.

## Users

Couples and groups travelling together, across many trips (the first: two people in South Korea, then Japan). Everyone pays with their own cards, in local currency or their home currency. They log expenses on their phones, on the street, at the till, in a taxi, often one-handed and sometimes without signal. They review totals and balances on a laptop or phone in the evening.

## Product Purpose

Track every shared trip expense and keep a fair, always-current answer to "who owes whom, and how much" in the home currency. Success means nobody has to think about fairness during the trip, and settling up at the end takes as few payments as possible.

## Positioning

Built for a travel group of any size, paying in mixed currencies. Every amount is kept in the currency it was paid in and converted at that day's ECB rate, so the balance is fair without anyone doing maths.

## Operating Context

- Adding an expense is the most frequent action and happens standing up, in seconds.
- Each expense can be entered in the home currency or a local currency (KRW, JPY), chosen per expense.
- Default split is evenly across everyone; any expense can be for a subset of people or split unevenly by shares.
- Connectivity is unreliable abroad: entries must be accepted offline and synced later.
- Installed to the home screen as a PWA on everyone's phone.

## Capabilities and Constraints

- Many trips per deployment; each trip has its own name, two or more travellers (more can join mid-trip), home currency (locked once it has expenses), local currencies and optional budget.
- Rates: ECB daily reference rates via frankfurter.dev, overridable per expense.
- Categories with a spending breakdown by category and by country (currency).
- Settle-up: suggests the fewest payments that square everyone up; each is recorded as a transfer.
- Access is protected by one shared passcode.
- Not decided: CSV export, receipt photos.

## Product Principles

1. Adding an expense is never more than a few taps. Sensible defaults (today, me as payer, split evenly, last currency used) do the work.
2. The balance is the headline. It is always visible and always honest about what is still unsynced.
3. Never lose an entry. Offline entries wait in an outbox until the server confirms them.
4. Show money in the currency it was paid in, with the home equivalent beside it.

## Accessibility & Inclusion

Readable outdoors in bright light on a phone. Large touch targets for one-handed use.
