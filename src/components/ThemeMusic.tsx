import { useEffect, useRef, useState, useCallback } from "react";
import { registry } from "../themes";
import type { ThemeMusic as ThemeMusicConfig } from "../themes";

interface ThemeMusicProps {
  theme: string;
}

/**
 * Procedural lofi 8-bit music player driven by theme config.
 * Uses Web Audio API to generate chiptune-style ambient music.
 */
export function ThemeMusic({ theme }: ThemeMusicProps) {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const schedulerRef = useRef<number>(0);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const stopMusic = useCallback(() => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = 0;
    }
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    gainRef.current = null;
  }, []);

  useEffect(() => {
    const themeDef = registry.getTheme(theme);
    const music = themeDef?.music;
    if (!music) {
      stopMusic();
      return;
    }

    // Create audio context on first interaction (autoplay policy)
    const startOnInteraction = () => {
      if (ctxRef.current) return;
      startMusic(music);
      document.removeEventListener("click", startOnInteraction);
      document.removeEventListener("keydown", startOnInteraction);
    };

    document.addEventListener("click", startOnInteraction);
    document.addEventListener("keydown", startOnInteraction);

    return () => {
      document.removeEventListener("click", startOnInteraction);
      document.removeEventListener("keydown", startOnInteraction);
      stopMusic();
    };
  }, [theme, stopMusic]);

  // Update volume when mute changes
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.setValueAtTime(
        muted ? 0 : registry.getTheme(theme)?.music?.volume ?? 0.12,
        ctxRef.current?.currentTime ?? 0,
      );
    }
  }, [muted, theme]);

  function startMusic(music: ThemeMusicConfig) {
    stopMusic();

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = mutedRef.current ? 0 : music.volume;
    masterGain.connect(ctx.destination);
    gainRef.current = masterGain;

    const beatDuration = 60 / music.bpm;
    let nextBeatTime = ctx.currentTime + 0.1;
    let beatIndex = 0;

    // Simple PRNG for deterministic-ish melody
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

    function scheduleNote(
      freq: number,
      startTime: number,
      duration: number,
      wave: OscillatorType,
      volume: number,
    ) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      env.gain.setValueAtTime(volume, startTime + duration * 0.6);
      env.gain.linearRampToValueAtTime(0, startTime + duration * 0.95);
      osc.connect(env);
      env.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    const scheduler = () => {
      if (!ctxRef.current || ctxRef.current.state === "closed") return;

      while (nextBeatTime < ctx.currentTime + 0.2) {
        const chordIdx = Math.floor(beatIndex / 4) % music.chords.length;
        const chord = music.chords[chordIdx];
        const beatInBar = beatIndex % 4;

        // Bass — root of chord, octave down
        if (beatInBar === 0 || beatInBar === 2) {
          const bassNote = music.key + chord[0] - 12;
          scheduleNote(
            midiToFreq(bassNote),
            nextBeatTime,
            beatDuration * 1.8,
            music.bassWave,
            0.25,
          );
        }

        // Chord pad — soft, every beat
        for (const offset of chord) {
          scheduleNote(
            midiToFreq(music.key + offset),
            nextBeatTime,
            beatDuration * 0.9,
            music.wave,
            0.06,
          );
        }

        // Melody — pentatonic noodling on some beats
        if (rand() > 0.35) {
          const scaleIdx = Math.floor(rand() * music.scale.length);
          const octave = rand() > 0.5 ? 12 : 0;
          const melodyNote = music.key + music.scale[scaleIdx] + octave;
          const melodyDuration = rand() > 0.5
            ? beatDuration * 0.5
            : beatDuration;
          scheduleNote(
            midiToFreq(melodyNote),
            nextBeatTime + (rand() > 0.7 ? beatDuration * 0.5 : 0),
            melodyDuration,
            music.wave,
            0.12 + rand() * 0.06,
          );
        }

        // Hi-hat-ish noise on offbeats
        if (beatInBar === 1 || beatInBar === 3) {
          const bufSize = ctx.sampleRate * 0.03;
          const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
          }
          const noise = ctx.createBufferSource();
          noise.buffer = buffer;
          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.04, nextBeatTime);
          noiseGain.gain.linearRampToValueAtTime(0, nextBeatTime + 0.05);
          const filter = ctx.createBiquadFilter();
          filter.type = "highpass";
          filter.frequency.value = 8000;
          noise.connect(filter);
          filter.connect(noiseGain);
          noiseGain.connect(masterGain);
          noise.start(nextBeatTime);
          noise.stop(nextBeatTime + 0.05);
        }

        nextBeatTime += beatDuration;
        beatIndex++;
      }
    };

    schedulerRef.current = window.setInterval(scheduler, 100);
  }

  return (
    <button
      className="music-toggle"
      onClick={() => setMuted((m) => !m)}
      title={muted ? "Unmute music" : "Mute music"}
    >
      {muted ? "🔇" : "🎵"}
    </button>
  );
}
