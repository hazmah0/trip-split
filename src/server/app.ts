import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { loginRoutes, requireAccess } from './access.ts';
import type { Env } from './access.ts';
import type { Db } from './db.ts';
import { entryRoutes } from './entries.ts';
import type { createEvents } from './events.ts';
import type { Push } from './push.ts';
import { stateRoutes } from './state.ts';
import { staticRoutes } from './static.ts';
import { tripRoutes } from './trips.ts';

type AppDeps = {
  db: Db;
  passcode: string;
  distDir: string;
  events: ReturnType<typeof createEvents>;
  push: Push;
};

export function createApp({ db, passcode, distDir, events, push }: AppDeps) {
  // Order matters: health and login answer before the access gate, everything after it needs a session.
  const api = new Hono<Env>()
    .use(
      bodyLimit({
        maxSize: 64 * 1024,
        onError: (c) => c.json({ error: 'body too large' }, 413, { Connection: 'close' }),
      }),
    )
    .all('/health', (c) => c.json({ ok: true }))
    .route('/', loginRoutes(db, passcode))
    .use(requireAccess(db, passcode))
    .route('/', stateRoutes(db))
    .route('/', events.routes)
    .route('/trips', tripRoutes(db, events.notify))
    .route('/entries', entryRoutes(db, events.notify, push.created))
    .route('/push', push.routes)
    .all('*', (c) => c.notFound());

  const app = new Hono<Env>();
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.use(secureHeaders({ strictTransportSecurity: false }));
  app.use(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.route('/api', api);
  app.route('/', staticRoutes(distDir));
  app.all('*', (c) => c.json({ error: 'method not allowed' }, 405));
  return app;
}
