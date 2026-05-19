import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  RemotionElementPlacement,
  RemotionSpec,
} from "../server/llm/schemas";
import fallbackSpec from "../../rem.json";
import { normalizeLayoutPreset } from "../server/llm/layout-presets";
import { specAnimations } from "./spec/Animations";
import { RenderSpecElement } from "./spec/Elements";
import { SceneChrome } from "./spec/SceneChrome";
import { specTokens } from "./spec/design";

export type VideoFromSpecProps = {
  /** When null (default), uses bundled `rem.json` from repo root. */
  spec: RemotionSpec | null;
};

const defaultFallback = fallbackSpec as RemotionSpec;

type Scene = RemotionSpec["scenes"][number];
type SceneEl = RemotionSpec["scenes"][number]["elements"][number];

function resolveElementPlacement(
  comp: RemotionSpec["composition"]
): RemotionElementPlacement {
  return comp.elementPlacement;
}

function focusedTextAlignForced(el: SceneEl): boolean {
  return el.type === "code" || el.type === "mermaid" || el.type === "image";
}

function SceneElement({
  el,
  sceneDuration,
  layout,
  iconVariant = "compact",
  availableWidth,
  availableHeight,
}: {
  el: SceneEl;
  sceneDuration: number;
  layout: "absolute" | "focused";
  iconVariant?: "compact" | "hero";
  availableWidth?: number;
  availableHeight?: number;
}) {
  const frame = useCurrentFrame();
  const snap = 8;
  const left = Math.round(el.x / snap) * snap;
  const top = Math.round(el.y / snap) * snap;
  const resolvedAnimation =
    el.type === "mermaid" &&
    (el.animation === "scale" || el.animation === "slide")
      ? ("fade" as const)
      : el.animation;
  const Anim = specAnimations[resolvedAnimation] ?? specAnimations.none;

  const inner = (
    <Anim frame={frame} durationInFrames={sceneDuration}>
      <RenderSpecElement
        el={el}
        iconVariant={iconVariant}
        availableWidth={availableWidth}
        availableHeight={availableHeight}
      />
    </Anim>
  );

  if (layout === "focused") {
    return <div style={{ maxWidth: "100%" }}>{inner}</div>;
  }

  return (
    <div style={{ position: "absolute", left, top }}>
      {inner}
    </div>
  );
}

function focusedMaxWidthForType(
  el: SceneEl,
  dualFigure: boolean,
  portrait: boolean
): number {
  if (portrait) {
    return el.type === "mermaid"
      ? 720
      : el.type === "code"
        ? 920
        : el.type === "icon"
          ? 780
          : 820;
  }
  if (dualFigure) {
    return el.type === "mermaid"
      ? 820
      : el.type === "code"
        ? 820
        : el.type === "icon"
          ? 600
          : 720;
  }
  /* Text columns are intentionally narrower than the canvas — long lines kill
   * legibility and short copy stranded in a 1080px column looks lonely. */
  return el.type === "mermaid"
    ? 840
    : el.type === "code"
      ? 980
      : el.type === "icon"
        ? 620
        : 820;
}

/** Vertical budget for a focused element in a single-element scene. */
function focusedMaxHeightForType(
  el: SceneEl,
  canvasHeight: number,
  portrait: boolean
): number {
  /* Outer scene padding eats the rest. These mirror the padding values used
   * in `SequentialFocusedScene` / `SplitTwoPanelScene` so the diagram
   * actually fits the pane it lives in, instead of overflowing the bottom. */
  const yPad = portrait ? 168 + 136 : 112 + 112;
  const usable = Math.max(120, canvasHeight - yPad);
  if (el.type === "mermaid") return Math.min(560, usable);
  if (el.type === "code") return Math.min(720, usable);
  if (el.type === "image") return Math.min(720, usable);
  return usable;
}

function splitMaxHeightForType(
  el: SceneEl,
  canvasHeight: number,
  portrait: boolean
): number {
  const yPad = portrait ? 168 + 136 : 88 + 96;
  /* In portrait the panes stack so each pane gets ~half. */
  const usable = portrait
    ? Math.max(120, (canvasHeight - yPad) / 2)
    : Math.max(120, canvasHeight - yPad);
  if (el.type === "mermaid") return Math.min(540, usable);
  if (el.type === "code") return Math.min(620, usable);
  if (el.type === "image") return Math.min(620, usable);
  return usable;
}

/** One visible element; timeline slices scene evenly across elements[]. */
function SequentialFocusedScene({
  scene,
  sceneDurationFrames,
}: {
  scene: Scene;
  sceneDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const els = scene.elements;
  if (els.length === 0) {
    return null;
  }

  const n = els.length;
  const segmentLen = Math.max(1, Math.floor(sceneDurationFrames / n));
  const idx = Math.min(n - 1, Math.floor(frame / segmentLen));
  const el = els[idx];

  /* Bigger outer breathing room so every scene reads "designy" instead of
   * "edge-to-edge poster". Margins are roughly 9% / 7% of the canvas. */
  const padding = portrait ? "168px 88px 136px" : "112px 148px";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: focusedMaxWidthForType(el, false, portrait),
          display: "flex",
          justifyContent: "center",
          textAlign: "left" as const,
        }}
      >
        <SceneElement
          el={el}
          sceneDuration={segmentLen}
          layout="focused"
          iconVariant={el.type === "icon" ? "hero" : "compact"}
          availableWidth={focusedMaxWidthForType(el, false, portrait)}
          availableHeight={focusedMaxHeightForType(el, height, portrait)}
        />
      </div>
    </div>
  );
}

/** Two panels shown together for the full scene (text+window or dual figure). */
function SplitTwoPanelScene({
  scene,
  sceneDurationFrames,
  mode,
}: {
  scene: Scene;
  sceneDurationFrames: number;
  mode: "text_left" | "text_right" | "dual_figure";
}) {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const els = scene.elements;
  if (els.length === 0) {
    return null;
  }

  if (els.length === 1) {
    return (
      <SequentialFocusedScene
        scene={scene}
        sceneDurationFrames={sceneDurationFrames}
      />
    );
  }

  const leftEl = els[0];
  const rightEl = els[1];
  const extraEls = els.slice(2);

  const dual = mode === "dual_figure";
  /* In portrait, panes hug their content (flex: 0 0 auto) so the outer
   * justifyContent: center stacks them snugly in the middle of the screen —
   * no more 50/50 split that left a giant empty strip between text and visual. */
  const proseCol = portrait
    ? ({ flex: "0 0 auto", minWidth: 0, maxWidth: "100%" } as const)
    : ({ flex: "0 0 38%", maxWidth: 640, minWidth: 320 } as const);
  const windowCol = portrait
    ? ({ flex: "0 0 auto", minWidth: 0, maxWidth: "100%" } as const)
    : ({
        flex: "1 1 0%",
        minWidth: 0,
        maxWidth: "none" as const,
      } as const);

  const leftPaneStyle =
    dual ? windowCol : mode === "text_left" ? proseCol : windowCol;
  const rightPaneStyle =
    dual ? windowCol : mode === "text_left" ? windowCol : proseCol;

  /* Text alignment is owned by `SpecText` itself (left-aligned inside a
   * centered island). The wrapper just centres the island in the pane. */
  const panelJustify = (el: SceneEl, _proseColumn: boolean) => {
    if (focusedTextAlignForced(el)) return "center" as const;
    return "center" as const;
  };

  const gutter = portrait ? 56 : dual ? 72 : 80;
  /* Wider margins on the split layout too; in landscape the outer ~7% feels
   * substantial without crowding the visual pane. */
  const padding = portrait ? "168px 80px 136px" : "88px 132px 96px";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: portrait ? "column" : "row",
        alignItems: "stretch",
        justifyContent: "center",
        padding,
        boxSizing: "border-box",
        gap: gutter,
      }}
    >
      <div
        style={{
          ...leftPaneStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
          maxWidth: focusedMaxWidthForType(leftEl, dual, portrait),
          display: "flex",
          justifyContent: panelJustify(leftEl, !dual && mode === "text_left"),
          textAlign: "left" as const,
        }}
      >
        <SceneElement
          el={leftEl}
          sceneDuration={sceneDurationFrames}
          layout="focused"
          iconVariant={
            dual || mode === "text_right" ? "hero" : "compact"
          }
          availableWidth={focusedMaxWidthForType(leftEl, dual, portrait)}
          availableHeight={splitMaxHeightForType(leftEl, height, portrait)}
        />
      </div>
    </div>
      <div
        style={{
          ...rightPaneStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
          maxWidth: focusedMaxWidthForType(rightEl, dual, portrait),
          display: "flex",
          justifyContent: panelJustify(rightEl, !dual && mode === "text_right"),
          textAlign: "left" as const,
        }}
        >
          <SceneElement
            el={rightEl}
            sceneDuration={sceneDurationFrames}
            layout="focused"
            iconVariant={
              dual || mode === "text_left" ? "hero" : "compact"
            }
            availableWidth={focusedMaxWidthForType(rightEl, dual, portrait)}
            availableHeight={splitMaxHeightForType(rightEl, height, portrait)}
          />
        </div>
      </div>
      {extraEls.map((el, idx) => (
        <SceneElement
          key={`extra-${idx}`}
          el={el}
          sceneDuration={sceneDurationFrames}
          layout="absolute"
        />
      ))}
    </div>
  );
}

function sceneBodyForPlacement(
  placement: RemotionElementPlacement,
  scene: Scene,
  sceneDurationFrames: number
): React.ReactNode {
  switch (placement) {
    case "one_at_a_time_centered":
      return (
        <SequentialFocusedScene
          scene={scene}
          sceneDurationFrames={sceneDurationFrames}
        />
      );
    case "split_text_left_window_right":
      return (
        <SplitTwoPanelScene
          scene={scene}
          sceneDurationFrames={sceneDurationFrames}
          mode="text_left"
        />
      );
    case "split_window_left_text_right":
      return (
        <SplitTwoPanelScene
          scene={scene}
          sceneDurationFrames={sceneDurationFrames}
          mode="text_right"
        />
      );
    case "split_side_by_side_figures":
      return (
        <SplitTwoPanelScene
          scene={scene}
          sceneDurationFrames={sceneDurationFrames}
          mode="dual_figure"
        />
      );
    case "canvas_absolute":
      return scene.elements.map((el: SceneEl, elIdx: number) => (
        <SceneElement
          key={elIdx}
          el={el}
          sceneDuration={sceneDurationFrames}
          layout="absolute"
        />
      ));
    default: {
      const _: never = placement;
      return _;
    }
  }
}

function placementForScene(
  scene: Scene,
  fallback: RemotionElementPlacement,
  portrait: boolean
): RemotionElementPlacement {
  /* Single-element scenes always centre — otherwise `canvas_absolute` strands
   * the lone element at its `x/y` coords and the rest of the canvas reads as
   * dead space. */
  if (scene.elements.length <= 1) {
    return "one_at_a_time_centered";
  }
  const preset = normalizeLayoutPreset(scene.layoutPreset);
  if (preset === "split_text_left_canvas_right") {
    return "split_text_left_window_right";
  }
  if (preset === "split_canvas_left_text_right") {
    return "split_window_left_text_right";
  }
  if (preset === "split_dual_figure") {
    return "split_side_by_side_figures";
  }
  if (
    preset === "title_hero_and_canvas" ||
    preset === "diagram_focus_sidebar" ||
    preset === "code_and_callouts" ||
    preset === "timeline_or_strip"
  ) {
    /* These presets are all "show a focused element with optional sidekicks".
     * In landscape we used to drop them into absolute-positioned chaos; instead
     * always sequence one-at-a-time which keeps each beat centred. */
    return "one_at_a_time_centered";
  }
  void portrait;
  return fallback;
}

export const VideoFromSpec: React.FC<VideoFromSpecProps> = ({
  spec: specProp,
}) => {
  const data = specProp ?? defaultFallback;
  const voice = data.voice ?? [];
  const defaultPlacement = resolveElementPlacement(data.composition);
  const portrait = data.composition.height > data.composition.width;

  return (
    <AbsoluteFill style={{ background: specTokens.pageBackground }}>
      {voice.map((seg, i) => (
        <Sequence
          key={`vo-${seg.staticPath}-${i}`}
          from={seg.fromFrame}
          durationInFrames={seg.durationInFrames}
        >
          <Audio
            src={staticFile(seg.staticPath)}
            volume={1}
            acceptableTimeShiftInSeconds={6}
            pauseWhenBuffering
            delayRenderTimeoutInMilliseconds={120000}
            delayRenderRetries={3}
          />
        </Sequence>
      ))}
      {data.scenes.map((scene: Scene, sceneIdx: number) => (
        <Sequence
          key={sceneIdx}
          from={scene.fromFrame}
          durationInFrames={scene.durationInFrames}
        >
          <AbsoluteFill
            style={{
              background: scene.background ?? specTokens.pageBackground,
            }}
          >
            <SceneChrome
              sceneIndex={sceneIdx}
              sceneCount={data.scenes.length}
              layoutPreset={normalizeLayoutPreset(scene.layoutPreset)}
              sceneDurationInFrames={scene.durationInFrames}
            >
              {sceneBodyForPlacement(
                placementForScene(scene, defaultPlacement, portrait),
                scene,
                scene.durationInFrames
              )}
            </SceneChrome>
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
