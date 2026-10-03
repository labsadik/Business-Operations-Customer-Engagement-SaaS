"use client";

import { useEffect, useState } from "react";

function secondsUntil(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export default function MeetingResponseCountdown({
  expiresAt,
  label
}: {
  expiresAt: string;
  label: string;
}) {
  const [remaining, setRemaining] = useState(() => secondsUntil(expiresAt));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        const next = secondsUntil(expiresAt);
        return next === current ? current : next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const urgent = remaining <= 60;
  const progress = Math.min(100, Math.max(0, (remaining / 300) * 100));

  return (
    <div className="mt-3 flex max-w-sm items-center gap-3">
      <span className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold ${urgent ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${urgent ? "bg-rose-500" : "bg-blue-600"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
