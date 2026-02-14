/**
 * Text-to-speech for agent say tool.
 * Uses the Web Speech API with pitch/rate derived from avatar voice profile.
 */

import { registry } from "../themes";

/** Speak text with avatar-appropriate voice settings */
export function speakText(text: string, avatarId: string) {
  if (!window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  // Derive pitch from avatar's voice profile (higher basePitch → higher TTS pitch)
  const avatarDef = registry.getAgent(avatarId);
  const basePitch = avatarDef?.voice?.basePitch ?? 500;

  // Map basePitch (200-1000 Hz) → TTS pitch (1.5-2.0) — cartoonish/chipmunk range
  const ttsPitch = 1.5 + ((basePitch - 200) / 800) * 0.5;
  utterance.pitch = Math.max(1.4, Math.min(2.0, ttsPitch));
  utterance.rate = 1.4; // faster = more cartoonish
  utterance.volume = 0.7;

  window.speechSynthesis.speak(utterance);
}
