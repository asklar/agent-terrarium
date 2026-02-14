/**
 * Text-to-speech for agent say tool.
 * Renders speech via Windows SAPI to a WAV buffer, then plays it
 * through the Web Audio API with playbackRate for real pitch shifting.
 */

import { invoke } from "@tauri-apps/api/core";
import { registry } from "../themes";

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Speak text with avatar-appropriate pitch shifting */
export async function speakText(text: string, avatarId: string) {
  const avatarDef = registry.getAgent(avatarId);
  const basePitch = avatarDef?.voice?.basePitch ?? 500;

  // Map basePitch (200-1000 Hz) → playbackRate (1.2 to 2.2)
  // Higher basePitch = faster playback = higher pitch (chipmunk effect)
  const playbackRate = 1.2 + ((basePitch - 200) / 800) * 1.0;

  // Derive voice index from avatar ID hash
  let hash = 0;
  for (let i = 0; i < avatarId.length; i++) {
    hash = ((hash << 5) - hash + avatarId.charCodeAt(i)) | 0;
  }
  const voiceIndex = Math.abs(hash);

  console.log(
    `SAPI TTS: avatar=${avatarId}, basePitch=${basePitch}, playbackRate=${playbackRate.toFixed(2)}, voiceIdx=${voiceIndex}`
  );

  try {
    // Get WAV bytes from Rust SAPI
    const wavBytes = await invoke<number[]>("speak_sapi", {
      text,
      voiceIndex,
    });

    // Convert to ArrayBuffer
    const buffer = new Uint8Array(wavBytes).buffer;

    // Decode and play with pitch shift
    const ctx = getAudioCtx();
    const audioBuffer = await ctx.decodeAudioData(buffer);

    // Stop any currently playing speech
    if (currentSource) {
      try { currentSource.stop(); } catch { /* ignore */ }
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;

    // Apply gain for volume control
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain);
    gain.connect(ctx.destination);

    source.start();
    currentSource = source;
  } catch (e) {
    console.warn("SAPI speak failed:", e);
  }
}
