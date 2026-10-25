import { expect, test } from 'vitest';
import { authorsLine, groupAmount, listNames, money, parseAmount } from './format.ts';

test('parses what people type', () => {
  expect(parseAmount('18000', 'KRW')).toBe(18000);
  expect(parseAmount('18,000', 'KRW')).toBe(18000);
  expect(parseAmount('18 000', 'KRW')).toBe(18000);
  expect(parseAmount('136,40', 'SEK')).toBe(13640);
  expect(parseAmount('1 234,5', 'SEK')).toBe(123450);
  expect(parseAmount('1,234.50', 'SEK')).toBe(123450);
  expect(parseAmount('0', 'SEK')).toBe(null);
  expect(parseAmount('abc', 'SEK')).toBe(null);
  expect(parseAmount('', 'SEK')).toBe(null);
});

test('formats word symbols after and glyph symbols before', () => {
  expect(money(128400, 'SEK').replace(/\s/g, ' ')).toBe('1 284 kr');
  expect(money(18000, 'KRW').replace(/\s/g, ' ')).toBe('₩18 000');
  expect(money(2960, 'JPY').replace(/\s/g, ' ')).toBe('¥2 960');
});

test('groups typed amounts and round-trips through parseAmount', () => {
  expect(groupAmount('86000', 'KRW')).toBe('86 000');
  expect(groupAmount('86,000', 'KRW')).toBe('86 000');
  expect(groupAmount('1234,5', 'SEK')).toBe('1 234,5');
  expect(groupAmount('1234.567', 'SEK')).toBe('1 234,56');
  expect(groupAmount('136,', 'SEK')).toBe('136,');
  expect(groupAmount('', 'SEK')).toBe('');
  expect(parseAmount(groupAmount('1234,5', 'SEK'), 'SEK')).toBe(123450);
  expect(parseAmount(groupAmount('86000', 'KRW'), 'KRW')).toBe(86000);
});

test('lists names', () => {
  expect(listNames(['Ada'])).toBe('Ada');
  expect(listNames(['Ada', 'Bo'])).toBe('Ada & Bo');
  expect(listNames(['Ada', 'Bo', 'Cy'])).toBe('Ada, Bo & Cy');
});

test.each([
  [{ addedBy: 0 }, 'Added by Ada'],
  [{ addedBy: 0, editedBy: 1 }, 'Added by Ada · edited by Bo'],
  [{ addedBy: 1, editedBy: 1 }, 'Added and edited by Bo'],
  [{ editedBy: 1 }, 'Edited by Bo'],
  [{}, null],
  [{ addedBy: 2 }, 'Added by Cy (removed)'],
])('names who added and edited %o', (entry, line) => {
  const trip = {
    travellers: [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy', removed: true as const }],
  };
  expect(authorsLine(entry, trip)).toBe(line);
});
