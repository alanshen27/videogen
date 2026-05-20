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
  /** SMTP — optional; when set, completed renders are emailed to EMAIL_TO */
  EMAIL_HOST: z.string().optional().default(""),
  EMAIL_PORT: z.coerce.number().int().positive().optional().default(587),
  EMAIL_USER: z.string().optional().default(""),
  EMAIL_PASS: z.string().optional().default(""),
  /** Sender address; defaults to EMAIL_USER when unset */
  EMAIL_FROM: z.string().optional().default(""),
  EMAIL_TO: z.string().optional().default(""),
});

export const env = envSchema.parse(process.env);

/** Resolved From header — explicit EMAIL_FROM or the authenticated mailbox. */
export function emailFromAddress(): string {
  return env.EMAIL_FROM.trim() || env.EMAIL_USER.trim();
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(
    env.EMAIL_HOST.trim() &&
      emailFromAddress() &&
      env.EMAIL_TO.trim() &&
      env.EMAIL_USER.trim() &&
      env.EMAIL_PASS.trim()
  );
}
