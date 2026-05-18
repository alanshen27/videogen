import { z } from "zod";
import type { JobArtifact, JobLog } from "@prisma/client";
import { db } from "../db";
import { generateStructuredOutput, generateFreeText } from "../llm/client";
import { downloadImage as downloadImageFile } from "./download-image";
import { searchReferenceImages } from "./search-images";

export interface ToolContext {
  jobId: string;
}

const toolDefinitions = {
  generateText: {
    description: "Generate text using the LLM with a given prompt and optional Zod schema for structured output",
    input: z.object({
      prompt: z.string(),
      schemaDescription: z.string().optional(),
      systemMessage: z.string().optional(),
    }),
  },
  searchReferenceImages: {
    description: "Search for reference images online by query",
    input: z.object({
      query: z.string(),
    }),
  },
  downloadImage: {
    description: "Download an image from a URL to local storage",
    input: z.object({
      url: z.string(),
      filename: z.string(),
    }),
  },
  updateJobProgress: {
    description: "Update the progress and status of a job",
    input: z.object({
      jobId: z.string(),
      progress: z.number().min(0).max(100),
      status: z.string(),
    }),
  },
  appendJobLog: {
    description: "Append a log entry to a job",
    input: z.object({
      jobId: z.string(),
      level: z.enum(["info", "warn", "error"]).default("info"),
      message: z.string(),
    }),
  },
  saveArtifact: {
    description: "Save an artifact for a job",
    input: z.object({
      jobId: z.string(),
      type: z.enum([
        "PLAN", "SCRIPT", "STORYBOARD", "SCENE_SPEC", "ASSETS",
        "REMOTION_SPEC", "VOICE_TIMELINE", "METADATA", "VIDEO", "THUMBNAIL", "IMAGE",
      ]),
      contentJson: z.any().optional(),
      filePath: z.string().optional(),
    }),
  },
};

type ToolName = keyof typeof toolDefinitions;

export async function executeTool(
  name: ToolName,
  input: unknown,
  ctx: ToolContext
): Promise<unknown> {
  const def = toolDefinitions[name];
  const parsed = def.input.parse(input);

  switch (name) {
    case "generateText": {
      const p = parsed as { prompt: string; schemaDescription?: string; systemMessage?: string };
      if (p.schemaDescription) {
        return await generateFreeText({
          prompt: p.prompt,
          systemMessage: p.systemMessage,
        });
      }
      return await generateFreeText({
        prompt: p.prompt,
        systemMessage: p.systemMessage,
      });
    }
    case "searchReferenceImages": {
      const p = parsed as { query: string };
      const results = await searchReferenceImages(p.query);
      return results.map((r) => ({ url: r.url, alt: r.alt, source: r.source }));
    }
    case "downloadImage": {
      const p = parsed as { url: string; filename: string };
      return await downloadImageFile(p.url, p.filename);
    }
    case "updateJobProgress": {
      const p = parsed as { jobId: string; progress: number; status: string };
      await db.job.update({
        where: { id: p.jobId },
        data: {
          progress: p.progress,
          status: p.status as any,
        },
      });
      return { success: true };
    }
    case "appendJobLog": {
      const p = parsed as { jobId: string; level: string; message: string };
      return await db.jobLog.create({
        data: {
          jobId: p.jobId,
          level: p.level,
          message: p.message,
        },
      });
    }
    case "saveArtifact": {
      const p = parsed as { jobId: string; type: string; contentJson?: unknown; filePath?: string };
      return await db.jobArtifact.create({
        data: {
          jobId: p.jobId,
          type: p.type as any,
          contentJson: p.contentJson ?? undefined,
          filePath: p.filePath ?? undefined,
        },
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export type ToolNameType = ToolName;
export const toolSchema = z.object({
  tool: z.enum(Object.keys(toolDefinitions) as [ToolName, ...ToolName[]]),
  input: z.any(),
});
