import { buildYoutubeRemotionSpecFromBrandedScenes } from "../src/server/remotion/branded-scene-spec";
import type { BrandedSceneSpec, Script } from "../src/server/llm/schemas";

const narration =
  "First, the request hits the load balancer. Then it routes through Auth. Finally the queue picks it up and writes to Postgres.";
const characters = narration.split("");
const totalSec = 6.0;
const characterStartTimesSeconds = characters.map((_, i) => (i / characters.length) * totalSec);
const characterEndTimesSeconds = characters.map(
  (_, i) => ((i + 1) / characters.length) * totalSec
);
const alignment = {
  characters,
  characterStartTimesSeconds,
  characterEndTimesSeconds,
};

const script: Script = {
  title: "T",
  hook: "H",
  fullNarration: narration,
  scenes: [
    {
      sceneNumber: 1,
      startSecond: 0,
      endSecond: 6,
      narration,
      visualDescription: "flowchart",
      codeSnippet: null,
      animationType: "diagram",
    },
  ],
};

const sceneSpec: BrandedSceneSpec = {
  visualStyle: "",
  scenes: [
    {
      sceneNumber: 1,
      template: "left_diagram_right_text",
      headline: "Anatomy of a POST",
      body: "",
      listItems: [],
      diagramMermaid:
        "flowchart LR\n  U[Client] --> LB[ALB]\n  LB --> A[Auth]\n  A --> Q[Queue]\n  Q --> DB[Postgres]",
      imageSearchQuery: "",
      codeSnippet: "",
      focusBeats: [
        {
          startSecond: 0,
          endSecond: 0.8,
          target: "title",
          mode: "highlight",
          caption: "",
          mermaidTargets: [],
          cueText: "",
        },
        {
          startSecond: 0.8,
          endSecond: 2.0,
          target: "diagram",
          mode: "highlight",
          caption: "lb",
          mermaidTargets: ["U", "LB"],
          cueText: "load balancer",
        },
        {
          startSecond: 2.0,
          endSecond: 3.5,
          target: "diagram",
          mode: "highlight",
          caption: "auth",
          mermaidTargets: ["A"],
          cueText: "through Auth",
        },
        {
          startSecond: 3.5,
          endSecond: 5.0,
          target: "diagram",
          mode: "highlight",
          caption: "queue",
          mermaidTargets: ["Q"],
          cueText: "queue picks it up",
        },
        {
          startSecond: 5.0,
          endSecond: 6.0,
          target: "diagram",
          mode: "highlight",
          caption: "db",
          mermaidTargets: ["DB"],
          cueText: "Postgres",
        },
      ],
    },
  ],
};

const out = buildYoutubeRemotionSpecFromBrandedScenes(sceneSpec, script, {
  imageByScene: new Map(),
  orientation: "LANDSCAPE",
  voiceTimingsBySceneIndex: {
    0: {
      durationFrames: Math.round(totalSec * 30),
      alignment,
      narration,
    },
  },
});

const scene = out.scenes[0]!;
const mermaidEl = scene.elements.find((e) => e.type === "mermaid")! as typeof scene.elements[0] & {
  diagramBeats?: { fromFrame: number; durationInFrames: number; targets: string[] }[];
};

console.log("Scene durationInFrames:", scene.durationInFrames, "(expected 180 for 6s)");
console.log("\nDiagram beats:");
for (const b of mermaidEl.diagramBeats ?? []) {
  console.log(
    `  fromFrame=${b.fromFrame.toString().padStart(3)} (sec=${(b.fromFrame / 30).toFixed(2)}) dur=${b.durationInFrames.toString().padStart(3)} targets=${b.targets.join(",")}`
  );
}

console.log("\nExpected:");
console.log(`  'load balancer' should fire ~${(narration.toLowerCase().indexOf("load balancer") / characters.length * totalSec).toFixed(2)}s`);
console.log(`  'through Auth'  should fire ~${(narration.toLowerCase().indexOf("through auth") / characters.length * totalSec).toFixed(2)}s`);
console.log(`  'Postgres'      should fire ~${(narration.toLowerCase().indexOf("postgres") / characters.length * totalSec).toFixed(2)}s`);
