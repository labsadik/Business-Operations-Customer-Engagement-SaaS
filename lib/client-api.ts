type ApiError = Error & { code?: string; details?: unknown };

const RETRYABLE_SERVER_STATUSES = new Set([502, 503, 504]);

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

/** Recover client-side reads from brief network/cold-start failures. Mutations are never retried. */
export async function clientApi<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const canRetry = method === "GET" && !init?.signal;

  for (let attempt = 0; attempt < (canRetry ? 2 : 1); attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
        cache: "no-store"
      });
    } catch (error) {
      if (!canRetry || attempt > 0) throw error;
      await pause(150);
      continue;
    }

    const body = await response.json().catch(() => ({})) as {
      data?: T; error?: string; message?: string; details?: unknown;
    };
    if (!response.ok) {
      if (canRetry && attempt === 0 && RETRYABLE_SERVER_STATUSES.has(response.status)) {
        await pause(150);
        continue;
      }
      const error = new Error(body.message || body.error || "REQUEST_FAILED") as ApiError;
      error.code = body.error;
      error.details = body.details;
      throw error;
    }
    return body.data as T;
  }
  throw new Error("REQUEST_FAILED");
}
