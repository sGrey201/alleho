import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { OFFLINE_CACHE_GC_TIME_MS } from "@/lib/offlineCacheConfig";

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`${status}: ${message}`);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiHttpError(res.status, text);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
  });
  await throwIfResNotOk(res);
  return res.json() as Promise<T>;
}

function httpStatusFromError(error: unknown): number | undefined {
  if (error instanceof ApiHttpError) return error.status;
  if (error instanceof Error) {
    const match = /^(\d{3}):/.exec(error.message);
    if (match) return Number(match[1]);
  }
  return undefined;
}

/** Abort, dropped connection, cookie race (401), rate-limit, server errors. */
export function isTransientQueryError(error: unknown): boolean {
  const status = httpStatusFromError(error);
  if (status === 401 || status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  if (status !== undefined) return false;
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError" || error instanceof TypeError;
}

export function retryTransientQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  return isTransientQueryError(error);
}

export function transientQueryRetryDelay(attemptIndex: number): number {
  return Math.min(500 * 2 ** attemptIndex, 4000);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      cache: "no-store",
      signal,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime: OFFLINE_CACHE_GC_TIME_MS,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
