import type { z } from 'zod';
import type { EntryInputSchema, TripSchema } from './schema.ts';

export type Person = number;

export const MAX_PEOPLE = 20;

export const CURRENCY_CODE = /^[A-Z]{3}$/;

export const CATEGORIES = [
  'food',
  'cafe',
  'groceries',
  'nightlife',
  'transport',
  'flights',
  'stay',
  'sights',
  'shopping',
  'gifts',
  'health',
  'fees',
  'cash',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Trip = z.infer<typeof TripSchema>;

export type EntryInput = z.infer<typeof EntryInputSchema>;

export type Entry = Omit<EntryInput, 'rate'> & { rate: number; home: number };

export type State = {
  trips: Trip[];
  entries: Entry[];
  invites: Record<string, string>;
  owner: boolean;
};

export const TRIP_GONE = 410;
export const UNKNOWN_CODE = 404;

export type Rates = Record<string, Record<string, number>>;
