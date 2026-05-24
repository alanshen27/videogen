import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Job } from "@prisma/client";
import { db } from "../db";
import {
  generateStructuredOutput,
  generateFreeText,
  OPENAI_MODEL_SCRIPT_LIGHT,
  OPENAI_MODEL_SPEC_DESIGN,
} from "../llm/client";

/**
 * PROMPT.md is the single source of truth for how the LLM should think
 * about content + design. We load it once at module init and prepend it to
 * every system message so every stage of the pipeline sees the same brief.
 *
 * Edit `PROMPT.md` (not the inline strings below) when changing direction.
 */
const BRAND_PROMPT = (() => {
  try {
    return readFileSync(join(process.cwd(), "PROMPT.md"), "utf8");
  } catch {
    return "";
  }
})();

function withBrand(systemMessage: string): string {
  if (!BRAND_PROMPT) return systemMessage;
  return `${BRAND_PROMPT}\n\n---\n\n${systemMessage}`;
}
import {
  PlanSchema,
  ScriptSchema,
  BrandedSceneSpecSchema,
  MetadataSchema,
  type BrandedSceneSpec,
  type RemotionSpec,
} from "../llm/schemas";
import { buildMetadataPrompt } from "../llm/metadata-prompt";
import { searchReferenceImages } from "../tools/search-images";
import { downloadImage } from "../tools/download-image";
import { env, isEmailDeliveryConfigured } from "../env";
import { sendJobVideoEmail } from "../email/send-job-video";
import {
  applyVoiceFirstTimelineToSpec,
  synthesizeElevenLabsVoiceFirst,
  type VoiceFirstTimeline,
} from "../tts/elevenlabs";
import { renderRemotionJobVideo } from "../remotion/render-job-video";
import { buildYoutubeRemotionSpecFromBrandedScenes } from "../remotion/branded-scene-spec";

async function log(jobId: string, level: string, message: string) {
  console.log(`[Job ${jobId}] [${level}] ${message}`);
  await db.jobLog.create({
    data: { jobId, level, message },
  });
}

async function updateProgress(jobId: string, progress: number, status: string) {
  await db.job.update({
    where: { id: jobId },
    data: { progress, status: status as any },
  });
}

async function saveArtifact(
  jobId: string,
  type: string,
  contentJson?: unknown,
  filePath?: string
) {
  return db.jobArtifact.create({
    data: {
      jobId,
      type: type as any,
      contentJson: contentJson ?? undefined,
      filePath: filePath ?? undefined,
    },
  });
}

type RasterAssetRow = {
  sceneNumber: number;
  needsRasterImage: boolean;
  prompt: string;
  searchQuery: string;
};

function normalizeRasterAssetRow(
  raw: unknown,
  jobTopic: string,
  getFallbackPrompt: (sceneNumber: number) => string
): RasterAssetRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sn = r.sceneNumber;
  const sceneNumber =
    typeof sn === "number"
      ? sn
      : typeof sn === "string"
        ? Number(sn)
        : Number.NaN;
  if (!Number.isFinite(sceneNumber)) return null;

  const fallbackPrompt = getFallbackPrompt(sceneNumber);

  const prompt =
    typeof r.prompt === "string" && r.prompt.trim().length > 0
      ? r.prompt
      : fallbackPrompt;

  const searchQuery =
    typeof r.searchQuery === "string" && r.searchQuery.trim().length > 0
      ? r.searchQuery
      : `${jobTopic} ${prompt}`.trim();

  return {
    sceneNumber,
    needsRasterImage:
      typeof r.needsRasterImage === "boolean" ? r.needsRasterImage : true,
    prompt,
    searchQuery,
  };
}

/** Fast-cut pacing: many short scenes; only diagram-hop beats may linger. */
function pacingHints(durationSeconds: number): {
  targetScenes: number;
  minScenes: number;
  maxScenes: number;
} {
  const targetScenes = Math.max(
    12,
    Math.min(40, Math.round(durationSeconds / 4.5))
  );
  return {
    targetScenes,
    minScenes: Math.max(10, Math.round(durationSeconds / 7)),
    maxScenes: Math.min(42, Math.round(durationSeconds / 3.5)),
  };
}

function buildVideoPrompt(job: Job): string {
  const { targetScenes, minScenes, maxScenes } = pacingHints(
    job.durationSeconds
  );
  return `
You are creating a YouTube-style educational video.

TOPIC: ${job.topic}
DURATION: ${job.durationSeconds} seconds
AUDIENCE: ${job.audienceLevel}
STYLE: ${job.style}
INSTRUCTIONS: ${job.instructions || "None"}

**Pacing (non-negotiable)** — fast cuts, not slide-deck dwell time:
- Plan **${targetScenes} scenes** (acceptable range ${minScenes}–${maxScenes}) for this duration. More scenes = better; do not under-cut.
- **Default scene length: 2.5–5 seconds** of narration (one punchy idea, then cut).
- **Exception — diagram hopping**: ONE scene may run **5–12 seconds** when the visual is a flowchart with per-node \`focusBeats\` / \`mermaidTargets\` stepping through the graph. Motion carries the beat; the camera does not need to cut.
- **Never** park on the same static layout (list, image, stat, quote, code-only) for more than **~5 seconds**. Split into two scenes instead.
- Prefer **a new scene** over stuffing another bullet into the current one.

**Spoken narration** (\`narration\`, \`hook\`, \`fullNarration\`) — written for **listeners on YouTube**, not producers:
- **READABLE**: short sentences, plain words, one idea per beat. A viewer listening once should follow without rewinding — no acronym dumps, no run-on clauses, no dense jargon walls. Every line must sound natural read aloud (voice-over).
- Conversational, confident, direct: explain ideas like you're talking to a smart friend.
- **Forbidden in spoken lines**: naming chart tools (\`Mermaid\`, \`flowchart\`), saying you're \`highlighting\`, \`emphasizing on screen\`, \`this visualization\`, \`the glowing section\`, \`as you can see in the diagram software\`, or any meta about how the video was produced.
- **Do**: refer to real parts of the system (\`the API layer\`, \`the database here\`, \`when a request hits the gateway\`) — substance only.
- **visualDescription** is internal production notes for motion designers — technical jargon about layouts/icons/**diagram emphasis** belongs **only** there, never copied into \`narration\`.

**Motion / visuals** (for planning + visualDescription + later Remotion prompts — not for narration):
- **Architecture & structure**: prefer a structured diagram (flowchart / sequence / state) as the hero when explaining systems, dependencies, data/control flow, deployment topology, layers, boundaries, request paths, infra roles — avoid disconnected icon grids for those beats.
- One clear idea per scene; avoid stacking many glyphs in one frame.
- Architecture walkthroughs: consecutive scenes may reuse **one** topology while motion shifts emphasis (\`style\`/\`classDef\`/\`linkStyle\`) — script should still sound natural each beat while focusing on **one subsystem per scene** in the narration.
- Diagram types: flowchart/graph + subgraphs for maps; sequenceDiagram for calls; stateDiagram-v2 for modes; class/ER only when they genuinely help.
- Visible titles never show raw Lucide/API identifiers — human phrases only.

Typography & tone on-screen: modern slides / concise headings — not faux-terminal styling unless showing real code.

Create engaging educational content that matches the requested style.
`;
}

export async function executePipeline(job: Job): Promise<void> {
  const jobId = job.id;
  const prompt = buildVideoPrompt(job);

  try {
    // Stage 1: PLAN_TOPIC
    await updateProgress(jobId, 5, "PLANNING");
    await log(jobId, "info", "Starting topic planning...");

    const { targetScenes, minScenes, maxScenes } = pacingHints(
      job.durationSeconds
    );
    const plan = await generateStructuredOutput({
      prompt: `${prompt}\n\nGenerate a topic plan with title, angle, target audience, learning objectives, scene count, and estimated duration.\n\nScene count: set sceneCount to **${targetScenes}** (stay within ${minScenes}–${maxScenes}). Each scene is one quick beat (~3–5s) unless it is a diagram-hop walkthrough (see pacing rules). More scenes = better rhythm — do not plan an 8-scene deck for a 90s video.\n\nAssume structured diagrams suit architecture/system-flow beats; icon-led slides elsewhere unless photography is essential.`,
      schema: PlanSchema,
      systemMessage: withBrand(
        "You are a professional educational video planner for fast-cut explainers. Prefer many short scene beats over few long chapters. Output valid JSON only."
      ),
      modelId: OPENAI_MODEL_SCRIPT_LIGHT,
    });
    await saveArtifact(jobId, "PLAN", plan);
    await log(jobId, "info", `Plan created: "${plan.title}" with ${plan.sceneCount} scenes`);

    // Stage 2: GENERATE_SCRIPT
    await updateProgress(jobId, 15, "SCRIPTING");
    await log(jobId, "info", "Generating full script...");

    const script = await generateStructuredOutput({
      prompt: `${prompt}\n\nPLAN:\n${JSON.stringify(plan, null, 2)}\n\nGenerate a full video script with scenes, narration, and visual descriptions. Each scene should have timing, narration text, visual description, and animation type.\n\nCRITICAL: Emit exactly ${plan.sceneCount} scenes with sceneNumber 1 through ${plan.sceneCount} (same count as plan.sceneCount). This must match later motion + voice-over pairing.\n\nSCENE TIMING (non-negotiable):\n- Most scenes: **2.5–5 seconds** each (\`endSecond - startSecond\`). One idea, tight narration (~8–18 spoken words), then cut.\n- **Diagram-hop scenes only**: **5–12 seconds** when \`animationType\` is \`diagram\` and \`visualDescription\` says the beat walks node-by-node through ONE flowchart (focus beats / mermaidTargets). Pack the hops into that single scene — do not stretch list/image/stat scenes this long.\n- If a beat needs more than ~5s on a static visual, **split into two scenes** with different templates.\n- Scene timings must be contiguous and sum to ~${job.durationSeconds}s (±2s).\n\nREADABILITY (non-negotiable): narration and hook must be easy to understand on first listen — short spoken sentences, everyday language for the audience level, no walls of technical terms. If a line would sound awkward read aloud, rewrite it.\n\nNARRATION AUDIO TAGS (ElevenLabs v3):\n- You MAY embed inline audio-direction tags in narration & hook to control delivery. Use them sparingly — at most one tag per ~25 spoken words. Overuse sounds theatrical.\n- Allowed inline tags (use exactly these, in square brackets):\n  [laughs] [chuckles] [sighs] [exhales] [whispers] [shouts] [excited] [curious] [thoughtful] [sarcastic] [amazed] [disappointed] [deadpan] [warm] [serious] [matter-of-fact]\n- Allowed pause: <break time="0.4s"/> (0.1s–3.0s). Use to set rhythm between sentences, NOT every line.\n- Tags appear **before** the affected sentence. Example:\n  \"[thoughtful] Here is the weird part. The query was fast. The connection was slow.\"\n- Do NOT invent other tags. [explode], [dramatic], [angry], [robotic] etc. are silently stripped before TTS.\n- Hook scene: opening line gets one tag (e.g. [curious], [excited]) to set the energy. Don't open with [deadpan].\n\nvisualDescription (production notes ONLY — **never** paste into narration):\n- Architecture/system beats: say it's a flowchart-style layout, **which layer or subsystem** this beat focuses on, and how emphasis should move scene-to-scene — motion tooling reads this; the viewer does not hear it.\n- Other beats: concise icon/storyboard cues (e.g. Cpu + Terminal + Code2). Photos only when necessary.`,
      schema: ScriptSchema,
      systemMessage: withBrand(
        "You are a professional YouTube scriptwriter for fast-cut explainers. Many short scenes (2.5–5s each); only diagram-hop walkthroughs may run 5–12s on one flowchart. Clear, concise narration — one idea per scene. Zero lecturing about graphics software. Use visualDescription for layout/emphasis notes only. ElevenLabs v3 tags sparingly. Output valid JSON only."
      ),
      modelId: OPENAI_MODEL_SCRIPT_LIGHT,
    });
    await saveArtifact(jobId, "SCRIPT", script);
    await log(jobId, "info", `Script created with ${script.scenes.length} scenes`);
    if (script.scenes.length !== plan.sceneCount) {
      await log(
        jobId,
        "warn",
        `Script scene count (${script.scenes.length}) differs from plan.sceneCount (${plan.sceneCount}); voice-over ↔ motion pairing may be wrong.`
      );
    }

    let voiceFirstTimeline: VoiceFirstTimeline | null = null;
    if (job.voiceOver && env.ELEVENLABS_API_KEY) {
      await updateProgress(jobId, 20, "SCRIPTING");
      await log(
        jobId,
        "info",
        "ElevenLabs FIRST: synthesizing narration MP3s before Remotion spec..."
      );
      try {
        voiceFirstTimeline = await synthesizeElevenLabsVoiceFirst({
          jobId,
          script,
          fps: 30,
          apiKey: env.ELEVENLABS_API_KEY,
          voiceId: env.ELEVENLABS_VOICE_ID,
          onLog: (level, message) => log(jobId, level, message),
        });
        await saveArtifact(jobId, "VOICE_TIMELINE", voiceFirstTimeline);
        await log(
          jobId,
          "info",
          `Voice-first timeline: ${voiceFirstTimeline.totalFrames} frames (~${(
            voiceFirstTimeline.totalFrames / 30
          ).toFixed(1)}s total)`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(
          jobId,
          "warn",
          `ElevenLabs FIRST failed; motion spec will use brief timing instead: ${msg}`
        );
        voiceFirstTimeline = null;
      }
    } else if (job.voiceOver && !env.ELEVENLABS_API_KEY) {
      await log(
        jobId,
        "warn",
        "Voice-over enabled but ELEVENLABS_API_KEY is missing; skipping pre-synthesis."
      );
    }

    // Stage 3: GENERATE_STORYBOARD
    await updateProgress(jobId, 30, "SCRIPTING");
    await log(jobId, "info", "Generating storyboard from script...");

    const storyboard = script.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      startSecond: scene.startSecond,
      endSecond: scene.endSecond,
      visualDescription: scene.visualDescription,
      animationType: scene.animationType,
      codeSnippet: scene.codeSnippet,
    }));
    await saveArtifact(jobId, "STORYBOARD", { scenes: storyboard });
    await log(jobId, "info", `Storyboard created with ${storyboard.length} scenes`);

    // Stage 4: GENERATE_ASSET_PROMPTS
    await updateProgress(jobId, 45, "ASSETS");
    await log(jobId, "info", "Generating asset prompts...");

    const assetPrompts = await generateFreeText({
      prompt: `${prompt}\n\nSCRIPT:\n${JSON.stringify(script, null, 2)}\n\nPick a Google Image search query for as many scenes as possible. Visuals are this video's bread and butter.

Return JSON array, one row per scene that benefits from an image: [{ "sceneNumber": number, "needsRasterImage": boolean, "prompt": string, "searchQuery": string }].

QUERY WRITING RULES (READ CAREFULLY):
- NEVER append "stock photo", "stock photography", "stock image", "royalty free", "HD", "4k", or any similar SEO junk. Those phrases drag results into watermarked Shutterstock/Getty thumbnails that we cannot download.
- Write the kind of short, specific query a human would type into Google Images to find a clean reference picture.
- For any named product / tool / company / framework / language / person (Claude, OpenAI, React, AWS, Postgres, Vercel, GitHub, Linear, ChatGPT, Cursor, Anthropic, etc.) write a TIGHT logo or screenshot query: \`"<thing> logo"\`, \`"<thing> screenshot"\`, \`"<thing> ui"\`. Short, specific, no extra words.
- For abstract concepts, name the THING itself, not a category: \`"dijkstra algorithm visualization"\` not \`"shortest path stock photo"\`; \`"weighted directed graph"\` not \`"graph diagram stock photo"\`.
- For setup / mood beats use a concrete subject: \`"data center server racks"\`, \`"developer terminal close up"\`. No "stock" suffix.

PER-SCENE RULES:
- needsRasterImage=true is the DEFAULT. Almost every scene benefits from a real picture.
- needsRasterImage=false ONLY when the scene is a pure flow/architecture diagram where a real picture would be confusing.
- It's fine — encouraged — to include every scene.

Output valid JSON only.`,
      systemMessage: withBrand(
        "You are a visual asset curator for a tech explainer video. Pictures beat icons. Write short specific Google Images queries — NEVER append 'stock photo' or similar SEO junk. Output valid JSON only."
      ),
    });

    let assetList: RasterAssetRow[] = [];
    try {
      const parsed = JSON.parse(
        assetPrompts.replace(/```json\n?/g, "").replace(/```/g, "")
      );
      const rawList: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed.assets ?? parsed.imagePrompts ?? [];
      assetList = rawList
        .map((row) =>
          normalizeRasterAssetRow(row, job.topic, (sceneNumber) =>
            script.scenes.find((s) => s.sceneNumber === sceneNumber)
              ?.visualDescription ?? ""
          )
        )
        .filter((row): row is RasterAssetRow => row !== null);
    } catch {
      assetList = script.scenes.map((s) => ({
        sceneNumber: s.sceneNumber,
        needsRasterImage: false,
        prompt: s.visualDescription,
        searchQuery: `${job.topic} ${s.visualDescription}`,
      }));
    }

    await saveArtifact(jobId, "ASSETS", { prompts: assetList });
    await log(
      jobId,
      "info",
      `Generated ${assetList.length} asset rows (${assetList.filter((a) => a.needsRasterImage).length} request raster imagery)`
    );

    // Stage 5: DOWNLOAD_REFERENCE_IMAGES (if enabled)
    if (job.includeImages) {
      await updateProgress(jobId, 55, "ASSETS");
      await log(jobId, "info", "Downloading reference images...");

      const downloadedImages: { sceneNumber: number; filePath: string }[] = [];
      let rasterCandidates = assetList.filter(
        (a) => a.needsRasterImage && a.searchQuery.trim().length > 0
      );

      if (rasterCandidates.length === 0) {
        // If user explicitly enabled images, still fetch a few references.
        rasterCandidates = script.scenes.slice(0, 4).map((s) => ({
          sceneNumber: s.sceneNumber,
          needsRasterImage: true,
          prompt: s.visualDescription,
          searchQuery: `${job.topic} ${s.visualDescription}`,
        }));
        await log(
          jobId,
          "info",
          "No raster candidates were suggested; forcing reference search for first scenes because includeImages=true."
        );
      }
      for (const asset of rasterCandidates.slice(0, 12)) {
        try {
          await log(
            jobId,
            "info",
            `Image search start: scene=${asset.sceneNumber}, query="${asset.searchQuery}"`
          );
          const results = await searchReferenceImages(asset.searchQuery);
          await log(
            jobId,
            "info",
            `Image search results: scene=${asset.sceneNumber}, count=${results.length}${
              results[0] ? `, source=${results[0].source}, first=${results[0].url.slice(0, 96)}` : ""
            }`
          );
          if (results.length === 0) {
            await log(
              jobId,
              "warn",
              `No image search results for scene ${asset.sceneNumber} (query: ${asset.searchQuery})`
            );
            continue;
          }

          let downloaded: string | null = null;
          for (let attempt = 0; attempt < Math.min(results.length, 4); attempt++) {
            const candidate = results[attempt];
            const filename = `scene-${asset.sceneNumber}-${Date.now()}-${attempt}.jpg`;
            try {
              const filePath = await downloadImage(candidate.url, filename);
              downloaded = filePath;
              await log(
                jobId,
                "info",
                `Downloaded image for scene ${asset.sceneNumber} via ${candidate.source} (attempt ${attempt + 1}): ${filePath}`
              );
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await log(
                jobId,
                "warn",
                `Image download attempt ${attempt + 1}/${Math.min(results.length, 4)} failed for scene ${asset.sceneNumber} (${candidate.source}): ${msg}`
              );
            }
          }

          if (downloaded) {
            downloadedImages.push({ sceneNumber: asset.sceneNumber, filePath: downloaded });
          } else {
            await log(
              jobId,
              "warn",
              `All ${Math.min(results.length, 4)} image download attempts failed for scene ${asset.sceneNumber}.`
            );
          }
        } catch (err) {
          await log(jobId, "warn", `Failed to download image for scene ${asset.sceneNumber}: ${err}`);
        }
      }

      for (const img of downloadedImages) {
        await saveArtifact(jobId, "IMAGE", { sceneNumber: img.sceneNumber }, img.filePath);
      }
    }

    // Stage 6: GENERATE_REMOTION_SPEC
    await updateProgress(jobId, 65, "ASSETS");
    await log(jobId, "info", "Generating Remotion animation spec...");

    const brandedSceneSpec: BrandedSceneSpec = await generateStructuredOutput({
      prompt: `${prompt}\n\nSCRIPT AND STORYBOARD:\n${JSON.stringify({ script, storyboard }, null, 2)}\n\nGenerate a branded scene spec for a YouTube-style explainer.\n\nAllowed templates:\n- left_diagram_right_text\n- right_diagram_left_text\n- list\n- image\n- image_hero\n- image_left\n- code_focus\n- stat_callout  // big number / single bold idea\n- quote          // short pull-quote\n\nRules:\n- Return exactly one branded scene per script scene, same order and scene numbers.\n- **Fast cuts**: match the script's short timings — do not pad scenes. If script gave a 3s beat, keep headline/body minimal.\n- VARY the template every scene — never the same template twice in a row. Back-to-back diagram *templates* are boring unless the second is a diagram-hop continuation (same mermaid, new focusBeats).\n- Use list / stat_callout / quote for hook + summary beats.\n- IMAGE BIAS: prefer image / image_hero / image_left whenever a real-world picture would help — ESPECIALLY for any named product, tool, company, framework, language, or person (Claude, OpenAI, React, AWS, Postgres, Vercel, GitHub, Linear, ChatGPT, etc.). For those, write imageSearchQuery as a tight "<thing> logo" / "<thing> screenshot" / "<thing> ui" query — short, specific, no filler. Examples: "Claude AI logo", "ChatGPT interface screenshot", "AWS Lambda logo", "Vercel dashboard ui".\n- NEVER append "stock photo" / "stock image" / "royalty free" / "HD" / "4k" to imageSearchQuery — that ranks watermarked Shutterstock thumbnails first which we can't download. Name the actual thing instead.\n- Architecture diagrams (mermaid source) are re-rendered as a clean Linear/Vercel-style flowchart — but only when ≤8 nodes, LR/TB, simple shapes (rect/rounded/diamond/cylinder), basic --> edges, no subgraphs, no sequence/state/ER/gantt. Reach for a diagram only when the flow/relationship IS the point; otherwise prefer an image.\n- If a scene has both a downloaded image AND a mermaid diagram, the image wins at render time. Don't bother emitting mermaid unless it's genuinely the best beat.\n- Use code_focus when code OR pseudo-code is the clearest way to explain a step. For algorithm/concept beats prefer PSEUDO-CODE in a python-fenced block (\`\`\`python\\n...\\n\`\`\`) — it reads like the narration, avoids language ceremony, and the syntax highlighter still colours it. Reserve real code for when the exact API/syntax IS the point.\n- Keep on-screen copy sparse: headline (≤6 words) + either one short body line (≤80 chars) OR 2–3 listItems — never headline + paragraph + bullets. Split templates default listItems=[].\n- template "list": always 2–4 listItems + focusBeats — title beat first, then one target="list" beat per item when VO says it (mermaidTargets ["0"], ["1"], …). Never headline-only list scenes.\n- focusBeats should point to one target at a time (title/body/list/diagram/image/code).\n- For mermaid walkthroughs (the diagram IS the visual), the diagram BEATS any downloaded image — author one focusBeats row per spoken beat with target="diagram" and mermaidTargets pointing to the node IDs you're currently narrating. The renderer animates: the listed nodes light up indigo while the rest dim. Keep each beat ~1–2.5s, cover the full scene, and make IDs match diagramMermaid exactly. TIMINGS ARE SCENE-RELATIVE: startSecond/endSecond live in 0..sceneDurationSeconds, NOT absolute script time. For a 6s scene with 4 beats: [0,1.5][1.5,3.0][3.0,4.5][4.5,6.0]. This is when diagrams shine — use it whenever a flow is the point.\n- **cueText — how visuals lock to voice (READ THIS)**: every focusBeat needs cueText set to a verbatim 2–6 word substring from THIS scene's narration. The server runs ElevenLabs character-level alignment on the narration MP3 and fires the beat on the EXACT frame the narrator speaks those words. This is the difference between \"the highlight is somewhere near the right moment\" and \"the highlight fires when the word is actually said.\" Use cueText=\"\" only for purely visual beats (e.g. a 0–1s title hold) where timing genuinely does not matter. Example: narration=\"the request hits the load balancer, then routes through Auth to the queue\" → beats with cueText=\"request hits\" (lights Gateway), \"load balancer\" (lights LB), \"through Auth\" (lights Auth), \"the queue\" (lights Queue).\n- For list reveals, give each item beat a cueText pointing at the spoken phrase that introduces that bullet (e.g. listItems[0]=\"Faster boot\" → cueText=\"faster boot\"). The bullet appears on that frame, not on a wall-clock estimate.\n- Structured JSON requires every field on each scene: use listItems=[], diagramMermaid="", imageSearchQuery="", codeSnippet="", focusBeats=[] (or beats with caption="", cueText="", and mermaidTargets=[] when unused) whenever those parts do not apply.`,
      schema: BrandedSceneSpecSchema,
      systemMessage: withBrand(
        "You are a YouTube motion storyboard director. Choose clear templates and beat-by-beat focus. Output valid JSON only."
      ),
      modelId: OPENAI_MODEL_SPEC_DESIGN,
    });

    await saveArtifact(jobId, "SCENE_SPEC", brandedSceneSpec);
    await log(
      jobId,
      "info",
      `Branded scene spec generated (${brandedSceneSpec.scenes.length} scenes)`
    );

    const downloadedImageArtifacts = await db.jobArtifact.findMany({
      where: { jobId, type: "IMAGE" },
      orderBy: { createdAt: "asc" },
    });
    const imageByScene = new Map<number, string>();
    for (const artifact of downloadedImageArtifacts) {
      const sceneNumber =
        typeof artifact.contentJson === "object" &&
        artifact.contentJson !== null &&
        "sceneNumber" in artifact.contentJson
          ? Number((artifact.contentJson as { sceneNumber?: unknown }).sceneNumber)
          : Number.NaN;
      if (Number.isFinite(sceneNumber) && artifact.filePath) {
        imageByScene.set(sceneNumber, artifact.filePath);
      }
    }

    /* When ElevenLabs voice-first synth produced character-level alignment,
     * hand it to the spec builder so diagram highlights / list reveals can
     * be anchored to the exact frame a phrase is spoken (via cueText). */
    const voiceTimingsBySceneIndex = voiceFirstTimeline
      ? Object.fromEntries(
          voiceFirstTimeline.scenes.map((row, i) => [
            i,
            {
              durationFrames: row.durationInFrames,
              alignment: voiceFirstTimeline.alignmentsBySceneIndex[i] ?? null,
              narration: voiceFirstTimeline.narrationBySceneIndex[i] ?? "",
            },
          ])
        )
      : undefined;

    let remotionSpecFinal: RemotionSpec = buildYoutubeRemotionSpecFromBrandedScenes(
      brandedSceneSpec,
      script,
      {
        imageByScene,
        orientation: job.orientation as "LANDSCAPE" | "PORTRAIT",
        voiceTimingsBySceneIndex,
      }
    );

    const scriptSceneCount = [...script.scenes].sort(
      (a, b) => a.sceneNumber - b.sceneNumber
    ).length;
    if (remotionSpecFinal.scenes.length !== scriptSceneCount) {
      await log(
        jobId,
        "warn",
        `Remotion spec has ${remotionSpecFinal.scenes.length} scenes but script has ${scriptSceneCount}; voice-over will only cover the first ${Math.min(remotionSpecFinal.scenes.length, scriptSceneCount)} paired scenes.`
      );
    }

    if (voiceFirstTimeline) {
      if (
        remotionSpecFinal.scenes.length !== voiceFirstTimeline.scenes.length
      ) {
        await log(
          jobId,
          "warn",
          `Remotion scene count (${remotionSpecFinal.scenes.length}) differs from voice-first timeline (${voiceFirstTimeline.scenes.length}); measured audio will align only through the paired prefix — verify scene pairing.`
        );
      }
      remotionSpecFinal = applyVoiceFirstTimelineToSpec(
        remotionSpecFinal,
        voiceFirstTimeline
      );
      await log(jobId, "info", "Applied voice-first MP3 durations and voice[] to spec.");
    }

    if (
      job.voiceOver &&
      env.ELEVENLABS_API_KEY &&
      (!remotionSpecFinal.voice?.length)
    ) {
      await log(
        jobId,
        "warn",
        "Voice-over is enabled but no voice segments were attached — the MP4 will be silent. Check script narration text and ElevenLabs messages above."
      );
    }

    await saveArtifact(jobId, "REMOTION_SPEC", remotionSpecFinal);
    await log(
      jobId,
      "info",
      `Remotion spec saved (${remotionSpecFinal.scenes.length} scenes${
        remotionSpecFinal.voice?.length ? ", voice-first audio timeline" : ""
      })`
    );

    // Stage 7: RENDER_VIDEO (must follow VO synthesis so timeline matches audio)
    let videoPath: string | null = null;
    if (job.renderVideo) {
      await updateProgress(jobId, 82, "RENDERING");
      await log(jobId, "info", "Remotion CLI render starting (progress in worker stdout)...");

      videoPath = await renderRemotionJobVideo({
        jobId,
        spec: remotionSpecFinal,
        onLogLine: (line) => {
          console.log(`[Job ${jobId}] [render] ${line}`);
        },
      });

      const renderResult = {
        status: "completed",
        message: "MP4 written by Remotion render.",
        frames: remotionSpecFinal.composition.durationInFrames,
        fps: remotionSpecFinal.composition.fps,
        outputPath: videoPath,
      };
      await saveArtifact(jobId, "VIDEO", renderResult, videoPath);
      await log(jobId, "info", `Video ready: ${videoPath}`);
    }

    // Stage 8: GENERATE_METADATA (after render — uses script only)
    await updateProgress(jobId, 92, "ASSETS");
    await log(jobId, "info", "Generating video metadata...");

    const metadata = await generateStructuredOutput({
      prompt: buildMetadataPrompt(prompt, script, {
        topic: job.topic,
        durationSeconds: job.durationSeconds,
        orientation: job.orientation as "LANDSCAPE" | "PORTRAIT",
      }),
      schema: MetadataSchema,
      systemMessage: withBrand(
        "You are a YouTube SEO expert for explainers and Shorts. Write paste-ready Shorts descriptions with a hashtag line (#tag #tag). Output valid JSON only."
      ),
      modelId: OPENAI_MODEL_SPEC_DESIGN,
    });
    if (job.generateThumbnail) {
      await saveArtifact(jobId, "THUMBNAIL", { thumbnailPrompt: metadata.thumbnailPrompt });
    }
    await saveArtifact(jobId, "METADATA", metadata);
    await log(
      jobId,
      "info",
      `Metadata created: "${metadata.title}" · Shorts: "${metadata.shortsTitle}"`
    );

    if (videoPath && isEmailDeliveryConfigured()) {
      try {
        const fps = remotionSpecFinal.composition.fps;
        const frames = remotionSpecFinal.composition.durationInFrames;
        await sendJobVideoEmail({
          jobId,
          topic: job.topic,
          videoPath,
          metadata,
          scriptTitle: script.title,
          hook: script.hook,
          sceneCount: script.scenes.length,
          runtimeSeconds: frames / fps,
        });
        await log(
          jobId,
          "info",
          `Delivery email sent to ${env.EMAIL_TO}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(jobId, "warn", `Email delivery failed: ${msg}`);
      }
    } else if (videoPath && !isEmailDeliveryConfigured()) {
      await log(
        jobId,
        "info",
        "Email delivery skipped (set EMAIL_HOST, EMAIL_USER, EMAIL_PASS, EMAIL_TO in .env)"
      );
    }

    // Stage 9: COMPLETE
    await updateProgress(jobId, 100, "COMPLETED");
    await log(jobId, "info", "Job completed successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await log(jobId, "error", `Job failed: ${errorMessage}`);
    await updateProgress(jobId, job.progress, "FAILED");
    await db.job.update({
      where: { id: jobId },
      data: { error: errorMessage },
    });
    throw error;
  }
}
