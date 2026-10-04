"use client";

import { MessageSquareText } from "lucide-react";
import PublicFeedbackPrompt from "@/components/public-feedback-prompt";
import { playFeedbackSoundIfEnabled } from "@/lib/client-feedback-sound";
import { useCallback, useState } from "react";

export default function PublicFeedbackEntry({
  companySlug,
  authenticated
}: {
  companySlug: string;
  authenticated: boolean;
}) {
  const [open, setOpen] = useState(false);

  function openFeedback() {
    void playFeedbackSoundIfEnabled();
    setOpen(true);
  }

  const returnTo = "/" + companySlug;
  const loginHref =
    "/api/auth/google/start?intent=customer&companySlug=" +
    encodeURIComponent(companySlug) +
    "&returnTo=" +
    encodeURIComponent(returnTo);

  return (
    <>
      <button
        type="button"
        onClick={openFeedback}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transform-none"
      >
        <MessageSquareText className="size-4" aria-hidden="true" />
        Give feedback
      </button>

      <PublicFeedbackPrompt
        open={open}
        onClose={() => setOpen(false)}
        companySlug={companySlug}
        authenticated={authenticated}
        loginHref={loginHref}
      />
    </>
  );
}
