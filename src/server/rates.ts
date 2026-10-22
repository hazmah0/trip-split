import type { Db } from './db.ts';

type Frankfurter = { date: string; rates: Record<string, number> };

async function frankfurter<T>(path: string): Promise<T> {
  const url = `https://api.frankfurter.dev/v1/${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`frankfurter ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// base=home and invert: KRW->SEK directly comes back as 0.00747, with too few significant digits.
async function fetchInverted(
  date: string,
  currencies: string[],
  home: string,
): Promise<Frankfurter> {
  const body = await frankfurter<Frankfurter>(
    `${date}?base=${home}&symbols=${currencies.join(',')}`,
  );
  const rates: Record<string, number> = {};
  for (const c of currencies) {
    const r = body.rates?.[c];
    if (typeof r !== 'number' || !(r > 0))
      throw new Error(`frankfurter has no ${c} rate for ${date}`);
    rates[c] = 1 / r;
  }
  return { date: body.date, rates };
}

const today = () => new Date().toISOString().slice(0, 10);

let known: Set<string> | undefined;

export async function unsupportedCurrencies(codes: string[]): Promise<string[]> {
  try {
    known ??= new Set(Object.keys(await frankfurter<Record<string, string>>('currencies')));
  } catch (err) {
    console.warn(`currency list unavailable, skipping the check: ${(err as Error).message}`);
    return [];
  }
  return codes.filter((c) => !known!.has(c));
}

export async function rateFor(
  db: Db,
  date: string,
  currency: string,
  home: string,
): Promise<number> {
  // Only past rates are final; today's may not be published yet.
  if (date >= today()) {
    const rate = (await latestRates(db, [currency], home))[currency];
    if (rate === undefined) throw new Error(`no ${currency} rate known`);
    return rate;
  }
  const cached = db.getRate(date, currency, home);
  if (cached !== null) return cached;
  try {
    const rate = (await fetchInverted(date, [currency], home)).rates[currency]!;
    db.putRate(date, currency, home, rate);
    return rate;
  } catch (err) {
    const fallback = db.latestRate(currency, home);
    if (fallback === null) throw err;
    console.warn(`rate lookup failed, using last cached ${currency}: ${(err as Error).message}`);
    return fallback;
  }
}

const LATEST_TTL = 60 * 60_000;
const fetchedAt = new Map<string, number>();

export async function latestRates(
  db: Db,
  currencies: string[],
  home: string,
): Promise<Record<string, number>> {
  const now = Date.now();
  if (currencies.some((c) => now - (fetchedAt.get(`${home}:${c}`) ?? 0) >= LATEST_TTL)) {
    try {
      const res = await fetchInverted('latest', currencies, home);
      for (const [c, r] of Object.entries(res.rates)) {
        db.putRate(res.date, c, home, r);
        fetchedAt.set(`${home}:${c}`, now);
      }
    } catch (err) {
      console.warn(`latest rates failed, using cache: ${(err as Error).message}`);
    }
  }
  const out: Record<string, number> = {};
  for (const c of currencies) {
    const r = db.latestRate(c, home);
    if (r !== null) out[c] = r;
  }
  return out;
}
