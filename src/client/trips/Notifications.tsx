import { useEffect, useState } from 'react';
import { pushStatus, pushSupported, setPush } from '../lib/push.ts';
import type { PushStatus } from '../lib/push.ts';

export function Notifications({ tripId, online }: { tripId: string; online: boolean }) {
  const [fetched, setFetched] = useState<PushStatus | null | 'offline'>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const status = online || fetched === null ? fetched : 'offline';

  useEffect(() => {
    if (online) pushStatus(tripId).then(setFetched, () => setFetched('offline'));
  }, [tripId, online]);

  if (!status || (!pushSupported && status === 'offline')) return null;
  const denied = pushSupported && Notification.permission === 'denied';

  async function toggle(s: PushStatus) {
    setBusy(true);
    setNote('');
    try {
      const next = await setPush(tripId, s.key, !s.on);
      if (next) setFetched(next);
    } catch {
      setNote('Could not change notifications. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mt-4 flex flex-col gap-3 card px-4 pt-4.5 pb-5 wide:mx-0">
      <h2 className="text-3xl font-extrabold">Notifications</h2>
      <p className="hint">
        {!pushSupported
          ? 'Notifications work in the installed app. On iPhone, tap Share, then Add to Home Screen.'
          : status === 'offline'
            ? 'Notifications can be changed once this phone is back online.'
            : status.on
              ? 'This phone gets a notification when someone else adds an expense or a payment.'
              : denied
                ? "Notifications are blocked for this app. Allow them in the phone's settings."
                : 'Get a notification on this phone when someone else adds an expense or a payment.'}
      </p>
      {pushSupported && status !== 'offline' && (
        <div className="form-actions">
          <button
            type="button"
            className={status.on ? 'btn-outline' : 'btn-primary'}
            disabled={busy || (denied && !status.on)}
            onClick={() => void toggle(status)}
          >
            {status.on ? 'Turn off notifications' : 'Turn on notifications'}
          </button>
        </div>
      )}
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
