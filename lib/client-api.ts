type ApiError = Error & { code?: string; details?: unknown };

const RETRYABLE_SERVER_STATUSES = new Set([500, 502, 503, 504]);

function pause(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    function abort() {
      window.clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Retry only safe GETs; honour cancellation and never replay mutations. */
export async function clientFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const canRetry = method === "GET";

  for (let attempt = 0; attempt < (canRetry ? 2 : 1); attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, cache: "no-store" });
    } catch (error) {
      if (!canRetry || attempt > 0 || init?.signal?.aborted) throw error;
      await pause(150, init?.signal ?? undefined);
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const hasJsonContentType = contentType.includes("application/json") || contentType.includes("+json");
    const transientFailure =
      RETRYABLE_SERVER_STATUSES.has(response.status) ||
      (response.ok && !hasJsonContentType);

    // A login/proxy HTML response with a 200 code must not masquerade as empty API data.
    if (canRetry && attempt === 0 && transientFailure && !init?.signal?.aborted) {
      await pause(150, init?.signal ?? undefined);
      continue;
    }
    return response;
  }
  throw new Error("REQUEST_FAILED");
}

// Strict Mode and page-level components can request the same GET while mounting.
// Share only in-flight, non-cancellable reads; never cache a completed response.
const pendingApiReads = new Map<string, Promise<unknown>>();

async function performClientApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await clientFetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({})) as {
    ok?: unknown; data?: T; error?: string; message?: string; details?: unknown;
  };
  if (!response.ok) {
    const error = new Error(body.message || body.error || "REQUEST_FAILED") as ApiError;
    error.code = body.error;
    error.details = body.details;
    throw error;
  }
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new Error("API_RESPONSE_INVALID");
  }
  return body.data as T;
}

export async function clientApi<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" || init?.signal) {
    return performClientApi<T>(url, init);
  }

  const key = url;
  const pending = pendingApiReads.get(key);
  if (pending) return pending as Promise<T>;

  const promise = performClientApi<T>(url, init);
  pendingApiReads.set(key, promise);
  try {
    return await promise;
  } finally {
    if (pendingApiReads.get(key) === promise) pendingApiReads.delete(key);
  }
}
