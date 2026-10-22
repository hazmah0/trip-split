import type { Category } from '../../shared/types.ts';

const paths = {
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 6s1 4 3 4v8',
  transport:
    'M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 11h16M8 17l-2 4M16 17l2 4M8 14h.01M16 14h.01',
  stay: 'M3 20V6M3 13h18v7M21 13v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  sights: 'M4 21h16M6 21V10M18 21V10M3 10l9-6 9 6M10 21v-5h4v5',
  shopping: 'M6 8h12l-1 13H7L6 8zM9 8V6a3 3 0 0 1 6 0v2',
  groceries: 'M3 4h3l2 11h11l2-8H7M10 20h.01M17 20h.01',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
  cafe: 'M4 9h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V9zM17 10h1.5a2.5 2.5 0 0 1 0 5H16.5M8 3v3M12 3v3',
  nightlife: 'M4 4h16l-8 9-8-9zM12 13v7M8 20h8M7 7.5h10',
  flights:
    'M10.5 13.5L4 11l-1 1.5 5.5 3.5L7 18H5l-1 1 3 1 1 3 1-1v-2l2-1.5 3.5 5.5L16 23l-2.5-6.5L19 11c1.5-1.5 2-3.5 1-4.5s-3-.5-4.5 1z',
  gifts:
    'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8c-1-3-5-4-5-1.5S10 8 12 8zM12 8c1-3 5-4 5-1.5S14 8 12 8z',
  health: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 8v8M8 12h8',
  cash: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9h.01M18 15h.01',
  fees: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.2-1.2.2-2-3-1-1 2h-2l-1-2-3 1 .2 2L6 7.2 4 7 3 10l2 1v2l-2 1 1 3 2-.2 1.2 1.2-.2 2 3 1 1-2h2l1 2 3-1-.2-2 1.2-1.2 2 .2 1-3-2-1v-2z',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  offline:
    'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M12 20h.01',
  check: 'M5 12l5 5 9-10',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  chevron: 'M6 9l6 6 6-6',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName | Category; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
