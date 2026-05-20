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

/** Rough speech length when ffprobe is unavailable.
 *
 * ElevenLabs voices average ~145 wpm in our explainer style (it was 170
 * before, which consistently under-budgeted and caused the next scene to
 * cut in mid-word). The new constant assumes 145 wpm + 12% safety so the
 * fallback never undershoots. */
export function estimateSpeechSecondsFromText(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  /* 145 wpm → 2.42 words/sec ; ×1.12 safety = 2.16 words/sec. */
  return Math.max(1, words / 2.16);
}
