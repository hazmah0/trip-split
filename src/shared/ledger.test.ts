import { expect, test } from 'vitest';
import {
  allocate,
  balances,
  decimals,
  settlements,
  summarize,
  toHome,
  transferShares,
} from './ledger.ts';
import type { Entry } from './types.ts';

const base: Entry = {
  id: 'x',
  tripId: 't',
  kind: 'expense',
  date: '2026-10-23',
  title: 't',
  category: 'food',
  amount: 0,
  currency: 'SEK',
  rate: 1,
  rateManual: false,
  home: 0,
  paidBy: 0,
  shares: [1, 1],
  updatedAt: 0,
  deleted: false,
};
const e = (p: Partial<Entry>): Entry => ({ ...base, ...p });

test('currency decimals', () => {
  expect(decimals('KRW')).toBe(0);
  expect(decimals('JPY')).toBe(0);
  expect(decimals('SEK')).toBe(2);
});

test('converts zero-decimal local currency to home minor units', () => {
  expect(toHome(15000, 'KRW', 0.0074867, 'SEK')).toBe(11230);
});

test('allocate splits exactly, the odd unit going to the lowest index', () => {
  expect(allocate(100, [1, 1, 1])).toStrictEqual([34, 33, 33]);
  expect(allocate(101, [1, 1])).toStrictEqual([51, 50]);
  expect(allocate(101, [3, 2])).toStrictEqual([61, 40]);
  expect(allocate(10, [0, 2, 0])).toStrictEqual([0, 10, 0]);
});

test('50/50 paid by person 0 means person 1 owes half', () => {
  expect(balances([e({ home: 10000 })], 2)).toStrictEqual([5000, -5000]);
});

test('expense only for the payer leaves balances untouched', () => {
  expect(balances([e({ home: 10000, paidBy: 1, shares: [0, 1] })], 2)).toStrictEqual([0, 0]);
});

test('three-way split: the two others each owe a third', () => {
  const net = balances([e({ home: 9000, shares: [1, 1, 1] })], 3);
  expect(net).toStrictEqual([6000, -3000, -3000]);
  expect(settlements(net)).toStrictEqual([
    { from: 1, to: 0, amount: 3000 },
    { from: 2, to: 0, amount: 3000 },
  ]);
});

test('entries from before a person joined leave them out', () => {
  const net = balances([e({ home: 10000 }), e({ home: 3000, paidBy: 2, shares: [1, 1, 1] })], 3);
  expect(net).toStrictEqual([4000, -6000, 2000]);
  expect(net.reduce((a, b) => a + b)).toBe(0);
});

test('settlements zero out every balance', () => {
  const net = [7000, -2500, -6000, 1500];
  const paid = [...net];
  for (const s of settlements(net)) {
    paid[s.from]! += s.amount;
    paid[s.to]! -= s.amount;
  }
  expect(paid).toStrictEqual([0, 0, 0, 0]);
});

test('a transfer settles the balance and is not spending', () => {
  const entries = [
    e({ home: 10000 }),
    e({ kind: 'transfer', home: 5000, paidBy: 1, shares: transferShares(0) }),
  ];
  expect(balances(entries, 2)).toStrictEqual([0, 0]);
  const s = summarize(entries, 2);
  expect(s.spent).toBe(10000);
  expect(s.consumed).toStrictEqual([5000, 5000]);
});

test('deleted entries are ignored', () => {
  expect(balances([e({ home: 10000, deleted: true })], 2)).toStrictEqual([0, 0]);
});
