export const KEY = {
  state: 'tb:state2',
  outbox: 'tb:outbox2',
  rates: 'tb:rates2',
  me: 'tb:me2',
  trip: 'tb:trip',
  lastCurrency: 'tb:lastCurrency',
};

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
