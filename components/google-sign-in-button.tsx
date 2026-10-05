"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="size-5 shrink-0"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.876 2.684-6.614Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.908-2.258c-.806.54-1.834.86-3.048.86-2.344 0-4.327-1.583-5.037-3.71H.957v2.327A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.71A5.41 5.41 0 0 1 3.68 9c0-.593.102-1.17.283-1.71V4.963H.957A9 9 0 0 0 0 9c0 1.454.348 2.827.957 4.037l3.006-2.327Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.442 1.345l2.581-2.581C13.463.891 11.43 0 9 0A9 9 0 0 0 .957 4.963L3.963 7.29C4.673 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({
  href,
  label = "Continue with Google",
  showGoogleLogo = false
}: {
  href: string;
  label?: string;
  showGoogleLogo?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <a
      href={href}
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
      ) : showGoogleLogo ? (
        <GoogleLogo />
      ) : (
        <span className="grid size-6 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-700" aria-hidden="true">
          G
        </span>
      )}
      {loading ? "Opening Google..." : label}
    </a>
  );
}
