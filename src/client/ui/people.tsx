import type { CSSProperties } from 'react';
import { active, label } from '../../shared/travellers.ts';
import type { Person, Trip } from '../../shared/types.ts';

const COLOURS = 8;

export const personColor = (p: Person) => `var(--color-person-${p % COLOURS})`;

export function personStyle(p: Person): CSSProperties {
  return { '--who': personColor(p), '--on-who': 'var(--color-ink)' } as CSSProperties;
}

export function Avatar({ p, name, big }: { p: Person; name: string; big?: boolean }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full bg-(--who) font-extrabold text-ink ${big ? 'size-12 text-2xl' : 'size-8 text-sm'}`}
      style={personStyle(p)}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Dot({ p }: { p: Person }) {
  return (
    <span
      className="mr-1.5 inline-block size-3 shrink-0 rounded-full align-[-1px]"
      style={{ background: personColor(p) }}
    />
  );
}

export function SplitBadge({
  shares,
  big,
  className = '',
}: {
  shares: number[];
  big?: boolean;
  className?: string;
}) {
  const total = shares.reduce((a, w) => a + w, 0) || 1;
  const stops: string[] = [];
  let at = 0;
  for (const [i, w] of shares.entries())
    if (w) stops.push(`${personColor(i)} ${(at / total) * 100}% ${((at += w) / total) * 100}%`);
  return (
    <span
      className={`rounded-full inset-shadow-hairline ${big ? 'size-5.5 shrink-0' : 'size-4.5 ring-2 ring-card'} ${className}`}
      style={{ background: `conic-gradient(${stops.join(', ')})` }}
      aria-hidden="true"
    />
  );
}

export const pickable = (trip: Trip, picked: Person[]) =>
  [...new Set([...active(trip), ...picked])].sort((a, b) => a - b);

export function PersonPicker({
  trip,
  value,
  keep = [],
  onChange,
  label: groupLabel,
}: {
  trip: Trip;
  value: Person;
  keep?: Person[];
  onChange: (p: Person) => void;
  label: string;
}) {
  const people = pickable(trip, [...keep, value]);
  const chips = people.length > 3;
  return (
    <div
      className={chips ? 'flex flex-wrap gap-2' : 'segmented'}
      role="radiogroup"
      aria-label={groupLabel}
    >
      {people.map((i) => (
        <button
          type="button"
          key={i}
          role="radio"
          aria-checked={value === i}
          className={chips ? 'chip' : undefined}
          style={personStyle(i)}
          onClick={() => onChange(i)}
        >
          {label(trip, i)}
        </button>
      ))}
    </div>
  );
}
