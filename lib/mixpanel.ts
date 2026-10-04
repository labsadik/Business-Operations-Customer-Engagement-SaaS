"use client";

import mixpanel from "mixpanel-browser";

export type MixpanelPropertyValue =
  | string
  | number
  | boolean
  | null
  | string[];

export type MixpanelProperties = Record<string, MixpanelPropertyValue>;

let initialized = false;

export function initializeMixpanel() {
  if (initialized || typeof window === "undefined") return;

  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim();
  if (!token) return;

  try {
    mixpanel.init(token, {
      autocapture: true,
      track_pageview: "url-with-path-and-query-string",
      persistence: "localStorage",
      secure_cookie: window.location.protocol === "https:"
    });
    initialized = true;
  } catch {
    // Analytics must never be allowed to break application behavior.
  }
}

export function trackEvent(
  eventName: string,
  properties?: MixpanelProperties
) {
  initializeMixpanel();

  if (!initialized || !eventName.trim()) return;

  try {
    mixpanel.track(eventName.trim(), properties);
  } catch {
    // Tracking failures are intentionally swallowed.
  }
}

export function identifyUser(distinctId: string) {
  initializeMixpanel();

  if (!initialized || !distinctId.trim()) return;

  try {
    mixpanel.identify(distinctId.trim());
  } catch {
    // Tracking failures are intentionally swallowed.
  }
}

export function resetUser() {
  if (!initialized) return;

  try {
    mixpanel.reset();
  } catch {
    // Tracking failures are intentionally swallowed.
  }
}
