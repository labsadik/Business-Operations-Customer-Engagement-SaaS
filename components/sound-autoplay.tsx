"use client";

import { useEffect } from "react";
import { unlockFeedbackSound } from "@/lib/client-feedback-sound";
import { unlockMeetingSound } from "@/lib/client-meeting-sound";
import { unlockTaskSound } from "@/lib/client-task-sound";

export default function SoundAutoplay() {
  useEffect(() => {
    let unlocked = false;

    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
      void Promise.allSettled([
        unlockTaskSound(),
        unlockMeetingSound(),
        unlockFeedbackSound()
      ]);
    };

    window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("touchstart", unlock, { capture: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
  }, []);

  return null;
}
