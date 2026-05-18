/**
 * Scene layout presets — LLM picks one per scene; renderer shows a small badge only.
 * Coordinate cookbooks keep placements consistent without changing the coordinate model.
 */
export const REMOTION_LAYOUT_PRESETS = [
  "free",
  "title_hero_and_canvas",
  "diagram_focus_sidebar",
  "split_compare",
  "split_text_left_canvas_right",
  "split_canvas_left_text_right",
  "split_dual_figure",
  "code_and_callouts",
  "timeline_or_strip",
] as const;

export type RemotionLayoutPresetId = (typeof REMOTION_LAYOUT_PRESETS)[number];

export function normalizeLayoutPreset(value: unknown): RemotionLayoutPresetId {
  if (
    typeof value === "string" &&
    (REMOTION_LAYOUT_PRESETS as readonly string[]).includes(value)
  ) {
    return value as RemotionLayoutPresetId;
  }
  return "free";
}

/** Injected into Remotion spec generation prompt */
export const REMOTION_LAYOUT_PRESET_PROMPT = `
LAYOUT PRESETS (every scene MUST include layoutPreset — pick one; avoid "free" unless nothing else fits):

- free: Rare escape hatch. Still obey safe area x∈[72,1820], y∈[56,1020]. Prefer snapping x/y to multiples of 24.

- title_hero_and_canvas: Title slide + big canvas.
  • Hero title text: x≈96–1320, y≈64–128 (large, short line).
  • Subtitle/lead: same column, y≈148–220.
  • Primary diagram or mermaid: x≈110–1380, y≈260–940; mermaid viewport often width≈1180–1560, height≈560–820.
  • Secondary icons/callouts only x≥1390 (right rail), stagger y by ≥110px.

- diagram_focus_sidebar: One dominant diagram/code block + slim sidebar.
  • Main mermaid/code/image-of-diagram: x≈88–1220, y≈200–920; mermaid width≈1120–1460, height≈540–780.
  • Sidebar icons + short labels: x≈1260–1820, vertical stack with Δy≥112.

- split_compare: Two parallel columns (concepts A vs B).
  • Left pane elements: x∈[88,880]; right pane: x∈[1040,1820].
  • Column titles at y≈72–168 per side; body starts y≥220. Keep center gutter ~880–1040 mostly empty (optional small "vs" text only).

- split_text_left_canvas_right: Pair with composition elementPlacement split_text_left_window_right.
  • Exactly TWO elements per scene: [0] copy column (type text): headline optional + markdown lists (\`- item\` / \`* item\` / \`• item\` bullets or \`1. step\` numbered); [1] diagram or code (mermaid/code/image).
  • x/y ignored by renderer — use placeholders.

- split_canvas_left_text_right: Pair with composition elementPlacement split_window_left_text_right.
  • Exactly TWO elements: [0] visual window on the LEFT, [1] text on the RIGHT.

- split_dual_figure: Pair with elementPlacement split_side_by_side_figures.
  • Exactly TWO figure-like elements (two mermaid diagrams, two code blocks, image+mermaid, etc.) — balanced 50/50 columns.

- code_and_callouts: Code is the hero.
  • Code block: x≈96–1040, y≈220–860 (maxWidth-friendly — avoid ultra-wide lines).
  • Explanatory icons/text panels: x≈1120–1780, Δy≥100 between stacked items.

- timeline_or_strip: Process / pipeline storytelling.
  • Primary horizontal band for nodes y≈380–540.
  • Place icons/circles along x≈140→1760 with spacing ≥160px; captions ±120–180px above/below the band (alternate to reduce collisions).

When using type "mermaid", align its box with the preset's diagram region and prefer animation "fade" or "highlight".

MERMAID — SIZE & SEQUENCING:
- Use generous width/height so architecture diagrams stay legible (many specs omit dimensions—renderer defaults are large).
- **Architecture beats**: prefer Mermaid over scattered icons whenever you are explaining **structure**, **layers**, **dependencies**, or **flows** between parts of a system.
- **System views**: flowcharts with subgraphs for services/data/clients; sequence/state diagrams when time/order matters.
- **Highlight the section that VO discusses**: on architecture **tours**, reuse one diagram across consecutive scenes; each scene shifts **which subgraph/nodes/edges** look "hot" (\`style\`, \`classDef\`/\`class\`, \`linkStyle\`) while other regions stay muted — narration and left-column copy should name that same section.
- **Lists inside shapes**: with HTML labels, node text may use line breaks, e.g. \`A["Title<br/>• Point one<br/>• Point two"]\` or stacked lines—keep each node concise.
- **Progressive sequences**: keep the **same** graph structure across consecutive scenes when narrating step-by-step; only update styling lines to move emphasis (avoid replacing the whole diagram each scene unless the architecture changes).

TYPOGRAPHY & DENSITY — renderer behaves like polished slides, not a terminal:
- Sans typography on-screen for types text/box/circle/arrow/icon captions/mermaid; monospace ONLY on elements where type === "code" (literal snippets).
- Type **text** supports **markdown-style lists** in \`content\`: each bullet line starts with \`- \`, \`* \`, or \`• \`; numbered lines with \`1. \` or \`1) \`. Optional title paragraph above a blank line, then the list.
- Write headings as Title Case or sentence case prose — avoid long ALL CAPS strings unless it's a deliberate billboard beat.
- Icon pairs render as compact horizontal rows (~340px wide). Avoid scattering icons diagonally: use FIXED x per rail (left column ~96–420 OR ~460–860; right ~1380–1820) and vertical spacing Δy of only 72–96 between sibling icons in the same rail so reads like a checklist.
`.trim();
