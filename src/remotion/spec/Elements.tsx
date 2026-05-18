import React from "react";
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
import { SpecCodeBlock } from "./SpecCodeBlock";
import { SpecDiagram } from "./SpecDiagram";

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
        background: "#a5b4fc",
        marginRight: 16,
        marginTop: 14,
        flex: "0 0 6px",
      }}
    />
  );
}

export function SpecText({ el }: { el: SceneEl }) {
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
  const HeaderIcon =
    el.iconName && el.iconName in REMOTION_ICON_MAP
      ? REMOTION_ICON_MAP[el.iconName]
      : null;

  const baseContainer: React.CSSProperties = {
    fontFamily: specTokens.sans,
    textShadow: shadow,
    overflowWrap: "break-word",
    wordBreak: "break-word",
    maxWidth: typo.maxWidth,
  };

  if (!useStructured) {
    return (
      <div
        style={{
          ...baseContainer,
          ...typo,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {blocks[0]?.kind === "paragraph" ? blocks[0].text : el.content}
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
            const tile = Math.round(headlineFs * 0.82);
            return (
              <div
                key={`p-${i}`}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 18,
                  marginBottom: 4,
                }}
              >
                {HeaderIcon ? (
                  <div
                    style={{
                      flexShrink: 0,
                      width: tile,
                      height: tile,
                      borderRadius: 10,
                      background: "rgba(99, 102, 241, 0.06)",
                      border: "1px solid rgba(129, 140, 248, 0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 6,
                    }}
                  >
                    <HeaderIcon
                      size={Math.round(tile * 0.52)}
                      strokeWidth={1.6}
                      color="#c7d2fe"
                    />
                  </div>
                ) : null}
                <div
                  style={{
                    fontFamily: specTokens.display,
                    fontWeight: 700,
                    fontSize: headlineFs,
                    lineHeight: 1.04,
                    letterSpacing: "-0.035em",
                    color: specTokens.ink.primary,
                    textShadow: specTokens.shadow.textHero,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {block.text}
                </div>
              </div>
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
              {block.text}
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
                <li
                  key={j}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    lineHeight: listLineHeight,
                  }}
                >
                  <FireshipBullet
                    palette={fireshipPaletteFor(`${item}:${j}`)}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>{item}</span>
                </li>
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
                <li
                  key={j}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                  }}
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
                  <span style={{ flex: 1, minWidth: 0 }}>{item}</span>
                </li>
              );
            })}
          </ol>
        );
      })}
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
        justifyContent: "center",
        textAlign: "center",
        minWidth: 200,
        minHeight: 72,
        maxWidth: 520,
        padding: "16px 22px",
        boxSizing: "border-box",
        fontFamily: specTokens.sans,
        fontSize: 18,
        fontWeight: 500,
        color: specTokens.ink.primary,
        lineHeight: 1.28,
        overflowWrap: "break-word",
        wordBreak: "break-word",
        background: "transparent",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 8,
        letterSpacing: "-0.005em",
      }}
    >
      {el.content}
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
        background: "rgba(99, 102, 241, 0.06)",
        border: "1px solid rgba(129, 140, 248, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: specTokens.mono,
        fontSize: 22,
        fontWeight: 500,
        color: "#c7d2fe",
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
        gap: 10,
        maxWidth: 520,
      }}
    >
      <svg
        width={260}
        height={20}
        viewBox="0 0 260 20"
        aria-hidden
        style={{ overflow: "visible" }}
      >
        <line
          x1="2"
          y1="10"
          x2="232"
          y2="10"
          stroke="rgba(129, 140, 248, 0.65)"
          strokeWidth="1.25"
        />
        <polygon
          points="246,10 232,4 232,16"
          fill="rgba(129, 140, 248, 0.65)"
        />
      </svg>
      <span
        style={{
          fontFamily: specTokens.sans,
          fontSize: 14,
          fontWeight: 500,
          color: specTokens.ink.muted,
          backgroundColor: "transparent",
          border: "1px solid rgba(255, 255, 255, 0.09)",
          borderRadius: 6,
          padding: "6px 10px",
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
            background: "rgba(99, 102, 241, 0.06)",
            border: "1px solid rgba(129, 140, 248, 0.4)",
          }}
        >
          <Icon size={iconPx} strokeWidth={1.6} color="#c7d2fe" />
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
          background: "rgba(99, 102, 241, 0.06)",
          border: "1px solid rgba(129, 140, 248, 0.35)",
        }}
      >
        <Icon size={26} strokeWidth={1.6} color="#c7d2fe" />
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

export function SpecImage({ el }: { el: SceneEl }) {
  const raw = el.content?.trim() ?? "";
  const [broken, setBroken] = React.useState(false);

  if (!raw || broken) {
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
          background: "#0a0a0c",
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

  const src = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : raw.startsWith("/public/")
      ? staticFile(raw.slice("/public/".length))
      : raw.startsWith("public/")
        ? staticFile(raw.slice("public/".length))
        : raw.startsWith("/")
          ? raw
          : staticFile(raw);

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
        background: "#0a0a0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img
        src={src}
        alt={raw.slice(0, 120)}
        onError={() => setBroken(true)}
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

export function RenderSpecElement({
  el,
  iconVariant = "compact",
}: {
  el: SceneEl;
  iconVariant?: "compact" | "hero";
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
      return <SpecMermaidOrFallback el={el as MermaidSceneEl} />;
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
function SpecMermaidOrFallback({ el }: { el: MermaidSceneEl }) {
  const parsed: ParsedGraph | null = React.useMemo(
    () => parseMermaidFlowchart(el.content ?? ""),
    [el.content]
  );

  if (parsed && parsed.nodes.length > 0 && parsed.nodes.length <= 24) {
    const maxW = el.width ?? 900;
    const maxH = el.height ?? 540;
    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <SpecDiagram graph={parsed} maxWidth={maxW} maxHeight={maxH} />
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
