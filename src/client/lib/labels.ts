import type { Category } from '../../shared/types.ts';

export const CATEGORY_LABEL: Record<Category, string> = {
  food: 'Food',
  cafe: 'Coffee & snacks',
  groceries: 'Groceries',
  nightlife: 'Drinks & nightlife',
  transport: 'Transport',
  flights: 'Flights',
  stay: 'Stay',
  sights: 'Sights & fun',
  shopping: 'Shopping',
  gifts: 'Gifts & souvenirs',
  health: 'Health',
  fees: 'Fees & SIM',
  cash: 'Cash withdrawal',
  other: 'Other',
};

const PLACE: Record<string, string> = { KRW: 'Korea', JPY: 'Japan' };
const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });

export function placeOf(currency: string, home: string): string {
  if (currency === home) return `Booked from home (${home})`;
  return PLACE[currency] ?? currencyNames.of(currency) ?? currency;
}
