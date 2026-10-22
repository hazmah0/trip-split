---
version: 1
slug: "src-client-app-tsx"
primary_target: "src/client/App.tsx"
related_targets: []
---

Scope: the whole app shell (expenses, stats, trip settings, trips switcher, add/edit and settle sheets, login and first-trip gates). Visitor mode: Operate.
Audience and job: two partners logging trip expenses one-handed on phones abroad, reviewing balance and stats in the evening on phone or laptop. Multiple trips per deployment.

## Direction contract

THESIS: A warm, friendly expense splitter where the one bright colour is always something you can press, and every expense shows its split at a glance. Refuses the grey-list-plus-green-card category default and the novelty of a themed costume.

OWN-WORLD: Warm sand ground (#f6efe7), white soft-cornered cards (20px radius, soft two-layer shadow), ink #2a2420, soft text #655a50, sand #eadfd2 for secondary controls. Action orange #d43f1c (darkened from the sketch for 4.5:1 contrast) only on Add expense, primary buttons and the active tab. Person colours mustard #f2c14e and sky #86b6d9 for avatars, payer selection and the split badge. Nunito throughout, self-hosted.

STORY: The visitor sees who owes whom in a sentence, logs a purchase in seconds, and trusts the number because each entry shows payer, split and sync state.

FIRST VIEWPORT: Trip name with switcher chevron and sync pill on top. Balance card: "Sam owes Alex 1 252 kr" in 38px heavy, debtor-to-creditor avatars, Settle up, spent-so-far with budget bar. Day header (Today · Korea, day total) above a card of expense rows: category tile with split badge, title, payer and split, home amount bold with local amount below. Floating orange Add expense above a white bottom tab bar (Expenses, Stats, Trip). Desktop: list left, stats right, floating pill tabs.

FORM: Warm Consumer App (catalog challenger digital-design-canon-warm-consumer-app-surface), chosen by the user over the assigned roll, seed key ac7a53fe. Signature move: the split badge, a two-colour pie on each category tile. Raises kept: sticky day guide header, dashed tile for unsynced entries.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
