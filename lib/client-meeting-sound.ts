"use client";

type MeetingSoundType = "incoming" | "accepted" | "retrying" | "expired";

let audioContext: AudioContext | null = null;
const lastPlayedAt = new Map<MeetingSoundType, number>();

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  audioContext = new Context();
  return audioContext;
}

export async function unlockMeetingSound() {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
}

function notesFor(type: MeetingSoundType) {
  switch (type) {
    case "accepted":
      return [523.25, 659.25, 783.99];
    case "retrying":
      return [493.88, 392];
    case "expired":
      return [349.23, 293.66, 246.94];
    case "incoming":
    default:
      return [659.25, 783.99];
  }
}

export async function playMeetingSound(type: MeetingSoundType) {
  const now = Date.now();
  const previous = lastPlayedAt.get(type) ?? 0;
  if (now - previous < 1200) return;

  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return;

    const notes = notesFor(type);
    const start = context.currentTime + 0.01;

    for (let index = 0; index < notes.length; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const offset = index * 0.12;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(notes[index], start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.045, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.105);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.12);
    }

    lastPlayedAt.set(type, now);
  } catch {
    // Browser audio policies can reject sound; UI state continues normally.
  }
}
