"use client";

/** Thin fetch wrappers for the client screens: status + parsed body, never a throw. */
export type ApiResult<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  data: T;
};

export async function apiJson<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

/** Multipart — the browser sets the boundary, so no content-type header here. */
export async function apiForm<T = Record<string, unknown>>(
  path: string,
  form: FormData,
  init?: Omit<RequestInit, "body">,
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    cache: "no-store",
    method: "POST",
    ...init,
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function apiError(r: ApiResult<unknown>): string | undefined {
  const data = r.data as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : undefined;
}
