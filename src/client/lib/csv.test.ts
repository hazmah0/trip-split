import { expect, test } from 'vitest';
import { tripCsv } from './csv.ts';
import type { Entry, Trip } from '../../shared/types.ts';

const trip: Trip = {
  id: 't',
  name: 'Korea',
  travellers: [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy' }],
  home: 'SEK',
  locals: ['KRW'],
  budget: null,
  updatedAt: 0,
  deleted: false,
};
const base: Entry = {
  id: 'x',
  tripId: 't',
  kind: 'expense',
  date: '2026-10-21',
  title: 'Bibimbap',
  category: 'food',
  amount: 15000,
  currency: 'KRW',
  rate: 0.0074867,
  rateManual: false,
  home: 11230,
  paidBy: 0,
  shares: [1, 1],
  updatedAt: 0,
  deleted: false,
};

test('exports oldest first, quotes awkward text, and splits shares across everyone', () => {
  const entries: Entry[] = [
    {
      ...base,
      id: 'b',
      date: '2026-10-22',
      kind: 'transfer',
      title: 'Settle up',
      category: 'other',
      amount: 5615,
      currency: 'SEK',
      rate: 1,
      home: 5615,
      paidBy: 1,
      shares: [1],
    },
    { ...base, note: 'Bo said "never again",\nspicy' },
  ];
  expect(tripCsv(entries, trip).split('\r\n')).toStrictEqual([
    'Date,Type,Title,Category,Note,Amount,Currency,Rate,Amount (SEK),Paid by,Ada share (SEK),Bo share (SEK),Cy share (SEK)',
    '2026-10-21,Expense,Bibimbap,Food,"Bo said ""never again"",\nspicy",15000,KRW,0.0074867,112.30,Ada,56.15,56.15,0.00',
    '2026-10-22,Transfer,Settle up,,,56.15,SEK,1,56.15,Bo,56.15,0.00,0.00',
  ]);
});

test('a removed traveller keeps their column and is labelled as removed', () => {
  const gone: Trip = { ...trip, travellers: [{ name: 'Ada' }, { name: 'Bo', removed: true }] };
  const rows = tripCsv([{ ...base, paidBy: 1 }], gone).split('\r\n');
  expect(rows[0]).toMatch(/,Paid by,Ada share \(SEK\),Bo \(removed\) share \(SEK\)$/);
  expect(rows[1]).toMatch(/,112\.30,Bo \(removed\),56\.15,56\.15$/);
});
