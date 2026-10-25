import { useEffect, useRef, useState } from 'react';
import { BalanceCard } from './expenses/BalanceCard.tsx';
import { EntrySheet } from './expenses/EntrySheet.tsx';
import { ExpenseList } from './expenses/ExpenseList.tsx';
import { SettleSheet, SwishReturnSheet } from './expenses/SettleSheet.tsx';
import { FirstTrip, Login, RemovedGate, Splash, WhoAmI } from './gates/Gates.tsx';
import { selectTrip, useStore, type View } from './lib/store.ts';
import { pendingSwish, type SwishPayment } from './lib/swish.ts';
import type { Settlement } from '../shared/ledger.ts';
import type { Entry, Person, Trip } from '../shared/types.ts';
import { Stats } from './stats/Stats.tsx';
import { Invite } from './trips/Invite.tsx';
import { Notifications } from './trips/Notifications.tsx';
import { TripForm } from './trips/TripForm.tsx';
import { TripsSheet } from './trips/TripsSheet.tsx';
import { Header, type Tab } from './Header.tsx';
import { Icon } from './ui/Icon.tsx';
import { Sheet } from './ui/Sheet.tsx';

export function App() {
  const v = useStore();
  if (v.auth === 'login') return <Login />;
  if (!v.trip) {
    if (v.auth === 'unknown') return <Splash online={v.online} />;
    return v.owner ? <FirstTrip /> : <Login noTrips />;
  }
  if (v.meRemoved) return <RemovedGate trip={v.trip} />;
  if (v.me === null) return <WhoAmI trip={v.trip} />;
  return <Main v={v} trip={v.trip} me={v.me} />;
}

type SheetState =
  | { kind: 'entry'; entry?: Entry }
  | { kind: 'settle'; entry?: Entry; settlement?: Settlement }
  | { kind: 'trips' | 'new-trip' }
  | { kind: 'swish'; payment: SwishPayment }
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
  useEffect(() => {
    const check = () => {
      const payment = document.visibilityState === 'visible' && pendingSwish(trip.id);
      if (payment) setSheet({ kind: 'swish', payment });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [trip.id]);

  return (
    <div className="mx-auto min-h-dvh max-w-app pb-[calc(var(--spacing-dock)+env(safe-area-inset-bottom)+88px)] wide:grid wide:max-w-wide wide:grid-cols-[minmax(0,1.25fr)_minmax(340px,1fr)] wide:grid-rows-[auto_1fr] wide:gap-x-6 wide:px-6 wide:pb-28">
      <Header
        trip={trip}
        v={v}
        tab={tab}
        onTab={setTab}
        onTrips={() => setSheet({ kind: 'trips' })}
      />

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
              entries={v.entries}
              hasPending={v.pendingTrips.has(trip.id)}
              online={v.online}
              owner={v.owner}
              onDone={() => setTab('expenses')}
            />
          </div>
          <Invite key={`invite-${trip.id}`} trip={trip} code={v.invite} owner={v.owner} />
          <Notifications key={`push-${trip.id}`} tripId={trip.id} online={v.online} />
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
          me={me}
          onClose={close}
        />
      )}
      {sheet?.kind === 'swish' && (
        <SwishReturnSheet payment={sheet.payment} trip={trip} onClose={close} />
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
