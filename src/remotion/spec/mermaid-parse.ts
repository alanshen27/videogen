/**
 * Tiny, defensive Mermaid → ParsedGraph converter.
 *
 * Supported subset (kept tight so the deterministic re-renderer can stay
 * pretty — anything else makes the parser return `null` and the caller
 * falls back to a stock image / raw Mermaid):
 *
 *   flowchart LR | RL | TB | TD | BT
 *   graph     LR | RL | TB | TD | BT
 *   id[Label]  id(Label)  id{Label}  id[(Label)]  id((Label))  id[[Label]]
 *   id1 --> id2          id1 --> id2 --> id3
 *   id1 -->|label| id2   id1 -- label --> id2
 *   id1 --- id2          id1 -.-> id2          id1 ==> id2
 *   subgraph id [Title]
 *     A --> B
 *   end
 *   classDef name fill:…  (style ignored, name kept)
 *   class A,B,C name      (name is mapped to emphasis: active|muted|default)
 */

export type DiagramDirection = "LR" | "TB";

export type DiagramNodeShape =
  | "rect"
  | "rounded"
  | "circle"
  | "diamond"
  | "cylinder"
  | "subroutine";

export type DiagramEmphasis = "default" | "active" | "muted";

export type DiagramNode = {
  id: string;
  label: string;
  shape: DiagramNodeShape;
  emphasis: DiagramEmphasis;
  /** When set, the node belongs to a `subgraph` with this id. */
  groupId?: string;
};

export type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
  /** `--` / `-->` / `-.->` / `==>` */
  style: "solid" | "dotted" | "thick";
};

/** A subgraph block — a labelled rectangle that visually wraps its members. */
export type DiagramGroup = {
  id: string;
  label: string;
  /** Node IDs that belong to this group (in declared order). */
  nodeIds: string[];
};

export type ParsedGraph = {
  direction: DiagramDirection;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

const SHAPE_OPEN: Record<string, DiagramNodeShape> = {
  "[[": "subroutine",
  "((": "circle",
  "[(": "cylinder",
  "[": "rect",
  "(": "rounded",
  "{": "diamond",
};
const SHAPE_CLOSE: Record<string, string> = {
  "[[": "]]",
  "((": "))",
  "[(": ")]",
  "[": "]",
  "(": ")",
  "{": "}",
};

function trimQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function normaliseLabel(raw: string): string {
  return trimQuotes(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function classifyEmphasis(className: string): DiagramEmphasis {
  const n = className.toLowerCase();
  if (
    /(active|hot|hi|main|primary|on|focus|warm|emph|highlight|important)/.test(n)
  ) {
    return "active";
  }
  if (
    /(muted|cool|lo|dim|off|disabled|secondary|inactive|support|aside|fade)/.test(
      n
    )
  ) {
    return "muted";
  }
  return "default";
}

function parseDirection(raw: string): DiagramDirection {
  const r = raw.toUpperCase();
  if (r === "RL" || r === "BT") return "LR";
  if (r === "TD" || r === "DT") return "TB";
  if (r === "TB" || r === "BT") return "TB";
  return "LR";
}

/**
 * Walk the line consuming tokens of the form:
 *   `<id>[<shape><label><shape-close>]`
 * and edge operators in between.
 *
 * Returns a list of [from, to, label?, style] tuples PLUS any nodes it discovered.
 */
type LineExtraction = {
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
};

const EDGE_OPS = [
  // Order matters — longer matches first.
  { re: /^==>/, style: "thick" as const },
  { re: /^-\.->/, style: "dotted" as const },
  { re: /^-->/, style: "solid" as const },
  { re: /^---/, style: "solid" as const },
  { re: /^-\.-/, style: "dotted" as const },
  { re: /^==/, style: "thick" as const },
];

function consumeNodeToken(
  src: string
): { id: string; label: string; shape: DiagramNodeShape; rest: string } | null {
  const idMatch = /^([A-Za-z_][\w]*)\s*/.exec(src);
  if (!idMatch) return null;
  const id = idMatch[1];
  let rest = src.slice(idMatch[0].length);

  for (const open of Object.keys(SHAPE_OPEN).sort((a, b) => b.length - a.length)) {
    if (rest.startsWith(open)) {
      const close = SHAPE_CLOSE[open];
      const after = rest.slice(open.length);
      const closeIdx = after.indexOf(close);
      if (closeIdx === -1) return null;
      const label = normaliseLabel(after.slice(0, closeIdx));
      rest = after.slice(closeIdx + close.length);
      return {
        id,
        label: label || id,
        shape: SHAPE_OPEN[open],
        rest: rest.replace(/^\s+/, ""),
      };
    }
  }

  return { id, label: id, shape: "rect", rest: rest.replace(/^\s+/, "") };
}

function consumeEdgeOp(
  src: string
): { style: DiagramEdge["style"]; label?: string; rest: string } | null {
  for (const op of EDGE_OPS) {
    const m = op.re.exec(src);
    if (m) {
      let rest = src.slice(m[0].length).replace(/^\s+/, "");
      let label: string | undefined;
      const pipeM = /^\|([^|]*)\|/.exec(rest);
      if (pipeM) {
        label = normaliseLabel(pipeM[1]);
        rest = rest.slice(pipeM[0].length).replace(/^\s+/, "");
      }
      return { style: op.style, label, rest };
    }
  }
  // Inline edge label form:  -- text -->
  const inline = /^-{2,3}\s+([^\->]+?)\s+-->/.exec(src);
  if (inline) {
    const label = normaliseLabel(inline[1]);
    const rest = src.slice(inline[0].length).replace(/^\s+/, "");
    return { style: "solid", label, rest };
  }
  return null;
}

function extractLine(line: string): LineExtraction | null {
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];

  let cursor = line.trim();
  let prev: { id: string } | null = null;
  let pendingEdge: { style: DiagramEdge["style"]; label?: string } | null = null;

  while (cursor.length > 0) {
    const tok = consumeNodeToken(cursor);
    if (!tok) return null;
    cursor = tok.rest;

    const existing = nodes.get(tok.id);
    if (existing) {
      if (tok.label !== tok.id && existing.label === existing.id) {
        existing.label = tok.label;
        existing.shape = tok.shape;
      }
    } else {
      nodes.set(tok.id, {
        id: tok.id,
        label: tok.label,
        shape: tok.shape,
        emphasis: "default",
      });
    }

    if (prev && pendingEdge) {
      edges.push({
        from: prev.id,
        to: tok.id,
        label: pendingEdge.label,
        style: pendingEdge.style,
      });
    }

    if (cursor.length === 0) break;

    const edge = consumeEdgeOp(cursor);
    if (!edge) {
      // Bare node line with trailing garbage; just stop.
      break;
    }
    cursor = edge.rest;
    prev = { id: tok.id };
    pendingEdge = { style: edge.style, label: edge.label };
  }

  if (nodes.size === 0 && edges.length === 0) return null;
  return { nodes, edges };
}

const UNSUPPORTED_PREFIXES = [
  "sequencediagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "journey",
  "mindmap",
  "gitGraph",
  "timeline",
  "requirementDiagram",
  "sankey-beta",
];

const UNSUPPORTED_KEYWORDS = ["click ", "linkStyle ", "style "];

export function parseMermaidFlowchart(source: string): ParsedGraph | null {
  const cleaned = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !l.trimStart().startsWith("%%"));
  if (cleaned.length === 0) return null;

  const head = cleaned[0].trim();
  const headLower = head.toLowerCase();

  if (UNSUPPORTED_PREFIXES.some((p) => headLower.startsWith(p.toLowerCase()))) {
    return null;
  }

  const headMatch = /^(flowchart|graph)\s+(LR|RL|TB|TD|BT|DT)\b/i.exec(head);
  if (!headMatch) return null;
  const direction = parseDirection(headMatch[2]);

  // We don't support clicks / explicit style — bail out if present.
  for (const line of cleaned.slice(1)) {
    const t = line.trim();
    const lower = t.toLowerCase();
    if (UNSUPPORTED_KEYWORDS.some((k) => lower.startsWith(k))) return null;
  }

  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const groups: DiagramGroup[] = [];
  const groupById = new Map<string, DiagramGroup>();
  /* `subgraph` blocks may nest in Mermaid. We track the active stack so each
   * node inside a block is tagged with the innermost group. */
  const groupStack: string[] = [];

  const tagWithCurrentGroup = (id: string) => {
    const groupId = groupStack[groupStack.length - 1];
    if (!groupId) return;
    const node = nodes.get(id);
    if (node && !node.groupId) node.groupId = groupId;
    const group = groupById.get(groupId);
    if (group && !group.nodeIds.includes(id)) group.nodeIds.push(id);
  };

  for (const line of cleaned.slice(1)) {
    const t = line.trim();
    if (t.length === 0) continue;

    if (/^classDef\s/i.test(t)) {
      continue;
    }

    /* `subgraph IDish [Optional title]`  or  `subgraph "Title with spaces"` */
    const subgraphOpen = /^subgraph\s+(.+)$/i.exec(t);
    if (subgraphOpen) {
      const tail = subgraphOpen[1].trim();
      let id = "";
      let label = "";
      const bracketed = /^([A-Za-z_]\w*)\s*\[\s*"?(.+?)"?\s*\]$/.exec(tail);
      const quoted = /^"(.+)"$/.exec(tail);
      const idOnly = /^([A-Za-z_]\w*)$/.exec(tail);
      if (bracketed) {
        id = bracketed[1];
        label = bracketed[2];
      } else if (quoted) {
        label = quoted[1];
        id = `__group_${groups.length}`;
      } else if (idOnly) {
        id = idOnly[1];
        label = id;
      } else {
        /* Free-form title without brackets: `subgraph My API Layer` */
        label = tail;
        id = `__group_${groups.length}`;
      }
      const group: DiagramGroup = { id, label: normaliseLabel(label), nodeIds: [] };
      groups.push(group);
      groupById.set(id, group);
      groupStack.push(id);
      continue;
    }

    if (/^end\s*$/i.test(t)) {
      groupStack.pop();
      continue;
    }

    /* `direction LR` inside a subgraph — Mermaid allows per-group direction
     * overrides. We honour the outer direction and just ignore these. */
    if (/^direction\s+(LR|RL|TB|TD|BT|DT)$/i.test(t)) {
      continue;
    }

    const cls = /^class\s+([\w,\s]+)\s+(\w+)/i.exec(t);
    if (cls) {
      const ids = cls[1].split(",").map((s) => s.trim()).filter(Boolean);
      const emphasis = classifyEmphasis(cls[2]);
      for (const id of ids) {
        const existing = nodes.get(id);
        if (existing) {
          existing.emphasis = emphasis;
        } else {
          nodes.set(id, { id, label: id, shape: "rect", emphasis });
          tagWithCurrentGroup(id);
        }
      }
      continue;
    }

    const extracted = extractLine(t);
    if (!extracted) return null;
    for (const [id, n] of extracted.nodes) {
      const existing = nodes.get(id);
      if (existing) {
        if (n.label !== n.id && existing.label === existing.id) {
          existing.label = n.label;
          existing.shape = n.shape;
        }
      } else {
        nodes.set(id, n);
      }
      tagWithCurrentGroup(id);
    }
    edges.push(...extracted.edges);
  }

  if (nodes.size === 0) return null;

  /* Drop empty subgraphs the LLM may have declared but never populated. */
  const finalGroups = groups.filter((g) => g.nodeIds.length > 0);

  return {
    direction,
    nodes: Array.from(nodes.values()),
    edges,
    groups: finalGroups,
  };
}

/**
 * Topological layering for layout purposes.
 * Layer 0 = sources (no incoming edges).
 * Cycles are broken by promoting the lowest-in-degree node remaining.
 */
export function layoutLayers(graph: ParsedGraph): string[][] {
  const inDeg = new Map<string, number>();
  for (const n of graph.nodes) inDeg.set(n.id, 0);
  for (const e of graph.edges) {
    if (e.from === e.to) continue;
    if (!inDeg.has(e.to)) inDeg.set(e.to, 0);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  const remaining = new Set(graph.nodes.map((n) => n.id));
  const layers: string[][] = [];

  while (remaining.size > 0) {
    const layer: string[] = [];
    for (const id of remaining) {
      if ((inDeg.get(id) ?? 0) === 0) layer.push(id);
    }
    if (layer.length === 0) {
      // Cycle — pick the node with the smallest remaining in-degree.
      let pick: string | null = null;
      let pickDeg = Number.POSITIVE_INFINITY;
      for (const id of remaining) {
        const d = inDeg.get(id) ?? 0;
        if (d < pickDeg) {
          pickDeg = d;
          pick = id;
        }
      }
      if (pick) layer.push(pick);
    }
    if (layer.length === 0) break; // safety

    layers.push(layer);
    for (const id of layer) {
      remaining.delete(id);
      for (const e of graph.edges) {
        if (e.from === id && remaining.has(e.to)) {
          inDeg.set(e.to, Math.max(0, (inDeg.get(e.to) ?? 0) - 1));
        }
      }
    }
  }

  return layers;
}
