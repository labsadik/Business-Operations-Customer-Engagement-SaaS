"use client";

export type TaskSoundEvent = "created" | "updated" | "completed" | "cancelled";

let audioContext: AudioContext | null = null;
let audioTailTime = 0;

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

export async function unlockTaskSound() {
  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state === "suspended") await context.resume();
  } catch {
    // The next user gesture may be needed on restrictive browsers.
  }
}

type SoundNote = {
  frequency: number;
  duration: number;
  gap: number;
  wave: OscillatorType;
  harmonic: number;
  volume: number;
  overtoneVolume: number;
};

function notesFor(event: TaskSoundEvent): SoundNote[] {
  if (event === "updated") {
    // A short, buzzy down-up double tap, unlike either chime.
    return [
      { frequency: 440, duration: 0.075, gap: 0.035, wave: "square", harmonic: 1.5, volume: 0.48, overtoneVolume: 0.08 },
      { frequency: 349.23, duration: 0.085, gap: 0.035, wave: "square", harmonic: 1.5, volume: 0.48, overtoneVolume: 0.08 },
      { frequency: 440, duration: 0.095, gap: 0.045, wave: "square", harmonic: 1.5, volume: 0.48, overtoneVolume: 0.08 }
    ];
  }
  if (event === "cancelled") {
    // A low three-note alert distinguishes cancelled work from normal updates.
    return [
      { frequency: 293.66, duration: 0.16, gap: 0.07, wave: "sawtooth", harmonic: 2, volume: 0.78, overtoneVolume: 0.2 },
      { frequency: 220, duration: 0.22, gap: 0.06, wave: "sawtooth", harmonic: 1.5, volume: 0.8, overtoneVolume: 0.22 },
      { frequency: 164.81, duration: 0.3, gap: 0.04, wave: "sawtooth", harmonic: 2, volume: 0.82, overtoneVolume: 0.22 }
    ];
  }
  if (event === "completed") {
    // A longer bell-like falling cascade signals completion.
    return [
      { frequency: 1174.66, duration: 0.18, gap: 0.025, wave: "sine", harmonic: 2, volume: 0.7, overtoneVolume: 0.17 },
      { frequency: 987.77, duration: 0.2, gap: 0.025, wave: "sine", harmonic: 2, volume: 0.68, overtoneVolume: 0.16 },
      { frequency: 783.99, duration: 0.24, gap: 0.03, wave: "sine", harmonic: 2, volume: 0.66, overtoneVolume: 0.15 },
      { frequency: 523.25, duration: 0.38, gap: 0.04, wave: "sine", harmonic: 2, volume: 0.7, overtoneVolume: 0.18 }
    ];
  }
  // A bright ascending three-note triangle chime signals a new task.
  return [
    { frequency: 523.25, duration: 0.12, gap: 0.025, wave: "triangle", harmonic: 2, volume: 0.76, overtoneVolume: 0.18 },
    { frequency: 659.25, duration: 0.12, gap: 0.025, wave: "triangle", harmonic: 2, volume: 0.76, overtoneVolume: 0.18 },
    { frequency: 783.99, duration: 0.23, gap: 0.04, wave: "triangle", harmonic: 2, volume: 0.78, overtoneVolume: 0.2 }
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
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.025, duration - 0.008));
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export async function playTaskSound(event: TaskSoundEvent) {
  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-8, context.currentTime);
    compressor.knee.setValueAtTime(6, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.16, context.currentTime);

    const master = context.createGain();
    // Near-full digital output, with a compressor to reduce harsh clipping.
    master.gain.setValueAtTime(0.98, context.currentTime);
    master.connect(compressor);
    compressor.connect(context.destination);

    const notes = notesFor(event);
    const startAt = Math.max(context.currentTime + 0.02, audioTailTime + 0.04);
    let cursor = startAt;
    for (const note of notes) {
      scheduleTone(context, master, note.frequency, cursor, note.duration, note.volume, note.wave);
      if (note.overtoneVolume > 0) {
        scheduleTone(context, master, note.frequency * note.harmonic, cursor, note.duration * 0.72, note.overtoneVolume, "sine");
      }
      cursor += note.duration + note.gap;
    }
    // Queue quick preview clicks rather than dropping one due to a cooldown.
    audioTailTime = cursor > context.currentTime + 1.4 ? context.currentTime + 0.02 : cursor;
  } catch {
    // Browser audio policy must never interrupt task management.
  }
}

export async function playTaskSoundIfEnabled(event: TaskSoundEvent) {
  // Kept as a backwards-compatible name; action sounds are always enabled.
  await playTaskSound(event);
}
