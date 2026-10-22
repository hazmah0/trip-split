import type { ReactNode } from 'react';
import { tripCsv } from '../lib/csv.ts';
import { dayLabel, money } from '../lib/format.ts';
import { CATEGORY_LABEL, placeOf } from '../lib/labels.ts';
import { allocate, decimals, summarize } from '../../shared/ledger.ts';
import type { Entry, Trip } from '../../shared/types.ts';
import { Icon } from '../ui/Icon.tsx';
import { Dot } from '../ui/people.tsx';

const panel = 'card px-4.5 py-4';
const heading = 'mb-1.5 text-lg font-extrabold';
const cell = 'py-2.25 pl-3 text-right text-base font-extrabold whitespace-nowrap';
const halfOrStack = 'flex min-w-max grow basis-[calc(50%-var(--spacing)*1.5)] flex-col gap-0.5';

function Bars({
  rows,
  home,
  total,
}: {
  rows: { key: string; label: ReactNode; value: number }[];
  home: string;
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul>
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[minmax(0,1fr)_auto_3em] items-baseline gap-x-2.5 gap-y-1 py-2"
        >
          <span className="inline-flex items-center gap-2 text-md font-bold">{r.label}</span>
          <span className="text-base font-extrabold">{money(r.value, home)}</span>
          <span className="text-right text-xs font-bold text-soft">
            {total ? Math.round((r.value / total) * 100) : 0}%
          </span>
          <span className="col-span-full bar" aria-hidden="true">
            <i className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Stats({ entries, trip }: { entries: Entry[]; trip: Trip }) {
  const { home, names } = trip;
  const s = summarize(entries, names.length);
  if (s.spent === 0) {
    return (
      <div className="m-4 p-5 text-base font-semibold text-soft wide:mx-0">
        <h2 className="mb-1.5 text-2xl font-extrabold text-ink">Stats appear as you spend</h2>
        <p>Spending by category, by country and per day shows up here after the first expense.</p>
      </div>
    );
  }

  // Round to whole units so each column adds up to the shown total by hand.
  const unit = 10 ** decimals(home);
  const units = Math.round(s.spent / unit);
  const total = units * unit;
  const paid = allocate(units, s.paid).map((x) => x * unit);
  const share = allocate(units, s.consumed).map((x) => x * unit);

  const days = [...s.byDay.keys()].sort();
  const first = days[0]!;
  const last = days.at(-1)!;
  const dayCount = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
  const perDay = Math.round(s.spent / dayCount);
  const maxDay = Math.max(...s.byDay.values());

  const byCategory = [...s.byCategory]
    .sort((a, b) => b[1] - a[1])
    .map(([c, value]) => ({
      key: c,
      label: (
        <>
          <Icon name={c} size={16} /> {CATEGORY_LABEL[c]}
        </>
      ),
      value,
    }));
  const byPlace = [...s.byCurrency]
    .sort((a, b) => b[1] - a[1])
    .map(([c, value]) => ({ key: c, label: placeOf(c, home), value }));

  return (
    <div className="flex flex-col gap-3 px-4 pt-1 wide:px-0">
      <section className={`${panel} flex flex-wrap gap-3`}>
        <div className={halfOrStack}>
          <span className="text-sm font-bold text-soft">Trip total</span>
          <span className="text-4xl font-extrabold">{money(total, home)}</span>
        </div>
        <div className={halfOrStack}>
          <span className="text-sm font-bold text-soft">Per day ({dayCount} days)</span>
          <span className="text-4xl font-extrabold">{money(perDay, home)}</span>
        </div>
      </section>

      <section className={panel}>
        <h2 className={heading}>Who paid, who used</h2>
        <table className="w-full text-md">
          <thead className="text-right text-xs font-bold whitespace-nowrap text-soft">
            <tr>
              <th scope="col" />
              <th scope="col" className="pb-2.25">
                Paid
              </th>
              <th scope="col" className="pb-2.25">
                Their share
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr+tr>*]:border-t [&>tr+tr>*]:border-hairline">
            {names.map((n, i) => (
              <tr key={i}>
                <th scope="row" className="w-full max-w-0 py-2.25 text-left font-extrabold">
                  <span className="flex items-center gap-1">
                    <Dot p={i} />
                    <span className="truncate">{n}</span>
                  </span>
                </th>
                <td className={cell}>{money(paid[i]!, home)}</td>
                <td className={cell}>{money(share[i]!, home)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={panel}>
        <h2 className={heading}>By category</h2>
        <Bars rows={byCategory} home={home} total={s.spent} />
      </section>

      <section className={panel}>
        <h2 className={heading}>By country</h2>
        <Bars rows={byPlace} home={home} total={s.spent} />
      </section>

      <section className={panel}>
        <h2 className={heading}>Day by day</h2>
        <ol>
          {days.toReversed().map((d) => (
            <li
              key={d}
              className="grid grid-cols-[7em_minmax(0,1fr)_auto] items-center gap-2.5 py-1.25 text-sm font-semibold"
            >
              <span className="whitespace-nowrap text-soft">{dayLabel(d)}</span>
              <span className="bar h-2.5" aria-hidden="true">
                <i
                  style={{ width: `${(s.byDay.get(d)! / maxDay) * 100}%` }}
                  className={`bar-fill ${s.byDay.get(d)! > perDay ? '' : 'bg-quiet-bar'}`}
                />
              </span>
              <span className="min-w-[5em] text-right font-extrabold">
                {money(s.byDay.get(d)!, home)}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 hint">
          Darker bars are days above your {money(perDay, home)} daily average.
        </p>
      </section>

      <a
        className="link inline-flex items-center self-center"
        download={`${trip.name}.csv`}
        href="#"
        // BOM so Excel reads names and titles as UTF-8.
        onClick={(e) =>
          (e.currentTarget.href = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${tripCsv(entries, trip)}`)}`)
        }
      >
        Export all expenses as CSV
      </a>
    </div>
  );
}
