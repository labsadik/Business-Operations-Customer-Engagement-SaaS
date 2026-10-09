type ApiError = Error & { code?: string; details?: unknown };

const RETRYABLE_SERVER_STATUSES = new Set([502, 503, 504]);

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
      await pause(150, init?.signal);
      continue;
    }

    if (canRetry && attempt === 0 && RETRYABLE_SERVER_STATUSES.has(response.status) && !init?.signal?.aborted) {
      await pause(150, init?.signal);
      continue;
    }
    return response;
  }
  throw new Error("REQUEST_FAILED");
}

export async function clientApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await clientFetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({})) as {
    data?: T; error?: string; message?: string; details?: unknown;
  };
  if (!response.ok) {
    const error = new Error(body.message || body.error || "REQUEST_FAILED") as ApiError;
    error.code = body.error;
    error.details = body.details;
    throw error;
  }
  return body.data as T;
}
