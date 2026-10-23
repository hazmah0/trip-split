import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createEvents } from './events.ts';
import { createPush, pushFromEnv } from './push.ts';
import type { PushConfig } from './push.ts';

export type StartOptions = {
  port?: number;
  dataDir?: string;
  passcode?: string;
  distDir?: string;
  push?: PushConfig | null;
};

export async function start(opts: StartOptions = {}) {
  const port = opts.port ?? Number(process.env.PORT ?? 8080);
  const passcode = opts.passcode ?? process.env.APP_PASSCODE ?? '';
  const distDir = resolve(opts.distDir ?? resolve(import.meta.dirname, '../../dist'));
  const db = openDb(opts.dataDir ?? process.env.DATA_DIR ?? './data');
  if (!passcode) console.warn('APP_PASSCODE is not set: authentication is DISABLED');
  const pushConfig = opts.push === undefined ? pushFromEnv(process.env) : opts.push;
  if (!pushConfig) console.log('VAPID keys are not set: push notifications are off');

  const events = createEvents();
  const push = createPush(db, pushConfig);
  const app = createApp({ db, passcode, distDir, events, push });

  const server = serve({ fetch: app.fetch, port });
  await once(server, 'listening');
  const actual = (server.address() as AddressInfo).port;
  console.log(`listening on http://localhost:${actual}`);
  return {
    url: `http://localhost:${actual}`,
    close: () =>
      new Promise<void>((ok) => {
        events.closeAll();
        push.close();
        server.close(() => {
          db.close();
          ok();
        });
      }),
  };
}

if (import.meta.main) {
  const app = await start();
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      console.log(`${sig}: shutting down`);
      void app.close().then(() => process.exit(0));
    });
  }
}
