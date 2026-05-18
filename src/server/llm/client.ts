import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { env } from "../env";

const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY || "sk-placeholder",
});

/** Motion spec, layout, metadata — heavier reasoning */
export const OPENAI_MODEL_SPEC_DESIGN = "gpt-5.5";

/** Plan, script, auxiliary prose — faster / cheaper */
export const OPENAI_MODEL_SCRIPT_LIGHT = "gpt-5-nano";

export async function generateStructuredOutput<T>({
  prompt,
  schema,
  systemMessage,
  maxRetries = 1,
  modelId = OPENAI_MODEL_SPEC_DESIGN,
}: {
  prompt: string;
  schema: z.ZodSchema<T>;
  systemMessage?: string;
  maxRetries?: number;
  /** Defaults to spec/design model */
  modelId?: string;
}): Promise<T> {
  const model = openai(modelId);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateObject({
        model,
        schema,
        prompt,
        system:
          systemMessage ??
          "You are a technical video production assistant. Always return valid JSON.",
        temperature: 0.7,
      });

      const parsed = schema.safeParse(result.object);
      if (parsed.success) {
        return parsed.data;
      }

      if (attempt < maxRetries) {
        prompt = `Previous output failed validation with errors: ${JSON.stringify(parsed.error.issues)}\n\nPlease fix and regenerate the JSON. Original prompt:\n${prompt}`;
      } else {
        throw new Error(
          `Schema validation failed after ${maxRetries + 1} attempts: ${JSON.stringify(parsed.error.issues)}`
        );
      }
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }

  throw new Error("Failed to generate structured output");
}

export async function generateFreeText({
  prompt,
  systemMessage,
  modelId = OPENAI_MODEL_SCRIPT_LIGHT,
}: {
  prompt: string;
  systemMessage?: string;
  /** Defaults to script/light model */
  modelId?: string;
}): Promise<string> {
  const model = openai(modelId);

  const result = await generateText({
    model,
    prompt,
    system:
      systemMessage ??
      "You are a technical video production assistant. Respond helpfully.",
    temperature: 0.7,
  });

  return result.text;
}
