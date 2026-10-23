import { useState, type FormEvent } from 'react';
import { login, setMe, useStore } from '../lib/store.ts';
import type { Trip } from '../../shared/types.ts';
import { TripForm } from '../trips/TripForm.tsx';
import { Avatar, personStyle } from '../ui/people.tsx';

export function Splash({ online }: { online: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-6">
      <p className="-mt-2 font-semibold text-soft">
        {online ? 'Loading your trips…' : 'No connection. Open the app once online to set it up.'}
      </p>
    </main>
  );
}

export function JoinForm({ onJoined }: { onJoined?: () => void }) {
  const { online, joinFailed } = useStore();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await login(text);
    setError(!ok);
    setBusy(false);
    if (ok) onJoined?.();
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <label className="field">
        <span>Invite link, code or owner passcode</span>
        <input
          className="input"
          autoFocus
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {(error || joinFailed) && (
        <p className="error" role="alert">
          {online
            ? "That link or code didn't work. Ask whoever shared it for a fresh link."
            : 'No connection. Try again once you are online.'}
        </p>
      )}
      <button className="btn-primary" disabled={busy || !text.trim()}>
        {busy ? 'Checking…' : 'Join'}
      </button>
    </form>
  );
}

export function Login({ noTrips }: { noTrips?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-6">
      <div className="flex w-full max-w-115 flex-col gap-4 card px-5 py-6">
        <h1 className="text-4xl font-extrabold">Trip Split</h1>
        <p className="-mt-2 font-semibold text-soft">
          {noTrips
            ? 'This phone has no trips yet. Paste an invite link to join one.'
            : 'Paste the invite link your group shared. Opened it in Safari? Copy it and paste it here.'}
        </p>
        <JoinForm />
      </div>
    </main>
  );
}

export function FirstTrip() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-6">
      <div className="flex w-full max-w-115 flex-col gap-4 card px-5 py-6">
        <h1 className="text-4xl font-extrabold">Start your first trip</h1>
        <p className="-mt-2 font-semibold text-soft">
          Your travel group, one fair balance. Every expense is converted to your home currency at
          that day's rate.
        </p>
        <TripForm onDone={() => {}} />
      </div>
    </main>
  );
}

export function WhoAmI({ trip }: { trip: Trip }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-6">
      <div className="flex w-full max-w-115 flex-col gap-4 card px-5 py-6">
        <h1 className="text-4xl font-extrabold">Whose phone is this?</h1>
        <p className="-mt-2 font-semibold text-soft">
          On {trip.name}, new expenses on this phone default to being paid by you.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {trip.names.map((n, i) => (
            <button
              key={i}
              className="flex flex-col items-center gap-2 rounded-card bg-ground px-2 py-4.5 text-lg font-extrabold transition-[transform,background-color] duration-200 ease-spring hover:bg-sand active:scale-96"
              style={personStyle(i)}
              onClick={() => setMe(trip.id, i)}
            >
              <Avatar p={i} name={n} big />
              {n}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
