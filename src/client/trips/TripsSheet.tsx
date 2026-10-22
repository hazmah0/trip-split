import { dayLabel, listNames, money } from '../lib/format.ts';
import type { View } from '../lib/store.ts';
import { summarize } from '../../shared/ledger.ts';
import { Icon } from '../ui/Icon.tsx';
import { Sheet } from '../ui/Sheet.tsx';

export function TripsSheet({
  v,
  onPick,
  onNew,
  onClose,
}: {
  v: View;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Your trips" onClose={onClose}>
      <ul className="mt-2 overflow-hidden card py-1">
        {v.trips.toReversed().map((t) => {
          const entries = v.allEntries.filter((e) => e.tripId === t.id);
          const dates = entries.map((e) => e.date).sort();
          const { spent } = summarize(entries, t.names.length);
          const current = t.id === v.trip?.id;
          return (
            <li key={t.id}>
              <button
                className="list-row grid-cols-[minmax(0,1fr)_auto]"
                aria-current={current ? 'true' : undefined}
                onClick={() => onPick(t.id)}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-base leading-tight font-bold">{t.name}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold text-soft">
                    {listNames(t.names)}
                    {dates.length > 0 &&
                      ` · ${dayLabel(dates[0]!)}${dates.length > 1 ? ` – ${dayLabel(dates.at(-1)!)}` : ''}`}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-px whitespace-nowrap">
                  <b className="text-lg font-extrabold">{money(spent, t.home)}</b>
                  {current && (
                    <small className="inline-flex items-center gap-0.75 text-xs font-semibold text-soft">
                      <Icon name="check" size={14} /> Current
                    </small>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="mt-4 btn-primary w-full" onClick={onNew}>
        <Icon name="plus" size={20} /> New trip
      </button>
    </Sheet>
  );
}
