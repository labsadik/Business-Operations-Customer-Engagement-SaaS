"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Globe2, LockKeyhole } from "lucide-react";

export default function PublicPageShare({
  savedSlug,
  draftSlug,
  published,
  canPublish,
  busy,
  onPublishRequest
}: {
  savedSlug: string;
  draftSlug?: string;
  published: boolean;
  canPublish: boolean;
  busy: boolean;
  onPublishRequest: () => void;
}) {
  const [origin, setOrigin] = useState("");
  const titleId = useId();
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    const timer = window.setTimeout(() => setOrigin(window.location.origin), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const savedPath = `/${savedSlug}`;
  const savedUrl = useMemo(
    () => (origin ? `${origin}${savedPath}` : savedPath),
    [origin, savedPath]
  );
  const hasUnsavedSlug = Boolean(draftSlug && draftSlug !== savedSlug);
  const draftPath = draftSlug ? `/${draftSlug}` : savedPath;
  const displayUrl = hasUnsavedSlug && origin ? `${origin}${draftPath}` : savedUrl;

  async function copyLink() {
    try {
      const exactUrl = `${origin || window.location.origin}${savedPath}`;
      await navigator.clipboard.writeText(exactUrl);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby={titleId}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {published ? <Globe2 className="size-5" aria-hidden="true" /> : <LockKeyhole className="size-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="text-sm font-semibold text-slate-950">Public booking page</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {published ? "Live" : "Draft"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {published
                ? "Visitors can open this URL and, after Google sign-in, request available meeting times."
                : "This page is prepared in your workspace but remains private until you publish it."}
            </p>
          </div>
        </div>

        {published ? (
          <button
            type="button"
            onClick={onPublishRequest}
            disabled={busy}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            onClick={onPublishRequest}
            disabled={busy || !canPublish}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Publish page
          </button>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-[#faf9f1] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Saved public URL</p>
        <p className="mt-2 break-all text-sm font-semibold text-slate-900">{displayUrl}</p>
        {hasUnsavedSlug && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
            The slug has unsaved changes. Copy and Preview still use the currently saved URL. Save the company profile to make the new URL live.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          {copyState === "success" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copyState === "success" ? "Link copied" : "Copy link"}
        </button>
        <a
          href={savedPath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {published ? "Open live page" : "Preview page"}
        </a>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-[11px] leading-5 sm:flex-row sm:items-start sm:justify-between">
        <p className={canPublish || published ? "text-slate-500" : "text-amber-800"}>
          {published
            ? "Publishing status is live."
            : canPublish
              ? "Ready to publish: a scheduling-ready Google-connected member is available."
              : "Connect a scheduling-ready Google account before publishing."}
        </p>
        {copyState === "success" && (
          <span role="status" aria-live="polite" className="font-semibold text-emerald-700">
            Public link copied to your clipboard.
          </span>
        )}
        {copyState === "error" && (
          <span role="status" aria-live="polite" className="font-semibold text-red-700">
            Could not copy the link. You can open the URL and copy it manually.
          </span>
        )}
      </div>
    </section>
  );
}
