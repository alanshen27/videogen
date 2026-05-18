# Test plan — Video lab UI polish (PR #1)

## What changed (user-visible)
- New per-scene chrome: `• videogen` brand mark top-left, tabular `NN / 12` counter top-right, and a 3px Linear-style progress strip along the bottom that fills as the video plays.
- New text variants in `SpecText`: short number/all-caps first line renders as a giant **stat callout**, content starting with `"` or `> ` renders as a designed **quote**.
- `SpecBox` gets an indigo accent rail + faint indigo wash; `SpecArrow` is wider with a gradient stroke.
- `public/smoke-remotion-input-props.json` expanded from 4 → 12 scenes covering every layout/element type.

## Primary flow
Open `/video-lab`, play the 48s smoke video, and verify each new visual feature renders correctly.

## Tests

### T1 — Chrome renders on every scene
- **Action**: Load `/video-lab`. The Remotion Player auto-loads `smoke-remotion-input-props.json`.
- **Pass**: Top-left shows a 6px indigo dot + the lowercase wordmark "videogen". Top-right shows `01 / 12` in mono tabular numerals. Bottom-left shows the layout-preset chip in uppercase mono (e.g. `TITLE HERO AND CANVAS`).
- **Fail**: Any of the three is missing, overlapping the scene content, or the counter shows `1 / 4` (stale spec).

### T2 — Progress strip fills across all 12 scenes
- **Action**: Click play. Watch the bottom 3px strip.
- **Pass**: At the very start the strip is empty. After ~4s (end of scene 1) the strip is filled to exactly 1/12 (≈8.3%). After ~24s (end of scene 6) it is ≈50%. At ~48s it is fully filled. The fill is an indigo gradient — not white, not orange.
- **Fail**: The strip stays empty, snaps in 4-second jumps without smoothly filling within a scene, or fills past 100% / wraps.

### T3 — Stat callout (scene 4 = "10x")
- **Action**: Seek the scrubber to ~14s (scene 4 starts at frame 360, durationInFrames = 120, so 12–16s).
- **Pass**: Renders `10x` as a very large display number (~220px), with a slight indigo gradient on the glyphs. Underneath in muted grey: `faster cold starts when you keep the runtime warm.` There is a small indigo-bordered icon tile (Zap) above the number labelled `Zap`.
- **Fail**: The number is the same size as the body text (means stat detector didn't fire), or the icon tile is missing, or "10x" appears inline as part of a paragraph.

### T4 — Quote variant (scene 7)
- **Action**: Seek to ~26s (scene 7 starts at frame 720, so 24–28s).
- **Pass**: Renders a giant `"` glyph in muted indigo at the top, then the quote body `Simplicity is the soul of efficiency.` in large display weight, then a short horizontal indigo rule + `Austin Freeman` in mono accentSoft colour.
- **Fail**: The literal `"` quote marks are visible around the body text (means quote detector didn't fire), or `— Austin Freeman` appears as plain body text on a second line.

### T5 — Stat callout (scene 11 = "ZERO")
- **Action**: Seek to ~42s (scene 11 starts at frame 1200, so 40–44s).
- **Pass**: Same big display treatment as T3 but with the word `ZERO` and caption `runtime dependencies on the hot path.` Icon tile labelled `Shield`.
- **Fail**: `ZERO` appears as a normal body paragraph or hero text rather than a 220px display number.

### T6 — Mixed code + list scene (scene 10 = SQL)
- **Action**: Seek to ~38s (scene 10 starts at frame 1080, so 36–40s).
- **Pass**: Left side shows a Shiki-highlighted SQL block (with `SELECT`, `FROM`, `GROUP BY` keywords in vesper-theme colour, ``LANG: SQL`` chip header). Right side shows a headline + bulleted list. Both panes fit within the safe area.
- **Fail**: Code is plain unstyled text (Shiki failed), bullets overlap the code, or only one of the two elements renders.

### T7 — Portrait mode chrome
- **Action**: Click the `9:16` button in the video-lab header.
- **Pass**: The video container becomes portrait. Brand mark and counter still visible, neither overlaps scene content (margins shrink to 32–40px in portrait). Bottom progress strip still spans the full width.
- **Fail**: Brand mark / counter is cropped, missing, or covers a headline.

## Out of scope
- Audio / voice playback (the smoke spec has no `voice` segments).
- Rendering at full 1080p via the actual Remotion CLI (only the in-browser Player is exercised).
- Backend job pipeline (lint/TS errors in `src/server/queue/` are pre-existing and unrelated).
