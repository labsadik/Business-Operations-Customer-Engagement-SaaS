"use client";

export type TaskSoundEvent = "created" | "updated" | "completed";

const STORAGE_KEY = "conventus:task-sound:v1";
let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const Context = window.AudioContext || (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!Context) return null;
  audioContext = new Context();
  return audioContext;
}

export function isTaskSoundEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const savedPreference = window.localStorage.getItem(STORAGE_KEY);
    return savedPreference === null ? true : savedPreference === "on";
  } catch {
    return false;
  }
}

export function setTaskSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Preferences are optional; storage must never block task workflows.
  }
}

export async function unlockTaskSound() {
  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state === "suspended") await context.resume();
  } catch {
    // The next user gesture may be needed on restrictive browsers.
  }
}

type SoundNote = { frequency: number; duration: number; gap: number };

function notesFor(event: TaskSoundEvent): SoundNote[] {
  if (event === "completed") {
    return [
      { frequency: 659.25, duration: 0.16, gap: 0.035 },
      { frequency: 830.61, duration: 0.16, gap: 0.035 },
      { frequency: 987.77, duration: 0.21, gap: 0.04 },
      { frequency: 1318.51, duration: 0.34, gap: 0.04 }
    ];
  }
  if (event === "updated") {
    return [
      { frequency: 587.33, duration: 0.14, gap: 0.04 },
      { frequency: 783.99, duration: 0.21, gap: 0.04 }
    ];
  }
  return [
    { frequency: 523.25, duration: 0.17, gap: 0.035 },
    { frequency: 659.25, duration: 0.17, gap: 0.035 },
    { frequency: 783.99, duration: 0.25, gap: 0.04 }
  ];
}

function scheduleTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  wave: OscillatorType
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.03, duration - 0.012));
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export async function playTaskSound(event: TaskSoundEvent) {
  const now = Date.now();
  if (now - lastPlayedAt < 450) return;
  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-4, context.currentTime);
    compressor.knee.setValueAtTime(8, context.currentTime);
    compressor.ratio.setValueAtTime(4, context.currentTime);
    compressor.attack.setValueAtTime(0.004, context.currentTime);
    compressor.release.setValueAtTime(0.2, context.currentTime);

    const master = context.createGain();
    master.gain.setValueAtTime(1, context.currentTime);
    master.connect(compressor);
    compressor.connect(context.destination);

    let cursor = context.currentTime + 0.02;
    for (const note of notesFor(event)) {
      // High signal level and a bright octave harmonics create an audible, clean cue.
      scheduleTone(context, master, note.frequency, cursor, note.duration, 0.72, "triangle");
      scheduleTone(context, master, note.frequency * 2, cursor, note.duration * 0.82, 0.2, "sine");
      cursor += note.duration + note.gap;
    }
    lastPlayedAt = now;
  } catch {
    // Browser audio policy must never interrupt task management.
  }
}

export async function playTaskSoundIfEnabled(event: TaskSoundEvent) {
  if (!isTaskSoundEnabled()) return;
  await playTaskSound(event);
}
