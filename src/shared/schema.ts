import { z } from 'zod';
import {
  CATEGORIES,
  CURRENCY_CODE,
  MAX_PEOPLE,
  MAX_SLOTS,
  MIN_ACTIVE,
  SWISH_NUMBER,
} from './types.ts';

const currency = z.string().regex(CURRENCY_CODE);
const person = z
  .string()
  .max(40)
  .refine((s) => s.trim().length > 0);
const nonNegative = z.int().nonnegative();
const cookieSafeId = z.string().regex(/^[\w-]{1,64}$/);
const traveller = z
  .int()
  .min(0)
  .max(MAX_SLOTS - 1);
const swishNumber = z.union([z.literal(''), z.string().regex(SWISH_NUMBER)]);

export const TravellerSchema = z.object({
  name: person,
  removed: z.literal(true).optional(),
  swish: z.string().regex(SWISH_NUMBER).optional(),
});

export const TripSchema = z
  .object({
    id: cookieSafeId,
    name: z.string().trim().min(1).max(80),
    travellers: z
      .array(TravellerSchema)
      .max(MAX_SLOTS)
      .refine((ts) => {
        const n = ts.filter((t) => !t.removed).length;
        return n >= MIN_ACTIVE && n <= MAX_PEOPLE;
      }),
    home: currency,
    locals: z.array(currency),
    budget: nonNegative.nullable(),
    updatedAt: nonNegative,
    deleted: z.boolean(),
  })
  .refine((t) => new Set([t.home, ...t.locals]).size === t.locals.length + 1, { path: ['locals'] });

export const TravellerAddSchema = z.object({ name: person });

export const TravellerPatchSchema = z
  .object({
    person: traveller,
    name: person.optional(),
    removed: z.boolean().optional(),
    swish: swishNumber.optional(),
  })
  .refine((p) => p.name !== undefined || p.removed !== undefined || p.swish !== undefined);

export const EntryInputSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  kind: z.enum(['expense', 'transfer']),
  date: z.iso.date(),
  title: z.string().max(200),
  note: z.string().max(1000).optional(),
  category: z.enum(CATEGORIES),
  amount: z.int().positive(),
  currency,
  rate: z.number().positive().nullable(), // home units per 1 unit of `currency`
  rateManual: z.boolean(),
  paidBy: traveller,
  shares: z
    .array(z.int().min(0).max(100))
    .min(1)
    .max(MAX_SLOTS)
    .refine((s) => s.some((w) => w > 0)),
  addedBy: traveller.optional(),
  editedBy: traveller.optional(),
  updatedAt: nonNegative,
  deleted: z.boolean(),
});

export const LoginSchema = z.object({ code: z.string().max(200) });

// shortcut: allowlist of known push services, add a host if a browser's push service is rejected
const ALLOWED_PUSH_HOSTS =
  /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

export const PushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/, hostname: ALLOWED_PUSH_HOSTS }).max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
