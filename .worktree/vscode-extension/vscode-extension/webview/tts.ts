/** Speak text using the Web Speech API (available in VS Code webviews). */
export function speak(
  text: string,
  rate: number = 1,
  pitch: number = 1,
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }
  const synth = window.speechSynthesis;
  // Cancel any in-progress speech before starting new
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = pitch;
  synth.speak(utterance);
}

/** Stop any in-progress speech. */
export function stopSpeaking(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }
  window.speechSynthesis.cancel();
}

/** Check whether TTS is available in this environment. */
export function isTtsAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined"
  );
}
