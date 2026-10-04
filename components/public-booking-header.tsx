"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Building2, LogIn, LogOut, X } from "lucide-react";
import UserAvatar from "@/components/user-avatar";

export default function PublicBookingHeader({
  companyName,
  companySlug,
  logoUrl,
  name,
  email,
  image,
  authenticated
}: {
  companyName: string;
  companySlug: string;
  logoUrl?: string;
  name?: string;
  email?: string;
  image?: string;
  authenticated: boolean;
}) {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!logoutOpen) return;
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLogoutOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [logoutOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href={("/" + companySlug) as Route} className="flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm">
              {logoUrl ? (
                // Company-provided logo URLs are not constrained to the Next image allowlist.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-full object-cover" />
              ) : (
                <Building2 className="size-5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-slate-950">{companyName}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Schedule with {companyName}</p>
            </div>
          </Link>

          {authenticated && name && email ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="truncate text-xs font-semibold text-slate-900">{name}</p>
                <p className="max-w-52 truncate text-[10px] text-slate-400">{email}</p>
              </div>
              <UserAvatar name={name} email={email} image={image} size={38} />
              <button
                type="button"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => setLogoutOpen(true)}
                className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <a
              href={"/api/auth/google/start?intent=customer&companySlug=" + encodeURIComponent(companySlug) + "&returnTo=%2F" + encodeURIComponent(companySlug)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              <LogIn className="size-4" />
              Sign in
            </a>
          )}
        </div>
      </header>

      {logoutOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-logout-title"
            className="w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Account</p>
                <h2 id="public-logout-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Sign out?</h2>
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={() => setLogoutOpen(false)}
                className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-6">
              <p className="text-sm leading-6 text-slate-600">You will need to sign in again before creating another customer booking.</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLogoutOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
