import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { can } from './access.ts';
import type { Access, Env } from './access.ts';

type Listener = { access: Access; send: (tripId: string) => Promise<void>; end: () => void };

export type Notify = (tripId: string, endMemberStreams?: boolean) => void;
export type Events = ReturnType<typeof createEvents>;

export function createEvents() {
  const listeners = new Set<Listener>();

  const notify: Notify = (tripId, endMemberStreams = false) => {
    for (const l of listeners) {
      if (!can(l.access, tripId)) continue;
      const sent = l.send(tripId);
      if (endMemberStreams && !l.access.owner) void sent.then(l.end);
    }
  };

  const routes = new Hono<Env>().get('/events', (c) => {
    c.header('X-Accel-Buffering', 'no');
    const res = streamSSE(c, async (stream) => {
      // EventSource's default 3s retry would wake an offline phone's radio over a thousand times an hour.
      await stream.write('retry: 15000\n\n');
      const ping = setInterval(() => void stream.write(': ping\n\n'), 25_000);
      await new Promise<void>((done) => {
        const l: Listener = {
          access: c.get('access'),
          send: (tripId) => stream.writeSSE({ event: 'change', data: tripId }),
          end: () => {
            listeners.delete(l);
            done();
          },
        };
        listeners.add(l);
        stream.onAbort(l.end);
      });
      clearInterval(ping);
    });
    // An ended stream's socket would otherwise idle in keep-alive and hold up server.close().
    res.headers.set('Connection', 'close');
    return res;
  });

  const closeAll = () => {
    for (const l of listeners) l.end();
  };

  return { notify, routes, closeAll };
}
