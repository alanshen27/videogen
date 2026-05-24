import { findPhraseStartSeconds } from "../src/server/tts/elevenlabs";

const narration = "the request hits the load balancer, then routes through Auth to the queue.";
const characters = narration.split("");
const characterStartTimesSeconds = characters.map((_, i) => (i / characters.length) * 5.0);
const characterEndTimesSeconds = characters.map(
  (_, i) => ((i + 1) / characters.length) * 5.0
);
const alignment = {
  characters,
  characterStartTimesSeconds,
  characterEndTimesSeconds,
};

console.log("Test 1 - 'load balancer':");
console.log(findPhraseStartSeconds(alignment, "load balancer"));

console.log("\nTest 2 - 'auth' case-insensitive:");
console.log(findPhraseStartSeconds(alignment, "auth"));

console.log("\nTest 3 - successive cursor (the visual cue advance pattern):");
let cursor = 0;
for (const phrase of ["request hits", "load balancer", "through Auth", "the queue"]) {
  const r = findPhraseStartSeconds(alignment, phrase, cursor);
  console.log(
    `  cue="${phrase}" startSec=${r?.startSeconds?.toFixed(2)} endIdx=${r?.endCharIndex}`
  );
  if (r) cursor = r.endCharIndex;
}

console.log("\nTest 4 - phrase not in narration (returns null):");
console.log(findPhraseStartSeconds(alignment, "kubernetes"));

console.log("\nTest 5 - phrase with emotion tag prefix (tag is stripped):");
console.log(findPhraseStartSeconds(alignment, "[thoughtful] load balancer"));

console.log("\nTest 6 - phrase with extra whitespace:");
console.log(findPhraseStartSeconds(alignment, "  load   balancer "));
