"use client";

import Clarity from "@microsoft/clarity";

let initialized = false;

export function initializeClarity() {
  if (initialized || typeof window === "undefined") return;

  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
  if (!projectId) return;

  try {
    Clarity.init(projectId);
    initialized = true;
  } catch {
    // Analytics must never be allowed to break application behavior.
  }
}
