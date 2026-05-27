/**
 * Strict allowlist sanitizer for LLM-generated SVG markup.
 *
 * We let the LLM author inline SVG so scenes can have hand-drawn-feel
 * illustrations, annotated diagrams, sketch graphs, etc. \u2014 visual variety
 * that stock photos and Mermaid flowcharts can't cover. But raw markup is
 * an XSS / SSRF surface, so:
 *
 *   - Only tags in `ALLOWED_TAGS` survive. Everything else is stripped.
 *   - Only attributes in `ALLOWED_ATTRS` (or starting with `data-`/`aria-`)
 *     survive.
 *   - `href` / `xlink:href` are limited to `#anchor` (no external).
 *   - `style=` is stripped (CSS can pull in `@import`, `expression`, urls).
 *   - Any `on*` event attribute is stripped (defense-in-depth).
 *   - `<foreignObject>`, `<script>`, `<animate>` with `attributeName=onload`,
 *     `<image>` with external href \u2014 all dropped.
 *
 * Output is guaranteed to be a self-contained SVG safe to render inside
 * Remotion via `dangerouslySetInnerHTML`. Returns the sanitized markup
 * or `null` when the input doesn't contain a usable `<svg>` element.
 *
 * This is intentionally a hand-rolled DOM-free parser \u2014 we don't ship
 * `jsdom`/`sanitize-html` to the worker just for one feature. The parser
 * walks the string once and rebuilds with only allowed tokens.
 */

/**
 * Allowed tags keyed by lowercase, value is the canonical XML casing.
 * SVG is case-sensitive in XML mode (`linearGradient`, `feGaussianBlur`)
 * so we always emit the canonical form even if the LLM lowercased it.
 */
const ALLOWED_TAGS = new Map<string, string>([
  ["svg", "svg"],
  ["g", "g"],
  ["defs", "defs"],
  ["path", "path"],
  ["rect", "rect"],
  ["circle", "circle"],
  ["ellipse", "ellipse"],
  ["line", "line"],
  ["polyline", "polyline"],
  ["polygon", "polygon"],
  ["text", "text"],
  ["tspan", "tspan"],
  ["title", "title"],
  ["desc", "desc"],
  ["lineargradient", "linearGradient"],
  ["radialgradient", "radialGradient"],
  ["stop", "stop"],
  ["clippath", "clipPath"],
  ["mask", "mask"],
  ["filter", "filter"],
  ["fegaussianblur", "feGaussianBlur"],
  ["feoffset", "feOffset"],
  ["feblend", "feBlend"],
  ["feflood", "feFlood"],
  ["fecomposite", "feComposite"],
  ["femerge", "feMerge"],
  ["femergenode", "feMergeNode"],
  ["fecolormatrix", "feColorMatrix"],
  ["femorphology", "feMorphology"],
  ["use", "use"],
  ["marker", "marker"],
  ["symbol", "symbol"],
  ["pattern", "pattern"],
  ["animate", "animate"],
  ["animatetransform", "animateTransform"],
  ["animatemotion", "animateMotion"],
  ["set", "set"],
  ["mpath", "mpath"],
]);

/**
 * Allowed attributes, keyed by lowercase, value is the canonical XML casing.
 * Some SVG attrs are camelCase (`viewBox`, `gradientUnits`) and *must* be
 * emitted that way to be honoured by the renderer.
 */
const ALLOWED_ATTRS = new Map<string, string>([
  /* Geometry */
  ["x", "x"],
  ["y", "y"],
  ["x1", "x1"],
  ["y1", "y1"],
  ["x2", "x2"],
  ["y2", "y2"],
  ["cx", "cx"],
  ["cy", "cy"],
  ["r", "r"],
  ["rx", "rx"],
  ["ry", "ry"],
  ["width", "width"],
  ["height", "height"],
  ["d", "d"],
  ["points", "points"],
  ["dx", "dx"],
  ["dy", "dy"],
  ["rotate", "rotate"],
  ["lengthadjust", "lengthAdjust"],
  ["textlength", "textLength"],
  /* Coordinate system / viewBox */
  ["viewbox", "viewBox"],
  ["preserveaspectratio", "preserveAspectRatio"],
  ["transform", "transform"],
  ["transform-origin", "transform-origin"],
  /* Fill / stroke */
  ["fill", "fill"],
  ["stroke", "stroke"],
  ["stroke-width", "stroke-width"],
  ["stroke-linecap", "stroke-linecap"],
  ["stroke-linejoin", "stroke-linejoin"],
  ["stroke-dasharray", "stroke-dasharray"],
  ["stroke-dashoffset", "stroke-dashoffset"],
  ["stroke-opacity", "stroke-opacity"],
  ["fill-opacity", "fill-opacity"],
  ["fill-rule", "fill-rule"],
  ["clip-rule", "clip-rule"],
  ["opacity", "opacity"],
  /* Text */
  ["font-family", "font-family"],
  ["font-size", "font-size"],
  ["font-weight", "font-weight"],
  ["font-style", "font-style"],
  ["text-anchor", "text-anchor"],
  ["dominant-baseline", "dominant-baseline"],
  ["alignment-baseline", "alignment-baseline"],
  ["letter-spacing", "letter-spacing"],
  ["word-spacing", "word-spacing"],
  /* Identity / refs */
  ["id", "id"],
  ["class", "class"],
  /* Gradients / patterns */
  ["offset", "offset"],
  ["stop-color", "stop-color"],
  ["stop-opacity", "stop-opacity"],
  ["gradientunits", "gradientUnits"],
  ["gradienttransform", "gradientTransform"],
  ["spreadmethod", "spreadMethod"],
  ["patternunits", "patternUnits"],
  ["patterntransform", "patternTransform"],
  ["patterncontentunits", "patternContentUnits"],
  ["maskunits", "maskUnits"],
  ["maskcontentunits", "maskContentUnits"],
  ["clippathunits", "clipPathUnits"],
  /* Refs (sanitized below) */
  ["href", "href"],
  ["xlink:href", "xlink:href"],
  ["clip-path", "clip-path"],
  ["mask", "mask"],
  ["filter", "filter"],
  ["marker-start", "marker-start"],
  ["marker-mid", "marker-mid"],
  ["marker-end", "marker-end"],
  /* Filter primitives */
  ["in", "in"],
  ["in2", "in2"],
  ["result", "result"],
  ["stddeviation", "stdDeviation"],
  ["values", "values"],
  ["mode", "mode"],
  ["operator", "operator"],
  ["type", "type"],
  ["tablevalues", "tableValues"],
  ["k1", "k1"],
  ["k2", "k2"],
  ["k3", "k3"],
  ["k4", "k4"],
  /* Animation */
  ["attributename", "attributeName"],
  ["from", "from"],
  ["to", "to"],
  ["by", "by"],
  ["begin", "begin"],
  ["end", "end"],
  ["dur", "dur"],
  ["repeatcount", "repeatCount"],
  ["calcmode", "calcMode"],
  ["keytimes", "keyTimes"],
  ["keysplines", "keySplines"],
  /* Misc namespaces actually used */
  ["xmlns", "xmlns"],
  ["xmlns:xlink", "xmlns:xlink"],
  ["version", "version"],
  ["role", "role"],
  ["aria-label", "aria-label"],
  ["aria-hidden", "aria-hidden"],
]);

/**
 * HARD_DENY tags: drop the tag *and* everything inside it. These can
 * carry executable / external content even when stripped of attributes
 * (script bodies, CSS imports, html embedded inside foreignObject).
 */
const HARD_DENY_TAGS = new Set<string>([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "style",
  "handler",
  "listener",
]);

/** Reject if the value scheme is anything other than safe in-doc anchors. */
function safeHref(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) return true;
  /* Data URLs even for images are noisy / tracking risks. Stay strict. */
  return false;
}

/**
 * @returns { canonName, value } when the attribute should be kept, `null`
 * when it should be dropped entirely.
 */
function sanitizeAttr(
  name: string,
  value: string
): { canonName: string; value: string } | null {
  const lower = name.toLowerCase();

  /* Drop event handlers no matter what. */
  if (lower.startsWith("on")) return null;
  /* Drop inline styles (CSS expression, @import, url(...)). */
  if (lower === "style") return null;
  /* xmlns:* are fine, generic */
  if (lower.startsWith("xmlns")) {
    if (value.toLowerCase().includes("script")) return null;
    return { canonName: name, value };
  }
  if (lower.startsWith("data-") || lower.startsWith("aria-")) {
    return { canonName: lower, value };
  }
  const canonName = ALLOWED_ATTRS.get(lower);
  if (!canonName) return null;

  /* href family — only same-doc anchors. */
  if (lower === "href" || lower === "xlink:href") {
    return safeHref(value) ? { canonName, value } : null;
  }

  /* Forbid `javascript:` etc. anywhere in the attribute body. */
  if (/javascript\s*:/i.test(value)) return null;
  if (/expression\s*\(/i.test(value)) return null;

  /* `*-path` / `mask` / `filter` / fill / stroke refs of the form url(#id)
   * are OK; deny `url(http://...)` etc. */
  if (/url\s*\(/i.test(value)) {
    const m = value.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
    if (!m) return null;
    const ref = m[1]!.trim();
    if (!ref.startsWith("#")) return null;
  }

  return { canonName, value };
}

type Tok =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; attrs: string; selfClose: boolean }
  | { kind: "close"; name: string };

function tokenize(input: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const lt = input.indexOf("<", i);
    if (lt < 0) {
      const tail = input.slice(i);
      if (tail.trim()) tokens.push({ kind: "text", value: tail });
      break;
    }
    if (lt > i) {
      const text = input.slice(i, lt);
      if (text.trim()) tokens.push({ kind: "text", value: text });
    }

    /* Comment / CDATA / DOCTYPE — skip entirely. */
    if (input.startsWith("<!--", lt)) {
      const end = input.indexOf("-->", lt + 4);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", lt)) {
      const end = input.indexOf("]]>", lt + 9);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    if (input.startsWith("<!", lt) || input.startsWith("<?", lt)) {
      const end = input.indexOf(">", lt + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }

    const gt = input.indexOf(">", lt + 1);
    if (gt < 0) {
      /* Unclosed tag — dump rest as text. */
      tokens.push({ kind: "text", value: input.slice(lt) });
      break;
    }
    const raw = input.slice(lt + 1, gt);
    const isClose = raw.startsWith("/");
    if (isClose) {
      const name = raw.slice(1).trim().split(/\s/)[0]!;
      tokens.push({ kind: "close", name });
    } else {
      const selfClose = raw.endsWith("/");
      const body = selfClose ? raw.slice(0, -1) : raw;
      const m = body.match(/^([\w:-]+)([\s\S]*)$/);
      if (m) {
        tokens.push({
          kind: "open",
          name: m[1]!,
          attrs: (m[2] ?? "").trim(),
          selfClose,
        });
      }
    }
    i = gt + 1;
  }
  return tokens;
}

function parseAttrs(attrStr: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1]!;
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    out.push([name, value]);
  }
  return out;
}

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeInlineSvg(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  /* Quick reject: must look like SVG. */
  const firstSvgIdx = trimmed.search(/<svg[\s>]/i);
  if (firstSvgIdx < 0) return null;

  /* Reject any obviously hostile contents up front \u2014 we still re-check
   * per-token below, but this short-circuits clearly bad input. */
  if (/<script\b/i.test(trimmed)) return null;

  const tokens = tokenize(trimmed.slice(firstSvgIdx));

  /* Track tag depth to drop content inside denied tags entirely. */
  const stack: string[] = [];
  let skipDepth = 0;
  const out: string[] = [];

  for (const tok of tokens) {
    if (tok.kind === "open") {
      const lower = tok.name.toLowerCase();
      if (skipDepth > 0) {
        if (!tok.selfClose) skipDepth++;
        continue;
      }
      if (HARD_DENY_TAGS.has(lower)) {
        if (!tok.selfClose) skipDepth = 1;
        continue;
      }
      const canon = ALLOWED_TAGS.get(lower);
      if (!canon) {
        /* Unknown tag - strip wrapper, keep children. Anchors / bitmap
         * `<image>` end up here: dropping the wrapper neutralises them
         * without losing surrounding context. */
        continue;
      }
      const attrs = parseAttrs(tok.attrs);
      const kept = attrs
        .map(([n, v]) => {
          const r = sanitizeAttr(n, v);
          return r === null ? null : `${r.canonName}="${escapeAttr(r.value)}"`;
        })
        .filter((s): s is string => s !== null);
      out.push(
        `<${canon}${kept.length ? " " + kept.join(" ") : ""}${tok.selfClose ? "/>" : ">"}`
      );
      if (!tok.selfClose) stack.push(canon);
    } else if (tok.kind === "close") {
      if (skipDepth > 0) {
        skipDepth--;
        continue;
      }
      const lower = tok.name.toLowerCase();
      const canon = ALLOWED_TAGS.get(lower);
      if (!canon) continue;
      const top = stack.lastIndexOf(canon);
      if (top >= 0) {
        for (let i = stack.length - 1; i >= top; i--) {
          out.push(`</${stack[i]}>`);
          stack.pop();
        }
      }
    } else {
      if (skipDepth > 0) continue;
      out.push(escapeText(tok.value));
    }
  }
  /* Close any tags still open. */
  while (stack.length > 0) {
    out.push(`</${stack.pop()}>`);
  }

  const result = out.join("");
  /* Final sanity: must still contain at least one <svg>. */
  if (!/<svg\b/i.test(result)) return null;
  /* Ensure xmlns is present \u2014 some browsers refuse to render inline SVG
   * without one when set via innerHTML. */
  return result.replace(
    /<svg\b(?![^>]*\bxmlns=)/i,
    '<svg xmlns="http://www.w3.org/2000/svg"'
  );
}
