import { useState } from 'react';
import { dayLabel, listNames, money, today } from '../lib/format.ts';
import { CATEGORY_LABEL, placeOf } from '../lib/labels.ts';
import type { View } from '../lib/store.ts';
import { receiver, summarize } from '../../shared/ledger.ts';
import { everyone, isEveryone, label } from '../../shared/travellers.ts';
import type { Entry, Trip } from '../../shared/types.ts';
import { Icon } from '../ui/Icon.tsx';
import { SplitBadge } from '../ui/people.tsx';

function dayHeading(date: string): string {
  const t = today();
  const y = new Date(`${t}T12:00:00`);
  y.setDate(y.getDate() - 1);
  if (date === t) return 'Today';
  if (date === y.toLocaleDateString('sv-SE')) return 'Yesterday';
  return dayLabel(date);
}

function matches(e: Entry, trip: Trip, q: string): boolean {
  const text = [
    e.title,
    e.note,
    CATEGORY_LABEL[e.category],
    label(trip, e.paidBy),
    e.currency,
    placeOf(e.currency, trip.home),
  ];
  return text.join(' ').toLowerCase().includes(q);
}

export function ExpenseList({
  v,
  trip,
  onOpen,
}: {
  v: View;
  trip: Trip;
  onOpen: (e: Entry) => void;
}) {
  const [query, setQuery] = useState('');
  if (v.entries.length === 0) {
    return (
      <div className="m-4 card p-5 text-base font-semibold text-soft wide:mx-0">
        <h2 className="mb-1.5 text-2xl font-extrabold text-ink">Nothing logged yet</h2>
        <p>
          Tap <b className="text-ink">Add expense</b> right after you pay. Enter it in{' '}
          {trip.locals.join(' or ') || 'local currency'} or {trip.home}, and the app converts it at
          that day's rate.
        </p>
        <p className="mt-2.5">
          The little badge on each expense shows the split:{' '}
          <SplitBadge shares={everyone(trip)} className="mx-0.5 inline-block align-[-3px]" /> split
          evenly, or one colour when it's only for one of you.
        </p>
      </div>
    );
  }
  const q = query.trim().toLowerCase();
  const shown = q ? v.entries.filter((e) => matches(e, trip, q)) : v.entries;
  const days = new Map<string, Entry[]>();
  for (const e of shown) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  return (
    <div className="mt-2">
      <label className="mx-4 field wide:mx-0">
        <span className="sr-only">Search expenses</span>
        <input
          className="input"
          type="search"
          value={query}
          placeholder="Search title, note, category, who paid"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {q && (
        <p className="mx-6.5 mt-2 hint wide:mx-2.5" role="status">
          {shown.length
            ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'} · ${money(summarize(shown, trip.travellers.length).spent, trip.home)} spent`
            : 'No expenses match.'}
        </p>
      )}
      {[...days].map(([date, list]) => {
        const total = summarize(list, trip.travellers.length).spent;
        const places = [
          ...new Set(
            list.filter((e) => e.currency !== trip.home).map((e) => placeOf(e.currency, trip.home)),
          ),
        ];
        return (
          <section key={date}>
            <h2 className="sticky top-[calc(var(--spacing-topbar)+env(safe-area-inset-top))] z-2 flex justify-between gap-3 bg-ground px-6.5 pt-3.5 pb-2 text-sm font-bold text-soft wide:px-2.5">
              <span>
                <b className="font-extrabold text-ink">{dayHeading(date)}</b>
                {places.length > 0 && ` · ${places.join(', ')}`}
              </span>
              <span>{money(total, trip.home)}</span>
            </h2>
            <ul className="mx-4 overflow-hidden card py-1 wide:mx-0">
              {list.map((e) => (
                <li key={e.id}>
                  <Row e={e} trip={trip} pending={v.pending.has(e.id)} onOpen={() => onOpen(e)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  e,
  trip,
  pending,
  onOpen,
}: {
  e: Entry;
  trip: Trip;
  pending: boolean;
  onOpen: () => void;
}) {
  const { home } = trip;
  const payer = label(trip, e.paidBy);
  const local = e.currency !== home;
  const transfer = e.kind === 'transfer';
  return (
    <button className="list-row" onClick={onOpen}>
      <span
        className={`relative grid size-11 place-items-center rounded-tile bg-ground ${pending ? 'outline-[1.5px] outline-offset-[-1.5px] outline-soft outline-dashed' : ''}`}
        aria-hidden="true"
      >
        <Icon name={transfer ? 'swap' : e.category} size={22} />
        {!transfer && <SplitBadge shares={e.shares} className="absolute -right-1 -bottom-1" />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base leading-tight font-bold">
          {transfer ? `${payer} paid ${label(trip, receiver(e))} back` : e.title}
        </span>
        {e.note && <span className="truncate text-xs font-medium text-soft">{e.note}</span>}
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold text-soft">
          {transfer ? 'Settle up' : `${payer} paid · ${splitTitle(e.shares, trip)}`}
          {pending && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-sand px-2 text-2xs font-bold text-ink">
              <Icon name="clock" size={12} /> Not synced
            </span>
          )}
        </span>
      </span>
      <span className="flex flex-col items-end gap-px whitespace-nowrap">
        <b className="text-lg font-extrabold">
          {local
            ? e.rate
              ? `${pending && !e.rateManual ? '≈ ' : ''}${money(e.home, home)}`
              : '…'
            : money(e.amount, e.currency)}
        </b>
        <small className="text-xs font-semibold text-soft">
          {local ? money(e.amount, e.currency) : `paid in ${e.currency}`}
        </small>
      </span>
    </button>
  );
}

function splitTitle(shares: number[], trip: Trip) {
  const who = shares.flatMap((w, i) => (w ? [i] : []));
  if (who.length === 1) return `only ${label(trip, who[0]!)}`;
  if (who.some((i) => shares[i] !== shares[who[0]!])) {
    const total = who.reduce((a, i) => a + shares[i]!, 0);
    return who.length <= 3
      ? who.map((i) => Math.round((shares[i]! / total) * 100)).join('/')
      : 'uneven split';
  }
  if (isEveryone(trip, shares)) return who.length === 2 ? 'split 50/50' : 'split evenly';
  return `split ${listNames(who.map((i) => label(trip, i)))}`;
}
