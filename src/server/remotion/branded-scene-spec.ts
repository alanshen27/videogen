import type {
  BrandedSceneSpec,
  RemotionElementPlacement,
  RemotionLucideIconName,
  RemotionSpec,
  Script,
} from "../llm/schemas";
import type { BrandedSceneTemplate, SceneFocusBeat } from "../llm/schemas";
import { parseMermaidFlowchart } from "../../remotion/spec/mermaid-parse";

type RemotionSpecGeneration = Omit<RemotionSpec, "voice">;
type RemotionElement = RemotionSpecGeneration["scenes"][number]["elements"][number];

export type RemotionOrientation = "LANDSCAPE" | "PORTRAIT";

type CompositionDims = { width: 1920 | 1080; height: 1920 | 1080 };

function dimsForOrientation(o: RemotionOrientation): CompositionDims {
  return o === "PORTRAIT"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

const FPS = 30;

function toFrames(seconds: number): number {
  return Math.max(45, Math.round(seconds * FPS));
}

function sceneDurationSecondsFromScript(script: Script, sceneNumber: number): number {
  const scene = script.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) return 6;
  return Math.max(1.5, scene.endSecond - scene.startSecond);
}

function chooseAnimationForTarget(target?: string): "fade" | "highlight" {
  if (target === "diagram" || target === "code" || target === "image") {
    return "highlight";
  }
  return "fade";
}

/**
 * Convert the scene's `focusBeats` into frame-relative `diagramBeats` that
 * the renderer can drive an animation timeline from.
 *
 * Timing interpretation is auto-detected per scene:
 *   - **Scene-relative** (preferred): max(endSecond) ≤ sceneDurationSeconds
 *     within ~5% slack. Beats sit in 0..sceneDuration. This is what the LLM
 *     naturally emits, and what `PROMPT.md` documents.
 *   - **Absolute** (legacy): otherwise — we subtract `sceneStartSecond`.
 *
 * If beats from a labelled walkthrough all collapse to the same frame
 * (length-0 timeline) we redistribute them evenly across the scene as a
 * defensive fallback so the highlight at least sequences through the nodes.
 *
 * Beats that don't target the diagram (or have no `mermaidTargets`) are
 * dropped before timing conversion.
 */
function buildDiagramBeats(
  focusBeats: SceneFocusBeat[],
  sceneStartSecond: number,
  sceneDurationFrames: number
): { fromFrame: number; durationInFrames: number; targets: string[] }[] {
  const diagramBeats = focusBeats.filter(
    (fb) =>
      fb.target === "diagram" &&
      Array.isArray(fb.mermaidTargets) &&
      fb.mermaidTargets.length > 0
  );
  if (diagramBeats.length === 0) return [];

  const sceneDurationSeconds = sceneDurationFrames / FPS;
  const maxEnd = Math.max(...diagramBeats.map((b) => b.endSecond));
  const sceneRelative = maxEnd <= sceneDurationSeconds * 1.05;

  const offset = sceneRelative ? 0 : sceneStartSecond;
  const minBeatFrames = 12;

  const beats = diagramBeats.map((fb) => {
    const startRel = Math.max(0, fb.startSecond - offset);
    const endRel = Math.max(startRel, fb.endSecond - offset);
    const fromFrame = Math.min(
      sceneDurationFrames - minBeatFrames,
      Math.round(startRel * FPS)
    );
    const endFrame = Math.min(
      sceneDurationFrames,
      Math.max(fromFrame + minBeatFrames, Math.round(endRel * FPS))
    );
    return {
      fromFrame: Math.max(0, fromFrame),
      durationInFrames: Math.max(minBeatFrames, endFrame - fromFrame),
      targets: fb.mermaidTargets.slice(0, 12),
    };
  });

  /* Defensive fallback: every beat collapsed to the same frame (the LLM
   * sent garbage timings). Distribute them evenly across the scene so the
   * highlight at least walks through the labelled nodes. */
  const span =
    Math.max(...beats.map((b) => b.fromFrame)) -
    Math.min(...beats.map((b) => b.fromFrame));
  if (span < minBeatFrames && beats.length > 1) {
    const slot = Math.floor(sceneDurationFrames / beats.length);
    return beats.map((b, i) => ({
      fromFrame: i * slot,
      durationInFrames: i === beats.length - 1
        ? sceneDurationFrames - i * slot
        : slot,
      targets: b.targets,
    }));
  }

  return beats;
}

export type ListRevealBeat = { fromFrame: number; itemIndex: number };

function parseListItemIndex(targets: string[], fallback: number): number {
  const raw = targets[0]?.trim();
  if (raw && /^\d+$/.test(raw)) return Math.max(0, Number.parseInt(raw, 10));
  return fallback;
}

/**
 * Align bullet reveals to voice using focus beats (`target: "list"`) or, when
 * those are missing, phrase positions in the scene narration (ElevenLabs gives
 * per-scene MP3 length, not word timestamps — this is the practical sync path).
 */
function deriveListBeatsFromNarration(
  narration: string,
  listItems: string[],
  sceneDurationFrames: number,
  headlineHoldFrames: number
): ListRevealBeat[] {
  if (listItems.length === 0) return [];

  const avail = Math.max(24, sceneDurationFrames - headlineHoldFrames);
  const lower = narration.toLowerCase();
  let cursor = 0;
  const ratios: number[] = [];

  for (let i = 0; i < listItems.length; i++) {
    const keywords = listItems[i]!
      .toLowerCase()
      .replace(/[*_`]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 4);
    let bestPos = -1;
    for (const w of keywords) {
      const pos = lower.indexOf(w, cursor);
      if (pos >= 0 && (bestPos < 0 || pos < bestPos)) bestPos = pos;
    }
    if (bestPos >= 0) {
      ratios.push(bestPos / Math.max(1, narration.length));
      cursor = bestPos + 1;
    } else {
      ratios.push((i + 1) / (listItems.length + 1));
    }
  }

  return ratios.map((ratio, itemIndex) => ({
    itemIndex,
    fromFrame: Math.min(
      sceneDurationFrames - 9,
      headlineHoldFrames + Math.round(ratio * avail * 0.92)
    ),
  }));
}

function titleHoldFrames(
  focusBeats: SceneFocusBeat[],
  sceneStartSecond: number,
  sceneDurationFrames: number
): number {
  const titleBeats = focusBeats.filter((fb) => fb.target === "title");
  if (titleBeats.length === 0) {
    return Math.min(15, Math.round(sceneDurationFrames * 0.1));
  }

  const sceneDurationSeconds = sceneDurationFrames / FPS;
  const maxEnd = Math.max(...titleBeats.map((b) => b.endSecond));
  const sceneRelative = maxEnd <= sceneDurationSeconds * 1.05;
  const offset = sceneRelative ? 0 : sceneStartSecond;
  const endSec = Math.max(
    0,
    ...titleBeats.map((b) => Math.max(0, b.endSecond - offset))
  );
  return Math.min(
    sceneDurationFrames - 12,
    Math.max(9, Math.round(endSec * FPS))
  );
}

function buildListBeats(
  focusBeats: SceneFocusBeat[],
  sceneStartSecond: number,
  sceneDurationFrames: number,
  listItems: string[],
  narration: string
): ListRevealBeat[] {
  if (listItems.length === 0) return [];

  const hold = titleHoldFrames(
    focusBeats,
    sceneStartSecond,
    sceneDurationFrames
  );
  const listFocus = focusBeats
    .filter((fb) => fb.target === "list")
    .sort((a, b) => a.startSecond - b.startSecond);

  if (listFocus.length === 0) {
    return deriveListBeatsFromNarration(
      narration,
      listItems,
      sceneDurationFrames,
      hold
    );
  }

  const sceneDurationSeconds = sceneDurationFrames / FPS;
  const maxEnd = Math.max(...listFocus.map((b) => b.endSecond));
  const sceneRelative = maxEnd <= sceneDurationSeconds * 1.05;
  const offset = sceneRelative ? 0 : sceneStartSecond;

  const fromFocus: ListRevealBeat[] = listFocus.map((fb, orderIdx) => {
    const startRel = Math.max(0, fb.startSecond - offset);
    return {
      fromFrame: Math.min(
        sceneDurationFrames - 9,
        Math.max(hold, Math.round(startRel * FPS))
      ),
      itemIndex: parseListItemIndex(fb.mermaidTargets, orderIdx),
    };
  });

  const byIndex = new Map<number, ListRevealBeat>();
  for (const beat of fromFocus) {
    if (!byIndex.has(beat.itemIndex)) byIndex.set(beat.itemIndex, beat);
  }

  const derived = deriveListBeatsFromNarration(
    narration,
    listItems,
    sceneDurationFrames,
    hold
  );

  return listItems.map((_, itemIndex) => {
    const authored = byIndex.get(itemIndex);
    if (authored) return authored;
    const fallback = derived.find((b) => b.itemIndex === itemIndex);
    return (
      fallback ?? {
        itemIndex,
        fromFrame: Math.min(
          sceneDurationFrames - 9,
          hold + Math.round((itemIndex / listItems.length) * (sceneDurationFrames - hold))
        ),
      }
    );
  });
}

/**
 * Whenever the LLM emitted a parseable diagram, it wins over a downloaded
 * image. The labelled structure of a flowchart carries more pedagogical
 * value than any stock screenshot for an explainer. Image stays attached
 * as `fallbackImageUrl` so we don't blank-screen if parsing later fails.
 */
function diagramWinsForScene(
  _template: BrandedSceneTemplate,
  _focusBeats: SceneFocusBeat[],
  mermaidParseable: boolean
): boolean {
  return mermaidParseable;
}

/** On-screen copy: headline + body OR headline + bullets — never all three. */
function listContent(headline: string, body: string, listItems: string[] = []): string {
  const trimmedHeadline = headline.trim();
  const trimmedBody = body.trim();
  const bullets = listItems
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 4)
    .map((item) => `- ${item}`)
    .join("\n");

  if (bullets.length > 0) {
    return trimmedHeadline ? `${trimmedHeadline}\n\n${bullets}` : bullets;
  }
  if (!trimmedBody) return trimmedHeadline;
  if (!trimmedHeadline) return trimmedBody;
  return `${trimmedHeadline}\n\n${trimmedBody}`;
}

function pickIcon(sceneText: string): RemotionLucideIconName {
  const t = sceneText.toLowerCase();
  if (t.includes("queue") || t.includes("worker") || t.includes("pipeline")) return "Workflow";
  if (t.includes("database") || t.includes("sql") || t.includes("storage") || t.includes("table")) return "Database";
  if (t.includes("api") || t.includes("server") || t.includes("backend")) return "Server";
  if (t.includes("auth") || t.includes("login") || t.includes("permission")) return "Lock";
  if (t.includes("user") || t.includes("client") || t.includes("audience")) return "Users";
  if (t.includes("network") || t.includes("request") || t.includes("gateway")) return "Network";
  if (t.includes("search") || t.includes("query") || t.includes("find")) return "Search";
  if (t.includes("code") || t.includes("function") || t.includes("snippet")) return "Code2";
  if (t.includes("time") || t.includes("latency") || t.includes("speed")) return "Timer";
  if (t.includes("model") || t.includes("ai") || t.includes("ml") || t.includes("inference") || t.includes("claude")) return "Brain";
  if (t.includes("clou") || t.includes("aws") || t.includes("gcp") || t.includes("azure") || t.includes("deploy")) return "Cloud";
  if (t.includes("graph") || t.includes("chart") || t.includes("metric") || t.includes("stat")) return "BarChart3";
  if (t.includes("warn") || t.includes("error") || t.includes("danger") || t.includes("debug") || t.includes("bug")) return "TriangleAlert";
  if (t.includes("idea") || t.includes("lesson") || t.includes("learn")) return "Lightbulb";
  if (t.includes("flow") || t.includes("pipe") || t.includes("process")) return "Workflow";
  if (t.includes("layer") || t.includes("stack")) return "Layers";
  if (t.includes("config") || t.includes("setting") || t.includes("option")) return "Settings";
  if (t.includes("link") || t.includes("share") || t.includes("integration")) return "Share2";
  return "Sparkles";
}

function staticImageContent(
  sceneNumber: number,
  fallback: string,
  imageByScene?: Map<number, string>
): string {
  const p = imageByScene?.get(sceneNumber);
  if (!p) return fallback;
  const idx = p.lastIndexOf("/public/");
  if (idx >= 0) return p.slice(idx + "/public/".length);
  return p;
}

function sceneIconName(scene: {
  headline: string;
  body: string;
}): RemotionLucideIconName {
  return pickIcon(`${scene.headline} ${scene.body}`);
}

export function buildYoutubeRemotionSpecFromBrandedScenes(
  sceneSpec: BrandedSceneSpec,
  script: Script,
  options?: {
    imageByScene?: Map<number, string>;
    orientation?: RemotionOrientation;
  }
): RemotionSpecGeneration {
  const orientation = options?.orientation ?? "LANDSCAPE";
  const dims = dimsForOrientation(orientation);
  const portrait = orientation === "PORTRAIT";
  let fromFrame = 0;

  const scenes: RemotionSpecGeneration["scenes"] = sceneSpec.scenes.map((scene) => {
    const scriptScene = script.scenes.find(
      (s) => s.sceneNumber === scene.sceneNumber
    );
    const sceneStartSecond = scriptScene?.startSecond ?? 0;
    const durationInFrames = toFrames(
      sceneDurationSecondsFromScript(script, scene.sceneNumber)
    );
    const primaryFocus = scene.focusBeats[0]?.target;
    const emphasisAnimation = chooseAnimationForTarget(primaryFocus);
    const diagramBeats = buildDiagramBeats(
      scene.focusBeats,
      sceneStartSecond,
      durationInFrames
    );

    const listItemsForScene = (scene.listItems ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const listBeats =
      listItemsForScene.length > 0
        ? buildListBeats(
            scene.focusBeats,
            sceneStartSecond,
            durationInFrames,
            listItemsForScene,
            scriptScene?.narration?.trim() ?? ""
          )
        : [];

    const leftTextX = portrait ? 64 : 116;
    const rightTextX = portrait ? 64 : 1044;
    const visualLeftX = portrait ? 48 : 92;
    const visualRightX = portrait ? 48 : 726;
    const topY = portrait ? 140 : 130;

    /**
     * Visual-element priority (per design):
     *   1. Downloaded reference image (logos, product shots, real photos) —
     *      whenever one exists for this scene we use it. Pictures of the actual
     *      thing beat any abstract diagram for an explainer video.
     *   2. React-drawn diagram (`SpecDiagram`) — clean Linear-style tiles, used
     *      when the LLM emitted a parseable mermaid flow AND no image was
     *      downloaded for the scene.
     *   3. Raw Mermaid render — only when neither image nor a parseable graph
     *      is available, attached as `fallbackImageUrl` on the mermaid element.
     */
    const downloadedImage = staticImageContent(
      scene.sceneNumber,
      "",
      options?.imageByScene
    );
    const mermaidParseable =
      !!scene.diagramMermaid &&
      (() => {
        const parsed = parseMermaidFlowchart(scene.diagramMermaid);
        return !!(parsed && parsed.nodes.length > 0 && parsed.nodes.length <= 24);
      })();

    /**
     * Diagram beats the image when the LLM specifically authored a labelled
     * walkthrough — see `diagramWinsForScene`. Otherwise the downloaded
     * image wins.
     */
    const diagramWins = diagramWinsForScene(
      scene.template,
      scene.focusBeats,
      mermaidParseable
    );
    const preferImage = downloadedImage.length > 0 && !diagramWins;

    const sceneIcon = sceneIconName(scene);

    const visualElement: RemotionElement = preferImage
      ? {
          type: "image",
          content: downloadedImage,
          iconName: null,
          width: null,
          height: null,
          x: visualRightX,
          y: 180,
          animation: emphasisAnimation,
        }
      : scene.diagramMermaid
        ? {
            type: "mermaid",
            content: scene.diagramMermaid,
            iconName: null,
            /* null lets the renderer fill the available pane (its defaults are
             * larger than what we used to hardcode here). */
            width: null,
            height: null,
            x: visualRightX,
            y: 156,
            animation: emphasisAnimation,
            fallbackImageUrl:
              downloadedImage.length > 0 ? downloadedImage : null,
            diagramBeats: diagramBeats.length > 0 ? diagramBeats : undefined,
          }
        : scene.codeSnippet
          ? {
              type: "code",
              content: scene.codeSnippet,
              iconName: null,
              width: null,
              height: null,
              x: visualRightX,
              y: 182,
              animation: emphasisAnimation,
            }
          : {
              type: "image",
              content: staticImageContent(
                scene.sceneNumber,
                scene.imageSearchQuery ?? "",
                options?.imageByScene
              ),
              iconName: null,
              width: null,
              height: null,
              x: visualRightX,
              y: 180,
              animation: emphasisAnimation,
            };

    const textElement: RemotionElement = {
      type: "text",
      content: listContent(scene.headline, scene.body, scene.listItems ?? []),
      /* Render the icon INLINE next to the headline (handled by SpecText) so
       * the layout stays a clean two-column without floating badges. */
      iconName: sceneIcon,
      width: null,
      height: null,
      x: leftTextX,
      y: topY,
      animation:
        primaryFocus === "body" || primaryFocus === "list" ? "highlight" : "fade",
      listBeats: listBeats.length > 0 ? listBeats : undefined,
    };

    const sceneOut: RemotionSpecGeneration["scenes"][number] = {
      fromFrame,
      durationInFrames,
      background:
        "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(217, 124, 117, 0.05) 0%, transparent 60%), linear-gradient(180deg, #1a1614 0%, #141110 100%)",
      layoutPreset: "free",
      elements: [],
    };

    switch (scene.template) {
      case "left_diagram_right_text":
        sceneOut.layoutPreset = "split_canvas_left_text_right";
        sceneOut.elements = [
          { ...visualElement, x: visualLeftX, y: 166 },
          { ...textElement, x: rightTextX, y: 148 },
        ];
        break;
      case "right_diagram_left_text":
        sceneOut.layoutPreset = "split_text_left_canvas_right";
        sceneOut.elements = [
          { ...textElement, x: leftTextX, y: 148 },
          { ...visualElement, x: visualRightX, y: 166 },
        ];
        break;
      case "list":
        sceneOut.layoutPreset = "title_hero_and_canvas";
        sceneOut.elements = [
          {
            ...textElement,
            x: 118,
            y: 124,
            content: listContent(scene.headline, scene.body, scene.listItems),
            animation: emphasisAnimation,
          },
        ];
        break;
      case "image_hero":
        sceneOut.layoutPreset = "title_hero_and_canvas";
        sceneOut.elements = [
          {
            ...textElement,
            x: 120,
            y: 88,
            content: scene.headline,
          },
          {
            type: "image",
            content: staticImageContent(
              scene.sceneNumber,
              scene.imageSearchQuery ?? "",
              options?.imageByScene
            ),
            iconName: null,
            width: null,
            height: null,
            x: 180,
            y: 224,
            animation: emphasisAnimation,
          },
        ];
        break;
      case "image_left":
        sceneOut.layoutPreset = "split_canvas_left_text_right";
        sceneOut.elements = [
          {
            type: "image",
            content: staticImageContent(
              scene.sceneNumber,
              scene.imageSearchQuery ?? "",
              options?.imageByScene
            ),
            iconName: null,
            width: null,
            height: null,
            x: 102,
            y: 182,
            animation: emphasisAnimation,
          },
          {
            ...textElement,
            x: rightTextX,
            y: 170,
          },
        ];
        break;
      case "image":
        sceneOut.layoutPreset = "diagram_focus_sidebar";
        sceneOut.elements = [
          {
            type: "image",
            content: staticImageContent(
              scene.sceneNumber,
              scene.imageSearchQuery ?? "",
              options?.imageByScene
            ),
            iconName: null,
            width: null,
            height: null,
            x: 170,
            y: 190,
            animation: emphasisAnimation,
          },
          {
            ...textElement,
            x: 1210,
            y: 176,
            content: `${scene.headline}\n\n${scene.body}`,
          },
        ];
        break;
      case "code_focus":
        sceneOut.layoutPreset = "code_and_callouts";
        sceneOut.elements = [
          {
            type: "code",
            content: scene.codeSnippet ?? "// explain key code path here",
            iconName: null,
            width: null,
            height: null,
            x: 110,
            y: 236,
            animation: emphasisAnimation,
          },
          {
            ...textElement,
            x: 1128,
            y: 210,
          },
        ];
        break;
      case "stat_callout":
        sceneOut.layoutPreset = "title_hero_and_canvas";
        sceneOut.elements = [
          {
            ...textElement,
            x: 200,
            y: 140,
            content: `${scene.headline}\n\n${scene.body}`,
          },
        ];
        break;
      case "quote":
        sceneOut.layoutPreset = "title_hero_and_canvas";
        sceneOut.elements = [
          {
            ...textElement,
            x: 160,
            y: 200,
            content: `${scene.headline}\n\n${scene.body}`,
          },
        ];
        break;
      default:
        sceneOut.elements = [
          {
            ...textElement,
            x: leftTextX,
            y: topY,
          },
          {
            ...visualElement,
            x: visualRightX,
            y: 166,
          },
        ];
    }

    fromFrame += durationInFrames;
    return sceneOut;
  });

  const compositionPlacement: RemotionElementPlacement = "canvas_absolute";

  return {
    composition: {
      width: dims.width,
      height: dims.height,
      fps: FPS,
      durationInFrames: fromFrame,
      elementPlacement: compositionPlacement,
    },
    scenes,
  };
}
