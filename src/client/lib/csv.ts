import { CATEGORY_LABEL } from './labels.ts';
import { allocate, decimals, toMajor } from '../../shared/ledger.ts';
import type { Entry, Trip } from '../../shared/types.ts';

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const major = (minor: number, currency: string) =>
  toMajor(minor, currency).toFixed(decimals(currency));

export function tripCsv(entries: Entry[], trip: Trip): string {
  const { names, home } = trip;
  const head = [
    'Date',
    'Type',
    'Title',
    'Category',
    'Note',
    'Amount',
    'Currency',
    'Rate',
    `Amount (${home})`,
    'Paid by',
  ];
  const rows = entries.toReversed().map((e) => {
    const transfer = e.kind === 'transfer';
    const shares = allocate(
      e.home,
      names.map((_, i) => e.shares[i] ?? 0),
    );
    return [
      e.date,
      transfer ? 'Transfer' : 'Expense',
      e.title,
      transfer ? '' : CATEGORY_LABEL[e.category],
      e.note ?? '',
      major(e.amount, e.currency),
      e.currency,
      String(e.rate),
      major(e.home, home),
      names[e.paidBy]!,
      ...shares.map((x) => major(x, home)),
    ];
  });
  return [[...head, ...names.map((n) => `${n} share (${home})`)], ...rows]
    .map((r) => r.map(cell).join(','))
    .join('\r\n');
}
