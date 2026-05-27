import { z } from "zod";
import { REMOTION_LAYOUT_PRESETS } from "./layout-presets";

export const PlanSchema = z.object({
  title: z.string(),
  angle: z.string(),
  targetAudience: z.string(),
  learningObjectives: z.array(z.string()),
  sceneCount: z.number().int().positive(),
  estimatedDuration: z.number().positive(),
});

export const SceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  startSecond: z.number(),
  endSecond: z.number(),
  narration: z.string(),
  visualDescription: z.string(),
  codeSnippet: z.string().nullable(),
  animationType: z.enum([
    "code",
    "array",
    "graph",
    "memory",
    "terminal",
    "diagram",
    "analogy",
  ]),
});

export const ScriptSchema = z.object({
  title: z.string(),
  hook: z.string(),
  fullNarration: z.string(),
  scenes: z.array(SceneSchema),
});

/** Curated Lucide React exports (PascalCase) — renderer resolves via lucide-react */
export const LucideIconNameSchema = z.enum([
  "Cpu",
  "Database",
  "Server",
  "Cloud",
  "Globe",
  "Wifi",
  "Layers",
  "Package",
  "GitBranch",
  "GitCommit",
  "Terminal",
  "Code2",
  "Brackets",
  "Zap",
  "Sparkles",
  "Lightbulb",
  "BookOpen",
  "GraduationCap",
  "Shield",
  "Lock",
  "Key",
  "Users",
  "User",
  "ArrowRight",
  "ArrowDown",
  "ArrowUpRight",
  "CircleDot",
  "TriangleAlert",
  "BarChart3",
  "PieChart",
  "Clock",
  "Timer",
  "Search",
  "Settings",
  "Wrench",
  "FolderOpen",
  "FileCode",
  "Share2",
  "Link",
  "Brain",
  "Puzzle",
  "Network",
  "Workflow",
  "ScrollText",
  "Binary",
]);

export type RemotionLucideIconName = z.infer<typeof LucideIconNameSchema>;

export const REMOTION_LUCIDE_ICON_NAMES = LucideIconNameSchema.options;

const animEnum = z.enum(["fade", "slide", "scale", "highlight", "none"]);

/** Names of SFX cues the renderer knows. Must match files under
 * `public/audio/sfx/<name>.mp3`. Adding a new cue means adding the file. */
export const SfxNameSchema = z.enum([
  "whoosh",
  "ding",
  "type",
  "pop",
  "thunk",
]);

/** Named music loops under `public/audio/music/<name>.mp3`. */
export const MusicNameSchema = z.enum([
  "lofi",
  "upbeat",
  "ambient",
]);

/** Per-scene transition into this scene. "cut" is the no-op default. */
export const SceneTransitionSchema = z.enum([
  "cut",
  "fade",
  "push_left",
  "push_up",
  "whip",
  "scale_down",
]);

export const RemotionLayoutPresetSchema = z.enum(REMOTION_LAYOUT_PRESETS);

/** How scene elements are laid out on screen */
export const RemotionElementPlacementSchema = z.enum([
  "canvas_absolute",
  "one_at_a_time_centered",
  /** elements[0] = copy column (left), elements[1] = diagram/code/image (right). Single-element scenes center full-width. */
  "split_text_left_window_right",
  /** elements[0] = diagram/code/image (left), elements[1] = copy (right). Single-element scenes center full-width. */
  "split_window_left_text_right",
  /** Two visuals side-by-side: elements[0] left pane, elements[1] right pane (mermaid, code, image, icons, etc.). */
  "split_side_by_side_figures",
]);

/**
 * Flat shape — OpenAI structured outputs forbid JSON Schema `oneOf` (used by z.discriminatedUnion).
 * Non-icon elements use `"iconName": null`; icons use a Lucide name from the allow-list.
 * Non-Mermaid elements use `"width": null` and `"height": null`; `mermaid` uses width/height for the diagram viewport (pixels). Prefer large dimensions (e.g. 1240×720 split; up to ~1560×820 hero); null uses renderer defaults (~1320×760).
 * For `type: "text"`, `content` may include markdown-style bullet or numbered lists (lines starting with `- `, `* `, `• `, or `1.` / `1)`).
 */
export const RemotionElementSchema = z.object({
  type: z.enum([
    "text",
    "code",
    "box",
    "arrow",
    "circle",
    "image",
    "icon",
    "mermaid",
    "chart",
    /**
     * `svg`: inline SVG markup. The LLM writes the SVG; the server runs it
     * through a strict allowlist sanitizer (no scripts, no event handlers,
     * no external refs). Use for hand-drawn-looking diagrams, sketch
     * illustrations, annotated arrows over icons, things that aren't a
     * Mermaid flowchart and aren't a stock photo.
     */
    "svg",
  ]),
  content: z.string(),
  iconName: z.union([LucideIconNameSchema, z.null()]),
  width: z.union([z.number(), z.null()]),
  height: z.union([z.number(), z.null()]),
  x: z.number(),
  y: z.number(),
  animation: animEnum,
  /**
   * Optional internal-only field set by the deterministic spec builder.
   *
   * For `mermaid` elements: a URL (or static path) the renderer can swap in
   * when Mermaid parsing fails. Priority order in the renderer:
   *   React-drawn flowchart (from `content`) → stock image (this) → Mermaid.
   *
   * Not produced by the LLM — `RemotionSpecGenerationSchema` covers this with
   * the rest of the optional fields. Always present; `null` means "no fallback".
   */
  fallbackImageUrl: z.union([z.string(), z.null()]).optional(),
  /**
   * Optional internal-only field — animated node highlights for `mermaid`
   * elements. The renderer reads `useCurrentFrame()` and applies the
   * matching beat's `targets` as the `active` emphasis set (everything else
   * becomes `muted` so the highlight pops). Frame numbers are SCENE-RELATIVE
   * (0 = scene start). Built by `branded-scene-spec` from
   * `BrandedScene.focusBeats` where `target === "diagram"`.
   */
  diagramBeats: z
    .array(
      z.object({
        fromFrame: z.number(),
        durationInFrames: z.number(),
        targets: z.array(z.string()),
      })
    )
    .optional(),
  /**
   * Optional internal-only field — staggered bullet reveals for `text`
   * elements. Frame numbers are SCENE-RELATIVE (0 = scene start). Built from
   * `BrandedScene.focusBeats` where `target === "list"`, or derived from
   * narration phrase alignment when beats are missing.
   */
  listBeats: z
    .array(
      z.object({
        fromFrame: z.number(),
        itemIndex: z.number().int().nonnegative(),
      })
    )
    .optional(),
  /**
   * Optional internal-only field — ordered fallback URLs for `image`
   * elements. The renderer tries `content` first, then walks this array
   * on each `<Img onError>`. Last resort: a designed placeholder card.
   * Server-set from the search/eval pipeline; not produced by the LLM.
   */
  imageCandidates: z.array(z.string()).optional(),
});

export const RemotionSceneSchema = z.object({
  fromFrame: z.number(),
  durationInFrames: z.number(),
  background: z.string(),
  /** Structural template — drives prompt cookbook + optional on-screen badge */
  layoutPreset: RemotionLayoutPresetSchema,
  elements: z.array(RemotionElementSchema),
  /** How to transition INTO this scene. "cut" is the default. Server-set,
   * not required from the LLM. */
  transition: SceneTransitionSchema.optional(),
  /** SFX cues fired during this scene. Each cue is scene-relative
   * (atFrame=0 is scene start). Files live under `public/audio/sfx/`. */
  sfx: z
    .array(
      z.object({
        name: SfxNameSchema,
        atFrame: z.number().int().nonnegative(),
        volume: z.number().min(0).max(1).optional(),
      })
    )
    .optional(),
});

/** Paths relative to Next/Remotion `public/` — use with Remotion `staticFile()` */
export const RemotionVoiceSegmentSchema = z.object({
  fromFrame: z.number(),
  durationInFrames: z.number(),
  staticPath: z.string(),
});

/** LLM output only — no `voice` (OpenAI structured outputs require every property in `required`; voice is added server-side). */
export const RemotionSpecGenerationSchema = z.object({
  composition: z.object({
    /** Landscape 1920×1080 OR portrait 1080×1920. */
    width: z.union([z.literal(1920), z.literal(1080)]),
    height: z.union([z.literal(1920), z.literal(1080)]),
    fps: z.literal(30),
    durationInFrames: z.number(),
    elementPlacement: RemotionElementPlacementSchema,
  }),
  scenes: z.array(RemotionSceneSchema),
});

export const RemotionSpecSchema = RemotionSpecGenerationSchema.extend({
  voice: z.array(RemotionVoiceSegmentSchema).optional(),
  /** Optional music bed spanning the whole composition. */
  music: z
    .object({
      name: MusicNameSchema,
      /** Linear volume [0,1]. Defaults to 0.12 — narration is the lead. */
      volume: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const MetadataSchema = z.object({
  /** Long-form / standard YouTube upload */
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  /** YouTube Shorts upload pack (hook title + #hashtag description) */
  shortsTitle: z.string(),
  /** Paste-ready Shorts description: hook line(s), blank line, then `#tag #tag` line */
  shortsDescription: z.string(),
  /** Same tags as in shortsDescription, without `#` prefix */
  hashtags: z.array(z.string()),
  thumbnailPrompt: z.string(),
  category: z.string(),
  language: z.string(),
});

export const BrandedSceneTemplateSchema = z.enum([
  "left_diagram_right_text",
  "right_diagram_left_text",
  "list",
  "image",
  "image_hero",
  "image_left",
  "code_focus",
  /** Big headline + supporting body — use when a single number/word is the point. */
  "stat_callout",
  /** Pull-quote layout — short body, optionally attributed. */
  "quote",
  /**
   * Inline SVG illustration on the left, narration text on the right.
   * Reach for this when a diagram isn't a flowchart and a stock photo would
   * feel generic: sketches, annotated arrows over icons, timeline drawings,
   * hand-drawn-style explainers. The SVG is in `inlineSvg`.
   */
  "svg_left",
  /** Inline SVG illustration as a hero (centered, large). */
  "svg_hero",
]);

export const SceneFocusModeSchema = z.enum([
  "highlight",
  "dim_others",
  "pulse",
  "zoom",
  "trace",
]);

export const SceneFocusTargetSchema = z.enum([
  "title",
  "body",
  "list",
  "diagram",
  "image",
  "code",
]);

export const SceneFocusBeatSchema = z.object({
  startSecond: z.number().nonnegative(),
  endSecond: z.number().positive(),
  target: SceneFocusTargetSchema,
  mode: SceneFocusModeSchema,
  /** Short on-screen cue for this beat (OpenAI structured outputs: required; use ""). */
  caption: z.string(),
  /** Mermaid node/class IDs for this beat (use [] when not applicable). */
  mermaidTargets: z.array(z.string()),
});

export const BrandedSceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  template: BrandedSceneTemplateSchema,
  headline: z.string(),
  body: z.string(),
  /** Use [] when the template does not use bullets. */
  listItems: z.array(z.string()),
  /** Raw Mermaid when using diagram templates; otherwise "". */
  diagramMermaid: z.string(),
  imageSearchQuery: z.string(),
  codeSnippet: z.string(),
  /**
   * Inline SVG markup for `svg_left` / `svg_hero` templates. Empty when
   * the template doesn't use SVG. The renderer sanitizes this server-side
   * (allowlist of tags/attrs, no scripts, no external refs) so the LLM can
   * emit creative drawings without becoming an XSS vector.
   *
   * The LLM should:
   *   - Use viewBox "0 0 800 500" (or similar landscape ratio)
   *   - Stick to vector primitives: path / circle / rect / line / polyline / text
   *   - Use the brand palette: stroke="#d97c75" for accents, stroke="#cfc8c2" for
   *     neutrals, fill="none" for outlines, no hard-coded brand colors of others.
   *   - Add labels via <text> with font-family="ui-sans-serif" font-size="20"
   *     fill="#f4ede5". Keep text in English.
   *   - No <script>, no <foreignObject>, no <image href="external">, no event
   *     handlers (on*).
   */
  inlineSvg: z.string(),
  focusBeats: z.array(SceneFocusBeatSchema),
});

export const BrandedSceneSpecSchema = z.object({
  visualStyle: z.string(),
  scenes: z.array(BrandedSceneSchema),
});

export type Plan = z.infer<typeof PlanSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type RemotionVoiceSegment = z.infer<typeof RemotionVoiceSegmentSchema>;
export type RemotionElementPlacement = z.infer<
  typeof RemotionElementPlacementSchema
>;
export type RemotionSpec = z.infer<typeof RemotionSpecSchema>;
export type VideoMetadata = z.infer<typeof MetadataSchema>;
export type BrandedSceneTemplate = z.infer<typeof BrandedSceneTemplateSchema>;
export type SceneFocusBeat = z.infer<typeof SceneFocusBeatSchema>;
export type BrandedSceneSpec = z.infer<typeof BrandedSceneSpecSchema>;
