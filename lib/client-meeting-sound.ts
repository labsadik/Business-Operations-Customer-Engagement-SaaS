"use client";

type MeetingSoundType = "incoming" | "accepted" | "retrying" | "expired";

type Note = {
  frequency: number;
  duration: number;
  gap?: number;
  wave?: OscillatorType;
  volume?: number;
};

let audioContext: AudioContext | null = null;
const lastPlayedAt = new Map<MeetingSoundType, number>();

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;

  const Context =
    window.AudioContext ||
    (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

  if (!Context) return null;

  audioContext = new Context();
  return audioContext;
}

function createOutput(context: AudioContext) {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-10, context.currentTime);
  compressor.knee.setValueAtTime(12, context.currentTime);
  compressor.ratio.setValueAtTime(10, context.currentTime);
  compressor.attack.setValueAtTime(0.003, context.currentTime);
  compressor.release.setValueAtTime(0.18, context.currentTime);

  const master = context.createGain();
  master.gain.setValueAtTime(1, context.currentTime);
  master.connect(compressor);
  compressor.connect(context.destination);

  return master;
}

export async function unlockMeetingSound() {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    await context.resume();
  }
}

function notesFor(type: MeetingSoundType): Note[] {
  switch (type) {
    case "accepted":
      return [
        { frequency: 523.25, duration: 0.13, gap: 0.025, wave: "triangle" },
        { frequency: 659.25, duration: 0.13, gap: 0.025, wave: "triangle" },
        { frequency: 783.99, duration: 0.14, gap: 0.025, wave: "triangle" },
        { frequency: 1046.5, duration: 0.23, gap: 0.04, wave: "triangle" }
      ];
    case "retrying":
      return [
        { frequency: 783.99, duration: 0.16, gap: 0.055, wave: "sawtooth" },
        { frequency: 523.25, duration: 0.2, gap: 0.06, wave: "sawtooth" },
        { frequency: 783.99, duration: 0.16, gap: 0.055, wave: "sawtooth" },
        { frequency: 523.25, duration: 0.28, gap: 0.04, wave: "sawtooth" }
      ];
    case "expired":
      return [
        { frequency: 659.25, duration: 0.15, gap: 0.04, wave: "triangle" },
        { frequency: 523.25, duration: 0.15, gap: 0.04, wave: "triangle" },
        { frequency: 392, duration: 0.17, gap: 0.04, wave: "triangle" },
        { frequency: 293.66, duration: 0.35, gap: 0.05, wave: "triangle" }
      ];
    case "incoming":
    default:
      return [
        { frequency: 659.25, duration: 0.14, gap: 0.035, wave: "triangle" },
        { frequency: 783.99, duration: 0.14, gap: 0.035, wave: "triangle" },
        { frequency: 1046.5, duration: 0.17, gap: 0.035, wave: "triangle" },
        { frequency: 783.99, duration: 0.14, gap: 0.035, wave: "triangle" },
        { frequency: 1174.66, duration: 0.27, gap: 0.11, wave: "triangle" },
        { frequency: 659.25, duration: 0.14, gap: 0.035, wave: "triangle" },
        { frequency: 1046.5, duration: 0.17, gap: 0.035, wave: "triangle" },
        { frequency: 1318.51, duration: 0.32, gap: 0.05, wave: "triangle" }
      ];
  }
}

function scheduleNote(
  context: AudioContext,
  destination: AudioNode,
  note: Note,
  start: number
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const peak = note.volume ?? 2.4;
  const wave = note.wave ?? "triangle";

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(note.frequency, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    start + Math.max(0.025, note.duration - 0.012)
  );

  oscillator.connect(gain);
  gain.connect(destination);

  oscillator.start(start);
  oscillator.stop(start + note.duration);
}

export async function playMeetingSound(type: MeetingSoundType) {
  const now = Date.now();
  const cooldown =
    type === "incoming"
      ? 2500
      : type === "accepted"
        ? 900
        : type === "retrying"
          ? 1200
          : 1600;

  const previous = lastPlayedAt.get(type) ?? 0;
  if (now - previous < cooldown) return;

  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") {
      await context.resume();
    }
    if (context.state !== "running") return;

    const destination = createOutput(context);
    const notes = notesFor(type);
    const start = context.currentTime + 0.02;

    let cursor = start;
    for (const note of notes) {
      scheduleNote(context, destination, note, cursor);

      // A quiet second harmonic adds clarity on laptop/phone speakers without
      // requiring a separate audio file and remains consistent across browsers.
      if (type === "incoming" || type === "accepted") {
        scheduleNote(
          context,
          destination,
          {
            ...note,
            frequency: note.frequency * 2,
            duration: note.duration * 0.82,
            volume: (note.volume ?? 2.4) * 0.28,
            wave: "sine"
          },
          cursor
        );
      }

      cursor += note.duration + (note.gap ?? 0.03);
    }

    lastPlayedAt.set(type, now);
  } catch {
    // Browser audio policies can reject sound; UI state continues normally.
  }
}
