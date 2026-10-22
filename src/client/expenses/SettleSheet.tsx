import { useState, type FormEvent } from 'react';
import { currencySymbol, groupAmount, majorText, parseAmount, today } from '../lib/format.ts';
import { deleteEntry, saveEntry } from '../lib/store.ts';
import { receiver, transferShares, type Settlement } from '../../shared/ledger.ts';
import type { Entry, Person, Trip } from '../../shared/types.ts';
import { PersonPicker } from '../ui/people.tsx';
import { Sheet } from '../ui/Sheet.tsx';

export function SettleSheet({
  settlement,
  entry,
  trip,
  onClose,
}: {
  settlement?: Settlement;
  entry?: Entry;
  trip: Trip;
  onClose: () => void;
}) {
  const { names, home } = trip;
  const [from, setFrom] = useState<Person>(entry?.paidBy ?? settlement?.from ?? 0);
  const [to, setTo] = useState<Person>(entry ? receiver(entry) : (settlement?.to ?? 1));
  const initial = entry?.amount ?? settlement?.amount;
  const [amountText, setAmountText] = useState(initial ? majorText(initial, home) : '');
  const [date, setDate] = useState(entry?.date ?? today());
  const amount = parseAmount(amountText, home);
  const pickFrom = (p: Person) => (p === to && setTo(from), setFrom(p));
  const pickTo = (p: Person) => (p === from && setFrom(to), setTo(p));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!amount) return;
    saveEntry({
      id: entry?.id ?? crypto.randomUUID(),
      tripId: trip.id,
      kind: 'transfer',
      date,
      title: 'Settle up',
      category: 'other',
      amount,
      currency: home,
      rate: 1,
      rateManual: false,
      paidBy: from,
      shares: transferShares(to),
      deleted: false,
    });
    onClose();
  }

  return (
    <Sheet title="Settle up" onClose={onClose}>
      <form className="flex flex-col gap-4.5 pt-2" onSubmit={submit}>
        <fieldset className="field">
          <legend>Who paid</legend>
          <PersonPicker names={names} value={from} onChange={pickFrom} label="Who paid" />
        </fieldset>
        <fieldset className="field">
          <legend>Who got the money</legend>
          <PersonPicker names={names} value={to} onChange={pickTo} label="Who got the money" />
        </fieldset>
        <label className="amount-field">
          <span className="sr-only">Amount in {home}</span>
          <span className="text-4xl font-extrabold text-soft" aria-hidden="true">
            {currencySymbol(home)}
          </span>
          <input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(groupAmount(e.target.value, home))}
          />
        </label>
        <p className="hint">
          Record it once the money has actually moved (Swish, bank transfer, cash). It brings their
          balance back towards zero.
        </p>
        <label className="field">
          <span>Date</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || today())}
          />
        </label>
        <div className="form-actions">
          {entry && (
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                if (confirm('Delete this payment?')) {
                  deleteEntry(entry);
                  onClose();
                }
              }}
            >
              Delete
            </button>
          )}
          <button className="btn-primary" disabled={!amount}>
            {entry ? 'Save changes' : 'Record payment'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
