import { useState } from 'react';
import { money } from '../lib/format.ts';
import { allocate } from '../../shared/ledger.ts';
import { everyone, isEveryone, label } from '../../shared/travellers.ts';
import type { Trip } from '../../shared/types.ts';
import { Icon } from '../ui/Icon.tsx';
import { Dot, personStyle, pickable, SplitBadge } from '../ui/people.tsx';

const picked = (shares: number[]) => shares.flatMap((w, i) => (w > 0 ? [i] : []));

export function SplitPicker({
  trip,
  shares,
  onChange,
  amount,
  currency,
}: {
  trip: Trip;
  shares: number[];
  onChange: (shares: number[]) => void;
  amount: number | null;
  currency: string;
}) {
  const [uneven, setUneven] = useState(() => shares.some((w) => w > 1));
  const [kept] = useState(() => picked(shares));
  const who = picked(shares).length;
  const parts = amount ? allocate(amount, shares) : null;
  const rows = pickable(trip, [...kept, ...picked(shares)]).map(
    (i) => [i, label(trip, i)] as const,
  );
  const setShare = (i: number, w: number) =>
    onChange(shares.map((x, j) => (j === i ? Math.max(0, Math.min(100, w)) : x)));

  return (
    <fieldset className="field">
      <legend className="flex items-center gap-2">
        Who is it for? <SplitBadge shares={shares} big />
      </legend>
      {uneven ? (
        <ul className="flex flex-col gap-0.5">
          {rows.map(([i, n]) => (
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
            aria-pressed={isEveryone(trip, shares)}
            onClick={() => onChange(everyone(trip))}
          >
            Everyone
          </button>
          {rows.map(([i, n]) => (
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
      <div className="mt-1.5 rate-line">
        <span>
          {!uneven && parts && who > 1 ? `${money(Math.round(amount! / who), currency)} each` : ''}
        </span>
        <button
          type="button"
          className="link"
          onClick={() => {
            if (uneven) onChange(shares.map((w) => (w ? 1 : 0)));
            setUneven(!uneven);
          }}
        >
          {uneven ? 'Split evenly' : 'Split unevenly'}
        </button>
      </div>
    </fieldset>
  );
}
