import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';

export const readJson = (c: Context) =>
  c.req.json<unknown>().catch(() => {
    throw new HTTPException(400, { message: 'invalid JSON' });
  });

export function parseBody<T extends z.ZodType>(
  what: string,
  schema: T,
  body: unknown,
): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new HTTPException(400, {
      message: `invalid ${what}.${String(r.error.issues[0]!.path[0] ?? 'body')}`,
    });
  return r.data;
}

export function parse<T extends z.ZodType<{ id: string }>>(
  what: string,
  schema: T,
  body: unknown,
  id: string,
): z.output<T> {
  const data = parseBody(what, schema, body);
  if (data.id !== id) throw new HTTPException(400, { message: `invalid ${what}.id` });
  return data;
}
