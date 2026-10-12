import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import CookieSettingsButton from "@/components/cookie-settings-button";
import { LEGAL_CONFIG } from "@/lib/legal";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export default function LegalPageShell({
  kind,
  title,
  summary,
  sections
}: {
  kind: "terms" | "privacy";
  title: string;
  summary: string;
  sections: LegalSection[];
}) {
  const Icon = kind === "privacy" ? ShieldCheck : FileText;

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
              <FileText className="size-4" aria-hidden="true" />
            </span>
            {LEGAL_CONFIG.siteName}
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-12">
          <aside className="lg:sticky lg:top-6">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
                <Icon className="size-4" aria-hidden="true" />
                Legal
              </div>
              <nav aria-label="Page sections" className="mt-4 space-y-1">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={"#" + section.id}
                    className="block rounded-lg px-2.5 py-2 text-xs font-medium leading-5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <article className="min-w-0 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-9 lg:p-12">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                {kind === "privacy" ? "Privacy" : "Terms"}
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                {title}
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-600">
                {summary}
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-[#faf9f1] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Effective</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-900">{LEGAL_CONFIG.effectiveDate}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[#faf9f1] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Last updated</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-900">{LEGAL_CONFIG.lastUpdated}</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-blue-600">Review status</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-blue-950">Owner + counsel review required before launch</p>
                </div>
              </div>

              <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-xs leading-6 text-amber-950">
                <p className="font-semibold">Important launch note</p>
                <p className="mt-1">
                  This page describes the current Canvas implementation and is not a representation that the service is legally compliant. Resolve all marked owner decisions and obtain qualified legal review before public launch.
                </p>
              </div>

              <div className="mt-10 space-y-10">
                {sections.map((section) => (
                  <section key={section.id} id={section.id} className="scroll-mt-8">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{section.title}</h2>
                    <div className="mt-3 space-y-4 text-sm leading-7 text-slate-600">
                      {section.content}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-7 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/" className="font-semibold text-slate-700 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Back to Canvas
            </Link>
            <Link href="/terms" className="hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Privacy</Link>
            <Link href="/login" className="hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Sign in</Link>
            <CookieSettingsButton>Cookie settings</CookieSettingsButton>
          </div>
          <p>
            Legal contact: <span className="font-medium text-slate-700">{LEGAL_CONFIG.legalContact}</span>
          </p>
        </div>
      </footer>
    </main>
  );
}
