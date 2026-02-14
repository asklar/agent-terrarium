import { registry } from "../themes";

export type SoundMood = "hover" | "chat" | "capture" | "gear" | "attention";

interface VoiceProfile {
  basePitch: number;
  pitchVar: number;
  wave: OscillatorType;
  syllables: number;
  speed: number;
  volume: number;
}

const DEFAULT_VOICE: VoiceProfile = {
  basePitch: 500, pitchVar: 80, wave: "sine", syllables: 3, speed: 0.07, volume: 0.08,
};

// Per-mood modifications to the base voice profile
const MOOD_MODS: Record<SoundMood, { pitchMult?: number; speedMult?: number; syllables?: number; volume?: number; wave?: OscillatorType }> = {
  hover:     {},
  chat:      { pitchMult: 1.15, syllables: 3, speedMult: 0.85, volume: 0.06 },
  capture:   { pitchMult: 1.3,  syllables: 2, speedMult: 0.6,  volume: 0.07, wave: "triangle" },
  gear:      { pitchMult: 0.9,  syllables: 2, speedMult: 1.2,  volume: 0.06, wave: "square" },
  attention: { pitchMult: 1.0,  syllables: 4, speedMult: 0.9,  volume: 0.09 },
};

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/** Expose the shared AudioContext for other sound effects (ball, etc.) */
export function getSharedAudioCtx(): AudioContext {
  return getAudioCtx();
}

/**
 * Play an agent-specific sound with mood variation.
 * Each mood produces a distinct chirp style based on the agent's voice profile.
 */
export function playAgentSound(avatar: string, mood: SoundMood = "hover") {
  try {
    const ctx = getAudioCtx();
    const agentDef = registry.getAgent(avatar);
    const base = agentDef?.voice ?? DEFAULT_VOICE;
    const mod = MOOD_MODS[mood];

    const pitchMult = mod.pitchMult ?? 1.0;
    const speedMult = mod.speedMult ?? 1.0;
    const syllables = mod.syllables ?? base.syllables;
    const wave = mod.wave ?? base.wave;
    const volume = mod.volume ?? base.volume;
    const speed = base.speed * speedMult;
    const basePitch = base.basePitch * pitchMult;
    const pitchVar = base.pitchVar;

    let t = ctx.currentTime;
    for (let i = 0; i < syllables; i++) {
      const freq = basePitch + (Math.random() - 0.5) * pitchVar * 2;
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(
        freq + (Math.random() - 0.5) * 60 * pitchMult,
        t + speed * 0.8,
      );
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + speed * 0.15);
      gain.gain.setValueAtTime(volume * 0.8, t + speed * 0.6);
      gain.gain.linearRampToValueAtTime(0.001, t + speed * 0.95);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + speed);
      t += speed;
    }
  } catch {
    // Audio not available
  }
}
