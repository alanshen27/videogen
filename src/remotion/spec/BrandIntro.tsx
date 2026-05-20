import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { specTokens } from "./design";

/** Frames spent on the brand intro before scene 1 begins. */
export const BRAND_INTRO_FRAMES = 75; // 2.5s @ 30fps

/**
 * Cold-open brand card: logo lifts in, "segfault" wordmark types out beside
 * it, a hairline rule sweeps under, then the whole composition fades out into
 * the first scene. Renders edge-to-edge so no SceneChrome wraps it.
 */
export const BrandIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isPortrait = height > width;

  const total = BRAND_INTRO_FRAMES;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  /* Three-beat reveal:
   *   0–14f : logo scales in
   *   8–22f : wordmark types out, hairline rule sweeps
   *  60–75f : whole card fades out into scene 1 */
  const logoIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const logoScale = 0.92 + logoIn * 0.08;
  const wordOpacity = interpolate(frame, [8, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  /* Type-on: reveal characters left-to-right with a clip path. */
  const typeOn = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const ruleScale = interpolate(frame, [16, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const cardOut = interpolate(frame, [total - 14, total], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoSize = isPortrait ? 180 : 240;
  const wordSize = isPortrait ? 88 : 116;
  const taglineSize = isPortrait ? 16 : 18;

  return (
    <AbsoluteFill
      style={{
        background: specTokens.pageBackground,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: cardOut,
      }}
    >
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
      <div
        style={{
          display: "flex",
          flexDirection: isPortrait ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: logoSize,
            height: logoSize,
            display: "block",
            transform: `scale(${logoScale})`,
            opacity: logoIn,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: isPortrait ? "center" : "flex-start",
            gap: 20,
            opacity: wordOpacity,
          }}
        >
          {/* Wordmark with type-on reveal — width clip (not inset) so descenders
           * on g/f are never chopped; sizing ghost keeps the clip box exact. */}
          <span
            style={{
              display: "inline-grid",
              lineHeight: 1,
            }}
          >
            <span
              aria-hidden
              style={{
                gridArea: "1 / 1",
                visibility: "hidden",
                fontFamily: specTokens.display,
                fontSize: wordSize,
                fontWeight: 600,
                lineHeight: 1.08,
                letterSpacing: "-0.05em",
                whiteSpace: "nowrap",
              }}
            >
              segfault
            </span>
            <span
              style={{
                gridArea: "1 / 1",
                overflow: "hidden",
                width: `${typeOn * 100}%`,
                maxWidth: "100%",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontFamily: specTokens.display,
                  fontSize: wordSize,
                  fontWeight: 600,
                  lineHeight: 1.08,
                  letterSpacing: "-0.05em",
                  color: specTokens.ink.primary,
                  whiteSpace: "nowrap",
                  paddingBottom: "0.06em",
                }}
              >
                segfault
              </span>
            </span>
          </span>
          {/* Hairline rule sweeps in under the wordmark. */}
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: isPortrait ? 160 : 220,
              height: 1,
              background:
                "linear-gradient(90deg, rgba(217, 124, 117, 0.9) 0%, rgba(217, 124, 117, 0.2) 100%)",
              transform: `scaleX(${ruleScale})`,
              transformOrigin: isPortrait ? "center" : "left center",
            }}
          />
          <div
            style={{
              fontFamily: specTokens.mono,
              fontSize: taglineSize,
              fontWeight: 400,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: specTokens.ink.subtle,
            }}
          >
            the best coding community
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
