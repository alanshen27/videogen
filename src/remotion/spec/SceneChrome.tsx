import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { RemotionLayoutPresetId } from "../../server/llm/layout-presets";
import { specTokens } from "./design";

type SceneChromeProps = {
  sceneIndex: number;
  sceneCount: number;
  layoutPreset: RemotionLayoutPresetId;
  /** Duration of the current scene in frames (for the bottom progress strip). */
  sceneDurationInFrames: number;
  children: React.ReactNode;
};

/**
 * Shared visual frame for every scene — warm-minimal: hairline borders, tabular
 * mono scene counter top-right, quiet preset label bottom-left, no gradients or
 * neon. Background overlays are barely-there grain + a soft coral top wash
 * that echoes the brand mark on a charcoal sheet.
 */
export function SceneChrome({
  sceneIndex,
  sceneCount,
  layoutPreset,
  sceneDurationInFrames,
  children,
}: SceneChromeProps) {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const isPortrait = height > width;

  const n = sceneIndex + 1;
  const padded =
    sceneCount >= 10 ? String(n).padStart(2, "0") : String(n);
  const totalLabel =
    sceneCount >= 10 ? String(sceneCount).padStart(2, "0") : String(sceneCount);

  const chipBase = isPortrait ? 13 : 14;
  const chipSide = isPortrait ? 40 : 72;
  const chipTop = isPortrait ? 32 : 48;
  const presetPad = isPortrait ? 32 : 72;

  const progress = Math.max(
    0,
    Math.min(1, sceneDurationInFrames > 0 ? frame / sceneDurationInFrames : 0)
  );
  /* The total-progress strip walks across the whole video. Each scene fills
   * its own segment in order so the eye gets a Linear-style timeline cue. */
  const segmentWidth =
    sceneCount > 0 ? 100 / Math.max(1, sceneCount) : 100;
  const filledSegmentsLeft = sceneIndex * segmentWidth;
  const activeSegmentFill = progress * segmentWidth;

  return (
    <AbsoluteFill>
      {/* Faint coral wash up top — the only real ambient color. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 80% 45% at 50% 0%, rgba(217, 124, 117, 0.07) 0%, transparent 60%)",
          zIndex: 0,
        }}
      />
      {/* Tiny grain dots — gives the surface tactility without being noisy. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.22,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255, 248, 240, 0.04) 1px, transparent 0)",
          backgroundSize: isPortrait ? "24px 24px" : "32px 32px",
        }}
      />
      <div style={{ position: "absolute", inset: 100, zIndex: 1 }}>{children}</div>

      {/* Brand mark, top-left — segfault logo + lowercase wordmark in mono. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: chipTop,
          left: chipSide,
          zIndex: 4,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: chipBase + 8,
            height: chipBase + 8,
            display: "block",
          }}
        />
        <span
          style={{
            fontFamily: specTokens.mono,
            fontSize: chipBase,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            color: specTokens.ink.muted,
          }}
        >
          segfault
        </span>
      </div>

      <div
        aria-hidden
        style={{
          position: "absolute",
          top: chipTop,
          right: chipSide,
          zIndex: 4,
          pointerEvents: "none",
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          fontFamily: specTokens.mono,
          fontSize: chipBase,
          letterSpacing: "0.04em",
          color: specTokens.ink.subtle,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ color: specTokens.ink.muted }}>{padded}</span>
        <span style={{ opacity: 0.55 }}>/ {totalLabel}</span>
      </div>

      {layoutPreset !== "free" ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: presetPad,
            bottom: isPortrait ? 48 : 64,
            zIndex: 4,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "rgba(217, 124, 117, 0.75)",
            }}
          />
          <span
            style={{
              fontFamily: specTokens.mono,
              fontSize: isPortrait ? 11 : 12,
              fontWeight: 400,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: specTokens.ink.subtle,
            }}
          >
            {layoutPreset.replace(/_/g, " ")}
          </span>
        </div>
      ) : null}

      {/* Bottom progress strip — a Linear-style timeline that fills across the
       * whole video. Past scenes are filled coral, the current scene fills as
       * the playhead advances, future scenes sit as a faint hairline rail. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          zIndex: 4,
          pointerEvents: "none",
          background: "rgba(255, 248, 240, 0.04)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${filledSegmentsLeft + activeSegmentFill}%`,
            background:
              "linear-gradient(90deg, rgba(217, 124, 117, 0.6) 0%, #e8a7a1 100%)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

