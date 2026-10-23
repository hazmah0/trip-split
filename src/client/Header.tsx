import type { View } from './lib/store.ts';
import type { Trip } from '../shared/types.ts';
import { Icon } from './ui/Icon.tsx';

export type Tab = 'expenses' | 'stats' | 'trip';

export function Header({
  trip,
  v,
  tab,
  onTab,
  onTrips,
}: {
  trip: Trip;
  v: View;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onTrips: () => void;
}) {
  return (
    <header className="sticky top-0 z-5 flex h-[calc(var(--spacing-topbar)+env(safe-area-inset-top))] items-center justify-between gap-3 bg-ground pt-[env(safe-area-inset-top)] pr-4 pl-3 wide:col-span-2 wide:grid wide:grid-cols-[minmax(0,1fr)_auto_1fr] wide:pr-0 wide:pl-1">
      <button
        className="inline-flex min-h-11 min-w-0 items-center gap-1 rounded-tile px-2 transition-colors hover:bg-sand wide:max-w-full wide:justify-self-start"
        onClick={onTrips}
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
            onClick={() => onTab(id)}
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
