"use client";

import { ExternalLink, Video } from "lucide-react";

export default function GoogleMeetEmbed({
  meetingCode,
  meetingUri
}: {
  meetingCode: string;
  meetingUri: string;
}) {
  return (
    <div className="relative min-h-[68vh] overflow-hidden bg-[#05070b]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.2),transparent_45%)]" />

      <div className="relative flex min-h-[68vh] items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-blue-500/15 text-blue-300">
                <Video className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Google Meet</p>
                <p className="mt-1 text-xs text-white/45">Live meeting hosted by Google</p>
              </div>
            </div>

            {meetingCode && (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Meeting code</p>
                <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-white/80">
                  {meetingCode}
                </p>
              </div>
            )}
          </div>

          <div className="grid min-h-[54vh] place-items-center px-6 py-14 text-center sm:px-10">
            <div className="max-w-2xl">
              <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
                <Video className="size-9" />
              </div>

              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Meeting ready
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Join your Google Meet
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/55">
                Google does not expose the normal Meet call interface as an
                embeddable iframe. Conventus keeps this secure meeting shell
                around the session, then opens the real Google-hosted call.
              </p>

              {meetingCode && (
                <div className="mx-auto mt-7 max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Google Meet code
                  </p>
                  <p className="mt-2 font-mono text-lg font-semibold tracking-wider text-white">
                    {meetingCode}
                  </p>
                </div>
              )}

              <a
                href={meetingUri}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-semibold text-slate-950 shadow-xl transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <Video className="size-4" />
                Open Google Meet
                <ExternalLink className="size-4" />
              </a>

              <div className="mx-auto mt-6 grid max-w-xl gap-2 rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] px-4 py-3 text-left">
                <p className="text-xs font-semibold text-amber-200/80">Why this is not an iframe</p>
                <p className="text-[11px] leading-5 text-white/40">
                  A normal meet.google.com page sends browser framing protections, so an iframe is rejected before the Meet application can load. Google&apos;s supported APIs do not provide a drop-in iframe for the full participant UI.
                </p>
              </div>
              <p className="mt-4 text-[11px] text-white/30">
                Only the authenticated Conventus customer, assigned employee,
                or authorized company manager can open this Conventus meeting page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
