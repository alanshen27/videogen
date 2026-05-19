import React from "react";
import { interpolate, spring, useVideoConfig } from "remotion";
import type { RemotionSpec } from "../../server/llm/schemas";

type SceneEl = RemotionSpec["scenes"][number]["elements"][number];

export type AnimProps = {
  children: React.ReactNode;
  frame: number;
  durationInFrames: number;
};

/**
 * Eased entry (opacity + 10px lift) followed by a slow continuous drift that
 * runs for the whole scene. The drift is a sub-pixel/per-frame creep so the
 * shot doesn't feel frozen between cuts, but it's gentle enough that no single
 * frame reads as motion.
 */
function FadeAnim({ children, frame, durationInFrames }: AnimProps) {
  const fadeEnd = Math.min(14, Math.max(6, durationInFrames * 0.12));
  const opacity = interpolate(frame, [0, fadeEnd], [0, 1], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const entryLift = interpolate(frame, [0, fadeEnd], [10, 0], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  /* Slow continuous drift — total of ~6px across the scene. Keeps the eye
   * moving without ever calling attention to itself. */
  const driftT = Math.min(1, frame / Math.max(1, durationInFrames));
  const drift = -driftT * 6;
  return (
    <div style={{ opacity, transform: `translateY(${entryLift + drift}px)` }}>
      {children}
    </div>
  );
}

function SlideAnim({ children, frame, durationInFrames }: AnimProps) {
  const dur = Math.min(16, Math.max(8, durationInFrames * 0.1));
  const t = interpolate(frame, [0, dur], [0, 1], {
    extrapolateRight: "clamp",
    easing: (x) => 1 - Math.pow(1 - x, 4),
  });
  const translateX = (1 - t) * 64;
  const opacity = interpolate(frame, [0, dur * 0.75], [0, 1], {
    extrapolateRight: "clamp",
  });
  /* Same gentle drift as Fade — translateX continues at a slow walk. */
  const driftT = Math.min(1, frame / Math.max(1, durationInFrames));
  const drift = -driftT * 4;
  return (
    <div
      style={{
        opacity,
        transform: `translate(${translateX + drift}px, 0)`,
      }}
    >
      {children}
    </div>
  );
}

function ScaleAnim({ children, frame }: AnimProps) {
  const { fps } = useVideoConfig();
  const s = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 170 },
  });
  return (
    <div
      style={{
        transform: `scale(${s})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Subtle entrance for "important" elements — fade-up + a tiny scale bounce.
 * No persistent box-shadow / coloured glow; that read as a card chrome around
 * diagrams and images which is the opposite of the look we want.
 */
function HighlightAnim({ children, frame, durationInFrames }: AnimProps) {
  const fadeEnd = Math.min(14, Math.max(6, durationInFrames * 0.12));
  const opacity = interpolate(frame, [0, fadeEnd], [0, 1], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const entryLift = interpolate(frame, [0, fadeEnd], [12, 0], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const bounceEnd = Math.min(22, Math.max(10, durationInFrames * 0.18));
  const bounce = interpolate(frame, [0, fadeEnd * 0.6, bounceEnd], [0.96, 1.015, 1], {
    extrapolateRight: "clamp",
  });
  /* Held-shot breathing: 0.997 ↔ 1.003 over ~6s, sine-eased. Invisible per
   * frame, but stops the held subject from feeling like a still image. */
  const breathPeriod = 180;
  const breath = 1 + 0.003 * Math.sin((frame / breathPeriod) * Math.PI * 2);
  /* Slow continuous lift — total of ~4px across the scene. */
  const driftT = Math.min(1, frame / Math.max(1, durationInFrames));
  const drift = -driftT * 4;
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${entryLift + drift}px) scale(${bounce * breath})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
}

export const specAnimations: Record<
  SceneEl["animation"] | "none",
  React.FC<AnimProps>
> = {
  fade: FadeAnim,
  slide: SlideAnim,
  scale: ScaleAnim,
  highlight: HighlightAnim,
  none: ({ children }) => <>{children}</>,
};
