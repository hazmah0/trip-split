import { z } from 'zod';
import { CATEGORIES, CURRENCY_CODE, MAX_PEOPLE } from './types.ts';

const currency = z.string().regex(CURRENCY_CODE);
const person = z
  .string()
  .max(40)
  .refine((s) => s.trim().length > 0);
const nonNegative = z.int().nonnegative();

export const TripSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1).max(80),
    names: z.array(person).min(2).max(MAX_PEOPLE),
    home: currency,
    locals: z.array(currency),
    budget: nonNegative.nullable(),
    updatedAt: nonNegative,
    deleted: z.boolean(),
  })
  .refine((t) => new Set([t.home, ...t.locals]).size === t.locals.length + 1, { path: ['locals'] });

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
  paidBy: z
    .int()
    .min(0)
    .max(MAX_PEOPLE - 1),
  shares: z
    .array(z.int().min(0).max(100))
    .min(1)
    .max(MAX_PEOPLE)
    .refine((s) => s.some((w) => w > 0)),
  updatedAt: nonNegative,
  deleted: z.boolean(),
});

export const LoginSchema = z.object({ passcode: z.string() });
