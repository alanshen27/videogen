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
  /** SMTP — optional; when set, completed renders are emailed to NOTIFY_EMAIL */
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  /** Recipient inbox for finished videos */
  NOTIFY_EMAIL: z.string().optional().default(""),
});

export const env = envSchema.parse(process.env);

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(
    env.SMTP_HOST.trim() &&
      env.SMTP_FROM.trim() &&
      env.NOTIFY_EMAIL.trim() &&
      env.SMTP_USER.trim() &&
      env.SMTP_PASS.trim()
  );
}
