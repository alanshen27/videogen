import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RemotionSpec } from "../llm/schemas";

/**
 * If the spec has no `voice` array but ElevenLabs MP3s exist under
 * `public/audio-jobs/<jobId>/<index>.mp3`, rebuild tracks from scene timings so
 * Remotion muxes narration into the MP4.
 */
async function hydrateVoiceFromPublicAudio(
  projectRoot: string,
  jobId: string,
  spec: RemotionSpec,
  onLogLine: (line: string) => void | Promise<void>
): Promise<RemotionSpec> {
  if (spec.voice?.length) {
    return spec;
  }

  const absDir = path.join(projectRoot, "public", "audio-jobs", jobId);
  let names: string[];
  try {
    names = await fs.readdir(absDir);
  } catch {
    return spec;
  }

  const mp3s = sortMp3SceneFiles(names.filter((n) => n.toLowerCase().endsWith(".mp3")));
  if (mp3s.length === 0) {
    return spec;
  }

  const n = Math.min(mp3s.length, spec.scenes.length);
  const voice: NonNullable<RemotionSpec["voice"]> = [];
  for (let i = 0; i < n; i++) {
    const scene = spec.scenes[i];
    voice.push({
      fromFrame: scene.fromFrame,
      durationInFrames: scene.durationInFrames,
      staticPath: path.posix.join("audio-jobs", jobId, mp3s[i]!),
    });
  }

  void Promise.resolve(
    onLogLine(
      `[voice] Hydrated ${voice.length} segment(s) from public/audio-jobs/${jobId}/ (spec had no voice[]; pairing by scene index)`
    )
  ).catch(() => {});

  return { ...spec, voice };
}

function sortMp3SceneFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const na = Number.parseInt(path.basename(a, ".mp3"), 10);
    const nb = Number.parseInt(path.basename(b, ".mp3"), 10);
    const aNum = !Number.isNaN(na);
    const bNum = !Number.isNaN(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b);
  });
}

async function assertPublicVoiceFilesExist(
  projectRoot: string,
  spec: RemotionSpec
): Promise<void> {
  const voice = spec.voice;
  if (!voice?.length) {
    return;
  }

  const missing: string[] = [];
  for (const seg of voice) {
    const abs = path.join(projectRoot, "public", seg.staticPath);
    try {
      await fs.access(abs);
    } catch {
      missing.push(seg.staticPath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Voice audio file(s) not found under public/: ${missing.join(", ")}. ` +
        `Expected ElevenLabs MP3s at public/audio-jobs/<jobId>/ before Remotion runs.`
    );
  }
}

function lineSplitter(
  stream: NodeJS.ReadableStream | null,
  onLine: (line: string) => void
): void {
  if (!stream) return;
  let buf = "";
  stream.on("data", (chunk: Buffer | string) => {
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trimEnd();
      if (t.length > 0) onLine(t);
    }
  });
  stream.on("end", () => {
    const t = buf.trimEnd();
    if (t.length > 0) onLine(t);
  });
}

function remotionBinPath(projectRoot: string): string {
  const binDir = path.join(projectRoot, "node_modules", ".bin");
  return process.platform === "win32"
    ? path.join(binDir, "remotion.cmd")
    : path.join(binDir, "remotion");
}

/**
 * Bundles and renders `MyComp` using the given spec (same entry as local dev).
 * Writes MP4 under `data/videos/<jobId>/video.mp4`.
 */
export async function renderRemotionJobVideo(options: {
  jobId: string;
  spec: RemotionSpec;
  onLogLine: (line: string) => void | Promise<void>;
}): Promise<string> {
  const projectRoot = process.cwd();
  const jobDir = path.join(projectRoot, "data", "videos", options.jobId);
  await fs.mkdir(jobDir, { recursive: true });

  const propsPath = path.join(jobDir, "input-props.json");
  const outPath = path.join(jobDir, "video.mp4");

  const spec = await hydrateVoiceFromPublicAudio(
    projectRoot,
    options.jobId,
    options.spec,
    options.onLogLine
  );

  await fs.writeFile(
    propsPath,
    `${JSON.stringify({ spec }, null, 2)}\n`,
    "utf8"
  );

  await assertPublicVoiceFilesExist(projectRoot, spec);

  const bin = remotionBinPath(projectRoot);
  const args = [
    "render",
    path.join("src", "remotion", "index.ts"),
    "MyComp",
    outPath,
    "--props",
    propsPath,
    "--overwrite",
  ];

  const voice = spec.voice;
  if (voice && voice.length > 0) {
    /*
     * - enforce-audio-track: mux an audio stream into MP4.
     * - aac: standard MP4 audio; Remotion decodes source MP3 from <Audio> and encodes here.
     * - number-of-shared-audio-tags: avoids starving multiple <Audio> clips during capture.
     */
    const sharedTags = Math.min(64, Math.max(12, voice.length + 8));
    args.push(
      "--enforce-audio-track",
      "--audio-codec",
      "aac",
      "--number-of-shared-audio-tags",
      String(sharedTags),
      "--timeout",
      "180000"
    );
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const emit = (line: string) => {
      void Promise.resolve(options.onLogLine(line)).catch(() => {});
    };

    lineSplitter(child.stdout, emit);
    lineSplitter(child.stderr, emit);

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `remotion render terminated by signal ${signal}`
            : `remotion render exited with code ${code ?? "unknown"}`
        )
      );
    });
  });

  return outPath;
}
