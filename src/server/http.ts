import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';

export const readJson = (c: Context) =>
  c.req.json<unknown>().catch(() => {
    throw new HTTPException(400, { message: 'invalid JSON' });
  });

export function parse<T extends z.ZodType<{ id: string }>>(
  what: string,
  schema: T,
  body: unknown,
  id: string,
): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new HTTPException(400, {
      message: `invalid ${what}.${String(r.error.issues[0]!.path[0] ?? 'body')}`,
    });
  if (r.data.id !== id) throw new HTTPException(400, { message: `invalid ${what}.id` });
  return r.data;
}
