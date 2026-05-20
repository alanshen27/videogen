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

export async function elevenLabsTextToSpeechMp3(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<Buffer> {
  const sanitized = sanitizeElevenLabsTags(text);
  const trimmed = sanitized.trim();
  if (!trimmed) {
    throw new Error("ElevenLabs TTS: empty text");
  }

  const payload =
    trimmed.length > MAX_CHARS_PER_SCENE
      ? `${trimmed.slice(0, MAX_CHARS_PER_SCENE)}…`
      : trimmed;

  const url = `${ELEVEN_TTS_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: payload,
      /* v3 supports inline emotion tags + <break/> pauses. v2 silently
       * drops both — if you don't have v3 access yet, set
       * `ELEVENLABS_MODEL_ID=eleven_multilingual_v2` to fall back. */
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_v3",
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

/** ElevenLabs runs before Remotion spec: every scene length derives from measured MP3 (+ pad). */
export type VoiceFirstTimeline = {
  fps: number;
  totalFrames: number;
  scenes: Array<{ fromFrame: number; durationInFrames: number }>;
  /** sceneIndex (script order) → static path under public/ */
  voiceStaticPathBySceneIndex: Record<number, string>;
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

  for (let i = 0; i < ordered.length; i++) {
    const sc = ordered[i];
    const scriptDur = Math.max(
      24,
      Math.ceil(Math.max(0.25, sc.endSecond - sc.startSecond) * fps)
    );
    const narration = sc.narration?.trim();

    if (!narration) {
      durationFramesPerScene.push(scriptDur);
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
      const mp3 = await elevenLabsTextToSpeechMp3(
        narration,
        options.apiKey,
        options.voiceId
      );
      await fs.writeFile(absPath, mp3);

      const probedSec =
        probeMp3DurationFromBuffer(mp3) ??
        probeAudioDurationSeconds(absPath);
      const measured = probedSec !== null;
      const sec = probedSec ?? estimateSpeechSecondsFromText(narration);
      const audioFrames = Math.ceil(sec * fps) + tailPadFrames;
      /* Voice-first: scene length follows the MP3, not the script's guess. */
      const dur = measured ? audioFrames : Math.max(scriptDur, audioFrames);
      durationFramesPerScene.push(dur);
      voiceStaticPathBySceneIndex[i] = staticPath;

      const note = measured
        ? `measured ${probedSec!.toFixed(2)}s (mp3 bytes)`
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
  };
}

/** Force LLM timeline to match measured voice — keeps visuals, fixes durations + voice[]. */
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
    /* Rescale animated diagram beats so they walk through the nodes in sync
     * with the (longer, voice-measured) narration. Without this rescale, the
     * LLM's "imagined 6s scene" beats finish in the first 6s of a 15s scene
     * and the highlight then sits stuck on the last node forever. */
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
