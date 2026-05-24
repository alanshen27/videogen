import { buildYoutubeRemotionSpecFromBrandedScenes } from "../src/server/remotion/branded-scene-spec";
import type { BrandedSceneSpec, Script } from "../src/server/llm/schemas";

const narration =
  "First, migrations applied to the live database. Then feature flags off for the new path. Finally rollback tested by replaying traffic.";
const characters = narration.split("");
const totalSec = 8.0;
const startTimes = characters.map((_, i) => (i / characters.length) * totalSec);
const endTimes = characters.map((_, i) => ((i + 1) / characters.length) * totalSec);

const script: Script = {
  title: "T",
  hook: "H",
  fullNarration: narration,
  scenes: [
    {
      sceneNumber: 1,
      startSecond: 0,
      endSecond: 8,
      narration,
      visualDescription: "list",
      codeSnippet: null,
      animationType: "analogy",
    },
  ],
};

const sceneSpec: BrandedSceneSpec = {
  visualStyle: "",
  scenes: [
    {
      sceneNumber: 1,
      template: "list",
      headline: "Three checks before deploy",
      body: "",
      listItems: ["Migrations applied", "Feature flags off", "Rollback tested"],
      diagramMermaid: "",
      imageSearchQuery: "",
      codeSnippet: "",
      focusBeats: [
        { startSecond: 0, endSecond: 1, target: "title", mode: "highlight", caption: "", mermaidTargets: [], cueText: "" },
        { startSecond: 1, endSecond: 3, target: "list", mode: "highlight", caption: "", mermaidTargets: ["0"], cueText: "migrations applied" },
        { startSecond: 3, endSecond: 5, target: "list", mode: "highlight", caption: "", mermaidTargets: ["1"], cueText: "feature flags off" },
        { startSecond: 5, endSecond: 8, target: "list", mode: "highlight", caption: "", mermaidTargets: ["2"], cueText: "rollback tested" },
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
      alignment: {
        characters,
        characterStartTimesSeconds: startTimes,
        characterEndTimesSeconds: endTimes,
      },
      narration,
    },
  },
});

const scene = out.scenes[0]!;
const textEl = scene.elements.find((e) => e.type === "text")! as typeof scene.elements[0] & {
  listBeats?: { fromFrame: number; itemIndex: number }[];
};

console.log("Scene durationInFrames:", scene.durationInFrames, "(expected 240 for 8s)");
console.log("\nList beats:");
for (const b of (textEl.listBeats ?? []).sort((a, b) => a.itemIndex - b.itemIndex)) {
  console.log(
    `  itemIndex=${b.itemIndex} fromFrame=${b.fromFrame.toString().padStart(3)} (sec=${(b.fromFrame / 30).toFixed(2)})`
  );
}

const expectedTimes = ["migrations applied", "feature flags off", "rollback tested"].map((p) => ({
  phrase: p,
  sec: (narration.toLowerCase().indexOf(p) / characters.length * totalSec).toFixed(2),
}));
console.log("\nExpected approximate fire times:");
for (const e of expectedTimes) console.log(`  '${e.phrase}' ~${e.sec}s`);
