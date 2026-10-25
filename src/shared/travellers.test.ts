import { expect, test } from 'vitest';
import { balances, settlements } from './ledger.ts';
import {
  active,
  everyone,
  isEveryone,
  isRemoved,
  label,
  removalProblem,
  validMe,
} from './travellers.ts';
import type { Entry } from './types.ts';

const t = {
  travellers: [{ name: 'Ada' }, { name: 'Bo', removed: true as const }, { name: 'Ada' }],
};

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
  shares: [1, 1, 1],
  updatedAt: 0,
  deleted: false,
};
const e = (p: Partial<Entry>): Entry => ({ ...base, ...p });
const kr = (minor: number) => `${minor / 100} kr`;

test('removed travellers keep their index and are told apart from same-named ones', () => {
  expect(isRemoved(t, 1)).toBe(true);
  expect(isRemoved(t, 0)).toBe(false);
  expect(active(t)).toStrictEqual([0, 2]);
  expect(label(t, 0)).toBe('Ada');
  expect(label(t, 1)).toBe('Bo (removed)');
  expect(label(t, 2)).toBe('Ada');
  expect(label(t, 7)).toBe('Traveller 8');
});

test('everyone means every active traveller, with equal weight', () => {
  expect(everyone(t)).toStrictEqual([1, 0, 1]);
  expect(isEveryone(t, [1, 0, 1])).toBe(true);
  expect(isEveryone(t, [1, 1, 1]), 'an old split that included Bo is a named split').toBe(false);
  expect(isEveryone(t, [2, 0, 2])).toBe(true);
  expect(isEveryone(t, [1, 0]), 'a missing trailing weight is 0').toBe(false);
  expect(isEveryone(t, [2, 0, 1])).toBe(false);
});

test('this phone is only ever an active traveller', () => {
  expect(validMe(t, 1), 'removed').toBeNull();
  expect(validMe(t, 3), 'out of range').toBeNull();
  expect(validMe(t, '0'), 'not a number').toBeNull();
  expect(validMe(t, undefined)).toBeNull();
  expect(validMe(t, 0.5)).toBeNull();
  expect(validMe(t, 2)).toBe(2);
});

test('a traveller can be removed only when settled and two others stay', () => {
  const three = { travellers: [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy' }] };
  expect(removalProblem(three, [], 1, kr)).toBeNull();
  const dinner = e({ home: 30000, paidBy: 0 });
  expect(removalProblem(three, [dinner], 1, kr)).toBe('Bo still owes 100 kr. Settle up first.');
  expect(removalProblem(three, [dinner], 0, kr)).toBe('Ada is still owed 200 kr. Settle up first.');
  expect(
    removalProblem(three, [{ ...dinner, deleted: true }], 1, kr),
    'a deleted entry does not count',
  ).toBeNull();
  expect(removalProblem({ travellers: [{ name: 'Ada' }, { name: 'Bo' }] }, [], 0, kr)).toBe(
    'A trip needs at least two travellers.',
  );
  expect(
    removalProblem({ travellers: [...t.travellers, { name: 'Di' }] }, [], 0, kr),
    'removed travellers do not count toward the two',
  ).toBeNull();
  expect(removalProblem(t, [], 0, kr)).toBe('A trip needs at least two travellers.');
});

test('a removed traveller whose balance moves later still shows up in settlements', () => {
  const late = e({ home: 3, paidBy: 0, shares: [1, 1, 1] });
  const owed = settlements(balances([late], t.travellers.length));
  expect(owed.map((s) => s.from)).toContain(1);
});
