import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().optional().default(""),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  IMAGE_SEARCH_API_KEY: z.string().optional().default(""),
  SERPAPI_API_KEY: z.string().optional().default(""),
  /** ElevenLabs — https://elevenlabs.io (optional; required when jobs use voice-over) */
  ELEVENLABS_API_KEY: z.string().optional().default(""),
  /** Voice ID from ElevenLabs dashboard; default is “Rachel” */
  ELEVENLABS_VOICE_ID: z
    .string()
    .optional()
    .default("21m00Tcm4TlvDq8ikWAM"),
});

export const env = envSchema.parse(process.env);
