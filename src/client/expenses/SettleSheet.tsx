import { useState, type FormEvent } from 'react';
import { authorsLine, groupAmount, majorText, money, parseAmount, today } from '../lib/format.ts';
import { deleteEntry, recordTransfer } from '../lib/store.ts';
import {
  clearSwish,
  startSwish,
  SWISH_CURRENCY,
  swishLink,
  type SwishPayment,
} from '../lib/swish.ts';
import { receiver, type Settlement } from '../../shared/ledger.ts';
import { active, isRemoved, label } from '../../shared/travellers.ts';
import type { Entry, Person, Trip } from '../../shared/types.ts';
import { AmountField, DateField } from '../ui/fields.tsx';
import { PersonPicker } from '../ui/people.tsx';
import { Sheet } from '../ui/Sheet.tsx';

export function SettleSheet({
  settlement,
  entry,
  trip,
  me,
  onClose,
}: {
  settlement?: Settlement;
  entry?: Entry;
  trip: Trip;
  me: Person;
  onClose: () => void;
}) {
  const { home } = trip;
  const [from, setFrom] = useState<Person>(entry?.paidBy ?? settlement?.from ?? me);
  const [to, setTo] = useState<Person>(() =>
    entry ? receiver(entry) : (settlement?.to ?? active(trip).find((p) => p !== me)!),
  );
  const [kept] = useState([from, to]);
  const initial = entry?.amount ?? settlement?.amount;
  const [amountText, setAmountText] = useState(initial ? majorText(initial, home) : '');
  const [date, setDate] = useState(entry?.date ?? today());
  const amount = parseAmount(amountText, home);
  const authors = entry && authorsLine(entry, trip);
  const pickFrom = (p: Person) => {
    if (p === to) setTo(from);
    setFrom(p);
  };
  const pickTo = (p: Person) => {
    if (p === from) setFrom(to);
    setTo(p);
  };
  const swishable = !entry && home === SWISH_CURRENCY && from === me;
  const swishTo = trip.travellers[to]?.swish;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!amount) return;
    recordTransfer(trip, { from, to, amount, date, id: entry?.id });
    onClose();
  }

  return (
    <Sheet title="Settle up" onClose={onClose}>
      <form className="flex flex-col gap-4.5 pt-2" onSubmit={submit}>
        <fieldset className="field">
          <legend>Who paid</legend>
          <PersonPicker trip={trip} value={from} keep={kept} onChange={pickFrom} label="Who paid" />
        </fieldset>
        <fieldset className="field">
          <legend>Who got the money</legend>
          <PersonPicker
            trip={trip}
            value={to}
            keep={kept}
            onChange={pickTo}
            label="Who got the money"
          />
        </fieldset>
        <AmountField
          currency={home}
          value={amountText}
          onChange={(e) => setAmountText(groupAmount(e.target.value, home))}
        />
        <p className="hint">
          Record it once the money has actually moved (Swish, bank transfer, cash). It brings their
          balance back towards zero.
        </p>
        <DateField value={date} onChange={(e) => setDate(e.target.value || today())} />
        {swishable && !swishTo && !isRemoved(trip, to) && (
          <p className="hint">
            {label(trip, to)} hasn't added a Swish number yet. They can add it in the Trip tab.
          </p>
        )}
        <div className="form-actions">
          {swishable && swishTo && !!amount && (
            <a
              className="btn-outline"
              href={swishLink(swishTo, amount, trip.name)}
              target="_blank"
              rel="noopener"
              onClick={() => startSwish({ tripId: trip.id, from, to, amount })}
            >
              Pay with Swish
            </a>
          )}
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
        {authors && <p className="px-1 hint">{authors}</p>}
      </form>
    </Sheet>
  );
}

export function SwishReturnSheet({
  payment,
  trip,
  onClose,
}: {
  payment: SwishPayment;
  trip: Trip;
  onClose: () => void;
}) {
  const { home } = trip;
  const { from, to, amount } = payment;
  const close = () => {
    clearSwish();
    onClose();
  };
  return (
    <Sheet title="Swish payment" onClose={close}>
      <div className="flex flex-col gap-4.5 pt-2">
        <div>
          <p className="text-xl font-extrabold">Did the Swish payment go through?</p>
          <p className="mt-1 font-bold text-soft">
            {label(trip, from)} → {label(trip, to)} · {money(amount, home, { cents: true })}
          </p>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-outline" onClick={close}>
            No, it didn't
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              recordTransfer(trip, { ...payment, date: today() });
              close();
            }}
          >
            Yes, record it
          </button>
        </div>
      </div>
    </Sheet>
  );
}
