import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { specTokens } from "./design";

/**
 * Pierre-/diffs.com-style code block: Shiki-highlighted, ghost frame, mono
 * font, no traffic-light buttons or gradient header chrome. The first frame
 * uses Remotion's `delayRender` to wait for Shiki to load (singleton — only
 * costs once per render).
 */

/* Static imports so the Next/Webpack bundler can statically analyse them —
 * a templated `import(\`shiki/langs/${l}.mjs\`)` blows up at build time. */
const LANG_IMPORTS = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  shell: () => import("shiki/langs/shell.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
} as const;

type BundledLang = keyof typeof LANG_IMPORTS;

const LANG_ALIAS: Record<string, BundledLang> = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  js: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  json: "json",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  shell: "shell",
  py: "python",
  python: "python",
  go: "go",
  rs: "rust",
  rust: "rust",
  java: "java",
  kt: "kotlin",
  kotlin: "kotlin",
  swift: "swift",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  "c++": "cpp",
  cs: "csharp",
  csharp: "csharp",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  css: "css",
  md: "markdown",
  markdown: "markdown",
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import("shiki/themes/vesper.mjs")],
      langs: Object.values(LANG_IMPORTS).map((load) => load()),
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }
  return highlighterPromise;
}

/**
 * Heuristically guess a language from the snippet content when no explicit
 * `lang` was provided. Cheap fast checks, not a real classifier.
 */
function guessLang(code: string): BundledLang {
  const head = code.trim().slice(0, 200);
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(head)) return "sql";
  if (/^[\s{]*"[^"]+"\s*:/.test(head)) return "json";
  if (/^\s*(def |from |import |class |print\()/.test(head)) return "python";
  if (/^\s*package\s+\w+|func\s+\w+\s*\(/.test(head)) return "go";
  if (/^\s*fn\s+\w+|let\s+mut\s+|use\s+std/.test(head)) return "rust";
  if (/^\s*#!\/.*sh|^\s*\$\s|^\s*(echo|cd|npm |npx |yarn |pnpm |brew )/.test(head))
    return "bash";
  if (/<\/?\w+[\s>]/.test(head)) return "tsx";
  if (/^\s*(const|let|var|function|export|import|interface|type)\b/.test(head))
    return "typescript";
  return "typescript";
}

function normaliseLang(lang: string | undefined, code: string): BundledLang {
  if (lang) {
    const k = lang.trim().toLowerCase();
    if (LANG_ALIAS[k]) return LANG_ALIAS[k];
  }
  return guessLang(code);
}

export type SpecCodeBlockProps = {
  code: string;
  /** Optional fenced-style language tag, e.g. "ts", "python". */
  lang?: string;
};

/**
 * Renders a `<pre><code>` with Shiki-tokenised inline spans. The colours
 * come from the bundled `vesper` theme (low-contrast designy dark), the
 * outer frame is the same hairline-on-zinc treatment as the rest of the
 * spec components.
 */
export function SpecCodeBlock({ code, lang }: SpecCodeBlockProps) {
  const reactId = useId();
  const continued = useRef(false);
  const [html, setHtml] = useState<string | null>(null);
  const resolvedLang = useMemo(() => normaliseLang(lang, code), [lang, code]);

  const handle = useMemo(
    () => delayRender(`shiki:${reactId}`),
    [reactId]
  );

  useEffect(() => {
    let cancelled = false;
    let didContinue = false;
    const safeContinue = () => {
      if (continued.current || didContinue) return;
      continued.current = true;
      didContinue = true;
      continueRender(handle);
    };

    getHighlighter()
      .then((hl) => {
        if (cancelled) return safeContinue();
        try {
          const out = hl.codeToHtml(code, {
            lang: resolvedLang,
            theme: "vesper",
          });
          setHtml(out);
        } catch {
          /* Unknown lang — fall back to plain TS highlight. */
          try {
            const out = hl.codeToHtml(code, {
              lang: "typescript",
              theme: "vesper",
            });
            setHtml(out);
          } catch {
            setHtml(null);
          }
        }
        safeContinue();
      })
      .catch(() => {
        safeContinue();
      });

    return () => {
      cancelled = true;
      safeContinue();
    };
  }, [code, resolvedLang, handle]);

  const lineCount = code.split("\n").length;
  const fontSize = lineCount > 24 ? 14 : lineCount > 16 ? 16 : 18;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 12,
        border: `1px solid ${specTokens.surface.codeBorder}`,
        background: specTokens.surface.code,
        overflow: "hidden",
        maxWidth: 940,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(129, 140, 248, 0.6)",
          }}
        />
        <span
          style={{
            fontFamily: specTokens.mono,
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: specTokens.ink.subtle,
          }}
        >
          {resolvedLang}
        </span>
      </div>
      <div
        style={{
          margin: 0,
          padding: "20px 22px 22px",
          fontFamily: specTokens.mono,
          fontSize,
          lineHeight: 1.55,
        }}
      >
        {html ? (
          <div
            /* Shiki output is trusted — produced server-side from our own input. */
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              fontFamily: "inherit",
              fontSize: "inherit",
              lineHeight: "inherit",
            }}
          />
        ) : (
          <pre style={{ margin: 0, color: "#e4e4e7" }}>
            <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {code}
            </code>
          </pre>
        )}
      </div>
      {/* Override Shiki's body styles to inherit our frame. */}
      <style>
        {`pre.shiki { margin: 0 !important; padding: 0 !important; background: transparent !important; }
          pre.shiki code { font-family: inherit !important; font-size: inherit !important; line-height: inherit !important; background: transparent !important; }
          pre.shiki .line { display: block; }`}
      </style>
    </div>
  );
}
