import { afterAll, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';

const dir = mkdtempSync(join(tmpdir(), 'trip-split-db-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const trip = (id: string, p: object = {}) => ({
  id,
  name: 'Seoul',
  home: 'SEK',
  locals: [],
  budget: null,
  updatedAt: 1000,
  deleted: false,
  ...p,
});
const rows = () =>
  new DatabaseSync(join(dir, 'travel.db'))
    .prepare('SELECT id, updated_at, json FROM trips ORDER BY id')
    .all() as { id: string; updated_at: number; json: string }[];

test('openDb turns names into travellers once, without touching updatedAt', () => {
  openDb(dir).close();
  const raw = new DatabaseSync(join(dir, 'travel.db'));
  const insert = raw.prepare('INSERT INTO trips (id, updated_at, json) VALUES (?, ?, ?)');
  const names = ['Ada', 'Bo'];
  insert.run('a', 1000, JSON.stringify(trip('a', { names })));
  insert.run('b', 1000, JSON.stringify(trip('b', { names, deleted: true })));
  raw.close();

  const db = openDb(dir);
  expect(db.getTrip('a')).toStrictEqual(
    trip('a', { travellers: [{ name: 'Ada' }, { name: 'Bo' }] }),
  );
  expect(db.getTrip('b'), 'a deleted trip converts too').toMatchObject({
    deleted: true,
    travellers: [{ name: 'Ada' }, { name: 'Bo' }],
  });
  db.close();

  const once = rows();
  expect(once.map((r) => r.updated_at)).toStrictEqual([1000, 1000]);
  openDb(dir).close();
  expect(rows(), 'a second start leaves converted rows byte-identical').toStrictEqual(once);
});
