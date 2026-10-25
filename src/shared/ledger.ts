import type { Category, Entry, Person } from './types.ts';

const decimalsCache = new Map<string, number>();
export function decimals(currency: string): number {
  let d = decimalsCache.get(currency);
  if (d === undefined) {
    d =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    decimalsCache.set(currency, d);
  }
  return d;
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** decimals(currency));
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** decimals(currency);
}

export function toHome(amount: number, currency: string, rate: number, home: string): number {
  return toMinor(toMajor(amount, currency) * rate, home);
}

export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, x) => a + x, 0);
  const order = raw
    .map((r, i) => [r - out[i]!, i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) if (left-- > 0) out[i]!++;
  return out;
}

export function balances(entries: Entry[], people: number): number[] {
  const net = Array<number>(people).fill(0);
  for (const e of entries) {
    if (e.deleted) continue;
    net[e.paidBy]! += e.home;
    allocate(e.home, e.shares).forEach((x, i) => (net[i]! -= x));
  }
  return net;
}

export type Settlement = { from: Person; to: Person; amount: number };

export function settlements(net: number[]): Settlement[] {
  const byAmount = (sign: number) =>
    net
      .flatMap((v, p) => (v * sign > 0 ? [{ p, v: v * sign }] : []))
      .sort((a, b) => b.v - a.v || a.p - b.p);
  const owe = byAmount(-1);
  const get = byAmount(1);
  const out: Settlement[] = [];
  for (let i = 0, j = 0; i < owe.length && j < get.length;) {
    const amount = Math.min(owe[i]!.v, get[j]!.v);
    out.push({ from: owe[i]!.p, to: get[j]!.p, amount });
    if (!(owe[i]!.v -= amount)) i++;
    if (!(get[j]!.v -= amount)) j++;
  }
  return out;
}

export type Summary = {
  spent: number;
  paid: number[];
  consumed: number[];
  byCategory: Map<Category, number>;
  byCurrency: Map<string, number>;
  byDay: Map<string, number>;
};

export function summarize(entries: Entry[], people: number): Summary {
  const s: Summary = {
    spent: 0,
    paid: Array<number>(people).fill(0),
    consumed: Array<number>(people).fill(0),
    byCategory: new Map(),
    byCurrency: new Map(),
    byDay: new Map(),
  };
  for (const e of entries) {
    if (e.deleted || e.kind !== 'expense') continue;
    s.spent += e.home;
    s.paid[e.paidBy]! += e.home;
    allocate(e.home, e.shares).forEach((x, i) => (s.consumed[i]! += x));
    s.byCategory.set(e.category, (s.byCategory.get(e.category) ?? 0) + e.home);
    s.byCurrency.set(e.currency, (s.byCurrency.get(e.currency) ?? 0) + e.home);
    s.byDay.set(e.date, (s.byDay.get(e.date) ?? 0) + e.home);
  }
  return s;
}

export function transferShares(to: Person): number[] {
  return Array.from({ length: to + 1 }, (_, i) => (i === to ? 1 : 0));
}

export function picked(shares: number[]): Person[] {
  return shares.flatMap((w, i) => (w > 0 ? [i] : []));
}

export function receiver(e: Pick<Entry, 'shares'>): Person {
  return e.shares.findIndex((w) => w > 0);
}
