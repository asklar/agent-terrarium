/**
 * Text-to-speech for agent say tool.
 * Uses Windows SAPI via Rust backend for proper pitch control.
 * WebView2/Chromium ignores SpeechSynthesisUtterance.pitch, so we use
 * SAPI XML tags (<pitch absmiddle="N">) which actually work.
 */

import { invoke } from "@tauri-apps/api/core";
import { registry } from "../themes";

/** Speak text with avatar-appropriate voice settings via SAPI */
export function speakText(text: string, avatarId: string) {
  // Derive pitch from avatar's voice profile (higher basePitch → higher SAPI pitch)
  const avatarDef = registry.getAgent(avatarId);
  const basePitch = avatarDef?.voice?.basePitch ?? 500;

  // Map basePitch (200-1000 Hz) → SAPI pitch (+3 to +10)
  const sapiPitch = Math.round(3 + ((basePitch - 200) / 800) * 7);
  // Map basePitch → SAPI rate (+2 to +5) — higher pitch = faster
  const sapiRate = Math.round(2 + ((basePitch - 200) / 800) * 3);

  invoke("speak_sapi", {
    text,
    pitch: Math.max(-10, Math.min(10, sapiPitch)),
    rate: Math.max(-10, Math.min(10, sapiRate)),
    volume: 70,
  }).catch((e) => console.warn("SAPI speak failed:", e));
}
