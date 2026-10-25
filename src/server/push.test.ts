import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { join } from 'node:path';
import webpush from 'web-push';
import type { EntryInput, State } from '../shared/types.ts';
import { start } from './main.ts';
import { pushFromEnv } from './push.ts';
import { dir, dist, entry, jarOf, people, request, trip } from './testing.ts';

const withoutDevice = (jar: string) =>
  jar
    .split('; ')
    .filter((c) => !c.startsWith('tb_device='))
    .join('; ');
const endpoint = (device: string) => `https://fcm.googleapis.com/fcm/send/${device}`;
const note = (to: string, ...lines: string[]) => ({
  to,
  title: 'Seoul',
  body: lines.join('\n'),
  tripId: 'p',
});

const sent: { to: string; title: string; body: string; tripId: string }[] = [];
const gone = new Set<string>();
const keys = { p256dh: 'p256dh', auth: 'auth' };
let srv: Awaited<ReturnType<typeof start>>;
let owner = '';
let bo = '';
let cy = '';

const req = (jar: string, path: string, method = 'GET', body?: unknown) =>
  request(srv.url, jar, path, method, body);
const logIn = async (code: string, jar = '') =>
  jarOf(jar, await req('', '/api/login', 'POST', { code }));
const pushOn = async (jar: string, device: string, tripId = 'p') => {
  const res = await req(jar, `/api/push/${tripId}`, 'PUT', { endpoint: endpoint(device), keys });
  return { res, jar: jarOf(jar, res) };
};
const status = async (jar: string) => (await req(jar, '/api/push/p')).json();
const save = (jar: string, p: Partial<EntryInput>) =>
  req(
    jar,
    `/api/entries/${p.id}`,
    'PUT',
    entry({ tripId: 'p', currency: 'SEK', amount: 4500, ...p }),
  );
const drain = async (n: number) => {
  await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(n));
  return sent.splice(0).sort((a, b) => a.to.localeCompare(b.to));
};

beforeAll(async () => {
  srv = await start({
    port: 0,
    dataDir: join(dir, 'push'),
    passcode: 'pw',
    distDir: dist,
    push: {
      publicKey: 'test-key',
      delayMs: 50,
      send: async (to, payload) => {
        sent.push({ to: to.endpoint.split('/').at(-1)!, ...JSON.parse(payload) });
        return gone.has(to.endpoint) ? 'gone' : 'sent';
      },
    },
  });
  owner = await logIn('pw');
  const seoul = trip({
    id: 'p',
    name: 'Seoul',
    travellers: people('Ada', 'Bo', 'Cy'),
    locals: ['KRW'],
  });
  await req(owner, '/api/trips/p', 'PUT', seoul);
  await req(owner, '/api/trips/q', 'PUT', trip({ id: 'q', name: 'Elsewhere', locals: [] }));
  const code = ((await (await req(owner, '/api/state')).json()) as State).invites.p!;
  bo = await logIn(code);
  cy = await logIn(code);
});
afterAll(() => srv.close());

test('subscribing needs a known https push service and a trip the device can see', async () => {
  expect(await status(owner)).toStrictEqual({ key: 'test-key', on: false });
  for (const bad of [
    'http://fcm.googleapis.com/fcm/send/x',
    'https://push.example.com/x',
    'https://evil.com#.googleapis.com/',
    'https://fcm.googleapis.com.evil.com/x',
  ]) {
    const res = await req(owner, '/api/push/p', 'PUT', { endpoint: bad, keys });
    expect(res.status, bad).toBe(400);
  }
  expect((await pushOn(bo, 'B', 'q')).res.status, 'bo is a member of p only').toBe(403);

  const a = await pushOn(owner, 'A');
  expect(await a.res.json()).toStrictEqual({ key: 'test-key', on: true });
  expect(a.res.headers.get('set-cookie')).toMatch(/^tb_device=[\w-]{22};.*HttpOnly/);
  owner = a.jar;
  expect(await status(owner)).toStrictEqual({ key: 'test-key', on: true });
  bo = (await pushOn(bo, 'B')).jar;
});

test('a new expense notifies every other subscribed device once', async () => {
  expect((await save(cy, { id: 'p1', currency: 'KRW', amount: 15000 })).status).toBe(200);
  const line = 'Ada paid 15 000 KRW for bibimbap';
  expect(await drain(2)).toStrictEqual([note('A', line), note('B', line)]);
});

test('the device that saved the entry is not notified', async () => {
  await save(owner, { id: 'p2', title: 'Taxi' });
  expect(await drain(1)).toStrictEqual([note('B', 'Ada paid 45 SEK for Taxi')]);
});

test('edits, deletes, stale retries and tombstones notify nobody', async () => {
  await save(cy, { id: 'p1', currency: 'KRW', amount: 15000, title: 'edit', updatedAt: 1001 });
  await save(cy, { id: 'p2', title: 'Taxi', deleted: true, updatedAt: 1001 });
  await save(cy, { id: 'p1', currency: 'KRW', amount: 15000, updatedAt: 1000 });
  await save(cy, { id: 'p9', deleted: true });
  await save(cy, { id: 'p4', title: 'Oops' });
  await save(cy, { id: 'p4', title: 'Oops', deleted: true, updatedAt: 1001 });
  await save(cy, { id: 'p3', title: 'Coffee' });
  const line = 'Ada paid 45 SEK for Coffee';
  expect(await drain(2), 'only the one entry still live').toStrictEqual([
    note('A', line),
    note('B', line),
  ]);
});

test('back-to-back new entries arrive as one notification per device', async () => {
  for (const [i, title] of ['Lunch', 'Metro', 'Museum', 'Dinner'].entries())
    await save(cy, { id: `b${i}`, title });
  const body = ['Lunch', 'Metro', 'Museum'].map((t) => `Ada paid 45 SEK for ${t}`);
  expect(await drain(2)).toStrictEqual([
    note('A', ...body, '+1 more'),
    note('B', ...body, '+1 more'),
  ]);
});

test('two devices saving at once each hear only about the other one', async () => {
  cy = (await pushOn(cy, 'C')).jar;
  await save(owner, { id: 'w1', title: 'Fuel' });
  await save(bo, { id: 'w2', title: 'Snacks', paidBy: 1 });
  const fuel = 'Ada paid 45 SEK for Fuel';
  const snacks = 'Bo paid 45 SEK for Snacks';
  expect(await drain(3)).toStrictEqual([
    note('A', snacks),
    note('B', fuel),
    note('C', fuel, snacks),
  ]);
});

test('a subscription the push service calls gone is deleted', async () => {
  gone.add(endpoint('B'));
  await save(cy, { id: 'g1', title: 'Tea' });
  const tea = 'Ada paid 45 SEK for Tea';
  expect(await drain(2)).toStrictEqual([note('A', tea), note('B', tea)]);
  expect(await status(bo)).toStrictEqual({ key: 'test-key', on: false });
  await save(cy, { id: 'g2', title: 'Cake' });
  expect(await drain(1)).toStrictEqual([note('A', 'Ada paid 45 SEK for Cake')]);
  gone.clear();
  expect(await (await pushOn(bo, 'B')).res.json()).toStrictEqual({ key: 'test-key', on: true });
});

test('turning notifications off stops them for that device only', async () => {
  expect(await (await req(bo, '/api/push/p', 'DELETE')).json()).toStrictEqual({
    key: 'test-key',
    on: false,
  });
  await save(cy, { id: 'o1', title: 'Soju' });
  expect(await drain(1)).toStrictEqual([note('A', 'Ada paid 45 SEK for Soju')]);
  expect(await status(cy), 'C is still on').toStrictEqual({ key: 'test-key', on: true });
});

test('an invite reset stops member notifications, the owner keeps getting them', async () => {
  const reset = await req(owner, '/api/trips/p/invite', 'POST');
  const { code } = (await reset.json()) as { code: string };
  await save(withoutDevice(owner), { id: 'r1', title: 'Bus' });
  expect(await drain(1), 'not B or C').toStrictEqual([note('A', 'Ada paid 45 SEK for Bus')]);

  const device = bo.split('; ').find((c) => c.startsWith('tb_device='))!;
  const back = await logIn(code, device);
  expect(await status(back), 'rejoining does not revive the old grant').toStrictEqual({
    key: 'test-key',
    on: false,
  });
});

test('a removed payer is named as removed', async () => {
  await req(owner, '/api/trips/p/travellers', 'POST', { name: 'Di' });
  await req(owner, '/api/trips/p/travellers', 'PATCH', { person: 3, removed: true });
  await save(withoutDevice(owner), { id: 'rm1', title: 'Late', paidBy: 3, shares: [1, 1, 1, 1] });
  expect(await drain(1)).toStrictEqual([note('A', 'Di (removed) paid 45 SEK for Late')]);
});

test('a settle-up payment names who got paid', async () => {
  await save(withoutDevice(owner), {
    id: 't1',
    kind: 'transfer',
    title: '',
    amount: 30000,
    shares: [0, 1],
  });
  expect(await drain(1)).toStrictEqual([note('A', 'Ada paid Bo 300 SEK')]);
});

test('push settings are checked at start, not on the first send', () => {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  const env = { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey };
  expect(() => pushFromEnv({ ...env, VAPID_SUBJECT: 'you@example.com' })).toThrow(/subject/);
  expect(() => pushFromEnv({ ...env, VAPID_SUBJECT: 'mailto:you@example.com' })).not.toThrow();
  expect(() => pushFromEnv(env)).toThrow(/set all of/);
  expect(pushFromEnv({})).toBeNull();
});
