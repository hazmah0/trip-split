import { useState, type FormEvent } from 'react';
import {
  currencySymbol,
  groupAmount,
  majorText,
  money,
  parseAmount,
  today,
} from '../lib/format.ts';
import { CATEGORY_LABEL } from '../lib/labels.ts';
import { deleteEntry, KEY, read, saveEntry, write } from '../lib/store.ts';
import { allocate, toHome, toMajor } from '../../shared/ledger.ts';
import {
  CATEGORIES,
  type Category,
  type Entry,
  type Person,
  type Trip,
} from '../../shared/types.ts';
import { Icon } from '../ui/Icon.tsx';
import { Dot, PersonPicker, personStyle, SplitBadge } from '../ui/people.tsx';
import { Sheet } from '../ui/Sheet.tsx';

const rateLine =
  'flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1 text-sm font-semibold text-soft';

function initialCurrency(trip: Trip): string {
  const last = read<string | null>(KEY.lastCurrency, null);
  if (last && (last === trip.home || trip.locals.includes(last))) return last;
  return trip.locals[0] ?? trip.home;
}

export function EntrySheet({
  entry,
  trip,
  me,
  rates,
  onClose,
}: {
  entry?: Entry;
  trip: Trip;
  me: Person;
  rates: Record<string, number>;
  onClose: () => void;
}) {
  const { names, home } = trip;
  const [currency, setCurrency] = useState(() => entry?.currency ?? initialCurrency(trip));
  const [amountText, setAmountText] = useState(
    entry ? majorText(entry.amount, entry.currency) : '',
  );
  const [title, setTitle] = useState(entry?.title ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [category, setCategory] = useState<Category>(entry?.category ?? 'food');
  const [paidBy, setPaidBy] = useState<Person>(entry?.paidBy ?? me);
  const [shares, setShares] = useState(() =>
    names.map((_, i) => (entry ? (entry.shares[i] ?? 0) : 1)),
  );
  const [uneven, setUneven] = useState(() => !!entry?.shares.some((w) => w > 1));
  const [date, setDate] = useState(entry?.date ?? today());
  const [manual, setManual] = useState(entry?.rateManual ?? false);
  const [chargedText, setChargedText] = useState(
    entry?.rateManual ? majorText(entry.home, home) : '',
  );
  const [error, setError] = useState('');

  const amount = parseAmount(amountText, currency);
  const charged = parseAmount(chargedText, home);
  const local = currency !== home;
  const autoRate = rates[currency];
  const estimate = amount && local && autoRate ? toHome(amount, currency, autoRate, home) : null;
  const who = shares.filter((w) => w > 0).length;
  const parts = amount ? allocate(amount, shares) : null;
  const setShare = (i: number, w: number) =>
    setShares(shares.map((x, j) => (j === i ? Math.max(0, Math.min(100, w)) : x)));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!amount) return setError(`Enter the amount in ${currency}.`);
    if (!who) return setError('Pick who this expense is for.');
    if (local && manual && !charged)
      return setError(`Enter what your card charged in ${home}, or switch back to the ECB rate.`);
    const rate = !local
      ? 1
      : manual && charged
        ? toMajor(charged, home) / toMajor(amount, currency)
        : null;
    write(KEY.lastCurrency, currency);
    saveEntry({
      id: entry?.id ?? crypto.randomUUID(),
      tripId: trip.id,
      kind: 'expense',
      date,
      title: title.trim() || CATEGORY_LABEL[category],
      note: note.trim() || undefined,
      category,
      amount,
      currency,
      rate,
      rateManual: local && manual,
      paidBy,
      shares,
      deleted: false,
    });
    onClose();
  }

  return (
    <Sheet title={entry ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form className="flex flex-col gap-4.5 pt-2" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-2.5">
          <label className="amount-field">
            <span className="sr-only">Amount in {currency}</span>
            <span className="text-4xl font-extrabold text-soft" aria-hidden="true">
              {currencySymbol(currency)}
            </span>
            <input
              data-autofocus={!entry || undefined}
              inputMode="decimal"
              enterKeyHint="next"
              placeholder="0"
              value={amountText}
              onChange={(e) => {
                setAmountText(groupAmount(e.target.value, currency));
                setError('');
              }}
              aria-invalid={!!error && !amount}
            />
          </label>
          <div className="segmented" role="radiogroup" aria-label="Currency">
            {[...trip.locals, home].map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={c === currency}
                onClick={() => setCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {local && (
          <div className={`${rateLine} -mt-1.5`}>
            {manual ? (
              <label className="field flex-[1_1_200px]">
                <span>Card charged ({home})</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={chargedText}
                  onChange={(e) => setChargedText(groupAmount(e.target.value, home))}
                  placeholder="e.g. 136,40"
                />
              </label>
            ) : (
              <span>
                {estimate !== null
                  ? `≈ ${money(estimate, home)} at the ECB rate for that day`
                  : `Converted to ${home} at the ECB rate when it syncs`}
              </span>
            )}
            <button type="button" className="link" onClick={() => setManual(!manual)}>
              {manual ? 'Use ECB rate' : 'Card charged a different amount?'}
            </button>
          </div>
        )}

        <label className="field">
          <span>What was it?</span>
          <input
            className="input"
            value={title}
            maxLength={200}
            placeholder={CATEGORY_LABEL[category]}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <fieldset className="field">
          <legend>Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                className="chip"
                aria-pressed={c === category}
                onClick={() => setCategory(c)}
              >
                <Icon name={c} size={16} /> {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          {category === 'cash' && (
            <p className="mt-2 hint">
              Split the withdrawal like a shared expense, then don't log what you buy with that
              cash, or it counts twice.
            </p>
          )}
        </fieldset>

        <fieldset className="field">
          <legend>Paid by</legend>
          <PersonPicker names={names} value={paidBy} onChange={setPaidBy} label="Paid by" />
        </fieldset>

        <fieldset className="field">
          <legend className="flex items-center gap-2">
            Who is it for? <SplitBadge shares={shares} big />
          </legend>
          {uneven ? (
            <ul className="flex flex-col gap-0.5">
              {names.map((n, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-bold">
                    <Dot p={i} />
                    {n}
                  </span>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`Smaller share for ${n}`}
                    disabled={!shares[i]}
                    onClick={() => setShare(i, shares[i]! - 1)}
                  >
                    <Icon name="minus" size={18} />
                  </button>
                  <span
                    className="min-w-9 text-center font-extrabold"
                    aria-label={`${n}: ${shares[i]} shares`}
                  >
                    ×{shares[i]}
                  </span>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`Bigger share for ${n}`}
                    onClick={() => setShare(i, shares[i]! + 1)}
                  >
                    <Icon name="plus" size={18} />
                  </button>
                  <span className="min-w-21 text-right font-bold text-soft">
                    {parts ? money(parts[i]!, currency) : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="chip"
                aria-pressed={who === names.length}
                onClick={() => setShares(names.map(() => 1))}
              >
                Everyone
              </button>
              {names.map((n, i) => (
                <button
                  type="button"
                  key={i}
                  className="chip"
                  style={personStyle(i)}
                  aria-pressed={shares[i]! > 0}
                  onClick={() => setShare(i, shares[i] ? 0 : 1)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <div className={`${rateLine} mt-1.5`}>
            <span>
              {!uneven && parts && who > 1
                ? `${money(Math.round(amount! / who), currency)} each`
                : ''}
            </span>
            <button
              type="button"
              className="link"
              onClick={() => {
                if (uneven) setShares(shares.map((w) => (w ? 1 : 0)));
                setUneven(!uneven);
              }}
            >
              {uneven ? 'Split evenly' : 'Split unevenly'}
            </button>
          </div>
        </fieldset>

        <label className="field">
          <span>Note (optional)</span>
          <textarea
            className="input"
            value={note}
            maxLength={1000}
            rows={2}
            placeholder="Anything to remember about it"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Date</span>
          <input
            className="input"
            type="date"
            value={date}
            required
            onChange={(e) => setDate(e.target.value || today())}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          {entry && (
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                if (confirm(`Delete “${entry.title}”?`)) {
                  deleteEntry(entry);
                  onClose();
                }
              }}
            >
              Delete
            </button>
          )}
          <button className="btn-primary">{entry ? 'Save changes' : 'Add expense'}</button>
        </div>
      </form>
    </Sheet>
  );
}
