/**
 * Text-to-speech for agent say tool.
 * Uses the Web Speech API with pitch/rate derived from avatar voice profile.
 * Note: pitch may not work on all voices in WebView2/Chromium.
 * We try to select a voice that supports pitch variation.
 */

import { registry } from "../themes";

let voicesLoaded = false;
let cachedVoices: SpeechSynthesisVoice[] = [];

function getVoices(): SpeechSynthesisVoice[] {
  if (!voicesLoaded) {
    cachedVoices = window.speechSynthesis?.getVoices() ?? [];
    if (cachedVoices.length > 0) voicesLoaded = true;
  }
  return cachedVoices;
}

// Listen for voices to load asynchronously
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
    voicesLoaded = true;
  };
}

/** Speak text with avatar-appropriate voice settings */
export function speakText(text: string, avatarId: string) {
  if (!window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";

  // Try to pick a non-natural/non-online voice (basic SAPI voices support pitch better)
  const voices = getVoices();
  const basicVoice = voices.find(
    (v) => v.lang.startsWith("en") && !v.name.includes("Natural") && !v.name.includes("Online") && v.localService
  ) ?? voices.find((v) => v.lang.startsWith("en") && v.localService);
  if (basicVoice) utterance.voice = basicVoice;

  // Derive pitch from avatar's voice profile (higher basePitch → higher TTS pitch)
  const avatarDef = registry.getAgent(avatarId);
  const basePitch = avatarDef?.voice?.basePitch ?? 500;

  // Map basePitch (200-1000 Hz) → TTS pitch (1.5-2.0) — cartoonish/chipmunk range
  const ttsPitch = 1.5 + ((basePitch - 200) / 800) * 0.5;
  utterance.pitch = Math.max(1.4, Math.min(2.0, ttsPitch));
  utterance.rate = 1.4;
  utterance.volume = 0.7;

  window.speechSynthesis.speak(utterance);
}
