import { extname, join, sep } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Context } from 'hono';

export function staticRoutes(distDir: string) {
  const assets = join(distDir, 'assets') + sep;
  const onFound = (path: string, c: Context) =>
    c.header(
      'Cache-Control',
      path.startsWith(assets) ? 'public, max-age=31536000, immutable' : 'no-cache',
    );

  return new Hono().get(
    '*',
    serveStatic({ root: distDir, onFound }),
    // A missing asset must 404, not come back as index.html under a JS or image URL.
    (c, next) => (extname(c.req.path) ? c.notFound() : next()),
    serveStatic({ root: distDir, path: 'index.html', onFound }),
    (c) => c.json({ error: 'not built: run pnpm build' }, 404),
  );
}
