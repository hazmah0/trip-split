import { toMajor } from '../../shared/ledger.ts';
import { SWISH_NUMBER, type Person, type Trip } from '../../shared/types.ts';
import { KEY, read, remove, write } from './storage.ts';

export type SwishPayment = {
  tripId: string;
  from: Person;
  to: Person;
  amount: number;
  at: number;
};

export const SWISH_CURRENCY = 'SEK';
const HOUR = 60 * 60 * 1000;
const ALLOWED = /^[a-zA-Z0-9åäöÅÄÖ !?(),.:;-]$/;
const plain = (c: string) => c.normalize('NFD').replace(/\p{M}/gu, '');

export function swishNumber(text: string): string | null {
  const n = text.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '46');
  return SWISH_NUMBER.test(n) ? n : null;
}

export const swishDisplay = (n: string) => n.replace(/^46/, '0');

export function swishToSave(
  trip: Trip,
  me: Person,
  typed: string | undefined,
): { send: string | null } | { error: string } {
  if (typed === undefined) return { send: null };
  const number = typed.trim() ? swishNumber(typed) : '';
  if (number === null)
    return { error: 'Enter a Swedish mobile number for Swish, like 070 123 45 67.' };
  return { send: number === (trip.travellers[me]?.swish ?? '') ? null : number };
}

export function swishMessage(text: string): string {
  return [...text.replace(/[‐-―−]/g, '-').replace(/\p{Cf}/gu, '')]
    .map((c) => [c, plain(c)].find((x) => ALLOWED.test(x)) ?? ' ')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
    .trim();
}

export function swishLink(number: string, amount: number, message: string): string {
  const msg = swishMessage(message);
  const amt = toMajor(amount, SWISH_CURRENCY).toFixed(2);
  return `https://app.swish.nu/1/p/sw/?sw=${number}&amt=${amt}${msg ? `&msg=${encodeURIComponent(msg)}` : ''}`;
}

export const startSwish = (p: Omit<SwishPayment, 'at'>) =>
  write(KEY.swish, { ...p, at: Date.now() });
export const clearSwish = () => remove(KEY.swish);

export function pendingSwish(tripId: string): SwishPayment | null {
  const p = read<SwishPayment | null>(KEY.swish, null);
  if (!p) return null;
  if (Date.now() - p.at > HOUR) {
    clearSwish();
    return null;
  }
  return p.tripId === tripId ? p : null;
}
