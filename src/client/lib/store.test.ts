import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EntryInput, State } from '../../shared/types.ts';
import { start } from '../../server/main.ts';

const realFetch = globalThis.fetch;
const storage = new Map<string, string>();
const dir = mkdtempSync(join(tmpdir(), 'trip-split-store-'));
let app: Awaited<ReturnType<typeof start>>;
let store: typeof import('./store.ts');

beforeAll(async () => {
  app = await start({ port: 0, dataDir: join(dir, 'data'), passcode: '', distDir: dir });
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) =>
    path.startsWith('https://')
      ? Promise.reject(new TypeError('fetch failed'))
      : realFetch(app.url + path, init),
  );
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
  store = await import('./store.ts');
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const entry = (id: string, currency: string): Omit<EntryInput, 'updatedAt'> => ({
  id,
  tripId: 't',
  kind: 'expense',
  date: '2026-08-01',
  title: id,
  category: 'food',
  amount: 10000,
  currency,
  rate: null,
  rateManual: false,
  paidBy: 0,
  shares: [1, 1],
  deleted: false,
});

test('an entry the server cannot price stays queued without blocking the rest of the sync', async () => {
  await store.saveTrip({
    id: 't',
    name: 'Seoul',
    names: ['Ada', 'Bo'],
    home: 'SEK',
    locals: ['KRW'],
    budget: null,
    deleted: false,
  });
  store.saveEntry(entry('krw', 'KRW'));
  store.saveEntry(entry('sek', 'SEK'));
  await store.sync();
  await store.sync();

  const server = (await (await realFetch(`${app.url}/api/state`)).json()) as State;
  expect(server.entries.map((e) => e.id)).toStrictEqual(['sek']);
  expect(Object.keys(JSON.parse(storage.get('tb:outbox2')!))).toStrictEqual(['krw']);
  const cached = JSON.parse(storage.get('tb:state2')!) as State;
  expect(
    cached.entries.map((e) => e.id),
    'state was pulled after the failed entry',
  ).toStrictEqual(['sek']);
});
