export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!res.ok)
    throw new HttpError(
      res.status,
      ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.statusText,
    );
  return (await res.json()) as T;
}
