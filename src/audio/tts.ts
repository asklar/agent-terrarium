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

  // Map basePitch (200-1000 Hz) → TTS pitch (0.8-2.0)
  const ttsPitch = 0.8 + ((basePitch - 200) / 800) * 1.2;
  utterance.pitch = Math.max(0.5, Math.min(2.0, ttsPitch));
  utterance.rate = 1.1;
  utterance.volume = 0.7;

  window.speechSynthesis.speak(utterance);
}
