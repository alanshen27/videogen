import * as fs from "fs/promises";
import * as path from "path";
import type { RemotionSpec, Script } from "../llm/schemas";
import {
  estimateSpeechSecondsFromText,
  probeAudioDurationSeconds,
  probeMp3DurationFromBuffer,
} from "./audio-duration";

const ELEVEN_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MAX_CHARS_PER_SCENE = 2500;

/**
 * Audio tags the renderer accepts in narration. The LLM is told to emit these
 * sparingly; anything else inside square brackets is treated as a hallucinated
 * tag and stripped before we ship the text to ElevenLabs.
 *
 * Source: https://elevenlabs.io/docs/best-practices/prompting/v3-prompting
 */
const ALLOWED_EMOTION_TAGS = new Set<string>([
  "laughs",
  "laughs harder",
  "chuckles",
  "sighs",
  "exhales",
  "whispers",
  "shouts",
  "excited",
  "curious",
  "thoughtful",
  "sarcastic",
  "amazed",
  "disappointed",
  "deadpan",
  "warm",
  "serious",
  "matter-of-fact",
]);

/**
 * Pass through `[laughs]` / `[whispers]` etc. when whitelisted, and
 * `<break time="0.4s"/>` style pauses. Strip everything else that *looks*
 * like a tag so we never ship `[explode]` to the TTS API.
 *
 * Why: the v3 model treats unknown bracketed tokens unpredictably — some
 * are read aloud, some break the cadence. A small whitelist keeps the
 * surface area predictable.
 */
export function sanitizeElevenLabsTags(text: string): string {
  /* Drop bracketed tags that aren't in the allow-list. */
  const tagStripped = text.replace(/\[([^\[\]]{1,40})\]/g, (_full, raw) => {
    const key = String(raw).trim().toLowerCase();
    return ALLOWED_EMOTION_TAGS.has(key) ? `[${key}]` : "";
  });

  /* Normalise <break time="..."> — keep only the time attribute, clamp to
   * [0.1s, 3.0s]. Anything weirder gets removed. */
  const breakNormalised = tagStripped.replace(
    /<\s*break\b[^>]*?time\s*=\s*"?([\d.]+)\s*s"?[^>]*?\/?>/gi,
    (_full, sec) => {
      const t = Math.max(0.1, Math.min(3.0, parseFloat(sec)));
      return `<break time="${t.toFixed(1)}s"/>`;
    }
  );

  /* Collapse multiple spaces left behind by stripped tags. */
  return breakNormalised.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

/**
 * Per-character timing returned by ElevenLabs `with-timestamps` endpoint.
 *
 * `characters` is the exact sequence the TTS spoke (after our sanitization
 * pass — emotion tags + `<break/>` markers are processed by ElevenLabs and
 * do not appear in this array as visible characters). `*_seconds[i]`
 * corresponds to `characters[i]`.
 *
 * We use this to anchor diagram highlights / list reveals to the exact
 * frame a phrase is spoken instead of guessing from LLM-imagined timings.
 */
export type CharacterAlignment = {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
};

/**
 * Find the start time (seconds) of `phrase` inside narration alignment.
 *
 * Match is case-insensitive and tolerates whitespace differences. Returns
 * `null` when the phrase is not present in what the TTS actually spoke.
 *
 * `searchFromChar` lets callers advance through narration so successive
 * beats anchor to successive mentions (e.g. "load" appears 3 times — beat
 * N gets the Nth occurrence).
 */
export function findPhraseStartSeconds(
  alignment: CharacterAlignment,
  phrase: string,
  searchFromChar: number = 0
): { startSeconds: number; endCharIndex: number } | null {
  const haystack = alignment.characters.join("").toLowerCase();
  /* Strip any emotion tags / break markers the LLM may have copied along
   * with the phrase \u2014 the TTS doesn't speak those, so they're not in the
   * alignment haystack. */
  const sanitizedPhrase = phrase
    .replace(/<\s*break\b[^>]*\/?>/gi, "")
    .replace(/\[[^\]]{1,40}\]/g, "");
  const needle = sanitizedPhrase
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!needle) return null;

  /* Try literal substring first. */
  let idx = haystack.indexOf(needle, searchFromChar);

  /* Fall back: collapse whitespace in haystack too, then map back. */
  if (idx < 0) {
    /* Build collapsed haystack with index mapping. */
    const collapsedIdx: number[] = [];
    let collapsed = "";
    let lastWasSpace = true;
    for (let i = 0; i < haystack.length; i++) {
      const ch = haystack.charAt(i);
      const isSpace = /\s/.test(ch);
      if (isSpace) {
        if (lastWasSpace) continue;
        collapsed += " ";
        collapsedIdx.push(i);
        lastWasSpace = true;
      } else {
        collapsed += ch;
        collapsedIdx.push(i);
        lastWasSpace = false;
      }
    }
    /* Map searchFromChar into collapsed space. */
    let collapsedFrom = 0;
    for (let i = 0; i < collapsedIdx.length; i++) {
      if (collapsedIdx[i]! >= searchFromChar) {
        collapsedFrom = i;
        break;
      }
    }
    const cidx = collapsed.indexOf(needle, collapsedFrom);
    if (cidx >= 0) {
      idx = collapsedIdx[cidx] ?? -1;
    }
  }

  if (idx < 0) return null;
  const startTime = alignment.characterStartTimesSeconds[idx];
  if (typeof startTime !== "number" || !Number.isFinite(startTime)) return null;
  return {
    startSeconds: startTime,
    endCharIndex: idx + needle.length,
  };
}

type TtsResult = {
  audio: Buffer;
  alignment: CharacterAlignment | null;
  /** Total seconds (from alignment last-end if available, else from MP3 bytes). */
  durationSeconds: number | null;
};

/**
 * Synthesize narration MP3 and (when available) per-character timing.
 *
 * We hit `/v1/text-to-speech/{voiceId}/with-timestamps` to get a base64 MP3
 * plus a `normalized_alignment` block keyed to the spoken characters. That
 * alignment is what lets the renderer fire a diagram highlight on the
 * exact frame the narrator says "load balancer".
 *
 * Falls back to the audio-only endpoint when the model/voice combo does
 * not support timestamps (returns `alignment: null`). The pipeline still
 * works without alignment — it just degrades to linear-time beat math.
 */
export async function elevenLabsTextToSpeech(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<TtsResult> {
  const sanitized = sanitizeElevenLabsTags(text);
  const trimmed = sanitized.trim();
  if (!trimmed) {
    throw new Error("ElevenLabs TTS: empty text");
  }

  const payload =
    trimmed.length > MAX_CHARS_PER_SCENE
      ? `${trimmed.slice(0, MAX_CHARS_PER_SCENE)}…`
      : trimmed;

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
  /* Voice settings tuned for narration consistency across scenes:
   *   - stability=0.5 leaves the model enough headroom to deliver
   *     emotion tags but stops the timbre from drifting scene-to-scene.
   *   - similarity_boost=0.75 keeps the voice recognisable as the chosen
   *     speaker (lower values start sounding like a different person).
   *   - style=0.35 picks up some of the inflection from emotion tags
   *     without going theatrical.
   *   - use_speaker_boost=true sharpens consonants for narration over a
   *     music bed.
   * These are overridable via env vars for quick A/B testing without a
   * redeploy. */
  const voiceSettings = {
    stability: parseFloat(process.env.ELEVENLABS_STABILITY ?? "0.5"),
    similarity_boost: parseFloat(
      process.env.ELEVENLABS_SIMILARITY_BOOST ?? "0.75"
    ),
    style: parseFloat(process.env.ELEVENLABS_STYLE ?? "0.35"),
    use_speaker_boost: process.env.ELEVENLABS_SPEAKER_BOOST !== "false",
  };
  const body = JSON.stringify({
    text: payload,
    /* v3 supports inline emotion tags + <break/> pauses. v2 silently
     * drops both — if you don't have v3 access yet, set
     * `ELEVENLABS_MODEL_ID=eleven_multilingual_v2` to fall back. */
    model_id: modelId,
    voice_settings: voiceSettings,
  });

  /* Try the with-timestamps endpoint first — gives us per-character timing
   * which we use to anchor diagram beats to spoken phrases. */
  const tsUrl = `${ELEVEN_TTS_URL}/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const tsRes = await fetch(tsUrl, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  });

  if (tsRes.ok) {
    const json = (await tsRes.json()) as {
      audio_base64?: string;
      alignment?: {
        characters?: string[];
        character_start_times_seconds?: number[];
        character_end_times_seconds?: number[];
      };
      normalized_alignment?: {
        characters?: string[];
        character_start_times_seconds?: number[];
        character_end_times_seconds?: number[];
      };
    };
    const audioB64 = json.audio_base64;
    if (audioB64) {
      const audio = Buffer.from(audioB64, "base64");
      const align = json.normalized_alignment ?? json.alignment;
      const alignment: CharacterAlignment | null =
        align &&
        Array.isArray(align.characters) &&
        Array.isArray(align.character_start_times_seconds) &&
        Array.isArray(align.character_end_times_seconds)
          ? {
              characters: align.characters,
              characterStartTimesSeconds: align.character_start_times_seconds,
              characterEndTimesSeconds: align.character_end_times_seconds,
            }
          : null;
      const lastEnd = alignment
        ? alignment.characterEndTimesSeconds[
            alignment.characterEndTimesSeconds.length - 1
          ]
        : null;
      const durationSeconds =
        typeof lastEnd === "number" && Number.isFinite(lastEnd) && lastEnd > 0
          ? lastEnd
          : probeMp3DurationFromBuffer(audio);
      return { audio, alignment, durationSeconds };
    }
  }

  /* Fallback: plain MP3 endpoint. v3 alpha sometimes refuses
   * with-timestamps — degrade gracefully so we still get audio. */
  const url = `${ELEVEN_TTS_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errBody.slice(0, 500)}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  return {
    audio,
    alignment: null,
    durationSeconds: probeMp3DurationFromBuffer(audio),
  };
}

/**
 * Back-compat shim — callers that only need the MP3 buffer (no timing).
 *
 * Prefer `elevenLabsTextToSpeech()` if you'll use the alignment data.
 */
export async function elevenLabsTextToSpeechMp3(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<Buffer> {
  return (await elevenLabsTextToSpeech(text, apiKey, voiceId)).audio;
}

/** ElevenLabs runs before Remotion spec: every scene length derives from measured MP3 (+ pad). */
export type VoiceFirstTimeline = {
  fps: number;
  totalFrames: number;
  scenes: Array<{ fromFrame: number; durationInFrames: number }>;
  /** sceneIndex (script order) → static path under public/ */
  voiceStaticPathBySceneIndex: Record<number, string>;
  /** sceneIndex → per-character timing (null when ElevenLabs did not return one) */
  alignmentsBySceneIndex: Record<number, CharacterAlignment | null>;
  /** sceneIndex → narration string (post-sanitize, post-tag-strip) — what TTS actually spoke. */
  narrationBySceneIndex: Record<number, string>;
};

export function formatVoiceTimelineForRemotionPrompt(t: VoiceFirstTimeline): string {
  const lines = t.scenes
    .map(
      (row, i) =>
        `  - Scene ${i + 1} (script order): fromFrame=${row.fromFrame}, durationInFrames=${row.durationInFrames}`
    )
    .join("\n");
  return `
VOICE-OVER ALREADY SYNTHESIZED (ElevenLabs MP3s exist under public/audio-jobs/). Total video length MUST match audio — ignore any earlier duration budget.

LOCK THESE VALUES EXACTLY:
- composition.durationInFrames = ${t.totalFrames}
- composition.fps = ${t.fps}

Per scene timing (${t.scenes.length} scenes, same order as script.scenes by sceneNumber):
${lines}

Each scenes[i] MUST use the matching fromFrame and durationInFrames above. Do not shorten clips — final runtime may differ from the topic brief; that is fine.
`.trim();
}

/**
 * Synthesize narration MP3s immediately after script — before Remotion spec generation.
 */
export async function synthesizeElevenLabsVoiceFirst(options: {
  jobId: string;
  script: Script;
  fps: number;
  apiKey: string;
  voiceId: string;
  onLog: (level: string, message: string) => void | Promise<void>;
}): Promise<VoiceFirstTimeline> {
  const ordered = [...options.script.scenes].sort(
    (a, b) => a.sceneNumber - b.sceneNumber
  );
  const { fps, jobId } = options;
  /* Small tail pad so the next scene does not clip the last phoneme. */
  const tailPadFrames = Math.max(9, Math.round(fps * 0.3));

  const absDir = path.join(process.cwd(), "public", "audio-jobs", jobId);
  await fs.mkdir(absDir, { recursive: true });
  const publicRel = path.posix.join("audio-jobs", jobId);

  const durationFramesPerScene: number[] = [];
  const voiceStaticPathBySceneIndex: Record<number, string> = {};
  const alignmentsBySceneIndex: Record<number, CharacterAlignment | null> = {};
  const narrationBySceneIndex: Record<number, string> = {};

  for (let i = 0; i < ordered.length; i++) {
    const sc = ordered[i];
    const scriptDur = Math.max(
      24,
      Math.ceil(Math.max(0.25, sc.endSecond - sc.startSecond) * fps)
    );
    const narration = sc.narration?.trim();

    if (!narration) {
      durationFramesPerScene.push(scriptDur);
      alignmentsBySceneIndex[i] = null;
      narrationBySceneIndex[i] = "";
      void Promise.resolve(
        options.onLog(
          "info",
          `ElevenLabs FIRST: scene ${i + 1} skipped (empty narration) — ${scriptDur}f from script timing`
        )
      ).catch(() => {});
      continue;
    }

    const filename = `${i}.mp3`;
    const staticPath = path.posix.join(publicRel, filename);
    const absPath = path.join(absDir, filename);

    try {
      const result = await elevenLabsTextToSpeech(
        narration,
        options.apiKey,
        options.voiceId
      );
      await fs.writeFile(absPath, result.audio);

      /* Persist alignment next to MP3 for debugging + later passes. */
      if (result.alignment) {
        const alignPath = path.join(absDir, `${i}.alignment.json`);
        await fs.writeFile(
          alignPath,
          JSON.stringify(result.alignment, null, 0)
        );
      }
      alignmentsBySceneIndex[i] = result.alignment;
      narrationBySceneIndex[i] = result.alignment
        ? result.alignment.characters.join("")
        : sanitizeElevenLabsTags(narration);

      const probedSec =
        result.durationSeconds ??
        probeMp3DurationFromBuffer(result.audio) ??
        probeAudioDurationSeconds(absPath);
      const measured = probedSec !== null;
      const sec = probedSec ?? estimateSpeechSecondsFromText(narration);
      const audioFrames = Math.ceil(sec * fps) + tailPadFrames;
      /* Voice-first: scene length follows the MP3, not the script's guess. */
      const dur = measured ? audioFrames : Math.max(scriptDur, audioFrames);
      durationFramesPerScene.push(dur);
      voiceStaticPathBySceneIndex[i] = staticPath;

      const note = measured
        ? `measured ${probedSec!.toFixed(2)}s${result.alignment ? ", with character-level alignment" : ""}`
        : `estimated ${sec.toFixed(2)}s (could not read mp3 length)`;
      void Promise.resolve(
        options.onLog(
          "info",
          `ElevenLabs FIRST: scene ${i + 1} ${staticPath} — ${note} → ${dur}f`
        )
      ).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void Promise.resolve(
        options.onLog("warn", `ElevenLabs FIRST failed scene ${i + 1}: ${msg}`)
      ).catch(() => {});
      const est =
        Math.ceil(estimateSpeechSecondsFromText(narration) * fps) +
        tailPadFrames;
      durationFramesPerScene.push(Math.max(scriptDur, est));
      alignmentsBySceneIndex[i] = null;
      narrationBySceneIndex[i] = sanitizeElevenLabsTags(narration);
    }
  }

  let from = 0;
  const scenes = durationFramesPerScene.map((durationInFrames) => {
    const row = { fromFrame: from, durationInFrames };
    from += durationInFrames;
    return row;
  });

  return {
    fps,
    totalFrames: from,
    scenes,
    voiceStaticPathBySceneIndex,
    alignmentsBySceneIndex,
    narrationBySceneIndex,
  };
}

/**
 * Final pass over a Remotion spec that was built with voice-first scene
 * durations already applied. We attach `voice[]` MP3 segments and (only
 * if the spec builder was given the alignment data) skip the legacy
 * linear-rescale of beats — that's now handled inside the spec builder.
 *
 * When the spec was built WITHOUT knowing the measured durations (e.g.
 * an older code path), we fall back to linear scaling so beats don't
 * land outside the new scene length.
 */
export function applyVoiceFirstTimelineToSpec(
  spec: RemotionSpec,
  timeline: VoiceFirstTimeline
): RemotionSpec {
  const nTime = timeline.scenes.length;
  let from = 0;
  const scenes = spec.scenes.map((s, i) => {
    const newDuration =
      i < nTime ? timeline.scenes[i]!.durationInFrames : s.durationInFrames;
    const oldDuration = s.durationInFrames;
    /* If the builder already produced scenes at the measured duration we
     * leave beats alone. Otherwise rescale them so they don't outlive the
     * new clip. */
    if (oldDuration === newDuration) {
      const row = {
        ...s,
        fromFrame: from,
        durationInFrames: newDuration,
      };
      from += newDuration;
      return row;
    }

    const scale = oldDuration > 0 ? newDuration / oldDuration : 1;
    const elements = s.elements.map((el) => {
      if (el.type === "mermaid") {
        const beats = (
          el as typeof el & {
            diagramBeats?: {
              fromFrame: number;
              durationInFrames: number;
              targets: string[];
            }[];
          }
        ).diagramBeats;
        if (!beats || beats.length === 0) return el;
        const rescaled = beats.map((b) => ({
          fromFrame: Math.round(b.fromFrame * scale),
          durationInFrames: Math.max(12, Math.round(b.durationInFrames * scale)),
          targets: b.targets,
        }));
        return { ...el, diagramBeats: rescaled };
      }

      if (el.type === "text") {
        const listBeats = (
          el as typeof el & {
            listBeats?: { fromFrame: number; itemIndex: number }[];
          }
        ).listBeats;
        if (!listBeats || listBeats.length === 0) return el;
        return {
          ...el,
          listBeats: listBeats.map((b) => ({
            ...b,
            fromFrame: Math.min(
              newDuration - 6,
              Math.max(0, Math.round(b.fromFrame * scale))
            ),
          })),
        };
      }

      return el;
    });
    const row = {
      ...s,
      fromFrame: from,
      durationInFrames: newDuration,
      elements,
    };
    from += newDuration;
    return row;
  });

  const voice: NonNullable<RemotionSpec["voice"]> = Object.keys(
    timeline.voiceStaticPathBySceneIndex
  )
    .map(Number)
    .sort((a, b) => a - b)
    .filter((idx) => idx < scenes.length)
    .map((idx) => ({
      fromFrame: scenes[idx]!.fromFrame,
      durationInFrames: scenes[idx]!.durationInFrames,
      staticPath: timeline.voiceStaticPathBySceneIndex[idx]!,
    }));

  return {
    ...spec,
    composition: {
      ...spec.composition,
      fps: 30,
      durationInFrames: from || timeline.totalFrames,
    },
    scenes,
    voice: voice.length > 0 ? voice : undefined,
  };
}
