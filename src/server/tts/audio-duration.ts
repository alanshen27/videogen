import { spawnSync } from "node:child_process";

/** Seconds from ffprobe; null if ffprobe missing or fails */
export function probeAudioDurationSeconds(absPath: string): number | null {
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

/** Rough speech length when ffprobe is unavailable (~170 wpm). */
export function estimateSpeechSecondsFromText(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, words / 2.85);
}
