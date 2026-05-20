import React, { useId, useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  BarChart3,
  Binary,
  BookOpen,
  Brain,
  CircleDot,
  Clock,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileCode,
  Globe,
  Key,
  Layers,
  Lightbulb,
  Lock,
  Network,
  Package,
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
import { specTokens } from "./design";
import {
  layoutLayers,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  type ParsedGraph,
} from "./mermaid-parse";

/**
 * Warm-minimal palette: charcoal canvas, paper-white labels, single coral
 * accent for the active beat (echoes the brand mark on dark sheet). Hairline
 * borders, ghost tiles, no glows.
 */
const DIAGRAM = {
  tileBg: "transparent",
  tileBgActive: "rgba(217, 124, 117, 0.08)",
  tileBorder: "rgba(255, 248, 240, 0.10)",
  tileBorderActive: "rgba(217, 124, 117, 0.65)",
  tileBorderMuted: "rgba(255, 248, 240, 0.05)",
  iconColor: "#ece8e3",
  iconColorActive: "#e8a7a1",
  iconColorMuted: "rgba(236, 232, 227, 0.4)",
  labelColor: "#fafafa",
  labelColorMuted: "rgba(236, 232, 227, 0.5)",
  /* Used for the small "dot" / status indicator inside each tile. */
  dotDefault: "rgba(255, 248, 240, 0.25)",
  dotActive: "#d97c75",
  dotMuted: "rgba(255, 248, 240, 0.12)",
  edge: "rgba(255, 248, 240, 0.14)",
  edgeActive: "rgba(217, 124, 117, 0.7)",
  edgeMuted: "rgba(255, 248, 240, 0.07)",
  edgeLabelBg: "#15110f",
  edgeLabelBorder: "rgba(255, 248, 240, 0.09)",
  edgeLabelColor: "#ece8e3",
  /* Subgraph / group chrome — dashed hairline rectangle + tiny mono label */
  groupBorder: "rgba(255, 248, 240, 0.13)",
  groupBg: "rgba(255, 248, 240, 0.012)",
  groupLabelBg: "#14100e",
  groupLabelColor: "rgba(236, 232, 227, 0.65)",
} as const;

type LucideCmp = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  color?: string;
}>;

const ICONS: Record<string, LucideCmp> = {
  api: Server,
  server: Server,
  backend: Server,
  gateway: Network,
  network: Network,
  router: Network,
  cdn: Globe,
  internet: Globe,
  user: User,
  users: Users,
  client: Users,
  audience: Users,
  database: Database,
  db: Database,
  store: Database,
  storage: Database,
  table: Database,
  cache: Database,
  queue: Workflow,
  worker: Workflow,
  pipeline: Workflow,
  flow: Workflow,
  process: Workflow,
  cpu: Cpu,
  gpu: Cpu,
  compute: Cpu,
  inference: Brain,
  model: Brain,
  ai: Brain,
  ml: Brain,
  claude: Brain,
  llm: Brain,
  prompt: ScrollText,
  context: ScrollText,
  history: ScrollText,
  tokens: Binary,
  token: Binary,
  cloud: Cloud,
  aws: Cloud,
  gcp: Cloud,
  azure: Cloud,
  deploy: Cloud,
  auth: Lock,
  login: Lock,
  permission: Lock,
  security: Shield,
  policy: Shield,
  safety: Shield,
  filter: Shield,
  key: Key,
  search: Search,
  query: Search,
  find: Search,
  settings: Settings,
  config: Settings,
  options: Settings,
  wrench: Wrench,
  tools: Wrench,
  share: Share2,
  link: Share2,
  integration: Share2,
  package: Package,
  module: Package,
  service: Package,
  microservice: Package,
  layer: Layers,
  stack: Layers,
  code: Code2,
  snippet: Code2,
  function: Code2,
  fn: Code2,
  terminal: Terminal,
  shell: Terminal,
  cli: Terminal,
  file: FileCode,
  zap: Zap,
  fast: Zap,
  speed: Zap,
  latency: Timer,
  time: Clock,
  clock: Clock,
  metric: BarChart3,
  metrics: BarChart3,
  graph: BarChart3,
  stat: BarChart3,
  bug: TriangleAlert,
  error: TriangleAlert,
  warn: TriangleAlert,
  danger: TriangleAlert,
  alert: TriangleAlert,
  fail: TriangleAlert,
  idea: Lightbulb,
  lesson: Lightbulb,
  learn: BookOpen,
  book: BookOpen,
  doc: BookOpen,
  wifi: Wifi,
  spark: Sparkles,
  magic: Sparkles,
};

function pickIconForLabel(label: string): LucideCmp {
  const lower = label.toLowerCase();
  for (const [keyword, Icon] of Object.entries(ICONS)) {
    if (lower.includes(keyword)) return Icon;
  }
  return CircleDot;
}

/** Frames between layer reveals when the diagram cascades in. */
const LAYER_REVEAL_BASE = 6;
const LAYER_REVEAL_STEP = 6;

type Anchor = { x: number; y: number };
type Placed = {
  node: DiagramNode;
  Icon: LucideCmp;
  center: Anchor;
  width: number;
  height: number;
  left: number;
  top: number;
  inAnchor: Anchor;
  outAnchor: Anchor;
  /** Topological layer index — used to stagger the cascade reveal. */
  layer: number;
};

type LayoutResult = {
  placed: Map<string, Placed>;
  width: number;
  height: number;
};

/**
 * Intrinsic, content-driven layout — tiles get a natural size, layers/rows are
 * laid out with fixed gaps, then the canvas is sized to the resulting bounds.
 * Nothing stretched, nothing centered into wasted space.
 */
function computeLayout(graph: ParsedGraph): LayoutResult {
  const layers = layoutLayers(graph);
  const isLR = graph.direction === "LR";

  const tileW = 176;
  const tileH = 54;
  const colGap = isLR ? 78 : 28;
  const rowGap = isLR ? 22 : 64;

  const placed = new Map<string, Placed>();

  if (isLR) {
    layers.forEach((layerIds, layerIdx) => {
      const colX = layerIdx * (tileW + colGap);
      const layerHeight =
        layerIds.length * tileH + Math.max(0, layerIds.length - 1) * rowGap;

      layerIds.forEach((id, rowIdx) => {
        const node = graph.nodes.find((n) => n.id === id);
        if (!node) return;
        const top = rowIdx * (tileH + rowGap) - layerHeight / 2;
        const left = colX;
        const cy = top + tileH / 2;
        placed.set(id, {
          node,
          Icon: pickIconForLabel(node.label),
          center: { x: left + tileW / 2, y: cy },
          width: tileW,
          height: tileH,
          left,
          top,
          inAnchor: { x: left, y: cy },
          outAnchor: { x: left + tileW, y: cy },
          layer: layerIdx,
        });
      });
    });
  } else {
    layers.forEach((layerIds, layerIdx) => {
      const rowY = layerIdx * (tileH + rowGap);
      const layerWidth =
        layerIds.length * tileW + Math.max(0, layerIds.length - 1) * colGap;

      layerIds.forEach((id, colIdx) => {
        const node = graph.nodes.find((n) => n.id === id);
        if (!node) return;
        const left = colIdx * (tileW + colGap) - layerWidth / 2;
        const top = rowY;
        const cx = left + tileW / 2;
        placed.set(id, {
          node,
          Icon: pickIconForLabel(node.label),
          center: { x: cx, y: top + tileH / 2 },
          width: tileW,
          height: tileH,
          left,
          top,
          inAnchor: { x: cx, y: top },
          outAnchor: { x: cx, y: top + tileH },
          layer: layerIdx,
        });
      });
    });
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of placed.values()) {
    minX = Math.min(minX, p.left);
    minY = Math.min(minY, p.top);
    maxX = Math.max(maxX, p.left + p.width);
    maxY = Math.max(maxY, p.top + p.height);
  }
  /* Reserve a small extra band for edge labels — they sit between layers
   * and can extend ~70px above/below the midline. Without this the layout
   * bbox is tile-tight and labels overflow the diagram envelope. */
  const labelBand = 24;
  if (Number.isFinite(minX)) {
    minY -= labelBand;
    maxY += labelBand;
  } else {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  for (const p of placed.values()) {
    p.left -= minX;
    p.top -= minY;
    p.center = { x: p.center.x - minX, y: p.center.y - minY };
    p.inAnchor = { x: p.inAnchor.x - minX, y: p.inAnchor.y - minY };
    p.outAnchor = { x: p.outAnchor.x - minX, y: p.outAnchor.y - minY };
  }

  return {
    placed,
    width: maxX - minX,
    height: maxY - minY,
  };
}

type GroupBox = {
  group: DiagramGroup;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Wrap each subgraph's members in a single bounding rectangle with padding
 * for the label tag. Empty / single-node groups are still rendered — the
 * border is what signals "these belong together".
 */
function computeGroupBoxes(
  graph: ParsedGraph,
  layout: LayoutResult
): GroupBox[] {
  const padX = 22;
  const padTop = 30; // room for the label sitting on the top-left corner
  const padBottom = 18;

  const boxes: GroupBox[] = [];
  for (const group of graph.groups) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const id of group.nodeIds) {
      const p = layout.placed.get(id);
      if (!p) continue;
      minX = Math.min(minX, p.left);
      minY = Math.min(minY, p.top);
      maxX = Math.max(maxX, p.left + p.width);
      maxY = Math.max(maxY, p.top + p.height);
    }
    if (!Number.isFinite(minX)) continue;
    boxes.push({
      group,
      left: minX - padX,
      top: minY - padTop,
      width: maxX - minX + padX * 2,
      height: maxY - minY + padTop + padBottom,
    });
  }
  return boxes;
}

function edgePath(from: Anchor, to: Anchor, isLR: boolean): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (isLR) {
    const cx = Math.max(40, Math.abs(dx) * 0.45);
    return `M ${from.x} ${from.y} C ${from.x + cx} ${from.y}, ${to.x - cx} ${to.y}, ${to.x} ${to.y}`;
  }
  const cy = Math.max(40, Math.abs(dy) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + cy}, ${to.x} ${to.y - cy}, ${to.x} ${to.y}`;
}

function NodeTile({
  placed,
  revealStart,
  isLR,
}: {
  placed: Placed;
  revealStart: number;
  isLR: boolean;
}) {
  const { node, width, height, Icon } = placed;
  const radius =
    node.shape === "circle"
      ? Math.min(width, height) / 2
      : 8;

  const muted = node.emphasis === "muted";
  const active = node.emphasis === "active";
  const labelLines = node.label.split("\n");
  const iconSize = Math.round(height * 0.3);
  const dotColor = muted
    ? DIAGRAM.dotMuted
    : active
      ? DIAGRAM.dotActive
      : DIAGRAM.dotDefault;
  const iconColor = muted
    ? DIAGRAM.iconColorMuted
    : active
      ? DIAGRAM.iconColorActive
      : DIAGRAM.iconColor;

  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [revealStart, revealStart + 12],
    [0, muted ? 0.7 : 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: (t) => 1 - Math.pow(1 - t, 3),
    }
  );
  /* Slide in from the side the flow comes from (left for LR, top for TB). */
  const slideAxis = isLR ? "X" : "Y";
  const slide = interpolate(
    frame,
    [revealStart, revealStart + 14],
    [-14, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: (t) => 1 - Math.pow(1 - t, 3),
    }
  );

  return (
    <div
      style={{
        position: "absolute",
        left: placed.left,
        top: placed.top,
        width,
        height,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "0 14px 0 12px",
        boxSizing: "border-box",
        gap: 10,
        borderRadius: radius,
        background: active ? DIAGRAM.tileBgActive : DIAGRAM.tileBg,
        border: `1px solid ${
          active
            ? DIAGRAM.tileBorderActive
            : muted
              ? DIAGRAM.tileBorderMuted
              : DIAGRAM.tileBorder
        }`,
        opacity,
        transform: `translate${slideAxis}(${slide}px)`,
      }}
    >
      {/* Tiny status dot — the Pierre/diff signal that this is a node */}
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: dotColor,
        }}
      />
      <Icon size={iconSize} strokeWidth={1.6} color={iconColor} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          fontFamily: specTokens.sans,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          lineHeight: 1.2,
          fontSize: 14,
          fontVariantNumeric: "tabular-nums",
          color: muted ? DIAGRAM.labelColorMuted : DIAGRAM.labelColor,
        }}
      >
        {labelLines.map((line, i) => (
          <span
            key={i}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

function EdgeLine({
  edge,
  from,
  to,
  isLR,
  arrowId,
  arrowMutedId,
  arrowActiveId,
  revealStart,
}: {
  edge: DiagramEdge;
  from: Placed;
  to: Placed;
  isLR: boolean;
  arrowId: string;
  arrowMutedId: string;
  arrowActiveId: string;
  /** Frame to start drawing this edge on. */
  revealStart: number;
}) {
  const a = from.outAnchor;
  const b = to.inAnchor;
  const muted =
    from.node.emphasis === "muted" || to.node.emphasis === "muted";
  const active =
    !muted &&
    (from.node.emphasis === "active" || to.node.emphasis === "active");

  const stroke = muted
    ? DIAGRAM.edgeMuted
    : active
      ? DIAGRAM.edgeActive
      : DIAGRAM.edge;
  const baseDash = edge.style === "dotted" ? "6 6" : undefined;
  const widthPx = edge.style === "thick" ? 2 : 1.4;
  const markerEnd = `url(#${
    muted ? arrowMutedId : active ? arrowActiveId : arrowId
  })`;

  const labelMid = {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2 - (isLR ? 14 : 0) + (isLR ? 0 : 4),
  };

  /* Edge "draws" itself from source to target by walking strokeDashoffset
   * across an approximate path length. We over-estimate length once so the
   * draw never finishes too early; the cap clamps any overshoot. */
  const frame = useCurrentFrame();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const pathLen = Math.hypot(dx, dy) * 1.25 + 60;
  const drawT = interpolate(frame, [revealStart, revealStart + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const dashOffset = pathLen * (1 - drawT);
  const labelOpacity = interpolate(
    frame,
    [revealStart + 8, revealStart + 18],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  /* For dotted edges we keep the source dash pattern; the cascade only fires
   * on solid lines (drawing a dotted line with a dashOffset reveal looks odd
   * because the dashes lurch as they appear). */
  const useDraw = !baseDash && drawT < 1;

  return (
    <g>
      <path
        d={edgePath(a, b, isLR)}
        stroke={stroke}
        strokeWidth={widthPx}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={useDraw ? `${pathLen}` : baseDash}
        strokeDashoffset={useDraw ? dashOffset : undefined}
        markerEnd={drawT > 0.85 ? markerEnd : undefined}
        opacity={baseDash ? drawT : 1}
      />
      {edge.label ? (
        <g
          transform={`translate(${labelMid.x} ${labelMid.y})`}
          opacity={labelOpacity}
        >
          <rect
            x={-Math.min(edge.label.length * 4.2 + 12, 140) / 2}
            y={-10}
            rx={4}
            ry={4}
            width={Math.min(edge.label.length * 4.2 + 12, 140)}
            height={20}
            fill={DIAGRAM.edgeLabelBg}
            stroke={DIAGRAM.edgeLabelBorder}
            strokeWidth={1}
          />
          <text
            x={0}
            y={3}
            textAnchor="middle"
            fontFamily={specTokens.sans}
            fontSize={11}
            fontWeight={500}
            letterSpacing="-0.005em"
            fill={DIAGRAM.edgeLabelColor}
          >
            {edge.label.length > 26 ? `${edge.label.slice(0, 24)}…` : edge.label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

export type SpecDiagramBeat = {
  /** Scene-relative frame the beat starts on. */
  fromFrame: number;
  /** Length of the beat, in frames. */
  durationInFrames: number;
  /** Node IDs to highlight (`active`); everything else becomes `muted`. */
  targets: string[];
};

export type SpecDiagramProps = {
  graph: ParsedGraph;
  /** Optional maximum width — graph scales down if its intrinsic size exceeds this. */
  maxWidth?: number;
  /** Optional maximum height — graph scales down if its intrinsic size exceeds this. */
  maxHeight?: number;
  /**
   * Optional per-beat emphasis timeline. When provided, the renderer uses
   * `useCurrentFrame()` to flip the active node set as the scene advances,
   * driving the "highlight as we explain it" animation. Falls back to the
   * static emphasis from the parsed `class` directives when no beat is
   * active for the current frame.
   */
  beats?: SpecDiagramBeat[];
};

/**
 * Pick the beat that owns the current frame. Beats are sorted ascending by
 * `fromFrame`; we use the last one whose start is ≤ frame.
 */
function activeBeat(
  beats: SpecDiagramBeat[] | undefined,
  frame: number
): SpecDiagramBeat | undefined {
  if (!beats || beats.length === 0) return undefined;
  let pick: SpecDiagramBeat | undefined;
  for (const b of beats) {
    if (b.fromFrame <= frame) pick = b;
    else break;
  }
  if (!pick) return undefined;
  if (frame >= pick.fromFrame + pick.durationInFrames) {
    /* Hold the last beat through to the end of the scene so the highlight
     * doesn't snap back to "everything default" between beats. */
  }
  return pick;
}

/**
 * Minimal React/SVG flowchart renderer.
 *
 * The diagram floats on the scene background — no card, no border, no glow.
 * Tiles are auto-laid-out at a fixed natural size and the whole thing is
 * scaled (CSS transform) to fit `maxWidth`/`maxHeight` if needed. Centering
 * is handled by the parent pane.
 */
export function SpecDiagram({
  graph,
  maxWidth = 720,
  maxHeight = 440,
  beats,
}: SpecDiagramProps) {
  const uid = useId().replace(/:/g, "");
  const arrowId = `fs-arrow-${uid}`;
  const arrowMutedId = `fs-arrow-muted-${uid}`;
  const arrowActiveId = `fs-arrow-active-${uid}`;
  const frame = useCurrentFrame();

  /* Apply the active beat as a dynamic emphasis override:
   *   - Targets become `active`
   *   - Every other node becomes `muted` (so the active set pops)
   *   - The original `emphasis` from `class` directives is used as the base
   *     when there is no active beat.
   */
  const animatedGraph: ParsedGraph = useMemo(() => {
    const beat = activeBeat(beats, frame);
    if (!beat) return graph;
    const targets = new Set(beat.targets);
    return {
      ...graph,
      nodes: graph.nodes.map((n) => ({
        ...n,
        emphasis: targets.has(n.id) ? "active" : "muted",
      })),
    };
  }, [graph, beats, frame]);

  const layout = useMemo(() => computeLayout(animatedGraph), [animatedGraph]);
  const isLR = animatedGraph.direction === "LR";
  const groupBoxes = useMemo(
    () => computeGroupBoxes(animatedGraph, layout),
    [animatedGraph, layout]
  );

  /* Make sure group padding doesn't get clipped at the diagram edges. */
  let extraLeft = 0;
  let extraTop = 0;
  let extraRight = 0;
  let extraBottom = 0;
  for (const b of groupBoxes) {
    extraLeft = Math.max(extraLeft, -b.left);
    extraTop = Math.max(extraTop, -b.top);
    extraRight = Math.max(extraRight, b.left + b.width - layout.width);
    extraBottom = Math.max(extraBottom, b.top + b.height - layout.height);
  }
  const offsetX = extraLeft;
  const offsetY = extraTop;
  const naturalW = Math.max(1, layout.width + extraLeft + extraRight);
  const naturalH = Math.max(1, layout.height + extraTop + extraBottom);
  /* Always reserve a small inner gutter so wide edge labels / hover glints
   * never touch the pane edge — sharper, more designed look. */
  const safetyMargin = 16;
  const fitW = Math.max(1, maxWidth - safetyMargin);
  const fitH = Math.max(1, maxHeight - safetyMargin);
  const scale = Math.min(1, fitW / naturalW, fitH / naturalH);

  return (
    <div
      style={{
        width: naturalW * scale,
        height: naturalH * scale,
        position: "relative",
      }}
    >
      <div
        style={{
          width: naturalW,
          height: naturalH,
          position: "relative",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* Subgraph rectangles render behind everything else.
            They use absolute-positioned div + SVG label so the corner tag
            sits on the border, matching the diffs.com / Linear group treatment. */}
        {groupBoxes.map((box) => (
          <div
            key={`g-${box.group.id}`}
            style={{
              position: "absolute",
              left: box.left + offsetX,
              top: box.top + offsetY,
              width: box.width,
              height: box.height,
              borderRadius: 12,
              border: `1px dashed ${DIAGRAM.groupBorder}`,
              background: DIAGRAM.groupBg,
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -10,
                left: 14,
                padding: "2px 10px",
                background: DIAGRAM.groupLabelBg,
                color: DIAGRAM.groupLabelColor,
                fontFamily: specTokens.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                lineHeight: 1.4,
                whiteSpace: "nowrap",
              }}
            >
              {box.group.label}
            </span>
          </div>
        ))}
        <svg
          width={naturalW}
          height={naturalH}
          viewBox={`${-offsetX} ${-offsetY} ${naturalW} ${naturalH}`}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L12,6 L0,12 Z" fill={DIAGRAM.edge} />
            </marker>
            <marker
              id={arrowActiveId}
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L12,6 L0,12 Z" fill={DIAGRAM.edgeActive} />
            </marker>
            <marker
              id={arrowMutedId}
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L12,6 L0,12 Z" fill={DIAGRAM.edgeMuted} />
            </marker>
          </defs>
          {animatedGraph.edges.map((edge, i) => {
            const a = layout.placed.get(edge.from);
            const b = layout.placed.get(edge.to);
            if (!a || !b) return null;
            /* Edge starts drawing right after its source node has landed. */
            const edgeStart = LAYER_REVEAL_BASE + a.layer * LAYER_REVEAL_STEP + 8;
            return (
              <EdgeLine
                key={`e-${i}`}
                edge={edge}
                from={a}
                to={b}
                isLR={isLR}
                arrowId={arrowId}
                arrowMutedId={arrowMutedId}
                arrowActiveId={arrowActiveId}
                revealStart={edgeStart}
              />
            );
          })}
        </svg>
        {Array.from(layout.placed.values()).map((placed) => (
          <NodeTile
            key={placed.node.id}
            placed={{
              ...placed,
              left: placed.left + offsetX,
              top: placed.top + offsetY,
            }}
            revealStart={LAYER_REVEAL_BASE + placed.layer * LAYER_REVEAL_STEP}
            isLR={isLR}
          />
        ))}
      </div>
    </div>
  );
}
