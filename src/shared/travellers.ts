import { balances } from './ledger.ts';
import { MIN_ACTIVE } from './types.ts';
import type { Entry, Person, Trip } from './types.ts';

type Roster = Pick<Trip, 'travellers'>;

export const isRemoved = (t: Roster, p: Person) => t.travellers[p]?.removed === true;

export const active = (t: Roster): Person[] =>
  t.travellers.flatMap((x, p) => (x.removed ? [] : [p]));

export function label(t: Roster, p: Person): string {
  const x = t.travellers[p];
  if (!x) return `Traveller ${p + 1}`;
  return x.removed ? `${x.name} (removed)` : x.name;
}

export const everyone = (t: Roster): number[] => t.travellers.map((x) => (x.removed ? 0 : 1));

export function isEveryone(t: Roster, shares: number[]): boolean {
  const w = shares.find((x) => x > 0);
  return t.travellers.every((x, p) => (shares[p] ?? 0) === (x.removed ? 0 : w));
}

export function validMe(t: Roster, stored: unknown): Person | null {
  const p = stored as Person;
  return Number.isInteger(p) && p >= 0 && p < t.travellers.length && !isRemoved(t, p) ? p : null;
}

export function removalProblem(
  t: Roster,
  entries: Entry[],
  p: Person,
  format: (minor: number) => string,
): string | null {
  const net = balances(entries, t.travellers.length)[p] ?? 0;
  if (net)
    return `${t.travellers[p]!.name} ${net < 0 ? 'still owes' : 'is still owed'} ${format(Math.abs(net))}. Settle up first.`;
  if (active(t).filter((q) => q !== p).length < MIN_ACTIVE)
    return 'A trip needs at least two travellers.';
  return null;
}
