import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/** ElevenLabs `mp3_44100_128` output — constant 128 kbps. */
const ELEVENLABS_MP3_BITRATE = 128_000;

function id3v2TagByteLength(header: Buffer): number {
  if (header.length < 10) return 0;
  if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return 0;
  const size =
    ((header[6]! & 0x7f) << 21) |
    ((header[7]! & 0x7f) << 14) |
    ((header[8]! & 0x7f) << 7) |
    (header[9]! & 0x7f);
  return 10 + size;
}

/**
 * Duration from MP3 byte length (no ffprobe). Accurate for ElevenLabs CBR
 * `mp3_44100_128` exports; skips ID3v2 when present.
 */
export function probeMp3DurationFromBuffer(buf: Buffer): number | null {
  if (buf.length < 128) return null;
  const id3 = id3v2TagByteLength(buf);
  const audioBytes = buf.length - id3;
  if (audioBytes < 64) return null;
  const sec = (audioBytes * 8) / ELEVENLABS_MP3_BITRATE;
  return Number.isFinite(sec) && sec > 0.05 ? sec : null;
}

export function probeMp3DurationSeconds(absPath: string): number | null {
  try {
    return probeMp3DurationFromBuffer(readFileSync(absPath));
  } catch {
    return null;
  }
}

/** Seconds from ffprobe when installed; otherwise null. */
function probeFfprobeDurationSeconds(absPath: string): number | null {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      absPath,
    ],
    { encoding: "utf8" }
  );
  if (result.error || result.status !== 0) return null;
  const n = Number.parseFloat(String(result.stdout).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Best available duration for a narration MP3:
 * 1. ffprobe (if installed)
 * 2. CBR length from file bytes (ElevenLabs format — no extra deps)
 */
export function probeAudioDurationSeconds(absPath: string): number | null {
  return (
    probeFfprobeDurationSeconds(absPath) ?? probeMp3DurationSeconds(absPath)
  );
}

/** Sum explicit `<break time="…s"/>` pauses the TTS will insert. */
export function breakSecondsFromNarration(text: string): number {
  let total = 0;
  for (const m of text.matchAll(
    /<\s*break\b[^>]*?time\s*=\s*"?([\d.]+)\s*s"?/gi
  )) {
    const t = Number.parseFloat(m[1] ?? "");
    if (Number.isFinite(t) && t > 0) total += t;
  }
  return total;
}

/**
 * Last-resort speech length when the MP3 cannot be read. Tuned to ElevenLabs
 * v3 (~155 wpm); no extra safety multiplier (that was over-padding scenes).
 */
export function estimateSpeechSecondsFromText(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const breaks = breakSecondsFromNarration(text);
  /* 155 wpm ≈ 2.58 words/sec */
  const speech = words > 0 ? words / 2.58 : 0.5;
  return Math.max(0.5, speech + breaks);
}
