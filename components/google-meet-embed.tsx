'use client';

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Video } from "lucide-react";

declare global {
  interface Window {
    MeetApp?: new () => {
      createMeeting: (options: {
        parent: HTMLElement;
        meetingCode: string;
      }) => unknown | Promise<unknown>;
    };
  }
}

export default function GoogleMeetEmbed({ meetingCode, meetingUri }: { meetingCode: string; meetingUri: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [error, setError] = useState("");

  const init = useCallback(() => {
    if (initializedRef.current || !containerRef.current || !meetingCode) return;
    const MeetApp = window.MeetApp;
    if (!MeetApp) {
      setError("Google Meet Embed SDK did not load.");
      return;
    }
    try {
      initializedRef.current = true;
      containerRef.current.replaceChildren();
      const app = new MeetApp();
      void Promise.resolve(app.createMeeting({ parent: containerRef.current, meetingCode })).catch(() => {
        initializedRef.current = false;
        setError("Google Meet could not be embedded. Use the Google Meet button below.");
      });
    } catch {
      initializedRef.current = false;
      setError("Google Meet could not be embedded. Use the Google Meet button below.");
    }
  }, [meetingCode]);

  useEffect(() => {
    if (window.MeetApp) init();
  }, [init]);

  return (
    <div className="relative h-[72vh] min-h-[620px] bg-[#05070b]">
      <Script
        src="https://www.gstatic.com/meetjs/alpha/meet.js"
        strategy="afterInteractive"
        onLoad={init}
        onError={() => setError("Google Meet Embed SDK did not load.")}
      />

      <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-black" aria-label={"Google Meet " + meetingCode} />

      {!error && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 pb-10 pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
            <Video className="size-4 text-blue-300" />
            <span>Google Meet</span>
          </div>
          <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[11px] text-white/65 backdrop-blur">
            {meetingCode}
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/95 p-6 text-center">
          <div className="max-w-md">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-500/15 text-blue-300">
              <Video className="size-7" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Google Meet</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Open the live meeting</h2>
            <p className="mt-3 text-sm leading-6 text-white/55">
              The Google-hosted Meet page cannot be framed directly. The supported Google Meet Embed SDK was unable to initialize here.
            </p>
            <a
              href={meetingUri}
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 hover:bg-slate-100"
            >
              <Video className="size-4" />
              Join Google Meet
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      )}

      {!error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-white/45 backdrop-blur">
            <Loader2 className="size-3.5 animate-spin" />
            Google Meet is loading
          </div>
        </div>
      )}
    </div>
  );
}
