import { useState, type FormEvent } from 'react';
import { majorText, parseAmount } from '../lib/format.ts';
import { HttpError, saveTrip, setMe } from '../lib/store.ts';
import { CURRENCY_CODE, MAX_PEOPLE, type Person, type Trip } from '../../shared/types.ts';
import { Icon } from '../ui/Icon.tsx';
import { PersonPicker } from '../ui/people.tsx';

const codes = (text: string) =>
  text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((c) => c.toUpperCase());

export function TripForm({
  trip,
  template,
  me,
  hasEntries,
  owner,
  onDone,
  onCancel,
}: {
  trip?: Trip;
  template?: Trip;
  me?: Person | null;
  hasEntries?: boolean;
  owner?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const base = trip ?? template;
  const [name, setName] = useState(trip?.name ?? '');
  const [names, setNames] = useState<string[]>(base?.names ?? ['', '']);
  // Entries point at people by index, so saved travellers stay once there are expenses.
  const kept = Math.max(2, hasEntries && trip ? trip.names.length : 0);
  const [home, setHome] = useState(base?.home ?? 'SEK');
  const [locals, setLocals] = useState(trip ? trip.locals.join(', ') : '');
  const [budget, setBudget] = useState(trip?.budget ? majorText(trip.budget, trip.home) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const h = home.trim().toUpperCase();
    const l = codes(locals).filter((c) => c !== h);
    if (![h, ...l].every((c) => CURRENCY_CODE.test(c)))
      return setError('Currencies are 3-letter codes, like SEK, KRW or EUR.');
    setBusy(true);
    setError('');
    try {
      const id = trip?.id ?? crypto.randomUUID();
      await saveTrip({
        id,
        name: name.trim(),
        names: names.map((n) => n.trim()),
        home: h,
        locals: [...new Set(l)],
        budget: parseAmount(budget, h),
        deleted: false,
      });
      if (!trip) setMe(id, 0);
      onDone();
    } catch (err) {
      setError(
        err instanceof HttpError && err.status === 400
          ? err.message
          : 'Could not save the trip. Trips need a connection; try again when you are online.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!trip || !confirm(`Delete “${trip.name}” and all its expenses? This can't be undone.`))
      return;
    setBusy(true);
    try {
      await saveTrip({ ...trip, deleted: true });
      onDone();
    } catch {
      setError('Could not delete the trip while offline.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4.5 pt-2" onSubmit={submit}>
      <label className="field">
        <span>Trip name</span>
        <input
          className="input"
          required
          maxLength={80}
          value={name}
          placeholder="e.g. Korea & Japan 2026"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <fieldset className="field">
        <legend>Who's travelling</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-3 gap-y-2.5">
          {names.map((n, i) => (
            <div key={i} className="relative flex">
              <input
                className={`input min-w-0 flex-1 ${i >= kept ? 'pr-12' : ''}`}
                required
                maxLength={40}
                value={n}
                aria-label={!trip && i === 0 ? 'Your name' : `Traveller ${i + 1}`}
                placeholder={!trip && i === 0 ? 'Your name' : `Traveller ${i + 1}`}
                onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {i >= kept && (
                <button
                  type="button"
                  className="absolute top-0.75 right-0.75 btn-icon"
                  aria-label={`Remove ${n || `traveller ${i + 1}`}`}
                  onClick={() => setNames(names.filter((_, j) => j !== i))}
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        {names.length < MAX_PEOPLE && (
          <button
            type="button"
            className="mt-2.5 btn-outline min-h-11 self-start"
            onClick={() => setNames([...names, ''])}
          >
            <Icon name="plus" size={18} /> Add person
          </button>
        )}
      </fieldset>
      {trip && me != null && (
        <fieldset className="field">
          <legend>This phone belongs to</legend>
          <PersonPicker
            names={trip.names}
            value={me}
            onChange={(p: Person) => setMe(trip.id, p)}
            label="This phone belongs to"
          />
        </fieldset>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span>Home currency</span>
          <input
            className="input"
            required
            maxLength={3}
            value={home}
            disabled={hasEntries}
            onChange={(e) => setHome(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Local currencies</span>
          <input
            className="input"
            value={locals}
            placeholder="KRW, JPY"
            onChange={(e) => setLocals(e.target.value)}
          />
        </label>
      </div>
      <p className="hint">
        {hasEntries
          ? `Home currency is locked because this trip already has expenses in ${trip?.home}.`
          : 'Home is what your cards bill in. Locals are the currencies you pay in on the trip, in travel order.'}
      </p>
      <label className="field">
        <span>Budget in {home.toUpperCase() || 'home currency'} (optional)</span>
        <input
          className="input"
          inputMode="decimal"
          value={budget}
          placeholder="No budget"
          onChange={(e) => setBudget(e.target.value.replace(/[^\d\s.,]/g, ''))}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {trip && owner && (
          <button type="button" className="btn-danger" disabled={busy} onClick={remove}>
            Delete trip
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : trip ? 'Save trip' : 'Create trip'}
        </button>
      </div>
    </form>
  );
}
