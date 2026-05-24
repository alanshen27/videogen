import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { RemotionLucideIconName, RemotionSpec } from "../../server/llm/schemas";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Binary,
  BookOpen,
  Brackets,
  Brain,
  CircleDot,
  CircleHelp,
  Clock,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileCode,
  FolderOpen,
  GitBranch,
  GitCommit,
  Globe,
  GraduationCap,
  Key,
  Layers,
  Lightbulb,
  Link,
  Lock,
  Network,
  Package,
  PieChart,
  Puzzle,
  ScrollText,
  Search,
  Server,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Terminal,
  Timer,
  TriangleAlert,
  User,
  Users,
  Wifi,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { Img, staticFile } from "remotion";
import {
  fireshipPaletteFor,
  specTokens,
  type FireshipPalette,
} from "./design";
import { SpecMermaid, type MermaidSceneEl } from "./MermaidBlock";
import { parseMermaidFlowchart, type ParsedGraph } from "./mermaid-parse";
import { SpecChart } from "./SpecChart";
import { SpecCodeBlock } from "./SpecCodeBlock";
import { SpecDiagram } from "./SpecDiagram";

/** Animated wipe under `**bold**` phrases — matches segfault coral accent. */
const highlightUnderlineGradient = `linear-gradient(90deg, ${specTokens.ink.accent} 0%, ${specTokens.ink.accentSoft} 80%, rgba(232, 167, 161, 0) 100%)`;

type LucideCmp = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}>;

const REMOTION_ICON_MAP: Record<RemotionLucideIconName, LucideCmp> = {
  Cpu,
  Database,
  Server,
  Cloud,
  Globe,
  Wifi,
  Layers,
  Package,
  GitBranch,
  GitCommit,
  Terminal,
  Code2,
  Brackets,
  Zap,
  Sparkles,
  Lightbulb,
  BookOpen,
  GraduationCap,
  Shield,
  Lock,
  Key,
  Users,
  User,
  ArrowRight,
  ArrowDown,
  ArrowUpRight,
  CircleDot,
  TriangleAlert,
  BarChart3,
  PieChart,
  Clock,
  Timer,
  Search,
  Settings,
  Wrench,
  FolderOpen,
  FileCode,
  Share2,
  Link,
  Brain,
  Puzzle,
  Network,
  Workflow,
  ScrollText,
  Binary,
};

export type SceneEl = RemotionSpec["scenes"][number]["elements"][number];

/** Flat Remotion elements use `type: union` (not a TS discriminated union) — use intersection to narrow. */
export type IconSceneEl = SceneEl & { type: "icon" };

const KNOWN_LUCIDE_LABELS = new Set<string>(
  Object.keys(REMOTION_ICON_MAP) as RemotionLucideIconName[]
);

/** Drop redundant "GitBranch …" prefixes matching iconName; hide raw component tokens. */
function sanitizeIconCaption(el: IconSceneEl): string | null {
  const raw = el.content?.trim();
  if (!raw) return null;
  let s = raw;
  const key = el.iconName;
  if (key && (s === key || s.startsWith(`${key} `))) {
    s = s === key ? "" : s.slice(key.length).trimStart();
  }
  if (!s) return null;
  if (KNOWN_LUCIDE_LABELS.has(s)) return null;
  return s;
}

function classifyText(content: string): "hero" | "lead" | "body" {
  const t = content.trim();
  const letters = t.replace(/[^a-zA-Z]/g, "");
  const mostlyUpper =
    letters.length > 12 && letters === letters.toUpperCase();
  if (mostlyUpper && t.length >= 14) return "hero";
  if (t.length > 72 || t.includes("\n")) return "body";
  return "lead";
}

/** Detects "stat callout" content — a short headline number / token plus an
 * optional caption underneath separated by a blank line. e.g.
 *   `10x\n\nfaster than baseline`
 *   `$2.4M\n\nARR after one quarter`
 *   `ZERO\n\nruntime dependencies`
 * We don't try to be clever — stats are short, the caption is the rest.
 */
function parseStatCallout(
  content: string
): { value: string; caption: string | null } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0 || firstLine.length > 14) return null;
  /* Allow digits, decimal points, common units / currency, ALL CAPS short words. */
  const numberLike = /^[\$\u20ac\u00a3]?\d+(?:[.,]\d+)?(?:[a-zA-Z%+]{1,4})?[+x]?$/.test(
    firstLine
  );
  const letters = firstLine.replace(/[^a-zA-Z]/g, "");
  const shortAllCaps =
    letters.length >= 3 &&
    letters.length <= 10 &&
    letters === letters.toUpperCase();
  if (!numberLike && !shortAllCaps) return null;
  const rest = trimmed.slice(firstLine.length).replace(/^\s+/, "");
  return { value: firstLine, caption: rest.length > 0 ? rest : null };
}

/** Detects "quote" content. Two accepted shapes:
 *   `“Some quote.”\n— Attribution`
 *   `> Some quote.\n— Attribution` (single `>` blockquote)
 */
function parseQuote(
  content: string
): { body: string; attribution: string | null } | null {
  const trimmed = content.trim();
  if (trimmed.length < 12) return null;

  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let body: string | null = null;
  let attribution: string | null = null;

  /* `>` blockquote form */
  if (lines[0].startsWith(">")) {
    const quoteLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith(">")) {
        quoteLines.push(line.replace(/^>\s?/, ""));
      } else {
        if (line.startsWith("—") || line.startsWith("-")) {
          attribution = line.replace(/^[—-]\s?/, "");
        }
      }
    }
    body = quoteLines.join(" ").trim();
  }

  /* Smart-quote form. The regex must skip the opening quote at index 0 —
   * otherwise it would match the opening glyph itself and produce an empty body. */
  if (
    !body &&
    (trimmed.startsWith("\u201c") ||
      trimmed.startsWith('"') ||
      trimmed.startsWith("\u2018"))
  ) {
    const rest = trimmed.slice(1);
    const closingMatch = /[\u201d"\u2019]/.exec(rest);
    if (closingMatch) {
      body = rest.slice(0, closingMatch.index).trim();
      const after = rest.slice(closingMatch.index + 1).trim();
      const attrMatch = /^[—-]\s?(.+)$/m.exec(after);
      if (attrMatch) attribution = attrMatch[1].trim();
    }
  }

  if (!body || body.length < 12) return null;
  return { body, attribution };
}

type TextTypo = {
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  letterSpacing: string;
  lineHeight: number;
  color: string;
  maxWidth: number;
};

function typoForVariant(variant: "hero" | "lead" | "body"): TextTypo {
  return variant === "hero"
    ? {
        fontSize: 78,
        fontWeight: 900,
        letterSpacing: "-0.045em",
        lineHeight: 1.02,
        color: specTokens.ink.primary,
        maxWidth: 1280,
      }
    : variant === "lead"
      ? {
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.16,
          color: specTokens.ink.primary,
          maxWidth: 980,
        }
      : {
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          lineHeight: 1.42,
          color: specTokens.ink.muted,
          maxWidth: 880,
        };
}

type ParsedTextBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

/** Markdown-style lists in type "text" — `- ` / `* ` / `• ` bullets; `1. ` / `1) ` ordered */
function parseTextBlocks(content: string): ParsedTextBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ParsedTextBlock[] = [];
  const bulletRe = /^\s*[-*•]\s+(.*)$/;
  const orderedRe = /^\s*\d+[.)]\s+(.*)$/;

  let paraBuf: string[] = [];
  let listBuf: string[] = [];
  let listKind: "ul" | "ol" | null = null;

  function flushPara() {
    if (paraBuf.length === 0) return;
    const text = paraBuf.join("\n").trimEnd();
    paraBuf = [];
    if (text) blocks.push({ kind: "paragraph", text });
  }

  function flushList() {
    if (!listKind || listBuf.length === 0) return;
    blocks.push({ kind: listKind, items: [...listBuf] });
    listBuf = [];
    listKind = null;
  }

  for (const line of lines) {
    const bullet = bulletRe.exec(line);
    const ordered = orderedRe.exec(line);

    if (bullet) {
      flushPara();
      if (listKind === "ol") flushList();
      listKind = "ul";
      listBuf.push(bullet[1]?.trim() ?? "");
      continue;
    }
    if (ordered) {
      flushPara();
      if (listKind === "ul") flushList();
      listKind = "ol";
      listBuf.push(ordered[1]?.trim() ?? "");
      continue;
    }

    flushList();
    if (line.trim() === "") {
      flushPara();
    } else {
      paraBuf.push(line);
    }
  }

  flushList();
  flushPara();

  return blocks.length > 0 ? blocks : [{ kind: "paragraph", text: content }];
}

/**
 * Word-by-word reveal for hero headlines. Every word is its own inline-block
 * span that fades + lifts in on a tiny per-word stagger (3 frames). Reads as
 * "the line is being spoken" rather than "the line was already there".
 *
 * Implementation notes:
 * - We split on whitespace to keep punctuation glued to words ("47ms,").
 * - Each word renders with `display: inline-block` so the transform is on
 *   the word itself, not the inline run. Single space between words is
 *   re-inserted as a plain text node so wrapping behaves normally.
 * - `**bold**` segments inside the headline get an animated coral
 *   underline-wipe drawn during the scene, NOT a synchronous fade. See
 *   `InlineHighlights` below.
 */
function KineticHeadline({
  text,
  fontSize,
  fontWeight = 700,
  letterSpacing,
  lineHeight,
  color,
  textShadow,
  fontFamily,
  startDelay = 4,
  perWord = 3,
}: {
  text: string;
  fontSize: number;
  fontWeight?: 400 | 500 | 600 | 700 | 800 | 900;
  letterSpacing?: string;
  lineHeight?: number;
  color?: string;
  textShadow?: string;
  fontFamily?: string;
  startDelay?: number;
  perWord?: number;
}) {
  const frame = useCurrentFrame();
  /* Tokenize: a token is either a `**bold span**` (possibly multi-word) or a
   * plain word. Bold segments stagger as one unit so the highlight reads as
   * one phrase, not three individually-revealed words. */
  type Token = { kind: "word" | "bold"; text: string };
  const tokens: Token[] = [];
  const boldRe = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > cursor) {
      for (const w of text.slice(cursor, m.index).split(/\s+/)) {
        if (w) tokens.push({ kind: "word", text: w });
      }
    }
    tokens.push({ kind: "bold", text: m[1] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    for (const w of text.slice(cursor).split(/\s+/)) {
      if (w) tokens.push({ kind: "word", text: w });
    }
  }

  return (
    <div
      style={{
        fontFamily,
        fontSize,
        fontWeight,
        letterSpacing,
        lineHeight,
        color,
        textShadow,
      }}
    >
      {tokens.map((tok, i) => {
        const start = startDelay + i * perWord;
        const opacity = interpolate(frame, [start, start + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: (t) => 1 - Math.pow(1 - t, 3),
        });
        const lift = interpolate(frame, [start, start + 12], [16, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: (t) => 1 - Math.pow(1 - t, 3),
        });
        const wipeStart = start + 6;
        const wipe =
          tok.kind === "bold"
            ? interpolate(frame, [wipeStart, wipeStart + 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: (t) => 1 - Math.pow(1 - t, 3),
              })
            : 0;
        return (
          <React.Fragment key={`${tok.text}-${i}`}>
            <span
              style={{
                position: "relative",
                display: "inline-block",
                opacity,
                transform: `translateY(${lift}px)`,
                willChange: "opacity, transform",
              }}
            >
              {tok.text}
              {tok.kind === "bold" ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: "-0.10em",
                    height: "0.10em",
                    width: `${wipe * 100}%`,
                    background: highlightUnderlineGradient,
                    borderRadius: 999,
                    transform: "translateZ(0)",
                  }}
                />
              ) : null}
            </span>
            {i < tokens.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Renders text with `**bold**` segments highlighted by an animated coral
 * underline-wipe. The wipe starts at `delayFrames` and draws across the
 * highlighted span over ~14 frames. Used by KineticHeadline + the lead body
 * paragraph so the LLM can call out a phrase without us hard-coding it.
 *
 * Returns plain text when no `**` markers are present, so it's safe to use
 * on every string in the headline path without overhead.
 */
function InlineHighlights({
  text,
  delayFrames,
}: {
  text: string;
  delayFrames: number;
}) {
  const frame = useCurrentFrame();
  if (!text.includes("**")) return <>{text}</>;

  /* Greedy split on bold markers — `a **b** c` → ["a ", "**b**", " c"]. */
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {parts.map((part, i) => {
        const m = /^\*\*([^*]+)\*\*$/.exec(part);
        if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
        const inner = m[1];
        const wipe = interpolate(
          frame,
          [delayFrames, delayFrames + 14],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: (t) => 1 - Math.pow(1 - t, 3),
          }
        );
        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              whiteSpace: "nowrap",
            }}
          >
            {inner}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                /* Sit the wipe right under the baseline of the text. */
                bottom: "-0.12em",
                height: "0.10em",
                width: `${wipe * 100}%`,
                /* Gradient terminates with a 16px taper so the leading edge
                 * looks like a marker stroke rather than a hard cut. */
                background: highlightUnderlineGradient,
                borderRadius: 999,
                transform: "translateZ(0)",
              }}
            />
          </span>
        );
      })}
    </>
  );
}

function FireshipBullet(_props: { palette: FireshipPalette }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "#d97c75",
        marginRight: 16,
        marginTop: 14,
        flex: "0 0 6px",
      }}
    />
  );
}

/**
 * List <li> that fades + lifts in on a per-index stagger. Sits on top of the
 * scene-level animation that the renderer already applies. Keeps lists from
 * appearing all-at-once which is the single biggest reason scenes felt static.
 */
function CascadeListItem({
  index,
  revealFromFrame,
  startDelay = 4,
  perItem = 5,
  gap = 0,
  children,
}: {
  index: number;
  /** When set (from voice-synced `listBeats`), item stays hidden until this frame. */
  revealFromFrame?: number;
  /** Frames to wait before the first item starts revealing. */
  startDelay?: number;
  /** Frames between item reveals. */
  perItem?: number;
  /** Extra `gap` between bullet and content (matches the original ol style). */
  gap?: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const start =
    revealFromFrame !== undefined
      ? revealFromFrame
      : startDelay + index * perItem;

  if (revealFromFrame !== undefined && frame < start) {
    return null;
  }
  const opacity = interpolate(frame, [start, start + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const lift = interpolate(frame, [start, start + 12], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap,
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      {children}
    </li>
  );
}

function listRevealFrameForIndex(
  listBeats: { fromFrame: number; itemIndex: number }[] | undefined,
  itemIndex: number
): number | undefined {
  if (!listBeats || listBeats.length === 0) return undefined;
  const exact = listBeats.find((b) => b.itemIndex === itemIndex);
  if (exact) return exact.fromFrame;
  const byOrder = listBeats[itemIndex];
  return byOrder?.fromFrame;
}

export function SpecText({ el }: { el: SceneEl }) {
  const listBeats = (
    el as SceneEl & {
      listBeats?: { fromFrame: number; itemIndex: number }[];
    }
  ).listBeats;

  /* Specialised renderers — stat callout + quote — catch high-signal short
   * content before the generic markdown/list parser runs. */
  const stat = parseStatCallout(el.content);
  if (stat) return <SpecStatCallout stat={stat} />;
  const quote = parseQuote(el.content);
  if (quote) return <SpecQuote quote={quote} />;

  const variant = classifyText(el.content);
  const typo = typoForVariant(variant);
  const blocks = parseTextBlocks(el.content);

  const hasList = blocks.some(
    (b) => b.kind === "ul" || b.kind === "ol"
  );
  const useStructured =
    hasList ||
    blocks.length > 1 ||
    (blocks.length === 1 &&
      blocks[0].kind === "paragraph" &&
      blocks[0].text.includes("\n"));

  const shadow =
    variant === "hero"
      ? specTokens.shadow.textHero
      : specTokens.shadow.text;

  void fireshipPaletteFor;

  const baseContainer: React.CSSProperties = {
    fontFamily: specTokens.sans,
    textShadow: shadow,
    overflowWrap: "break-word",
    wordBreak: "break-word",
    maxWidth: typo.maxWidth,
  };

  if (!useStructured) {
    const paragraphText =
      blocks[0]?.kind === "paragraph" ? blocks[0].text : el.content;
    /* Hero / lead variants get the word-by-word reveal. Long body copy
     * keeps the existing static render — staggering 30+ words feels like
     * a karaoke prompter, not narration. */
    if (variant === "hero" || variant === "lead") {
      return (
        <div
          style={{
            ...baseContainer,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <KineticHeadline
            text={paragraphText}
            fontFamily={specTokens.sans}
            fontSize={typo.fontSize}
            fontWeight={typo.fontWeight}
            letterSpacing={typo.letterSpacing}
            lineHeight={typo.lineHeight}
            color={typo.color}
            textShadow={shadow}
          />
        </div>
      );
    }
    return (
      <div
        style={{
          ...baseContainer,
          ...typo,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <InlineHighlights text={paragraphText} delayFrames={10} />
      </div>
    );
  }

  const listFontSize = Math.max(22, typo.fontSize - 4);
  const listLineHeight = 1.32;

  /* Whole text island is centred in the pane via `margin: auto`, but the
   * content inside flows left-aligned so paragraphs and lists read naturally. */
  return (
    <div
      style={{
        ...baseContainer,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        gap: hasList ? 28 : 18,
        color: typo.color,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      {blocks.map((block, i) => {
        if (block.kind === "paragraph") {
          const isFirst = i === 0;
          const headline =
            isFirst &&
            block.text.length <= 170 &&
            (hasList || blocks.length > 1 || block.text.split(" ").length <= 12);
          if (headline) {
            const headlineFs = Math.min(typo.fontSize + 22, 84);
            return (
              <KineticHeadline
                key={`p-${i}`}
                text={block.text}
                fontFamily={specTokens.display}
                fontWeight={700}
                fontSize={headlineFs}
                lineHeight={1.04}
                letterSpacing={"-0.035em"}
                color={specTokens.ink.primary}
                textShadow={specTokens.shadow.textHero}
              />
            );
          }
          return (
            <div
              key={`p-${i}`}
              style={{
                whiteSpace: "pre-line",
                fontWeight: typo.fontWeight,
                fontSize: typo.fontSize,
                lineHeight: typo.lineHeight,
                letterSpacing: typo.letterSpacing,
                color: typo.color,
              }}
            >
              <InlineHighlights text={block.text} delayFrames={14} />
            </div>
          );
        }

        if (block.kind === "ul") {
          return (
            <ul
              key={`ul-${i}`}
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                fontSize: listFontSize,
                fontWeight: 500,
                lineHeight: listLineHeight,
                color: typo.color,
                textAlign: "left",
              }}
            >
              {block.items.map((item, j) => (
                <CascadeListItem
                  key={j}
                  index={j}
                  revealFromFrame={listRevealFrameForIndex(listBeats, j)}
                  startDelay={listBeats ? 0 : 4}
                >
                  <FireshipBullet
                    palette={fireshipPaletteFor(`${item}:${j}`)}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <InlineHighlights
                      text={item}
                      delayFrames={
                        listRevealFrameForIndex(listBeats, j) ?? 8 + j * 5
                      }
                    />
                  </span>
                </CascadeListItem>
              ))}
            </ul>
          );
        }

        return (
          <ol
            key={`ol-${i}`}
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              counterReset: "fs-li",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontSize: listFontSize,
              fontWeight: 500,
              lineHeight: listLineHeight,
              color: typo.color,
              textAlign: "left",
            }}
          >
            {block.items.map((item, j) => {
              return (
                <CascadeListItem
                  key={j}
                  index={j}
                  revealFromFrame={listRevealFrameForIndex(listBeats, j)}
                  startDelay={listBeats ? 0 : 4}
                  gap={16}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      minWidth: 28,
                      paddingTop: 4,
                      fontFamily: specTokens.mono ?? specTokens.sans,
                      fontWeight: 500,
                      fontSize: Math.max(16, listFontSize - 8),
                      letterSpacing: "0",
                      color: "rgba(228, 228, 231, 0.55)",
                      fontVariantNumeric: "tabular-nums",
                      flex: "0 0 auto",
                    }}
                  >
                    {String(j + 1).padStart(2, "0")}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <InlineHighlights
                      text={item}
                      delayFrames={
                        listRevealFrameForIndex(listBeats, j) ?? 8 + j * 5
                      }
                    />
                  </span>
                </CascadeListItem>
              );
            })}
          </ol>
        );
      })}
    </div>
  );
}

/**
 * Try to split a stat string like "10x", "$2.4M", "4.8/5" into a numeric body
 * and a non-numeric tail. We only count up the numeric body and keep the tail
 * pinned for the entire reveal. Returns null when the value is purely textual
 * (e.g. "ZERO") — those use a fade reveal instead.
 */
function splitNumericStat(
  value: string
): { prefix: string; num: number; suffix: string; decimals: number } | null {
  const m = /^([^0-9\-]*)(-?\d+(?:[.,]\d+)?)(.*)$/.exec(value);
  if (!m) return null;
  const numText = m[2].replace(",", ".");
  const num = parseFloat(numText);
  if (!Number.isFinite(num)) return null;
  const decimals = numText.includes(".") ? numText.split(".")[1].length : 0;
  return { prefix: m[1], num, suffix: m[3], decimals };
}

/**
 * Cheap PRNG used to flicker digits during stat reveal. Deterministic given
 * (frame, idx) — same render produces same pixels, which keeps Remotion's
 * still-frame caching happy.
 */
function digitFlickerSeed(frame: number, idx: number): number {
  let x = (frame * 1103515245 + idx * 12345 + 12345) & 0x7fffffff;
  x ^= x >>> 13;
  x = (x * 1274126177) & 0x7fffffff;
  x ^= x >>> 16;
  return x;
}

/**
 * Replace digits in `value` with random digits during the early count-up
 * window so the stat reads like a slot-machine ticker. Once `progress >= 1`
 * (count-up done), we return `value` verbatim and settle.
 *
 * `progress` is 0..1; flicker is most aggressive at 0 and fades out by 1.
 */
function flickerDigits(value: string, frame: number, progress: number): string {
  if (progress >= 1) return value;
  /* Flicker density tapers from ~70% of digits early on to 0% at the end. */
  const density = (1 - progress) * 0.7;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c >= "0" && c <= "9") {
      const seed = digitFlickerSeed(frame, i);
      const flicker = (seed & 0xff) / 255 < density;
      out += flicker ? String((seed >> 8) % 10) : c;
    } else {
      out += c;
    }
  }
  return out;
}

function SpecStatCallout({
  stat,
}: {
  stat: { value: string; caption: string | null };
}) {
  const frame = useCurrentFrame();
  const parts = splitNumericStat(stat.value);

  /* Count-up runs over ~22 frames after a short hold. Pure-text stats
   * ("ZERO") instead fade in over the same window. */
  const t = interpolate(frame, [6, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (x) => 1 - Math.pow(1 - x, 3),
  });
  const rawValue = parts
    ? `${parts.prefix}${(parts.num * t).toFixed(parts.decimals)}${parts.suffix}`
    : stat.value;
  /* Flicker only applies to numeric stats and only during the count-up window. */
  const displayedValue = parts
    ? flickerDigits(rawValue, frame, t)
    : rawValue;
  const textOpacity = parts
    ? 1
    : interpolate(frame, [6, 26], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: (x) => 1 - Math.pow(1 - x, 3),
      });

  /* Caption holds back so the number lands first, then the line of context
   * underlines it — a deliberate two-beat reveal. */
  const captionStart = 28;
  const captionOpacity = interpolate(
    frame,
    [captionStart, captionStart + 12],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: (x) => 1 - Math.pow(1 - x, 3),
    }
  );
  const captionLift = interpolate(
    frame,
    [captionStart, captionStart + 14],
    [8, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: (x) => 1 - Math.pow(1 - x, 3),
    }
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 22,
        fontFamily: specTokens.sans,
        maxWidth: 980,
      }}
    >
      <div
        style={{
          fontFamily: specTokens.display,
          fontSize: 220,
          fontWeight: 700,
          lineHeight: 0.92,
          letterSpacing: "-0.055em",
          color: specTokens.ink.primary,
          textShadow: specTokens.shadow.textHero,
          background:
            "linear-gradient(180deg, #fafafa 0%, #e8a7a1 95%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          fontVariantNumeric: "tabular-nums",
          opacity: textOpacity,
        }}
      >
        {displayedValue}
      </div>
      {stat.caption ? (
        <div
          style={{
            fontSize: 36,
            fontWeight: 500,
            lineHeight: 1.22,
            letterSpacing: "-0.02em",
            color: specTokens.ink.muted,
            maxWidth: 760,
            opacity: captionOpacity,
            transform: `translateY(${captionLift}px)`,
          }}
        >
          {stat.caption}
        </div>
      ) : null}
    </div>
  );
}

/** Pull-quote layout — large body + soft-coral opening glyph + attribution rule. */
function SpecQuote({
  quote,
}: {
  quote: { body: string; attribution: string | null };
}) {
  const frame = useCurrentFrame();

  /* Three-beat reveal: opening glyph → body → attribution rule, each lifted
   * in on its own offset. Reads as a careful pull-quote, not a static plate. */
  const glyphIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const bodyIn = interpolate(frame, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const bodyLift = interpolate(frame, [6, 22], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const attrIn = interpolate(frame, [18, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const ruleScale = interpolate(frame, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 28,
        fontFamily: specTokens.sans,
        maxWidth: 980,
        position: "relative",
      }}
    >
      <span
        aria-hidden
        style={{
          fontFamily: specTokens.display,
          fontSize: 180,
          lineHeight: 0.7,
          color: "rgba(232, 167, 161, 0.38)",
          marginLeft: -8,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          opacity: glyphIn,
        }}
      >
        “
      </span>
      <div
        style={{
          fontFamily: specTokens.display,
          fontSize: 54,
          fontWeight: 600,
          lineHeight: 1.18,
          letterSpacing: "-0.028em",
          color: specTokens.ink.primary,
          textShadow: specTokens.shadow.textHero,
          marginTop: -32,
          opacity: bodyIn,
          transform: `translateY(${bodyLift}px)`,
        }}
      >
        {quote.body}
      </div>
      {quote.attribution ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 4,
            opacity: attrIn,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 32,
              height: 1,
              background: "rgba(232, 167, 161, 0.5)",
              transform: `scaleX(${ruleScale})`,
              transformOrigin: "left center",
            }}
          />
          <span
            style={{
              fontFamily: specTokens.mono,
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: specTokens.ink.accentSoft,
            }}
          >
            {quote.attribution}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function SpecCode({ el }: { el: SceneEl }) {
  /* Pull a leading ```lang fence hint out of the content if present. */
  const raw = el.content ?? "";
  const fenced = /^```([a-zA-Z0-9_+-]+)\n([\s\S]*?)\n```\s*$/.exec(raw.trim());
  const lang = fenced?.[1];
  const code = fenced ? fenced[2] : raw;
  return <SpecCodeBlock code={code} lang={lang} />;
}

export function SpecBox({ el }: { el: SceneEl }) {
  void fireshipPaletteFor;
  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-start",
        textAlign: "left",
        minWidth: 200,
        minHeight: 72,
        maxWidth: 520,
        padding: "16px 22px 16px 26px",
        boxSizing: "border-box",
        fontFamily: specTokens.sans,
        fontSize: 18,
        fontWeight: 500,
        color: specTokens.ink.primary,
        lineHeight: 1.28,
        overflowWrap: "break-word",
        wordBreak: "break-word",
        background: "rgba(217, 124, 117, 0.03)",
        border: "1px solid rgba(255, 248, 240, 0.1)",
        borderRadius: 8,
        letterSpacing: "-0.005em",
        overflow: "hidden",
      }}
    >
      {/* Coral accent rail down the left edge — a tiny hint of brand colour
       * without crossing into Fireship rainbow territory. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background:
            "linear-gradient(180deg, rgba(232, 167, 161, 0.9) 0%, rgba(217, 124, 117, 0.4) 100%)",
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>{el.content}</span>
    </div>
  );
}

export function SpecCircle({ el }: { el: SceneEl }) {
  const inner = 96;
  return (
    <div
      style={{
        width: inner,
        height: inner,
        borderRadius: "50%",
        boxSizing: "border-box",
        background: "rgba(217, 124, 117, 0.07)",
        border: "1px solid rgba(217, 124, 117, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: specTokens.mono,
        fontSize: 22,
        fontWeight: 500,
        color: "#e8a7a1",
        letterSpacing: "-0.01em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {el.content}
    </div>
  );
}

export function SpecArrow({ el }: { el: SceneEl }) {
  const label = el.content?.trim() || "Edge";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 12,
        maxWidth: 520,
      }}
    >
      <svg
        width={320}
        height={22}
        viewBox="0 0 320 22"
        aria-hidden
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="arrow-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(232, 167, 161, 0.28)" />
            <stop offset="100%" stopColor="rgba(232, 167, 161, 0.95)" />
          </linearGradient>
        </defs>
        <line
          x1="2"
          y1="11"
          x2="288"
          y2="11"
          stroke="url(#arrow-stroke)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <polygon
          points="306,11 286,2 286,20"
          fill="rgba(232, 167, 161, 0.95)"
        />
      </svg>
      <span
        style={{
          fontFamily: specTokens.sans,
          fontSize: 14,
          fontWeight: 500,
          color: specTokens.ink.muted,
          background: "rgba(217, 124, 117, 0.05)",
          border: "1px solid rgba(217, 124, 117, 0.35)",
          borderRadius: 6,
          padding: "6px 12px",
          maxWidth: 440,
          overflowWrap: "break-word",
          wordBreak: "break-word",
          lineHeight: 1.34,
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function SpecIcon({
  el,
  variant = "compact",
}: {
  el: IconSceneEl;
  /** `hero` fills split-screen / centered beats; `compact` stays narrow for canvas rails */
  variant?: "compact" | "hero";
}) {
  const rawName = el.iconName;
  const Icon =
    rawName != null && rawName in REMOTION_ICON_MAP
      ? REMOTION_ICON_MAP[rawName as RemotionLucideIconName]
      : CircleHelp;
  const cap = sanitizeIconCaption(el);
  void fireshipPaletteFor;

  const capLen = cap?.length ?? 0;

  if (variant === "hero") {
    const captionFontSize =
      capLen > 56 ? 24 : capLen > 40 ? 26 : capLen > 28 ? 28 : 30;
    const tile = 112;
    const iconPx = 52;

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 620,
          boxSizing: "border-box",
          padding: "26px 28px",
          borderRadius: 12,
          background: "transparent",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: tile,
            height: tile,
            flexShrink: 0,
            borderRadius: 10,
            background: "rgba(217, 124, 117, 0.07)",
            border: "1px solid rgba(217, 124, 117, 0.45)",
          }}
        >
          <Icon size={iconPx} strokeWidth={1.6} color="#e8a7a1" />
        </div>
        {cap ? (
          <span
            style={{
              fontFamily: specTokens.display,
              fontSize: captionFontSize,
              fontWeight: 600,
              color: specTokens.ink.primary,
              lineHeight: 1.18,
              flex: 1,
              minWidth: 0,
              overflowWrap: "break-word",
              wordBreak: "break-word",
              letterSpacing: "-0.02em",
            }}
          >
            {cap}
          </span>
        ) : null}
      </div>
    );
  }

  const captionFontSize =
    capLen > 52 ? 15 : capLen > 36 ? 16 : capLen > 24 ? 17 : 18;
  const tile = 56;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        maxWidth: 380,
        minWidth: 56,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: tile,
          height: tile,
          flexShrink: 0,
          borderRadius: 8,
          background: "rgba(217, 124, 117, 0.07)",
          border: "1px solid rgba(217, 124, 117, 0.4)",
        }}
      >
        <Icon size={26} strokeWidth={1.6} color="#e8a7a1" />
      </div>
      {cap ? (
        <span
          style={{
            fontFamily: specTokens.display,
            fontSize: captionFontSize,
            fontWeight: 500,
            color: specTokens.ink.primary,
            lineHeight: 1.28,
            flex: 1,
            minWidth: 0,
            overflowWrap: "break-word",
            wordBreak: "break-word",
            letterSpacing: "-0.005em",
          }}
        >
          {cap}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Resolve a stored content path or URL into something `<Img src>` accepts.
 * Local paths under `public/` become Remotion `staticFile` URLs; remote
 * URLs and absolute /-paths pass through unchanged.
 */
function resolveImageSrc(raw: string): string {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/public/")) return staticFile(raw.slice("/public/".length));
  if (raw.startsWith("public/")) return staticFile(raw.slice("public/".length));
  if (raw.startsWith("/")) return raw;
  return staticFile(raw);
}

export function SpecImage({ el }: { el: SceneEl }) {
  const raw = el.content?.trim() ?? "";
  /* Ordered fallback URLs attached by the spec builder. The renderer walks
   * this list on `<Img onError>` so a 404 on the primary doesn't leave the
   * scene blank — it just tries the next candidate. Only when every
   * candidate fails do we show the placeholder card. */
  const candidates = (el as SceneEl & { imageCandidates?: string[] })
    .imageCandidates;
  const allSources = React.useMemo(() => {
    return [raw, ...(candidates ?? [])].filter(
      (s): s is string => Boolean(s)
    );
  }, [raw, candidates]);
  const [srcIndex, setSrcIndex] = React.useState(0);
  const exhausted = srcIndex >= allSources.length;

  if (!raw || exhausted) {
    return (
      <div
        style={{
          width: 560,
          height: 340,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          color: specTokens.ink.subtle,
          fontFamily: specTokens.sans,
          fontSize: 13,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#15110f",
          padding: 24,
          textAlign: "center",
          lineHeight: 1.32,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        image unavailable
      </div>
    );
  }

  const currentRaw = allSources[srcIndex]!;
  const src = resolveImageSrc(currentRaw);

  /* Logos/screenshots/diagrams need to breathe — `contain` keeps the whole
   * asset visible (no cropping a logo in half). The dark backdrop reads well
   * for both transparent PNGs and photographs. */
  return (
    <div
      style={{
        position: "relative",
        width: 620,
        height: 380,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#15110f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img
        src={src}
        alt={currentRaw.slice(0, 120)}
        onError={() => setSrcIndex((i) => i + 1)}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "auto",
          objectFit: "contain",
        }}
      />
    </div>
  );
}

/**
 * Render LLM-authored inline SVG. The markup arrives already sanitized by
 * the server (allowlist of tags/attrs, no scripts). We wrap it in a sized
 * box and let the SVG's viewBox + preserveAspectRatio handle scaling.
 *
 * If the markup ends up empty (sanitizer rejected everything) we render a
 * neutral placeholder card instead of a missing element.
 */
export function SpecSvg({ el }: { el: SceneEl }) {
  const raw = el.content?.trim() ?? "";
  const width = el.width ?? 640;
  const height = el.height ?? 400;

  if (!raw || !raw.includes("<svg")) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          color: specTokens.ink.subtle,
          fontFamily: specTokens.sans,
          fontSize: 13,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#15110f",
          textAlign: "center",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        svg unavailable
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: specTokens.ink.primary,
      }}
      /* Markup is sanitized server-side via sanitizeInlineSvg() — only an
       * allowlist of tags/attrs survives, no scripts, no external refs. */
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  );
}

export function RenderSpecElement({
  el,
  iconVariant = "compact",
  availableWidth,
  availableHeight,
}: {
  el: SceneEl;
  iconVariant?: "compact" | "hero";
  /** Pane dimensions the renderer knows it has — diagrams use these to
   *  fit exactly without overflowing. Optional; renderers fall back to
   *  conservative defaults. */
  availableWidth?: number;
  availableHeight?: number;
}) {
  switch (el.type) {
    case "text":
      return <SpecText el={el} />;
    case "code":
      return <SpecCode el={el} />;
    case "box":
      return <SpecBox el={el} />;
    case "circle":
      return <SpecCircle el={el} />;
    case "arrow":
      return <SpecArrow el={el} />;
    case "image":
      return <SpecImage el={el} />;
    case "icon":
      return (
        <SpecIcon el={el as IconSceneEl} variant={iconVariant} />
      );
    case "mermaid":
      return (
        <SpecMermaidOrFallback
          el={el as MermaidSceneEl}
          availableWidth={availableWidth}
          availableHeight={availableHeight}
        />
      );
    case "chart":
      return <SpecChart content={el.content} />;
    case "svg":
      return <SpecSvg el={el} />;
    default:
      return null;
  }
}

/**
 * Render order for `type: "mermaid"`:
 *   1. React-drawn flowchart via SpecDiagram (Fireship look) — preferred.
 *   2. Stock image (`el.fallbackImageUrl`), if branded-scene-spec attached one.
 *   3. Mermaid runtime renderer — last resort, only if React parse fails AND no
 *      fallback image is available.
 */
function SpecMermaidOrFallback({
  el,
  availableWidth,
  availableHeight,
}: {
  el: MermaidSceneEl;
  availableWidth?: number;
  availableHeight?: number;
}) {
  const parsed: ParsedGraph | null = React.useMemo(
    () => parseMermaidFlowchart(el.content ?? ""),
    [el.content]
  );
  const beats = (el as MermaidSceneEl & {
    diagramBeats?: {
      fromFrame: number;
      durationInFrames: number;
      targets: string[];
    }[];
  }).diagramBeats;

  if (parsed && parsed.nodes.length > 0 && parsed.nodes.length <= 24) {
    /* Prefer the actual pane size handed down by VideoFromSpec. Fall back to
     * the (possibly stale) el.width/height, then to safe-small defaults so
     * the diagram never overflows. */
    const maxW = availableWidth ?? el.width ?? 720;
    const maxH = availableHeight ?? el.height ?? 460;
    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <SpecDiagram
          graph={parsed}
          maxWidth={maxW}
          maxHeight={maxH}
          beats={beats}
        />
      </div>
    );
  }

  const fallbackUrl = (el as MermaidSceneEl & { fallbackImageUrl?: string | null })
    .fallbackImageUrl;
  if (fallbackUrl && fallbackUrl.trim().length > 0) {
    return (
      <SpecImage
        el={
          {
            ...el,
            type: "image",
            content: fallbackUrl,
            iconName: null,
          } as SceneEl
        }
      />
    );
  }

  return <SpecMermaid el={el} />;
}
