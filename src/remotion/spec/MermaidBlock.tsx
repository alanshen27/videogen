import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { continueRender, delayRender } from "remotion";
import mermaid from "mermaid";
import type { RemotionSpec } from "../../server/llm/schemas";
import { specTokens, fireshipPaletteAt } from "./design";

let mermaidConfigured = false;

function configureMermaidOnce() {
  if (mermaidConfigured) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    themeVariables: {
      fontSize: "24px",
      fontFamily: specTokens.sans,
      primaryColor: "#1f1a3d",
      primaryTextColor: "#fafafa",
      primaryBorderColor: "#f43f5e",
      secondaryColor: "#0b0d18",
      secondaryTextColor: "#e4e4e7",
      tertiaryColor: "#050610",
      lineColor: "#fb7185",
      border2: "#8b5cf6",
      clusterBkg: "rgba(20, 22, 38, 0.92)",
      clusterBorder: "#f43f5e",
      titleColor: "#fafafa",
      edgeLabelBackground: "rgba(8, 9, 18, 0.95)",
      actorBkg: "#1f1a3d",
      actorBorder: "#f43f5e",
      actorTextColor: "#fafafa",
      signalColor: "#fb923c",
      signalTextColor: "#fafafa",
      labelTextColor: "#fafafa",
      mainBkg: "#1f1a3d",
      nodeBorder: "#f43f5e",
      nodeTextColor: "#fafafa",
    },
    /* `strict` + programmatic innerHTML can yield blank SVG in headless Chrome; sandbox keeps sanitization without stripping draws */
    securityLevel: "sandbox",
    fontFamily: specTokens.sans,
    flowchart: {
      curve: "basis",
      padding: 18,
      htmlLabels: true,
      nodeSpacing: 42,
      rankSpacing: 56,
      diagramPadding: 12,
    },
    sequence: { actorMargin: 36, boxMargin: 16 },
  });
  mermaidConfigured = true;
}

export type MermaidSceneEl =
  RemotionSpec["scenes"][number]["elements"][number] & {
    type: "mermaid";
  };

/**
 * Quick heuristic node count for flowchart-like sources.
 * Counts every `id[...]`, `id(...)`, `id{...}`, `id[[...]]`, `id([...])` literal.
 */
function countFlowchartNodes(source: string): number {
  const idTokenRe = /\b([A-Za-z_][\w]*)\s*(?:\[\[|\(\(|\{\{|\[\(|\[|\(|\{)/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = idTokenRe.exec(source)) !== null) {
    seen.add(m[1]);
  }
  return seen.size;
}

/**
 * The LLM often emits enormous `flowchart LR` graphs (15+ nodes) that get
 * crushed when rendered into a slide. Rewrite those to `flowchart TB` so the
 * chart stacks vertically and stays legible inside a 16:9 / 9:16 pane.
 */
function rewriteForLegibility(source: string): string {
  const trimmed = source.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("flowchart") && !lower.startsWith("graph")) return trimmed;

  const nodeCount = countFlowchartNodes(trimmed);
  if (nodeCount <= 8) return trimmed;

  // Replace direction in first header line only.
  const lines = trimmed.split("\n");
  const head = lines[0];
  const rewritten = head.replace(
    /^(flowchart|graph)\s+(LR|RL|TB|BT|TD|DT)\b/i,
    (_, kw) => `${kw} TB`
  );
  if (rewritten === head) return trimmed;
  return [rewritten, ...lines.slice(1)].join("\n");
}

/**
 * If the source has no classDef directives, inject Fireship palette defaults so
 * standard nodes look colourful instead of slate grey.
 */
function injectDefaultPalette(source: string, sceneTint: string): string {
  if (/classDef\s+/.test(source)) return source;

  const block = [
    `  classDef fsHot fill:${sceneTint},stroke:#fb7185,color:#fff1f2,stroke-width:3px;`,
    `  classDef fsCool fill:#1f1a3d,stroke:#8b5cf6,color:#ddd6fe,stroke-width:3px;`,
    `  classDef fsWarm fill:#3b1f1f,stroke:#fb923c,color:#fed7aa,stroke-width:3px;`,
  ].join("\n");

  return `${source}\n${block}\n`;
}

export function SpecMermaid({ el }: { el: MermaidSceneEl }) {
  const [svg, setSvg] = useState("");
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | null>(null);
  const reactId = useId().replace(/:/g, "");
  const wrapId = `mmw-${reactId}`;

  const sceneTint = useMemo(() => {
    /* Stable tint per diagram so consecutive scenes feel related but distinct. */
    const palette = fireshipPaletteAt(el.content.length % 7);
    return palette.base;
  }, [el.content]);

  const preparedSource = useMemo(
    () => injectDefaultPalette(rewriteForLegibility(el.content), sceneTint),
    [el.content, sceneTint]
  );

  const contentKey = useMemo(
    () => `${preparedSource.length}:${preparedSource.slice(0, 120)}`,
    [preparedSource]
  );

  const handle = useMemo(
    () => delayRender(`mermaid:${reactId}:${contentKey}`),
    [reactId, contentKey]
  );

  const continued = useRef(false);
  const safeContinue = useCallback(() => {
    if (continued.current) return;
    continued.current = true;
    continueRender(handle);
  }, [handle]);

  /** Defaults favor large readable diagrams on 1080p / 1920p portrait; spec
   * width/height override when set. The container is also clamped to
   * `maxWidth/maxHeight: 100%` below so it can never overflow its pane. */
  const boxW = el.width ?? 1760;
  const boxH = el.height ?? 940;

  useEffect(() => {
    continued.current = false;
    bindFunctionsRef.current = null;
    configureMermaidOnce();

    let cancelled = false;

    void (async () => {
      const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="80"><text fill="${specTokens.ink.warn}" font-family="monospace" font-size="15" x="14" y="46">Empty Mermaid diagram</text></svg>`;
      const errorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="80"><text fill="${specTokens.ink.danger}" font-family="monospace" font-size="15" x="14" y="46">Mermaid error — fix diagram syntax in spec</text></svg>`;

      try {
        const trimmed = preparedSource.trim();
        if (!trimmed) {
          if (!cancelled) setSvg(emptySvg);
          return;
        }

        const renderId = `mm-${reactId}-${Math.random().toString(36).slice(2, 11)}`;
        const { svg: out, bindFunctions } = await mermaid.render(renderId, trimmed);
        if (cancelled) return;

        if (!out?.trim()) {
          setSvg(errorSvg);
          return;
        }

        bindFunctionsRef.current = bindFunctions ?? null;
        /* Sniff intrinsic aspect ratio from the generated SVG's viewBox so we
         * can scale-to-fit without letterboxing tiny diagrams. */
        const vbMatch = out.match(/viewBox="([\d.\s-]+)"/);
        if (vbMatch) {
          const parts = vbMatch[1].trim().split(/\s+/).map(Number);
          if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
            setNaturalAspect(parts[2] / parts[3]);
          }
        }
        setSvg(out);
      } catch {
        if (!cancelled) {
          bindFunctionsRef.current = null;
          setSvg(errorSvg);
        }
      }
    })();

    return () => {
      cancelled = true;
      bindFunctionsRef.current = null;
      safeContinue();
    };
  }, [preparedSource, handle, reactId, safeContinue]);

  /* Remotion must not continue until React has committed SVG markup AND we've
   * measured the actual rendered container, otherwise frames either finalize
   * blank or use the wrong inner dimensions. */
  useLayoutEffect(() => {
    if (!svg.trim()) return;

    const root = containerRef.current;
    const bind = bindFunctionsRef.current;
    if (root && bind) {
      try {
        bind(root);
      } catch {
        /* ignore bind failures — static SVG still draws */
      }
    }

    const outer = outerRef.current;
    if (outer) {
      const rect = outer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMeasured({ w: rect.width, h: rect.height });
      }
    }

    safeContinue();
  }, [svg, safeContinue]);

  /* In the studio the container can re-flow as the user resizes panels. */
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !outerRef.current) return;
    const node = outerRef.current;
    const ro = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMeasured({ w: rect.width, h: rect.height });
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  /* Size the SVG holder to the largest rectangle that:
   *   (1) fits inside the rendered outer box (after a small padding)
   *   (2) preserves the SVG's natural aspect ratio
   * so the SVG can fill its parent edge-to-edge — no letterbox, no squish. */
  const innerStyle = useMemo<React.CSSProperties>(() => {
    if (!naturalAspect) {
      return { width: "100%", height: "100%" };
    }
    const pad = 36;
    const containerW = measured?.w ?? boxW;
    const containerH = measured?.h ?? boxH;
    const availW = Math.max(64, containerW - pad);
    const availH = Math.max(64, containerH - pad);
    const boxAspect = availW / availH;
    if (naturalAspect >= boxAspect) {
      const w = availW;
      const h = w / naturalAspect;
      return { width: `${w}px`, height: `${h}px` };
    }
    const h = availH;
    const w = h * naturalAspect;
    return { width: `${w}px`, height: `${h}px` };
  }, [naturalAspect, measured, boxW, boxH]);

  return (
    <div
      ref={outerRef}
      style={{
        position: "relative",
        width: boxW,
        height: boxH,
        maxWidth: "100%",
        maxHeight: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#15110f",
      }}
    >
      <style type="text/css">{`
        #${wrapId} {
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #${wrapId} svg {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
        }
        #${wrapId} svg text,
        #${wrapId} svg .nodeLabel,
        #${wrapId} svg .edgeLabel {
          font-family: ${specTokens.sans};
          font-weight: 500;
          fill: #fafafa;
        }
        #${wrapId} svg .edgeLabel rect,
        #${wrapId} svg .edgeLabel foreignObject {
          background: transparent;
        }
        #${wrapId} svg .edgeLabel span {
          background: #15110f !important;
          color: #fafafa !important;
          padding: 3px 7px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 12px;
        }
      `}</style>
      <div
        ref={containerRef}
        id={wrapId}
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 18,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            ...innerStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          // Mermaid returns trusted SVG for chart output only.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
