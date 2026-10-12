"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f1] px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-blue-600">Canvas</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The application hit an unexpected error. Try again and the system will recover without losing durable data.
        </p>
        <button
          onClick={() => reset()}
          className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}