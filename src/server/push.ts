import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import webpush from 'web-push';
import { receiver, toMajor } from '../shared/ledger.ts';
import { PushSubscriptionSchema } from '../shared/schema.ts';
import type { Entry, PushTarget, Trip } from '../shared/types.ts';
import { cookieAttrs, inviteCodeOf, need } from './access.ts';
import type { Env } from './access.ts';
import { newCode } from './db.ts';
import type { Db } from './db.ts';
import { readJson } from './http.ts';

export type SendPush = (to: PushTarget, payload: string) => Promise<'sent' | 'gone'>;
export type PushConfig = { publicKey: string; send: SendPush; delayMs?: number };
export type Push = ReturnType<typeof createPush>;
type Burst = { timer: NodeJS.Timeout; items: { id: string; device: string | null }[] };

const DEVICE = 'tb_device';
const MAX_LINES = 3;

export function pushFromEnv(env: NodeJS.ProcessEnv): PushConfig | null {
  const {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject,
  } = env;
  if (!publicKey && !privateKey && !subject) return null;
  if (!publicKey || !privateKey || !subject)
    throw new Error('set all of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT, or none');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, send: webPushSend };
}

const webPushSend: SendPush = async (to, payload) => {
  try {
    await webpush.sendNotification(to, payload, { TTL: 86_400 });
    return 'sent';
  } catch (err) {
    if (!(err instanceof webpush.WebPushError)) throw err;
    if (err.statusCode === 404 || err.statusCode === 410) return 'gone';
    throw new Error(`push service answered ${err.statusCode}`, { cause: err });
  }
};

function ensureDevice(c: Context<Env>): string {
  const known = getCookie(c, DEVICE);
  if (known) return known;
  const device = newCode();
  setCookie(c, DEVICE, device, cookieAttrs(c));
  return device;
}

// shortcut: currency codes, not money()'s symbols (client-only, not in the image), share money() if that matters
const amount = (e: Entry) =>
  `${toMajor(e.amount, e.currency).toLocaleString('sv-SE')} ${e.currency}`;

const line = (trip: Trip, e: Entry) =>
  e.kind === 'transfer'
    ? `${trip.names[e.paidBy]} paid ${trip.names[receiver(e)]} ${amount(e)}`
    : `${trip.names[e.paidBy]} paid ${amount(e)} for ${e.title || e.category}`;

function message(trip: Trip, entries: Entry[]) {
  const lines = entries.slice(0, MAX_LINES).map((e) => line(trip, e));
  if (entries.length > MAX_LINES) lines.push(`+${entries.length - MAX_LINES} more`);
  return { title: trip.name, body: lines.join('\n'), tripId: trip.id };
}

export function createPush(db: Db, config: PushConfig | null) {
  if (!config)
    return { routes: new Hono<Env>(), created: (_e: Entry, _c: Context<Env>) => {}, close() {} };

  const { publicKey, send, delayMs = 3000 } = config;
  const pending = new Map<string, Burst>();
  const status = (tripId: string, device: string | undefined) => ({
    key: publicKey,
    on: !!device && db.hasPush(tripId, device),
  });

  function created(entry: Entry, c: Context<Env>) {
    const { tripId } = entry;
    const item = { id: entry.id, device: getCookie(c, DEVICE) ?? null };
    const burst = pending.get(tripId);
    if (burst) {
      burst.items.push(item);
      burst.timer.refresh();
      return;
    }
    const items = [item];
    const timer = setTimeout(() => {
      pending.delete(tripId);
      void flush(tripId, items);
    }, delayMs).unref();
    pending.set(tripId, { timer, items });
  }

  async function flush(tripId: string, items: Burst['items']) {
    const trip = db.getTrip(tripId);
    if (!trip || trip.deleted) return;
    const live = items.flatMap(({ id, device }) => {
      const e = db.getEntry(id);
      return e && !e.deleted ? [{ e, device }] : [];
    });
    await Promise.all(
      db.pushTargets(tripId).map(async ({ device, endpoint, p256dh, auth }) => {
        const theirs = live.filter((x) => x.device !== device).map((x) => x.e);
        if (!theirs.length) return;
        const payload = JSON.stringify(message(trip, theirs));
        try {
          if ((await send({ endpoint, keys: { p256dh, auth } }, payload)) === 'gone')
            db.dropEndpoint(endpoint);
        } catch (err) {
          console.error(`push to ${new URL(endpoint).host} failed:`, (err as Error).message);
        }
      }),
    );
  }

  const routes = new Hono<Env>()
    .get('/:tripId', (c) => {
      const tripId = c.req.param('tripId');
      need(c.get('access'), tripId);
      return c.json(status(tripId, getCookie(c, DEVICE)));
    })
    .put('/:tripId', async (c) => {
      const tripId = c.req.param('tripId');
      need(c.get('access'), tripId);
      const trip = db.getTrip(tripId);
      if (!trip || trip.deleted) throw new HTTPException(404, { message: 'trip not found' });
      const sub = PushSubscriptionSchema.safeParse(await readJson(c));
      if (!sub.success)
        throw new HTTPException(400, {
          message:
            sub.error.issues[0]!.path[0] === 'endpoint'
              ? 'unsupported push service'
              : 'invalid subscription',
        });
      const code = inviteCodeOf(c, tripId);
      const device = ensureDevice(c);
      db.putPush({ tripId, device, code, ...sub.data });
      return c.json(status(tripId, device));
    })
    .delete('/:tripId', (c) => {
      const tripId = c.req.param('tripId');
      need(c.get('access'), tripId);
      const device = getCookie(c, DEVICE);
      if (device) db.dropPush(tripId, device);
      return c.json(status(tripId, device));
    });

  const close = () => {
    for (const b of pending.values()) clearTimeout(b.timer);
    pending.clear();
  };

  return { routes, created, close };
}
