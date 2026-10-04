"use client";

const STORAGE_KEY = "conventus:feedback-sound:v1";

function getContext() {
  if (typeof window === "undefined") return null;
  const Context =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? { Context } : null;
}

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext() {
  const context = getContext();
  if (!context) return null;
  if (audioContext) return audioContext;
  audioContext = new context.Context();
  return audioContext;
}

export function isFeedbackSoundEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setFeedbackSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // First-party preference is optional and never blocks feedback.
  }
}

export async function playFeedbackSound() {
  const now = Date.now();
  if (now - lastPlayedAt < 800) return;

  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return;

    const start = context.currentTime + 0.01;
    const notes = [587.33, 880];
    for (let index = 0; index < notes.length; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const offset = index * 0.09;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(notes[index], start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.035, start + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.075);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.09);
    }
    lastPlayedAt = now;
  } catch {
    // Browser audio policies are best-effort; feedback remains fully usable.
  }
}

export async function playFeedbackSoundIfEnabled() {
  if (!isFeedbackSoundEnabled()) return;
  await playFeedbackSound();
}
