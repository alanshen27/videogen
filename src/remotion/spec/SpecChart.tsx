import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { specTokens } from "./design";

/**
 * Minimal hand-rolled chart for "show numbers, animate them in".
 *
 * Why not Recharts: this renders inside Remotion, and the only animation we
 * need is "bars grow from 0 to value over ~20 frames" + (optionally)
 * highlight one bar. Hand-rolled SVG is ~200 lines and avoids pulling in
 * 200kB of chart library that ships features we never use (legends,
 * tooltips, brush, axis ticks).
 *
 * Content format the LLM emits in `el.content`:
 *
 *     bar
 *     Postgres wait | 22
 *     TLS handshake | 6
 *     Handler       | 12
 *     Response      | 7
 *     ---
 *     yLabel: ms p99
 *     highlight: Postgres wait
 *
 * First line is the kind (`bar` | `line`). Each subsequent `label | value`
 * line is a data point. Optional `---` introduces a key/value block of
 * extras (`yLabel`, `highlight`, `title`).
 *
 * Invalid input falls back to rendering the raw text, never crashes the
 * scene.
 */
export type ChartKind = "bar" | "line";

export type ChartData = {
  kind: ChartKind;
  title: string | null;
  yLabel: string | null;
  /** Index of the data point to emphasise; -1 = none. */
  highlightIndex: number;
  points: Array<{ label: string; value: number }>;
};

export function parseChartContent(content: string): ChartData | null {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const kindLine = lines[0].toLowerCase();
  const kind: ChartKind | null =
    kindLine === "bar" ? "bar" : kindLine === "line" ? "line" : null;
  if (!kind) return null;

  let dividerIdx = lines.findIndex((l) => l === "---");
  if (dividerIdx === -1) dividerIdx = lines.length;

  const dataLines = lines.slice(1, dividerIdx);
  const extraLines = lines.slice(dividerIdx + 1);

  const points = dataLines
    .map((l) => {
      /* Match `label | value` (pipe-separated). Value must be numeric. */
      const m = /^(.+?)\s*\|\s*(-?\d+(?:\.\d+)?)$/.exec(l);
      if (!m) return null;
      const value = parseFloat(m[2]);
      if (!Number.isFinite(value)) return null;
      return { label: m[1].trim(), value };
    })
    .filter((p): p is { label: string; value: number } => p !== null);
  if (points.length === 0) return null;

  let title: string | null = null;
  let yLabel: string | null = null;
  let highlightLabel: string | null = null;
  for (const line of extraLines) {
    const m = /^(\w+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "title") title = val;
    else if (key === "ylabel") yLabel = val;
    else if (key === "highlight") highlightLabel = val;
  }
  const highlightIndex = highlightLabel
    ? points.findIndex(
        (p) => p.label.toLowerCase() === highlightLabel!.toLowerCase()
      )
    : -1;

  return { kind, title, yLabel, highlightIndex, points };
}

/* Easing tuned to feel like Remotion's other reveals — quick to ~90% then
 * settle. Mirrors `(t) => 1 - (1-t)^3` used elsewhere. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function SpecChart({ content }: { content: string }) {
  const data = parseChartContent(content);
  if (!data) {
    /* Fallback so a malformed chart doesn't crash the scene. */
    return (
      <pre
        style={{
          color: specTokens.ink.muted,
          fontFamily: specTokens.mono ?? specTokens.sans,
          fontSize: 22,
          whiteSpace: "pre-wrap",
        }}
      >
        {content}
      </pre>
    );
  }

  return data.kind === "bar" ? (
    <BarChartBody data={data} />
  ) : (
    <LineChartBody data={data} />
  );
}

/* Render constants — sized for the 1320×760 default figure pane. The
 * outer container is laid out by the renderer; we just fill it. */
const CHART_W = 1240;
const CHART_H = 620;
const PAD = { top: 80, right: 60, bottom: 70, left: 220 };

function BarChartBody({ data }: { data: ChartData }) {
  const frame = useCurrentFrame();
  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const maxValue = Math.max(...data.points.map((p) => p.value), 1);
  const barCount = data.points.length;
  /* Each bar gets equal height; small gap between. */
  const gap = 14;
  const barH = Math.max(8, (innerH - gap * (barCount - 1)) / barCount);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {data.title ? (
        <div
          style={{
            fontFamily: specTokens.sans,
            fontSize: 30,
            fontWeight: 700,
            color: specTokens.ink.primary,
            letterSpacing: "-0.02em",
            marginBottom: 6,
          }}
        >
          {data.title}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        style={{ maxHeight: 620 }}
      >
        {/* Faint baseline grid: 4 vertical guides. */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={PAD.left + innerW * g}
            x2={PAD.left + innerW * g}
            y1={PAD.top - 8}
            y2={PAD.top + innerH + 4}
            stroke="rgba(120, 130, 170, 0.16)"
            strokeWidth={1}
          />
        ))}
        {/* Y-axis baseline. */}
        <line
          x1={PAD.left}
          x2={PAD.left}
          y1={PAD.top - 8}
          y2={PAD.top + innerH + 8}
          stroke="rgba(199, 210, 254, 0.4)"
          strokeWidth={2}
        />

        {data.points.map((p, i) => {
          /* Per-bar stagger: each bar starts 4 frames after the previous. */
          const start = 6 + i * 4;
          const t = interpolate(frame, [start, start + 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          });
          const value = p.value * t;
          const w = (value / maxValue) * innerW;
          const y = PAD.top + i * (barH + gap);
          const isHighlight = i === data.highlightIndex;
          /* Highlighted bar uses the indigo gradient, others a muted slate. */
          const fill = isHighlight
            ? "url(#bar-grad-hl)"
            : "url(#bar-grad-mute)";
          return (
            <g key={i}>
              <text
                x={PAD.left - 16}
                y={y + barH / 2}
                textAnchor="end"
                dominantBaseline="middle"
                style={{
                  fontFamily: specTokens.sans,
                  fontSize: 22,
                  fontWeight: 500,
                  fill: isHighlight
                    ? specTokens.ink.primary
                    : specTokens.ink.muted,
                  letterSpacing: "-0.01em",
                }}
              >
                {p.label}
              </text>
              <rect
                x={PAD.left}
                y={y}
                width={Math.max(0, w)}
                height={barH}
                fill={fill}
                rx={6}
              />
              {/* Value label rides the end of the bar. Holds back until the
                  bar has at least started growing so it doesn't sit alone. */}
              <text
                x={PAD.left + w + 12}
                y={y + barH / 2}
                textAnchor="start"
                dominantBaseline="middle"
                opacity={Math.min(1, t * 1.4)}
                style={{
                  fontFamily: specTokens.mono ?? specTokens.sans,
                  fontSize: 22,
                  fontWeight: 600,
                  fill: isHighlight ? "#c7d2fe" : "rgba(228,228,231,0.75)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatValue(value, p.value)}
              </text>
            </g>
          );
        })}

        <defs>
          <linearGradient id="bar-grad-hl" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a5b4fc" />
          </linearGradient>
          <linearGradient id="bar-grad-mute" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(99, 102, 241, 0.35)" />
            <stop offset="100%" stopColor="rgba(165, 180, 252, 0.45)" />
          </linearGradient>
        </defs>
      </svg>
      {data.yLabel ? (
        <div
          style={{
            fontFamily: specTokens.mono ?? specTokens.sans,
            fontSize: 18,
            color: specTokens.ink.muted,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          x-axis: {data.yLabel}
        </div>
      ) : null}
    </div>
  );
}

function LineChartBody({ data }: { data: ChartData }) {
  const frame = useCurrentFrame();
  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const maxValue = Math.max(...data.points.map((p) => p.value), 1);
  const minValue = Math.min(0, ...data.points.map((p) => p.value));
  const span = Math.max(1, maxValue - minValue);
  const n = data.points.length;
  const xFor = (i: number) =>
    n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW;
  const yFor = (v: number) =>
    PAD.top + innerH - ((v - minValue) / span) * innerH;

  /* Stroke-on draw: total path length isn't easy to compute without a DOM
   * ref, so we just approximate by interpolating opacity per segment. */
  const tLine = interpolate(frame, [8, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  const path = data.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.value)}`)
    .join(" ");

  /* The full polyline is rendered once and clipped via a rect that
   * sweeps in from the left. */
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {data.title ? (
        <div
          style={{
            fontFamily: specTokens.sans,
            fontSize: 30,
            fontWeight: 700,
            color: specTokens.ink.primary,
            letterSpacing: "-0.02em",
          }}
        >
          {data.title}
        </div>
      ) : null}
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" style={{ maxHeight: 620 }}>
        {/* Horizontal grid lines for the line chart. */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={PAD.top + innerH * g}
            y2={PAD.top + innerH * g}
            stroke="rgba(120, 130, 170, 0.18)"
            strokeWidth={1}
          />
        ))}

        <defs>
          <clipPath id="line-sweep">
            <rect
              x={PAD.left - 2}
              y={PAD.top - 8}
              width={innerW * tLine + 2}
              height={innerH + 16}
            />
          </clipPath>
          <linearGradient id="line-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#c7d2fe" />
          </linearGradient>
        </defs>

        <path
          d={path}
          fill="none"
          stroke="url(#line-grad)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#line-sweep)"
        />

        {data.points.map((p, i) => {
          const x = xFor(i);
          const y = yFor(p.value);
          /* Dots appear once the sweep has passed them. */
          const reachT = n <= 1 ? 1 : i / (n - 1);
          const dotOpacity = interpolate(tLine, [reachT, reachT + 0.05], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isHighlight = i === data.highlightIndex;
          return (
            <g key={i} opacity={dotOpacity}>
              <circle
                cx={x}
                cy={y}
                r={isHighlight ? 9 : 6}
                fill={isHighlight ? "#c7d2fe" : "#a5b4fc"}
                stroke={isHighlight ? "#fafafa" : "transparent"}
                strokeWidth={2}
              />
              <text
                x={x}
                y={PAD.top + innerH + 26}
                textAnchor="middle"
                style={{
                  fontFamily: specTokens.sans,
                  fontSize: 18,
                  fontWeight: 500,
                  fill: specTokens.ink.muted,
                  letterSpacing: "-0.01em",
                }}
              >
                {p.label}
              </text>
              {isHighlight ? (
                <text
                  x={x}
                  y={y - 18}
                  textAnchor="middle"
                  style={{
                    fontFamily: specTokens.mono ?? specTokens.sans,
                    fontSize: 22,
                    fontWeight: 700,
                    fill: "#c7d2fe",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatValue(p.value, p.value)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {data.yLabel ? (
        <div
          style={{
            fontFamily: specTokens.mono ?? specTokens.sans,
            fontSize: 18,
            color: specTokens.ink.muted,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          y-axis: {data.yLabel}
        </div>
      ) : null}
    </div>
  );
}

/* Pretty-print a number relative to its target's decimals. We respect the
 * source decimals so `22` stays `22` and `4.8` stays `4.8`. */
function formatValue(displayed: number, target: number): string {
  const targetStr = String(target);
  const decimals = targetStr.includes(".")
    ? targetStr.split(".")[1].length
    : 0;
  return displayed.toFixed(decimals);
}
