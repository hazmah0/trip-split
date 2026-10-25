import { useEffect, useState } from 'react';
import { pushStatus, pushSupported, setPush } from '../lib/push.ts';
import type { PushStatus } from '../lib/push.ts';
import { SettingsCard } from './SettingsCard.tsx';

function hint(status: PushStatus | 'offline', denied: boolean): string {
  if (!pushSupported)
    return 'Notifications work in the installed app. On iPhone, tap Share, then Add to Home Screen.';
  if (status === 'offline') return 'Notifications can be changed once this phone is back online.';
  if (status.on)
    return 'This phone gets a notification when someone else adds an expense or a payment.';
  if (denied) return "Notifications are blocked for this app. Allow them in the phone's settings.";
  return 'Get a notification on this phone when someone else adds an expense or a payment.';
}

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
    <SettingsCard title="Notifications" hint={hint(status, denied)} note={note}>
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
    </SettingsCard>
  );
}
