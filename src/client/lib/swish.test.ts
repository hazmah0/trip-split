import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import {
  clearSwish,
  pendingSwish,
  startSwish,
  swishDisplay,
  swishLink,
  swishMessage,
  swishNumber,
  swishToSave,
} from './swish.ts';
import type { Trip } from '../../shared/types.ts';

const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});
afterEach(() => {
  vi.useRealTimers();
  clearSwish();
});

test('Swedish mobile numbers normalize to the Swish link form', () => {
  expect(swishNumber('070-123 45 67')).toBe('46701234567');
  expect(swishNumber('+46 70 123 45 67')).toBe('46701234567');
  expect(swishNumber('0046701234567')).toBe('46701234567');
  expect(swishNumber('46701234567')).toBe('46701234567');
  expect(swishNumber('08 123 456 78')).toBeNull();
  expect(swishNumber('070 123 45')).toBeNull();
  expect(swishDisplay('46701234567')).toBe('0701234567');
});

test('the message keeps only what Swish accepts', () => {
  expect(swishMessage('Korea – Japan 2026')).toBe('Korea - Japan 2026');
  expect(swishMessage('Seoul 🍜 trip')).toBe('Seoul trip');
  expect(swishMessage('Ada & Bo')).toBe('Ada Bo');
  expect(swishMessage('Café crème')).toBe('Cafe creme');
  expect(swishMessage('Åre, Göteborg & Malmö')).toBe('Åre, Göteborg Malmö');
  expect(swishMessage('a\u200Bb')).toBe('ab');
  expect(swishMessage(`${'x'.repeat(49)} yz`)).toBe('x'.repeat(49));
  expect(swishMessage('🍜')).toBe('');
});

test('the link carries number, amount with two decimals and a %20-encoded message', () => {
  expect(swishLink('46701234567', 34000, 'Korea – Japan')).toBe(
    'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=340.00&msg=Korea%20-%20Japan',
  );
  expect(swishLink('46701234567', 12345, '🍜')).toBe(
    'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=123.45',
  );
});

test('a pending payment is for its own trip and expires after an hour', () => {
  vi.useFakeTimers({ now: 1_000_000 });
  const p = { tripId: 't', from: 0, to: 1, amount: 34000, at: Date.now() };
  expect(pendingSwish('t')).toBeNull();
  startSwish(p);
  expect(pendingSwish('t')).toStrictEqual(p);
  expect(pendingSwish('other')).toBeNull();
  vi.advanceTimersByTime(60 * 60 * 1000 + 1);
  expect(pendingSwish('t')).toBeNull();
  vi.setSystemTime(p.at);
  expect(pendingSwish('t'), 'expired payment is cleared').toBeNull();
});

test('the trip form sends your Swish number only when it changed', () => {
  const trip = {
    travellers: [{ name: 'Ada' }, { name: 'Bo', swish: '46701740605' }],
  } as Trip;
  expect(swishToSave(trip, 1, undefined), 'untouched').toStrictEqual({ send: null });
  expect(swishToSave(trip, 1, '070-174 06 05'), 'same number').toStrictEqual({ send: null });
  expect(swishToSave(trip, 0, '070 174 06 06'), 'new number').toStrictEqual({
    send: '46701740606',
  });
  expect(swishToSave(trip, 1, ' '), 'cleared').toStrictEqual({ send: '' });
  expect(swishToSave(trip, 1, '08 123 456 78')).toHaveProperty('error');
});
