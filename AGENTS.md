<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Video content brief

When working on prompts, scene specs, the LLM pipeline, or anything that
influences what ends up on screen, read `PROMPT.md`. It documents the
design system, the layout/template options, the visual-element priority,
and the rules for writing narration / image queries / Mermaid. The LLM
pipeline already prepends it to every system message; keep that doc and
the renderer (`src/remotion/`) in sync.
