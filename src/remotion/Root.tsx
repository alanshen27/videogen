import React from "react";
import { Composition } from "remotion";
import type { RemotionSpec } from "../server/llm/schemas";
import fallbackSpec from "../../rem.json";
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
        durationInFrames={300}
        calculateMetadata={async ({ props }) => {
          const s = (props.spec ?? fallback) as RemotionSpec;
          return {
            durationInFrames: s.composition.durationInFrames,
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
        durationInFrames={300}
        calculateMetadata={async ({ props }) => {
          const s = (props.spec ?? fallback) as RemotionSpec;
          return {
            durationInFrames: s.composition.durationInFrames,
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
