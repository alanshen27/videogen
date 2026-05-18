import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/remotion/index.ts");
/* Multiple ElevenLabs clips need enough pooled <audio> tags during preview/render */
Config.setNumberOfSharedAudioTags(48);
