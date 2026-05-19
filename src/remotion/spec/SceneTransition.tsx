import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Per-scene "in" transition. The previous scene hard-cuts (its `Sequence`
 * ends), and this wrapper animates the new scene's entrance — fade,
 * push, scale, etc. — over a short window at the start of the scene.
 *
 * We don't do *true* cross-fades (which would require the previous scene
 * to extend past its end, doubling the work and complicating scene-relative
 * timing). The compromise is: this wrapper transforms the entire scene
 * container including its background, so transitions like `push_left`
 * read as a slide-in even though under the hood the previous content has
 * already been unmounted.
 */
export type SceneTransitionKind =
  | "cut"
  | "fade"
  | "push_left"
  | "push_up"
  | "whip"
  | "scale_down";

const TRANSITION_FRAMES: Record<SceneTransitionKind, number> = {
  cut: 0,
  fade: 8,
  push_left: 14,
  push_up: 14,
  whip: 6,
  scale_down: 10,
};

/* Cubic-out: snappy entrance that settles, instead of a linear lurch. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function SceneTransition({
  kind,
  sceneDurationInFrames,
  children,
}: {
  kind: SceneTransitionKind;
  sceneDurationInFrames: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  /* No-op fast path: keeps the render tree shallow when the spec asks for
   * a hard cut, which is still the default for scene 0. */
  if (kind === "cut") {
    return <>{children}</>;
  }

  const dur = Math.min(
    TRANSITION_FRAMES[kind],
    Math.max(1, Math.floor(sceneDurationInFrames / 4))
  );
  const t = interpolate(frame, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  let transform = "";
  let opacity = 1;
  let filter: string | undefined;

  switch (kind) {
    case "fade":
      opacity = t;
      break;
    case "push_left":
      transform = `translateX(${(1 - t) * width}px)`;
      break;
    case "push_up":
      transform = `translateY(${(1 - t) * height}px)`;
      break;
    case "whip":
      /* Slight overshoot scale + brief blur — feels like a camera snap.
       * Kept short (6 frames) so it doesn't outstay its welcome. */
      transform = `scale(${1 + (1 - t) * 0.18})`;
      opacity = interpolate(t, [0, 0.4, 1], [0, 0.6, 1]);
      filter = `blur(${(1 - t) * 6}px)`;
      break;
    case "scale_down":
      /* New scene starts slightly larger (1.06) and settles to 1.0,
       * suggesting the camera is moving in. */
      transform = `scale(${1 + (1 - t) * 0.06})`;
      opacity = t;
      break;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        transform: transform || undefined,
        transformOrigin: "50% 50%",
        filter,
        /* willChange so the browser/Remotion compositor handles the
         * transform on the GPU layer rather than re-painting each frame. */
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  );
}
