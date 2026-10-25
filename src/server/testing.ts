import { afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EntryInput, Trip } from '../shared/types.ts';

const FX: Record<string, Record<string, number>> = {
  SEK: { KRW: 133.57, JPY: 15.836 },
  EUR: { KRW: 1580.2, JPY: 172.4 },
};

export const realFetch = globalThis.fetch;
export const frankfurter = { calls: [] as string[], down: false };

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('https://api.frankfurter.dev/')) return realFetch(input, init);
  frankfurter.calls.push(url);
  if (frankfurter.down) throw new TypeError('fetch failed');
  if (url.endsWith('/currencies'))
    return Response.json({
      EUR: 'Euro',
      JPY: 'Japanese Yen',
      KRW: 'South Korean Won',
      SEK: 'Swedish Krona',
    });
  const base = new URL(url).searchParams.get('base')!;
  return Response.json({ amount: 1, base, date: '2026-10-22', rates: FX[base] });
};

export const dir = mkdtempSync(join(tmpdir(), 'trip-split-test-'));
export const dist = join(dir, 'dist');
mkdirSync(join(dist, 'assets'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<!doctype html>app');
writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
writeFileSync(join(dir, 'secret.txt'), 'secret');

afterAll(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

export const request = (base: string, jar: string, path: string, method = 'GET', body?: unknown) =>
  realFetch(base + path, {
    method,
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const jarOf = (jar: string, res: Response) =>
  [jar, ...res.headers.getSetCookie().map((c) => c.split(';')[0])].filter(Boolean).join('; ');

export const people = (...names: string[]) => names.map((name) => ({ name }));

export const trip = (p: Partial<Trip> = {}): Trip => ({
  id: 'a',
  name: 'Korea & Japan',
  travellers: people('Ada', 'Bo'),
  home: 'SEK',
  locals: ['KRW', 'JPY'],
  budget: 5000000,
  updatedAt: 1000,
  deleted: false,
  ...p,
});

export const entry = (p: Partial<EntryInput> = {}): EntryInput => ({
  id: 'e1',
  tripId: 'a',
  kind: 'expense',
  date: '2026-10-20',
  title: 'bibimbap',
  category: 'food',
  amount: 15000,
  currency: 'KRW',
  rate: null,
  rateManual: false,
  paidBy: 0,
  shares: [1, 1],
  updatedAt: 1000,
  deleted: false,
  ...p,
});
