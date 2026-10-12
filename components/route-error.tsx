"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function RouteError({
  error,
  reset,
  title,
  description,
  backHref = "/",
  backLabel = "Back to home"
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center bg-[#faf9f1] px-5 py-10">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-9">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="size-6" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Canvas</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="size-4" />
            Try again
          </button>
          <Link
            href={backHref as Route}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}