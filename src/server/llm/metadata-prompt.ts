import type { Script } from "./schemas";

type MetadataJobContext = {
  topic: string;
  durationSeconds: number;
  orientation: "LANDSCAPE" | "PORTRAIT";
};

export function buildMetadataPrompt(
  basePrompt: string,
  script: Script,
  job: MetadataJobContext
): string {
  const vertical =
    job.orientation === "PORTRAIT" || job.durationSeconds <= 60;

  return `${basePrompt}

SCRIPT:
${JSON.stringify(script, null, 2)}

UPLOAD CONTEXT:
- Topic: ${job.topic}
- Runtime: ~${job.durationSeconds}s
- Orientation: ${job.orientation}${vertical ? " (vertical — treat as YouTube Shorts-first)" : ""}

Generate YouTube metadata JSON with BOTH a long-form pack and a Shorts pack.

LONG-FORM (standard video):
- title: specific, searchable, ≤70 chars. Lead with the payoff, not "In this video".
- description: 2–4 short paragraphs — hook, what they'll learn, light CTA. Plain prose; at most 3 trailing hashtags on the last line only.
- tags: 8–15 strings for the YouTube tags field (no # prefix), mix broad + niche.

SHORTS PACK (required — paste into Shorts upload):
- shortsTitle: hook-first, ≤60 chars. One emoji max. No "In this video" / "Hey guys".
- shortsDescription: exactly this shape:
  1) One punchy sentence (hook or payoff).
  2) Blank line.
  3) One line of hashtags only — each tag starts with #, space-separated (e.g. "#python #systemdesign #shorts"). Use 6–12 tags: topic + audience + always include #shorts.
- hashtags: the same tags as line 3 but WITHOUT # (for copy/tag fields).

THUMBNAIL + META:
- thumbnailPrompt: bold type + symbolic icon/diagram — not generic stock photography unless the topic demands it.
- category: YouTube category name (e.g. "Science & Technology").
- language: BCP-47 code (e.g. "en").

${vertical ? "Shorts pack is the primary upload voice — long-form title/description can be tighter variants of the same hook." : "Shorts pack should be a snappier, hashtag-forward variant for cross-posting to Shorts."}`;
}
