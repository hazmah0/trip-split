import { money } from '../lib/format.ts';
import { balances, settlements, summarize, type Settlement } from '../../shared/ledger.ts';
import type { Entry, Trip } from '../../shared/types.ts';
import { Icon } from '../ui/Icon.tsx';
import { Avatar } from '../ui/people.tsx';

export function BalanceCard({
  entries,
  trip,
  onSettle,
}: {
  entries: Entry[];
  trip: Trip;
  onSettle: (s?: Settlement) => void;
}) {
  const { names, home, budget } = trip;
  const { spent } = summarize(entries, names.length);
  const owed = settlements(balances(entries, names.length));
  const over = budget !== null && spent > budget;
  const pct = budget ? Math.min(100, (spent / budget) * 100) : 100;
  const pair = (s: Settlement) => (
    <span className="inline-flex items-center gap-2 text-soft" aria-hidden="true">
      <Avatar p={s.from} name={names[s.from]!} />
      <Icon name="arrow" size={18} />
      <Avatar p={s.to} name={names[s.to]!} />
    </span>
  );
  return (
    <section className="mx-4 mt-1 card px-5 pt-4.5 pb-4 wide:mx-0" aria-live="polite">
      {owed.length <= 1 ? (
        <>
          <h1 className="mb-3 text-display font-extrabold text-balance">
            {owed[0] ? (
              <>
                {names[owed[0].from]} owes {names[owed[0].to]}{' '}
                <span className="whitespace-nowrap">{money(owed[0].amount, home)}</span>
              </>
            ) : (
              'All square'
            )}
          </h1>
          <div className="flex min-h-11 items-center justify-between gap-3">
            {owed[0] && pair(owed[0])}
            <button
              className="ml-auto btn-secondary"
              onClick={() => onSettle(owed[0])}
              disabled={!owed[0]}
            >
              Settle up
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="mb-3 text-display font-extrabold text-balance">
            Settle up in {owed.length} payments
          </h1>
          <ul className="flex flex-col gap-2.5">
            {owed.map((s) => (
              <li key={`${s.from}-${s.to}`} className="flex items-center gap-3">
                {pair(s)}
                <span className="flex min-w-0 flex-1 flex-col font-bold wide:flex-row wide:gap-1">
                  <span className="truncate">
                    {names[s.from]} pays {names[s.to]}
                  </span>
                  <b className="whitespace-nowrap">{money(s.amount, home)}</b>
                </span>
                <button
                  className="ml-auto btn-secondary"
                  onClick={() => onSettle(s)}
                  aria-label={`Record ${names[s.from]} paying ${names[s.to]}`}
                >
                  Settle
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3.5 border-t border-hairline pt-3 text-sm font-semibold text-soft">
        <p className="flex flex-wrap justify-between gap-x-3">
          <span className="whitespace-nowrap">Spent so far</span>
          <span className={`ml-auto text-right ${over ? 'text-danger' : ''}`}>
            <b className="font-extrabold text-ink">{money(spent, home)}</b>
            {budget !== null &&
              (over
                ? `, ${money(spent - budget, home)} over budget`
                : ` of ${money(budget, home)}`)}
          </span>
        </p>
        {budget !== null && (
          <div
            className="mt-2 bar bg-sand"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Budget used"
          >
            <i
              className={`bar-fill transition-[width] duration-500 ease-out-expo ${over ? 'bg-danger' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
