"use client";

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

export async function unlockFeedbackSound() {
  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state === "suspended") await context.resume();
  } catch {
    // The browser may require a later first-party gesture.
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

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-8, context.currentTime);
    compressor.knee.setValueAtTime(8, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.15, context.currentTime);
    const master = context.createGain();
    master.gain.setValueAtTime(0.95, context.currentTime);
    master.connect(compressor);
    compressor.connect(context.destination);

    const start = context.currentTime + 0.01;
    const notes = [587.33, 880];
    for (let index = 0; index < notes.length; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const offset = index * 0.09;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(notes[index], start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.36, start + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.075);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.09);
    }
    lastPlayedAt = now;
  } catch {
    // Browser audio policies are best-effort; feedback remains fully usable.
  }
}

export async function playFeedbackSoundIfEnabled() {
  // Kept as a backwards-compatible name; feedback action sounds are always enabled.
  await playFeedbackSound();
}
