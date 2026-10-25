import { useState } from 'react';
import { inviteUrl, rotateInvite } from '../lib/store.ts';
import type { Trip } from '../../shared/types.ts';
import { SettingsCard } from './SettingsCard.tsx';

export function Invite({ trip, code, owner }: { trip: Trip; code: string | null; owner: boolean }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const url = code && inviteUrl(code);

  async function share() {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: trip.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setNote('Link copied.');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setNote('Could not share the link.');
    }
  }

  async function reset() {
    if (
      !confirm(
        'Reset the invite link? Everyone who joined with the old link will need the new one.',
      )
    )
      return;
    setBusy(true);
    try {
      await rotateInvite(trip.id);
      setNote('New link ready. Share it with everyone on the trip.');
    } catch {
      setNote('Could not reset the link while offline.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      title="Invite"
      hint={
        url
          ? 'Anyone with the link can see this trip and add expenses.'
          : 'The invite link appears once this phone is back online.'
      }
      note={note}
    >
      <div className="form-actions">
        {owner && (
          <button type="button" className="btn-outline" disabled={busy || !url} onClick={reset}>
            Reset link
          </button>
        )}
        <button type="button" className="btn-primary" disabled={!url} onClick={share}>
          Share invite link
        </button>
      </div>
    </SettingsCard>
  );
}
