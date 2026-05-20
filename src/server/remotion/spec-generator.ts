/**
 * Remotion Spec Generator
 *
 * Produces a render-ready Remotion project from a video spec.
 * In a full setup, this would scaffold a Remotion project and
 * invoke `npx remotion render` to produce the final MP4.
 *
 * For MVP, this creates a spec-compliant JSON that can be fed
 * to a Remotion composition at render time.
 */
import type { RemotionSpec } from "../llm/schemas";
import * as fs from "fs/promises";
import * as path from "path";

export async function generateRemotionProject(
  spec: RemotionSpec,
  jobId: string
): Promise<string> {
  const projectDir = path.join(process.cwd(), "data", "videos", jobId);

  await fs.mkdir(projectDir, { recursive: true });

  const specPath = path.join(projectDir, "remotion-spec.json");
  await fs.writeFile(specPath, JSON.stringify(spec, null, 2));

  const compositionEntry = `
// Auto-generated Remotion composition for job: ${jobId}
// To render: npx remotion render HelloWorld out/video.mp4

import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';

const spec = require('./remotion-spec.json');

const AnimationComponents: Record<string, React.FC<{ children: React.ReactNode; frame: number; durationInFrames: number }>> = {
  fade: ({ children, frame, durationInFrames }) => {
    const opacity = interpolate(frame, [0, Math.min(15, durationInFrames * 0.2)], [0, 1], { extrapolateRight: 'clamp' });
    return <div style={{ opacity }}>{children}</div>;
  },
  slide: ({ children, frame, durationInFrames }) => {
    const translateX = interpolate(frame, [0, Math.min(15, durationInFrames * 0.2)], [50, 0], { extrapolateRight: 'clamp' });
    return <div style={{ transform: \`translateX(\${translateX}px)\` }}>{children}</div>;
  },
  scale: ({ children, frame, durationInFrames }) => {
    const s = spring({ frame, fps: 30, config: { mass: 0.5 } });
    return <div style={{ transform: \`scale(\${s})\` }}>{children}</div>;
  },
  highlight: ({ children, frame, durationInFrames }) => {
    const intensity = interpolate(frame, [0, 10, durationInFrames * 0.7, durationInFrames], [0, 1, 1, 0]);
    const bg = \`rgba(217, 124, 117, \${intensity * 0.3})\`;
    return <div style={{ backgroundColor: bg, borderRadius: 8, padding: 4 }}>{children}</div>;
  },
  none: ({ children }) => <>{children}</>,
};

function RenderElement({ el }: { el: { type: string; content: string; x: number; y: number; animation: string; frame: number; durationInFrames: number } }) {
  const styles: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    fontFamily: 'monospace',
    color: '#e5e5e5',
  };

  switch (el.type) {
    case 'text':
      return <div style={{ ...styles, fontSize: 24, maxWidth: 1200 }}>{el.content}</div>;
    case 'code':
      return <pre style={{ ...styles, backgroundColor: '#1a1a2e', padding: '8px 16px', borderRadius: 6, fontSize: 16, maxWidth: 800 }}><code>{el.content}</code></pre>;
    case 'box':
      return <div style={{ ...styles, width: 200, height: 100, border: '2px solid #d97c75', borderRadius: 8 }} />;
    case 'circle':
      return <div style={{ ...styles, width: 80, height: 80, borderRadius: '50%', border: '2px solid #f59e0b' }} />;
    case 'arrow':
      return <div style={{ ...styles, color: '#ef4444', fontSize: 32 }}>{el.content || '→'}</div>;
    default:
      return null;
  }
}

export const AutoChannelComposition: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0f0f1a' }}>
      {spec.scenes.map((scene: { fromFrame: number; durationInFrames: number; elements: any[] }, sceneIdx: number) => (
        <Sequence key={sceneIdx} from={scene.fromFrame} durationInFrames={scene.durationInFrames}>
          <AbsoluteFill style={{ backgroundColor: scene.background || '#0f0f1a' }}>
            {scene.elements.map((el: any, elIdx: number) => {
              const AnimComponent = AnimationComponents[el.animation] || AnimationComponents.none;
              return (
                <AnimComponent key={elIdx} frame={0} durationInFrames={scene.durationInFrames}>
                  <RenderElement el={{ ...el, frame: 0, durationInFrames: scene.durationInFrames }} />
                </AnimComponent>
              );
            })}
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
`;

  const compPath = path.join(projectDir, "Composition.tsx");
  await fs.writeFile(compPath, compositionEntry.trim());

  return projectDir;
}

export function estimateRenderTime(spec: RemotionSpec): number {
  const totalFrames = spec.composition.durationInFrames;
  const estimatedSecondsPerFrame = 0.5;
  return totalFrames * estimatedSecondsPerFrame;
}
