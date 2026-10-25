import type { ComponentProps } from 'react';
import { currencySymbol } from '../lib/format.ts';

export function AmountField({
  currency,
  ...input
}: { currency: string } & ComponentProps<'input'>) {
  return (
    <label className="amount-field">
      <span className="sr-only">Amount in {currency}</span>
      <span className="text-4xl font-extrabold text-soft" aria-hidden="true">
        {currencySymbol(currency)}
      </span>
      <input inputMode="decimal" {...input} />
    </label>
  );
}

export function DateField(input: ComponentProps<'input'>) {
  return (
    <label className="field">
      <span>Date</span>
      <input className="input" type="date" {...input} />
    </label>
  );
}
