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
  const avatarDef = registry.getAgent(avatarId);
  const basePitch = avatarDef?.voice?.basePitch ?? 500;

  // Map basePitch → SAPI rate (+2 to +8) — higher = faster/chipmunk-like
  const sapiRate = Math.round(2 + ((basePitch - 200) / 800) * 6);
  // Derive a voice index from avatar ID hash for consistent voice assignment
  let hash = 0;
  for (let i = 0; i < avatarId.length; i++) {
    hash = ((hash << 5) - hash + avatarId.charCodeAt(i)) | 0;
  }
  const voiceIndex = Math.abs(hash);

  console.log(
    `SAPI TTS: avatar=${avatarId}, basePitch=${basePitch}, rate=${sapiRate}, voiceIdx=${voiceIndex}`
  );

  invoke("speak_sapi", {
    text,
    rate: Math.max(-10, Math.min(10, sapiRate)),
    volume: 70,
    voiceIndex,
  }).catch((e) => console.warn("SAPI speak failed:", e));
}
