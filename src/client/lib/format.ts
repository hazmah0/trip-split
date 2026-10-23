import { decimals, toMajor, toMinor } from '../../shared/ledger.ts';
import type { Entry } from '../../shared/types.ts';

const symbols = new Map<string, string>();
export function currencySymbol(currency: string): string {
  let s = symbols.get(currency);
  if (s === undefined) {
    s =
      new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency;
    symbols.set(currency, s);
  }
  return s;
}

const numberFormats = new Map<number, Intl.NumberFormat>();
export function money(minor: number, currency: string, opts: { cents?: boolean } = {}): string {
  const digits = opts.cents ? decimals(currency) : 0;
  let f = numberFormats.get(digits);
  if (!f)
    numberFormats.set(
      digits,
      (f = new Intl.NumberFormat('sv-SE', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })),
    );
  const n = f.format(toMajor(minor, currency));
  const s = currencySymbol(currency);
  return /^\p{L}+$/u.test(s) ? `${n} ${s}` : `${s}${n}`;
}

export function listNames(list: string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} & ${list.at(-1)}`;
}

export function authorsLine(
  { addedBy, editedBy }: Pick<Entry, 'addedBy' | 'editedBy'>,
  names: string[],
): string | null {
  if (addedBy === undefined) return editedBy === undefined ? null : `Edited by ${names[editedBy]}`;
  if (editedBy === undefined) return `Added by ${names[addedBy]}`;
  return editedBy === addedBy
    ? `Added and edited by ${names[addedBy]}`
    : `Added by ${names[addedBy]} · edited by ${names[editedBy]}`;
}

export function today(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function parseAmount(text: string, currency: string): number | null {
  let t = text.replace(/[\s ]/g, '');
  if (!t) return null;
  const lastSep = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  // A separator followed by exactly 3 digits is a thousands separator (zero-decimal currencies type "18,000").
  if (lastSep >= 0 && t.length - lastSep - 1 === 3) t = t.replace(/[.,]/g, '');
  else if (lastSep >= 0) t = t.slice(0, lastSep).replace(/[.,]/g, '') + '.' + t.slice(lastSep + 1);
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const minor = toMinor(Number(t), currency);
  return minor > 0 ? minor : null;
}

export function groupAmount(text: string, currency: string): string {
  const t = text.replace(/[^\d.,]/g, '');
  const d = decimals(currency);
  const sep = d > 0 ? Math.max(t.lastIndexOf(','), t.lastIndexOf('.')) : -1;
  const int = (sep >= 0 ? t.slice(0, sep) : t).replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sep >= 0
    ? `${grouped},${t
        .slice(sep + 1)
        .replace(/[.,]/g, '')
        .slice(0, d)}`
    : grouped;
}

export function majorText(minor: number, currency: string) {
  return groupAmount(String(toMajor(minor, currency)), currency);
}
