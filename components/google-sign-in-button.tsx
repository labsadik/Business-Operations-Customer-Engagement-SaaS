"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function GoogleSignInButton({
  href,
  label = "Continue with Google"
}: {
  href: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <a
      href={loading ? undefined : href}
      aria-disabled={loading}
      aria-busy={loading}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        setLoading(true);
      }}
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 aria-disabled:cursor-wait aria-disabled:opacity-80"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <span className="grid size-6 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-700" aria-hidden="true">
          G
        </span>
      )}
      {loading ? "Opening Google..." : label}
    </a>
  );
}
