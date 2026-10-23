import { useEffect, useRef, useState } from 'react';
import { BalanceCard } from './expenses/BalanceCard.tsx';
import { EntrySheet } from './expenses/EntrySheet.tsx';
import { ExpenseList } from './expenses/ExpenseList.tsx';
import { SettleSheet } from './expenses/SettleSheet.tsx';
import { FirstTrip, Login, Splash, WhoAmI } from './gates/Gates.tsx';
import { selectTrip, useStore, type View } from './lib/store.ts';
import type { Settlement } from '../shared/ledger.ts';
import type { Entry, Person, Trip } from '../shared/types.ts';
import { Stats } from './stats/Stats.tsx';
import { Invite } from './trips/Invite.tsx';
import { TripForm } from './trips/TripForm.tsx';
import { TripsSheet } from './trips/TripsSheet.tsx';
import { Icon } from './ui/Icon.tsx';
import { Sheet } from './ui/Sheet.tsx';

export function App() {
  const v = useStore();
  if (v.auth === 'login') return <Login />;
  if (!v.trip) {
    if (v.auth === 'unknown') return <Splash online={v.online} />;
    return v.owner ? <FirstTrip /> : <Login noTrips />;
  }
  if (v.me === null) return <WhoAmI trip={v.trip} />;
  return <Main v={v} trip={v.trip} me={v.me} />;
}

type Tab = 'expenses' | 'stats' | 'trip';

type SheetState =
  | { kind: 'entry'; entry?: Entry }
  | { kind: 'settle'; entry?: Entry; settlement?: Settlement }
  | { kind: 'trips' | 'new-trip' }
  | null;

function Main({ v, trip, me }: { v: View; trip: Trip; me: Person }) {
  const [tab, setTab] = useState<Tab>('expenses');
  const [sheet, setSheet] = useState<SheetState>(null);
  const close = () => setSheet(null);
  const statsRef = useRef<HTMLElement>(null);
  const [statsFit, setStatsFit] = useState(true);
  useEffect(() => {
    const el = statsRef.current!;
    const check = () => setStatsFit(el.offsetTop + el.offsetHeight <= innerHeight);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    addEventListener('resize', check);
    return () => {
      ro.disconnect();
      removeEventListener('resize', check);
    };
  }, []);

  return (
    <div className="mx-auto min-h-dvh max-w-app pb-[calc(var(--spacing-dock)+env(safe-area-inset-bottom)+88px)] wide:grid wide:max-w-wide wide:grid-cols-[minmax(0,1.25fr)_minmax(340px,1fr)] wide:grid-rows-[auto_1fr] wide:gap-x-6 wide:px-6 wide:pb-28">
      <header className="sticky top-0 z-5 flex h-[calc(var(--spacing-topbar)+env(safe-area-inset-top))] items-center justify-between gap-3 bg-ground pt-[env(safe-area-inset-top)] pr-4 pl-3 wide:col-span-2 wide:grid wide:grid-cols-[minmax(0,1fr)_auto_1fr] wide:pr-0 wide:pl-1">
        <button
          className="inline-flex min-h-11 min-w-0 items-center gap-1 rounded-tile px-2 transition-colors hover:bg-sand wide:max-w-full wide:justify-self-start"
          onClick={() => setSheet({ kind: 'trips' })}
          aria-haspopup="dialog"
        >
          <span className="truncate text-3xl font-extrabold">{trip.name}</span>
          <Icon name="chevron" size={18} />
        </button>
        <nav
          className="fixed inset-x-0 bottom-0 z-6 flex justify-center rounded-t-sheet bg-card px-4 pt-2 pb-[env(safe-area-inset-bottom)] shadow-dock wide:static wide:gap-0.5 wide:rounded-pill wide:bg-sand wide:p-0.75 wide:shadow-none"
          aria-label="Main"
        >
          {(
            [
              ['expenses', 'list', 'Expenses'],
              ['stats', 'chart', 'Stats'],
              ['trip', 'settings', 'Trip'],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              className={`flex h-(--spacing-dock) max-w-40 flex-1 flex-col items-center justify-center gap-0.75 pb-1.5 text-xs font-bold text-soft transition-colors hover:text-ink aria-[current=page]:text-action wide:h-10 wide:flex-row wide:gap-1.5 wide:rounded-pill wide:px-4 wide:pb-0 wide:text-md wide:aria-[current=page]:bg-card wide:aria-[current=page]:text-ink wide:aria-[current=page]:shadow-lift wide:[&_svg]:size-4.5 ${id === 'stats' ? 'wide:hidden' : ''}`}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              <Icon name={icon} size={24} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex justify-end wide:pr-fab-slot">
          <SyncStatus v={v} />
        </div>
      </header>

      <section
        className={`${tab === 'expenses' ? '' : 'hidden'} wide:col-start-1 wide:row-start-2 wide:block`}
        aria-label="Expenses"
      >
        <BalanceCard
          entries={v.entries}
          trip={trip}
          onSettle={(settlement) => setSheet({ kind: 'settle', settlement })}
        />
        <ExpenseList
          key={trip.id}
          v={v}
          trip={trip}
          onOpen={(entry) =>
            setSheet(
              entry.kind === 'transfer' ? { kind: 'settle', entry } : { kind: 'entry', entry },
            )
          }
        />
      </section>

      <section
        ref={statsRef}
        className={`${tab === 'stats' ? '' : 'hidden'} ${tab === 'trip' ? '' : 'wide:block'} ${statsFit ? 'wide:sticky wide:top-[calc(var(--spacing-topbar)+4px)]' : ''} wide:col-start-2 wide:row-start-2 wide:self-start`}
        aria-label="Stats"
      >
        <Stats entries={v.entries} trip={trip} />
      </section>

      {tab === 'trip' && (
        <section className="wide:col-start-2 wide:row-start-2" aria-label="Trip settings">
          <div className="mx-4 mt-1 card px-4 pt-4.5 pb-5 wide:mx-0">
            <h2 className="text-3xl font-extrabold">Trip settings</h2>
            <TripForm
              key={trip.id}
              trip={trip}
              me={me}
              hasEntries={v.entries.length > 0}
              owner={v.owner}
              onDone={() => setTab('expenses')}
            />
          </div>
          <Invite key={trip.id} trip={trip} code={v.invite} owner={v.owner} />
        </section>
      )}

      <button
        className={`${tab === 'trip' ? 'hidden' : 'inline-flex'} fixed right-[max(16px,calc((100vw-var(--container-app))/2+16px))] bottom-[calc(var(--spacing-dock)+env(safe-area-inset-bottom)+14px)] z-7 h-14 items-center gap-2 rounded-fab bg-action pr-6 pl-4.5 text-xl font-extrabold text-white shadow-fab transition-[transform,background-color] duration-200 ease-spring hover:bg-action-deep active:scale-95 wide:top-1.5 wide:right-[max(24px,calc((100vw-var(--container-wide))/2+24px))] wide:bottom-auto wide:inline-flex wide:h-12 wide:text-lg wide:shadow-none`}
        onClick={() => setSheet({ kind: 'entry' })}
      >
        <Icon name="plus" size={22} /> Add expense
      </button>

      {sheet?.kind === 'entry' && (
        <EntrySheet entry={sheet.entry} trip={trip} me={me} rates={v.rates} onClose={close} />
      )}
      {sheet?.kind === 'settle' && (
        <SettleSheet
          settlement={sheet.settlement}
          entry={sheet.entry}
          trip={trip}
          onClose={close}
        />
      )}
      {sheet?.kind === 'trips' && (
        <TripsSheet
          v={v}
          onPick={(id) => {
            selectTrip(id);
            setTab('expenses');
            close();
          }}
          onNew={() => setSheet({ kind: 'new-trip' })}
          onClose={close}
        />
      )}
      {sheet?.kind === 'new-trip' && (
        <Sheet title="New trip" onClose={close}>
          <TripForm
            template={trip}
            onDone={() => {
              setTab('expenses');
              close();
            }}
            onCancel={close}
          />
        </Sheet>
      )}
    </div>
  );
}

const pill =
  'inline-flex flex-none items-center gap-1.5 rounded-pill px-3 py-1.25 text-xs font-bold';

function SyncStatus({ v }: { v: View }) {
  const n = v.pending.size;
  if (!v.online)
    return (
      <span className={`${pill} bg-ink text-white`}>
        <Icon name="offline" size={14} /> Offline{n ? ` · ${n} waiting` : ''}
      </span>
    );
  if (n)
    return (
      <span className={`${pill} bg-sand`}>{v.syncing ? 'Syncing…' : `${n} waiting to sync`}</span>
    );
  return (
    <span className={`${pill} bg-sand`}>
      <span className="size-1.75 rounded-full bg-synced" /> Synced
    </span>
  );
}
