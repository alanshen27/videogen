import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { RemotionLayoutPresetId } from "../../server/llm/layout-presets";
import { specTokens } from "./design";

type SceneChromeProps = {
  sceneIndex: number;
  sceneCount: number;
  layoutPreset: RemotionLayoutPresetId;
  children: React.ReactNode;
};

/**
 * Shared visual frame for every scene — diffs.com-flavoured: hairline borders,
 * tabular mono scene counter top-right, quiet preset label bottom-left, no
 * gradients or neon. Background overlays are barely-there grain + soft top
 * indigo wash.
 */
export function SceneChrome({
  sceneIndex,
  sceneCount,
  layoutPreset,
  children,
}: SceneChromeProps) {
  const { width, height } = useVideoConfig();
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

  return (
    <AbsoluteFill>
      {/* Faint indigo wash up top — the only real ambient color. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 80% 45% at 50% 0%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
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
            "radial-gradient(circle at 1px 1px, rgba(244, 244, 245, 0.04) 1px, transparent 0)",
          backgroundSize: isPortrait ? "24px 24px" : "32px 32px",
        }}
      />
      <div style={{ position: "absolute", inset: 100, zIndex: 1 }}>{children}</div>

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
            bottom: isPortrait ? 32 : 48,
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
              background: "rgba(129, 140, 248, 0.7)",
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
    </AbsoluteFill>
  );
}
