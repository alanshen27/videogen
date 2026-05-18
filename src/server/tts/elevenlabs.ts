import * as fs from "fs/promises";
import * as path from "path";
import type { RemotionSpec, Script } from "../llm/schemas";
import {
  estimateSpeechSecondsFromText,
  probeAudioDurationSeconds,
} from "./audio-duration";

const ELEVEN_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MAX_CHARS_PER_SCENE = 2500;

export async function elevenLabsTextToSpeechMp3(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<Buffer> {
  const trimmed = text.trim();
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
      model_id: "eleven_multilingual_v2",
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
  const tailPadFrames = Math.max(12, Math.round(fps * 0.45));

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

      const probedSec = probeAudioDurationSeconds(absPath);
      const sec =
        probedSec ?? estimateSpeechSecondsFromText(narration);
      const audioFrames = Math.ceil(sec * fps) + tailPadFrames;
      const dur = Math.max(scriptDur, audioFrames);
      durationFramesPerScene.push(dur);
      voiceStaticPathBySceneIndex[i] = staticPath;

      const note =
        probedSec !== null
          ? `measured ${probedSec.toFixed(2)}s`
          : `estimated ${sec.toFixed(2)}s (install ffmpeg/ffprobe for exact length)`;
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
    const duration =
      i < nTime ? timeline.scenes[i]!.durationInFrames : s.durationInFrames;
    const row = { ...s, fromFrame: from, durationInFrames: duration };
    from += duration;
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
