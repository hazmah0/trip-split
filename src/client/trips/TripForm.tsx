import { useState, type ComponentProps, type FormEvent, type KeyboardEvent } from 'react';
import { majorText, money, parseAmount } from '../lib/format.ts';
import { HttpError } from '../lib/api.ts';
import { addTraveller, saveTrip, setMe, updateTraveller } from '../lib/store.ts';
import { SWISH_CURRENCY, swishDisplay, swishToSave } from '../lib/swish.ts';
import { active, isRemoved, label, removalProblem } from '../../shared/travellers.ts';
import {
  CURRENCY_CODE,
  MAX_PEOPLE,
  MAX_SLOTS,
  MIN_ACTIVE,
  type Entry,
  type Person,
  type Trip,
} from '../../shared/types.ts';
import { Icon } from '../ui/Icon.tsx';
import { PersonPicker } from '../ui/people.tsx';

const codes = (text: string) =>
  text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((c) => c.toUpperCase());

const serverSays = (err: unknown, fallback: string) =>
  err instanceof HttpError && (err.status === 400 || err.status === 409) ? err.message : fallback;

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.currentTarget.blur();
};

function NameField({
  remove,
  ...input
}: ComponentProps<'input'> & {
  remove?: { label: string; disabled?: boolean; onClick: () => void };
}) {
  return (
    <div className="relative flex">
      <input
        className={`input min-w-0 flex-1 ${remove ? 'pr-12' : ''}`}
        required
        maxLength={40}
        {...input}
      />
      {remove && (
        <button
          type="button"
          className="absolute top-0.75 right-0.75 btn-icon"
          aria-label={remove.label}
          disabled={remove.disabled}
          onClick={remove.onClick}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}

export function TripForm({
  trip,
  template,
  me,
  entries = [],
  hasPending = false,
  online = true,
  owner,
  onDone,
  onCancel,
}: {
  trip?: Trip;
  template?: Trip;
  me?: Person | null;
  entries?: Entry[];
  hasPending?: boolean;
  online?: boolean;
  owner?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const base = trip ?? template;
  const hasEntries = entries.length > 0;
  const [name, setName] = useState(trip?.name ?? '');
  const [names, setNames] = useState<string[]>(() =>
    template ? active(template).map((p) => label(template, p)) : ['', ''],
  );
  const [edits, setEdits] = useState<Record<Person, string>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [home, setHome] = useState(base?.home ?? 'SEK');
  const [locals, setLocals] = useState(trip ? trip.locals.join(', ') : '');
  const [budget, setBudget] = useState(trip?.budget ? majorText(trip.budget, trip.home) : '');
  const [typed, setTyped] = useState<string>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const h = home.trim().toUpperCase();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const l = codes(locals).filter((c) => c !== h);
    if (![h, ...l].every((c) => CURRENCY_CODE.test(c)))
      return setError('Currencies are 3-letter codes, like SEK, KRW or EUR.');
    const swish = trip && me != null ? swishToSave(trip, me, typed) : null;
    if (swish && 'error' in swish) return setError(swish.error);
    setSubmitting(true);
    setError('');
    try {
      if (trip) {
        for (const p of Object.keys(edits)) await commitRename(trip, Number(p));
        await commitDraft(trip);
      }
      const id = trip?.id ?? crypto.randomUUID();
      await saveTrip({
        id,
        name: name.trim(),
        travellers: trip?.travellers ?? names.map((n) => ({ name: n.trim() })),
        home: h,
        locals: [...new Set(l)],
        budget: parseAmount(budget, h),
        deleted: false,
      });
      if (me != null && swish?.send != null) {
        try {
          await updateTraveller(id, { person: me, swish: swish.send });
        } catch {
          return setError("Trip saved, but your Swish number wasn't. Try again.");
        }
      }
      if (!trip) setMe(id, 0);
      onDone();
    } catch (err) {
      setError(
        serverSays(
          err,
          'Could not save the trip. Trips need a connection; try again when you are online.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!trip || !confirm(`Delete “${trip.name}” and all its expenses? This can't be undone.`))
      return;
    setSubmitting(true);
    try {
      await saveTrip({ ...trip, deleted: true });
      onDone();
    } catch {
      setError('Could not delete the trip while offline.');
    } finally {
      setSubmitting(false);
    }
  }

  async function act(change: () => Promise<void>) {
    setError('');
    try {
      await change();
    } catch (err) {
      setError(
        serverSays(
          err,
          'Could not save the change. Travellers need a connection; try again when you are online.',
        ),
      );
    }
  }

  const dropEdit = (p: Person) => setEdits(({ [p]: _done, ...rest }) => rest);

  async function commitRename(t: Trip, p: Person) {
    const next = edits[p]?.trim();
    if (next === undefined) return;
    if (next && next !== t.travellers[p]!.name)
      await updateTraveller(t.id, { person: p, name: next });
    dropEdit(p);
  }

  async function commitDraft(t: Trip) {
    const next = draft?.trim();
    setDraft(null);
    if (!next) return;
    try {
      await addTraveller(t.id, next);
    } catch (err) {
      setDraft(next);
      throw err;
    }
  }

  function removeTraveller(t: Trip, p: Person) {
    const why = removalProblem(t, entries, p, (m) => money(m, t.home, { cents: true }));
    if (why) return setError(why);
    const you = p === me ? ' This is you; this phone will leave the trip.' : '';
    if (confirm(`Remove ${label(t, p)} from “${t.name}”?${you}`))
      void act(() => updateTraveller(t.id, { person: p, removed: true }));
  }

  const activeCount = trip ? active(trip).length : names.length;
  const canRemove = !!trip && activeCount > MIN_ACTIVE;
  const blocked = !online
    ? 'Removing needs a connection.'
    : hasPending
      ? 'Wait until this phone has synced.'
      : null;

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
          {trip
            ? trip.travellers.map((t, p) => {
                if (isRemoved(trip, p))
                  return (
                    <div key={p} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold text-soft">
                        {label(trip, p)}
                      </span>
                      <button
                        type="button"
                        className="btn-outline min-h-11"
                        disabled={submitting}
                        onClick={() =>
                          void act(() => updateTraveller(trip.id, { person: p, removed: false }))
                        }
                      >
                        Restore
                      </button>
                    </div>
                  );
                return (
                  <NameField
                    key={p}
                    value={edits[p] ?? t.name}
                    aria-label={`Traveller ${p + 1}`}
                    onChange={(e) => setEdits({ ...edits, [p]: e.target.value })}
                    onBlur={() => void act(() => commitRename(trip, p))}
                    onKeyDown={blurOnEnter}
                    remove={
                      canRemove
                        ? {
                            label: `Remove ${t.name}`,
                            disabled: submitting || !!blocked,
                            onClick: () => removeTraveller(trip, p),
                          }
                        : undefined
                    }
                  />
                );
              })
            : names.map((n, i) => (
                <NameField
                  key={i}
                  value={n}
                  aria-label={i === 0 ? 'Your name' : `Traveller ${i + 1}`}
                  placeholder={i === 0 ? 'Your name' : `Traveller ${i + 1}`}
                  onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                  remove={
                    i >= MIN_ACTIVE
                      ? {
                          label: `Remove ${n || `traveller ${i + 1}`}`,
                          onClick: () => setNames(names.filter((_, j) => j !== i)),
                        }
                      : undefined
                  }
                />
              ))}
          {trip && draft !== null && (
            <input
              className="input"
              autoFocus
              maxLength={40}
              value={draft}
              aria-label="New traveller"
              placeholder={`Traveller ${trip.travellers.length + 1}`}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void act(() => commitDraft(trip))}
              onKeyDown={blurOnEnter}
            />
          )}
        </div>
        {canRemove && blocked && <p className="mt-2 hint">{blocked}</p>}
        {activeCount < MAX_PEOPLE &&
          (trip?.travellers.length ?? 0) < MAX_SLOTS &&
          draft === null && (
            <button
              type="button"
              className="mt-2.5 btn-outline min-h-11 self-start"
              onClick={() => (trip ? setDraft('') : setNames([...names, '']))}
            >
              <Icon name="plus" size={18} /> Add person
            </button>
          )}
      </fieldset>
      {trip && me != null && (
        <fieldset className="field">
          <legend>This phone belongs to</legend>
          <PersonPicker
            trip={trip}
            value={me}
            onChange={(p: Person) => {
              setMe(trip.id, p);
              setTyped(undefined);
            }}
            label="This phone belongs to"
          />
        </fieldset>
      )}
      {trip && me != null && h === SWISH_CURRENCY && (
        <>
          <label className="field">
            <span>Your Swish number (optional)</span>
            <input
              className="input"
              inputMode="tel"
              value={typed ?? swishDisplay(trip.travellers[me]?.swish ?? '')}
              placeholder="070 123 45 67"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          <p className="hint">Everyone on the trip can see it. It lets them pay you with Swish.</p>
        </>
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
          <button type="button" className="btn-danger" disabled={submitting} onClick={remove}>
            Delete trip
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : trip ? 'Save trip' : 'Create trip'}
        </button>
      </div>
    </form>
  );
}
