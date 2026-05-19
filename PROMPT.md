# PROMPT.md — LLM brief for videogen

This document is the source of truth for any LLM that generates scripts,
storyboards, asset prompts, branded scene specs, or any other artifact that
ends up on screen. Read it once before generating, then internalise it.

If something here conflicts with a hardcoded prompt string in
`src/server/queue/pipeline.ts`, **this document wins**. Update the prompt
strings to match.

---

## 1. What we're making

YouTube-style explainer videos: 60–180s, voice-narrated, dense with motion.
Each video is composed scene-by-scene from a small set of templates and
rendered by Remotion (React). The visual language is **diffs.com / Pierre /
Linear / Vercel / Geist** — designy, restrained, monochrome with a single
indigo accent. **Not** Fireship rainbow gradients. **Not** clipart.

> Tagline for the brand: *"a developer-tool aesthetic explaining a
> developer-tool concept."*

---

## 2. Design system

The renderer applies these tokens automatically (`src/remotion/spec/design.ts`).
You should write content that flatters them, not that fights them.

### Surface

- Background: near-flat charcoal (`#0a0a0c → #08080a`) with a faint indigo
  wash up top. **Do not** propose colorful gradient scene backgrounds — they
  get normalised to the flat token at render time.
- Borders: 1px hairline `rgba(255,255,255,0.08)`. No drop shadows, no glows.
- Cards: `transparent` background with a hairline border. Active emphasis is
  a faint indigo wash (`rgba(99,102,241,0.06)`) plus a brighter border.

### Color

There is **one** accent: indigo (`#a5b4fc` / `#c7d2fe` / `rgba(129,140,248,*)`).
Everything else is zinc grey or white. Do not introduce additional brand
colors in your scene content; the renderer will ignore them.

### Typography

- **Sans**: Inter / Geist (UI body, headlines).
- **Mono**: Geist Mono / JetBrains Mono (code, list numbers, scene counter,
  technical primitives).
- Weights: 400/500/600/700. Never 800/900 — that reads as "Fireship".
- Tight tracking: `letter-spacing: -0.02em` for display, `-0.005em` for body.

### Iconography

- Icons come from **Lucide** only (`src/remotion/spec/icon-map.ts`).
- They render at 1.6 stroke width, in indigo (`#c7d2fe`) inside a ghost
  tile — never filled with rainbow gradients.
- **Do not decorate titles with icons.** Titles and stat callouts render as
  pure type. The renderer ignores `iconName` on `type: "text"` elements —
  set it to `null`. Icons are still used inside diagrams (`type: "icon"`
  tiles, and the inferred icons inside Mermaid nodes).

---

## 3. Layout & composition

The renderer (`VideoFromSpec.tsx`) places each scene into one of four
layouts. You influence which one via the **`template`** field on the
branded scene spec.

### Layout rules

- **Outer margins are large by design** (~9% of canvas). Don't try to fight
  them by stuffing more content per scene — fewer ideas, more breathing room.
- **One clear idea per scene.** A scene answers one question, shows one
  flow, or makes one comparison.
- **Single-element scenes are always centred** in the canvas. Don't worry
  about positioning.
- **Two-element scenes** (text + visual) become a split layout: text island
  on one side, visual island on the other, with a wide gutter between.
- Text is always **left-aligned inside a centred island** (Linear-style).
  Lists and paragraphs hug each other; the whole stack sits centred in its
  pane. Never propose centre-aligned body text.

### Available templates (`BrandedSceneTemplate`)

| Template                    | Use when…                                                    |
| --------------------------- | ------------------------------------------------------------ |
| `left_diagram_right_text`   | The flow IS the point. Diagram on the left, narration right. |
| `right_diagram_left_text`   | Same, mirrored — alternate so the eye moves.                 |
| `list`                      | Hook, summary, "three things to check" beats.                |
| `image`                     | A real product / logo / screenshot is the cleanest visual.   |
| `image_hero`                | Big image, short caption. Use for brand reveals.             |
| `image_left`                | Image card paired with a text panel.                         |
| `code_focus`                | Real code is central. Use rarely.                            |
| `stat_callout`              | Single huge number / word. Use sparingly for impact.         |
| `quote`                     | Short pull-quote, optionally attributed.                     |

**Vary the template.** Three diagram scenes in a row is boring. A typical
8-scene video might read: `list → image_hero → left_diagram_right_text →
right_diagram_left_text → stat_callout → image → quote → list`.

---

## 4. Visual element priority

When a scene needs a visual, the renderer picks **in this order**:

1. **React-drawn diagram** (the LLM's Mermaid, redrawn in our ghost-tile
   style). **Whenever you emit a parseable `diagramMermaid`, it wins.**
   Diagrams carry labelled structure that no stock screenshot can match.
2. **Downloaded image** (logo, screenshot, photo) — used when no diagram
   was authored for the scene.
3. **Stock image fallback** (the downloaded image, if any, used as fallback
   when Mermaid parsing fails).
4. **Raw Mermaid** (last resort — it'll look out of place).

### Implication for your prompts

- **Diagrams beat images, always.** If a scene benefits from a labelled
  flow at all, write a `diagramMermaid` for it — don't emit one *and* an
  image hoping the image wins. It won't. Use `focusBeats[].mermaidTargets`
  to walk the viewer through the diagram one node at a time (see §9).
- **Use images when there is no flow.** Brand reveals, product
  screenshots, photographic mood beats, and named-thing reveals (Claude,
  OpenAI, React, AWS, Postgres, Vercel, GitHub, Linear, ChatGPT, Docker,
  Stripe, …) → set `template` to `image` / `image_hero` / `image_left`
  with a tight `imageSearchQuery`, and leave `diagramMermaid` empty.
- **Lists for "the three pillars of X."** Don't draw a diagram for
  enumerated concepts — that's a `list`.

---

## 5. Writing `imageSearchQuery`

This becomes a Google Images query via SerpAPI. The cleaner the query, the
better the result.

**Do:**
- `Claude AI logo`
- `ChatGPT interface screenshot`
- `AWS Lambda logo`
- `Vercel dashboard ui`
- `Postgres logo transparent`
- `Linear app screenshot dark`

**Don't, ever:**
- Append `stock photo`, `stock image`, `royalty free`, `HD`, `4k`, or any
  SEO filler. These rank watermarked Shutterstock thumbnails first — which
  we cannot download, period.
- Use generic phrases like `business meeting`, `developer working`,
  `team collaboration`. They return generic stock and we have to throw them
  away.
- Mention abstract ideas (`scalability illustration`). Name the concrete
  thing instead.

If a scene's subject genuinely has no good real-world image (e.g. an
abstract architecture pattern), drop the image and reach for a diagram or
a list/quote/stat instead.

---

## 6. Writing `diagramMermaid`

Only emit Mermaid when a diagram is genuinely the point. Keep it inside the
re-renderable subset:

**Allowed:**
- `flowchart LR` and `flowchart TB`
- Nodes: `A["Label"]`, `B("Rounded")`, `C{"Diamond"}`, `D[("Cylinder")]`
- Edges: `-->`, `--> |label|`, `---`, `-.->`, `==>`
- `subgraph GroupId [Title]` … `end` — wraps its member nodes in a labelled
  hairline rectangle. **Use this for architecture diagrams** (cloud groups,
  microservices boundaries, network zones, layers). Subgraphs can nest.
- `classDef` with `class A,B name;` — used by `focusBeats.mermaidTargets`
  to highlight the currently-explained node. Keep `classDef` names readable
  (`active`, `muted`, `primary`) — the renderer maps them to emphasis levels.

**Forbidden (will fall back to image or skip the scene):**
- `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`,
  `gantt`, `pie`, `journey`, `mindmap`, `architecture-beta`.
- More than ~24 nodes total (gets cramped and ugly at 1080p).
- Custom `style` / `linkStyle` colors — the renderer ignores them and
  applies its own palette. Use `class` + `classDef` instead.

**Architecture diagram example** (this WILL render as a clean ghost-tile
flow with a labelled "VPC" box around the inner services):

```mermaid
flowchart LR
  User["User"] --> LB["Load Balancer"]
  subgraph vpc [VPC]
    LB --> API["API Server"]
    API --> Cache[("Redis")]
    API --> DB[("Postgres")]
  end
  API --> S3[("S3 Bucket")]
  classDef hi fill:#000,stroke:#000;
  class API hi;
```

**Walkthroughs:** if you reuse the same topology across consecutive scenes
to walk the viewer through it, keep stable IDs and use
`focusBeats[].mermaidTargets` to point at the currently-explained nodes.
The renderer will dim everything else.

---

## 7. Writing the script

This is where most of the value lives. Narration is **spoken**, not read.

### Narration (`narration`, `hook`, `fullNarration`)

- **Short sentences.** One idea per beat. A viewer listening once should
  follow without rewinding.
- **Plain language for the audience level.** `BEGINNER` means no
  unexplained acronyms. `EXPERT` can be denser but still listenable.
- **No meta about the video itself.** Forbidden phrases:
  - "as you can see in the diagram"
  - "on the right of the screen"
  - "we're highlighting"
  - "this flowchart shows"
  - "in this animation"
  - "in this Mermaid diagram"
  - Any reference to `Mermaid`, `Lucide`, `Remotion`, `React`, the rendering
    tooling, or production process.
- **Refer to real parts of the system.** "When a request hits the gateway"
  — not "this box here".

### Tone — no AI cliché

The biggest tell of LLM-generated copy is generic, abstract language with no
specifics. Beat that out of every line. Concretely:

- **Name real things.** "Postgres" not "the database". "p99 47ms" not
  "fast". "Fastify on Node 20" not "the backend". "BRIN index on
  `created_at`" not "an efficient index".
- **Pick one example, commit to it.** Don't list three frameworks; pick
  one. Don't say "could be Redis, Memcached, or DynamoDB" — pick Redis and
  move on. The viewer wants a concrete story, not a survey.
- **Use real numbers, not vague intensifiers.** "47ms p99" not
  "blazing fast". "Cuts the query from 1.2s to 38ms" not "dramatically
  faster". If you don't have a number, omit the claim — don't fake it.
- **No "in this video / in this scene / let's dive into / unpack /
  unlock".** Same energy as the meta-language above.
- **No marketing voice.** Forbidden: "seamless", "robust",
  "lightning-fast", "blazing", "next-generation", "powerful", "elegant",
  "beautiful", "delightful", "world-class", "revolutionary", "leverage",
  "synergy", "best-in-class", "future-proof", "cutting-edge".
- **No filler openers.** Forbidden: "In today's fast-paced world",
  "Imagine if…", "Have you ever wondered…", "Let me tell you a story",
  "Picture this".
- **No throat-clearing.** "Now, here's the thing", "But wait, there's
  more", "Here's where it gets interesting" — cut them all.
- **No "the three pillars / four key principles / five must-knows".**
  Pick a specific number that matches the actual content. If there are
  four things, say four. If there are seven, say seven.
- **Past or present tense, not future hand-waving.** "We traced one
  request and found the 22ms wait was on Postgres." Beats "Tracing
  requests can help you discover where latency lives."

If a sentence would still make sense with the product name swapped for
any other product, it's too generic — rewrite it.

### `visualDescription`

Internal production notes only. **Never** copy this into narration.

- Architecture beats: name the layout (flowchart-style), which subsystem
  this beat focuses on, and how emphasis should move scene-to-scene.
- Other beats: short icon / storyboard cues (e.g. `Cpu + Terminal + Code2`).

### Visible titles (`headline`, on-screen text)

- Human phrases, never raw API identifiers.
- Title-case or sentence-case, never `SCREAMING_SNAKE`.
- ≤ 8 words. The headline is small-display-typography, not a press release.

---

## 8. Structured content rules

These fields exist on every `BrandedScene` and **must always be present**,
even when unused. Use the empty defaults shown.

```ts
{
  sceneNumber: 1,
  template: "left_diagram_right_text",
  headline: "Anatomy of a request",
  body: "User pings the gateway, gateway forwards to the service, service writes to the store.",
  listItems: [],                      // [] when template !== "list"
  diagramMermaid: "flowchart LR\n...", // "" when no diagram
  imageSearchQuery: "",                // "" when no image
  codeSnippet: "",                     // "" when template !== "code_focus"
  focusBeats: [
    {
      startSecond: 0,
      endSecond: 2.4,
      target: "title",
      mode: "highlight",
      caption: "",
      mermaidTargets: [],
    },
  ],
}
```

### Body length budget

- `headline`: ≤ 8 words.
- `body`: ≤ 220 chars when paired with a visual; ≤ 360 chars when
  text-only.
- `listItems`: 2–5 items, each ≤ 60 chars. More than 5 gets cramped.
- `codeSnippet`: ≤ 18 lines, ≤ 80 chars wide. Shiki gives us real syntax
  highlighting; specify the language with a leading fence
  (`` ```typescript `` … `` ``` ``) when the snippet isn't TypeScript so the
  highlighter picks the right grammar. Supported langs: typescript, tsx,
  javascript, jsx, json, bash, python, go, rust, java, kotlin, swift, c,
  cpp, csharp, sql, yaml, html, css, markdown.

### Focus beats — driving animated diagrams

`focusBeats` is the **animation timeline**. Each beat is `[startSecond,
endSecond]` and points at one target. Beats with `target === "diagram"` are
special: they drive the per-node highlight animation in the rendered graph.

- `target`: one of `title | body | list | diagram | image | code`.
- `mode`: `highlight` (default), `dim_others`, `pulse`, `zoom`, `trace`.
- `caption`: short on-screen cue (or `""`).
- `mermaidTargets`: array of node IDs (matching IDs from `diagramMermaid`)
  that should be lit up during this beat. Everything else dims to muted.

**Diagram walkthrough pattern.** When narrating a flow node-by-node,
author one `focusBeats` row per spoken beat, and have each one point at
the node(s) currently being discussed:

```jsonc
{
  "template": "left_diagram_right_text",
  "diagramMermaid": "flowchart LR\n  U[\"User\"] --> G[\"Gateway\"]\n  G --> A[\"Auth\"]\n  A --> Q[(\"Queue\")]\n  Q --> W[\"Worker\"]\n  W --> DB[(\"Postgres\")]",
  "focusBeats": [
    { "startSecond": 0,   "endSecond": 1.4, "target": "title",   "mode": "highlight", "caption": "",        "mermaidTargets": [] },
    { "startSecond": 1.4, "endSecond": 3.0, "target": "diagram", "mode": "highlight", "caption": "request", "mermaidTargets": ["U", "G"] },
    { "startSecond": 3.0, "endSecond": 4.6, "target": "diagram", "mode": "highlight", "caption": "auth",    "mermaidTargets": ["A"] },
    { "startSecond": 4.6, "endSecond": 6.2, "target": "diagram", "mode": "highlight", "caption": "queue",   "mermaidTargets": ["Q", "W"] },
    { "startSecond": 6.2, "endSecond": 8.0, "target": "diagram", "mode": "highlight", "caption": "persist", "mermaidTargets": ["DB"] }
  ]
}
```

This produces an animated diagram: at second 1.4 the renderer highlights
`U` and `G` (everything else dims), at second 3.0 it shifts to `A`, etc.
Narration timing should line up — when you say "the request hits the auth
service", that's when the `["A"]` beat should be active.

Rules:
- `mermaidTargets` IDs must match the IDs in `diagramMermaid` exactly.
- Keep beats short (1–2.5 seconds each) — viewers track one move at a time.
- Always cover the full scene. The last beat holds to the end of the scene.
- Use `mermaidTargets: []` on non-diagram beats; the renderer ignores them.

---

## 9. Generating ideas — the "fireship rhythm" without the fireship look

Good explainer scripts follow a beat structure. Use this as the default
arc and bend it where it hurts:

| Beat # | Role             | Template suggestion                |
| ------ | ---------------- | ---------------------------------- |
| 1      | Hook             | `stat_callout`, `quote`, `list`    |
| 2      | Context / why    | `image_hero`, `list`               |
| 3–N-2  | Body / mechanics | `*_diagram_*`, `image_left`, `list` |
| N-1    | Catch / nuance   | `quote`, `stat_callout`            |
| N      | Summary          | `list`                             |

Patterns to favour:

- **Compare-and-contrast** beats: a list of "old way vs new way", a split
  with two images side-by-side.
- **Walk-through**: reuse one diagram for 2–3 consecutive scenes with
  `mermaidTargets` shifting emphasis — the narration narrates *what's
  happening here* without ever saying "as you can see".
- **One bold number**: any time the topic has a stat (10x, 95th
  percentile, $0.0002 per call), give it a `stat_callout` of its own.

Patterns to avoid:

- "Bullet points of bullet points." If every scene is a `list`, the video
  feels like a slide deck. Mix in diagrams and images.
- "Rainbow scene chips." Don't propose per-scene accent colors; we don't
  use them.
- "Fake terminal" framing of normal explainers. Reserve `code_focus` for
  real code.

---

## 10. Quick reference checklist before returning JSON

- [ ] Every scene has all 7 fields filled (use `""` / `[]` where unused).
- [ ] No two consecutive scenes share the same `template`.
- [ ] `imageSearchQuery` is a tight noun phrase. No "stock photo" anywhere.
- [ ] `diagramMermaid` is empty OR within the allowed subset (≤8 nodes,
      `flowchart LR|TB`, basic shapes, no subgraphs).
- [ ] Narration mentions no on-screen meta vocabulary.
- [ ] `headline` ≤ 8 words; `body` within budget.
- [ ] `focusBeats` covers the scene's duration with targets that exist
      on that scene (don't aim `target: "code"` at a list scene).
- [ ] Background gradients / colors in your spec will be overridden — don't
      bother proposing exotic ones.

If you're unsure whether to use a diagram or an image: **pick the image**.
If you're unsure whether to use an image or a list: **pick the list with a
short headline**. The renderer makes both look great.
