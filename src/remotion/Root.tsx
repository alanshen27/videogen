import React from "react";
import { Composition } from "remotion";
import type { RemotionSpec } from "../server/llm/schemas";
import fallbackSpec from "../../rem.json";
import { BRAND_INTRO_FRAMES } from "./spec/BrandIntro";
import { VideoFromSpec, type VideoFromSpecProps } from "./VideoFromSpec";

const fallback = fallbackSpec as RemotionSpec;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyComp"
        component={VideoFromSpec}
        defaultProps={{
          spec: null,
        } satisfies VideoFromSpecProps}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300 + BRAND_INTRO_FRAMES}
        calculateMetadata={async ({ props }) => {
          const s = (props.spec ?? fallback) as RemotionSpec;
          return {
            durationInFrames:
              s.composition.durationInFrames + BRAND_INTRO_FRAMES,
            fps: s.composition.fps,
            width: s.composition.width,
            height: s.composition.height,
            props,
          };
        }}
      />
      <Composition
        id="MyCompPortrait"
        component={VideoFromSpec}
        defaultProps={{ spec: null } satisfies VideoFromSpecProps}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300 + BRAND_INTRO_FRAMES}
        calculateMetadata={async ({ props }) => {
          const s = (props.spec ?? fallback) as RemotionSpec;
          return {
            durationInFrames:
              s.composition.durationInFrames + BRAND_INTRO_FRAMES,
            fps: s.composition.fps,
            width: s.composition.width,
            height: s.composition.height,
            props,
          };
        }}
      />
    </>
  );
};
