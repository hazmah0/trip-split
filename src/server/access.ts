import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { LoginSchema } from '../shared/schema.ts';
import { UNKNOWN_CODE } from '../shared/types.ts';
import type { Db } from './db.ts';
import { readJson } from './http.ts';

const COOKIE = 'tb_session';
const TRIP_COOKIE = 'tb_t_';

export type Access = { owner: true } | { owner: false; trips: ReadonlySet<string> };
export type Env = { Variables: { access: Access } };

export const can = (a: Access, tripId: string) => a.owner || a.trips.has(tripId);
export function need(a: Access, tripId: string) {
  if (!can(a, tripId)) throw new HTTPException(403, { message: 'not a member of this trip' });
}
export function ownerOnly(a: Access, why: string) {
  if (!a.owner) throw new HTTPException(403, { message: why });
}

export const cookieAttrs = (c: Context) =>
  ({
    path: '/',
    maxAge: 31536000,
    httpOnly: true,
    sameSite: 'Lax',
    secure: c.req.header('x-forwarded-proto') === 'https',
  }) as const;

export function inviteCodeOf(c: Context<Env>, tripId: string): string | null {
  if (c.get('access').owner) return null;
  const code = getCookie(c, TRIP_COOKIE + tripId);
  if (!code) throw new HTTPException(403, { message: 'not a member of this trip' });
  return code;
}

function resolveAccess(
  cookies: Record<string, string>,
  isOwner: boolean,
  tripsForCodes: (codes: string[]) => string[],
): Access {
  if (isOwner) return { owner: true };
  const codes = Object.entries(cookies)
    .filter(([name]) => name.startsWith(TRIP_COOKIE))
    .map(([, code]) => code);
  return { owner: false, trips: new Set(tripsForCodes(codes)) };
}

const sha256 = (s: string) => createHmac('sha256', 'trip-split').update(s).digest();
const sessionToken = (passcode: string) =>
  Buffer.from(
    passcode ? createHmac('sha256', passcode).update('trip-split-session').digest('hex') : '',
  );

export function loginRoutes(db: Db, passcode: string) {
  const token = sessionToken(passcode);
  const failures: number[] = [];

  return new Hono().post('/login', async (c) => {
    const code = LoginSchema.safeParse(await readJson(c)).data?.code ?? '';
    // Global brute-force brake: client IPs are unreliable behind proxies, and only a handful of travellers ever log in.
    const now = Date.now();
    while (failures.length && failures[0]! < now - 10 * 60_000) failures.shift();
    if (failures.length >= 20)
      throw new HTTPException(429, { message: 'too many attempts, wait 10 minutes' });

    const tripId = code ? db.liveTripForCode(code) : null;
    if (!tripId && passcode && !timingSafeEqual(sha256(code), sha256(passcode))) {
      failures.push(now);
      throw new HTTPException(UNKNOWN_CODE, { message: "that link or code didn't work" });
    }

    const attrs = cookieAttrs(c);
    if (tripId) setCookie(c, TRIP_COOKIE + tripId, code, attrs);
    else setCookie(c, COOKIE, token.toString(), attrs);
    return c.json({ tripId });
  });
}

export function requireAccess(db: Db, passcode: string): MiddlewareHandler<Env> {
  const token = sessionToken(passcode);

  return async (c, next) => {
    const got = Buffer.from(getCookie(c, COOKIE) ?? '');
    const isOwner = !passcode || (got.length === token.length && timingSafeEqual(got, token));
    const access = resolveAccess(getCookie(c), isOwner, db.tripsForCodes);
    if (!access.owner && !access.trips.size)
      throw new HTTPException(401, { message: 'login required' });
    c.set('access', access);
    await next();
  };
}
