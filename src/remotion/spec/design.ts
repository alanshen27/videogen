/**
 * Shared visual tokens for Remotion spec renders — Fireship-inspired palette.
 *
 * Direction: dense slides, bold display type, neon-leaning accents, gradient tiles,
 * tight gutters. Tune once here and the whole library reacts.
 */

const accentRing = "linear-gradient(135deg, #f97316 0%, #f43f5e 55%, #8b5cf6 100%)";
const accentGlow = "0 0 0 1px rgba(244, 63, 94, 0.35), 0 18px 40px rgba(244, 63, 94, 0.22)";

export type FireshipPaletteId =
  | "magenta"
  | "amber"
  | "cyan"
  | "lime"
  | "violet"
  | "rose"
  | "sky";

export type FireshipPalette = {
  id: FireshipPaletteId;
  /** Solid fill for hero tiles. */
  base: string;
  /** Gradient that wraps the tile. */
  gradient: string;
  /** Stroke / border accent. */
  ring: string;
  /** Glow shadow for tiles + diagrams. */
  glow: string;
  /** Foreground text color on the tile. */
  ink: string;
  /** Use for ALL-CAPS labels and stamps. */
  stamp: string;
};

/** Cycle these across scenes / icons for a Fireship checkerboard of colour. */
export const fireshipPalettes: FireshipPalette[] = [
  {
    id: "magenta",
    base: "#f43f5e",
    gradient: "linear-gradient(135deg, #fb7185 0%, #f43f5e 45%, #be123c 100%)",
    ring: "rgba(244, 63, 94, 0.55)",
    glow: "0 18px 42px rgba(244, 63, 94, 0.35)",
    ink: "#fff1f2",
    stamp: "#fecdd3",
  },
  {
    id: "amber",
    base: "#f59e0b",
    gradient: "linear-gradient(135deg, #fde047 0%, #f59e0b 45%, #c2410c 100%)",
    ring: "rgba(245, 158, 11, 0.55)",
    glow: "0 18px 42px rgba(245, 158, 11, 0.35)",
    ink: "#fff7ed",
    stamp: "#fde68a",
  },
  {
    id: "cyan",
    base: "#06b6d4",
    gradient: "linear-gradient(135deg, #67e8f9 0%, #06b6d4 45%, #0e7490 100%)",
    ring: "rgba(34, 211, 238, 0.55)",
    glow: "0 18px 42px rgba(34, 211, 238, 0.32)",
    ink: "#ecfeff",
    stamp: "#a5f3fc",
  },
  {
    id: "lime",
    base: "#84cc16",
    gradient: "linear-gradient(135deg, #bef264 0%, #65a30d 45%, #3f6212 100%)",
    ring: "rgba(132, 204, 22, 0.55)",
    glow: "0 18px 42px rgba(132, 204, 22, 0.32)",
    ink: "#f7fee7",
    stamp: "#d9f99d",
  },
  {
    id: "violet",
    base: "#8b5cf6",
    gradient: "linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 45%, #6d28d9 100%)",
    ring: "rgba(139, 92, 246, 0.55)",
    glow: "0 18px 42px rgba(139, 92, 246, 0.35)",
    ink: "#f5f3ff",
    stamp: "#ddd6fe",
  },
  {
    id: "rose",
    base: "#ec4899",
    gradient: "linear-gradient(135deg, #f9a8d4 0%, #ec4899 45%, #9d174d 100%)",
    ring: "rgba(236, 72, 153, 0.55)",
    glow: "0 18px 42px rgba(236, 72, 153, 0.34)",
    ink: "#fdf2f8",
    stamp: "#fbcfe8",
  },
  {
    id: "sky",
    base: "#0ea5e9",
    gradient: "linear-gradient(135deg, #7dd3fc 0%, #0ea5e9 45%, #0369a1 100%)",
    ring: "rgba(14, 165, 233, 0.55)",
    glow: "0 18px 42px rgba(14, 165, 233, 0.32)",
    ink: "#f0f9ff",
    stamp: "#bae6fd",
  },
];

export function fireshipPaletteAt(index: number): FireshipPalette {
  const i = ((index % fireshipPalettes.length) + fireshipPalettes.length) % fireshipPalettes.length;
  return fireshipPalettes[i];
}

/** Deterministic palette pick from any string (icon name, scene title, …). */
export function fireshipPaletteFor(key: string): FireshipPalette {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return fireshipPaletteAt(Math.abs(h));
}

export const specTokens = {
  /** Display / UI copy — Inter-leaning system stack. */
  sans:
    '"Inter", "Geist", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  /** Display face used at 600–800 weights (same family — tight tracking does the work). */
  display:
    '"Inter", "Geist", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  /** Mono — used for code, list numbers, technical primitives. */
  mono:
    '"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

  ink: {
    primary: "#fafafa",
    muted: "#d6d3d0",
    subtle: "#a09b96",
    /* Warm coral accent — matches the brand mark's curved L on the dark canvas.
     * Single accent, used sparingly. */
    accent: "#d97c75",
    accentSoft: "#e8a7a1",
    info: "#7dd3fc",
    warn: "#fcd34d",
    danger: "#fda4af",
  },

  surface: {
    code: "rgba(14, 12, 11, 0.85)",
    codeBorder: "rgba(255, 255, 255, 0.07)",
    card: "rgba(26, 22, 20, 0.6)",
    cardBorder: "rgba(255, 255, 255, 0.07)",
    pill: "rgba(217, 124, 117, 0.08)",
    iconTile: "rgba(217, 124, 117, 0.06)",
    iconTileBorder: "rgba(217, 124, 117, 0.35)",
  },

  shadow: {
    text: "0 1px 0 rgba(0,0,0,0.5)",
    textHero: "0 1px 0 rgba(0,0,0,0.55)",
    card: "0 0 0 1px rgba(255,255,255,0.05)",
    node: "none",
  },

  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },

  /** Accent strokes used for callouts / dividers. */
  accent: {
    ring: accentRing,
    glow: accentGlow,
  },

  /** Default page background — warm near-black canvas with a faint coral wash
   * up top, echoing the brand mark on a charcoal sheet. */
  pageBackground:
    "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(217, 124, 117, 0.05) 0%, transparent 60%), linear-gradient(180deg, #1a1614 0%, #141110 100%)",
} as const;

export type FireshipDesign = typeof specTokens;
