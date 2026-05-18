import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "../../db";
import { videoGenerationQueue } from "../../queue";

export const jobRouter = router({
  create: publicProcedure
    .input(
      z.object({
        topic: z.string().min(1, "Topic is required"),
        durationSeconds: z.number().min(10).max(600).default(90),
        audienceLevel: z
          .enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"])
          .default("BEGINNER"),
        style: z
          .enum(["FIRESHIP", "BYTEBYTEGO", "THREE_BLUE_ONE_BROWN", "CUSTOM"])
          .default("FIRESHIP"),
        orientation: z.enum(["LANDSCAPE", "PORTRAIT"]).default("LANDSCAPE"),
        instructions: z.string().default(""),
        includeImages: z.boolean().default(true),
        generateThumbnail: z.boolean().default(true),
        renderVideo: z.boolean().default(true),
        voiceOver: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const job = await db.job.create({
        data: {
          topic: input.topic,
          durationSeconds: input.durationSeconds,
          audienceLevel: input.audienceLevel,
          style: input.style,
          orientation: input.orientation,
          instructions: input.instructions,
          includeImages: input.includeImages,
          generateThumbnail: input.generateThumbnail,
          renderVideo: input.renderVideo,
          voiceOver: input.voiceOver,
          status: "PENDING",
          progress: 0,
        },
      });

      await videoGenerationQueue.add("process-video", {
        jobId: job.id,
        topic: job.topic,
      });

      await db.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: "Job created and queued for processing",
        },
      });

      return job;
    }),

  list: publicProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const jobs = await db.job.findMany({
        take: input.limit + 1,
        orderBy: { createdAt: "desc" },
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (jobs.length > input.limit) {
        const nextItem = jobs.pop();
        nextCursor = nextItem!.id;
      }

      return { items: jobs, nextCursor };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const job = await db.job.findUnique({
        where: { id: input.id },
      });
      if (!job) throw new Error("Job not found");
      return job;
    }),

  retry: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const job = await db.job.findUnique({ where: { id: input.id } });
      if (!job) throw new Error("Job not found");

      if (job.status !== "FAILED") {
        throw new Error("Only failed jobs can be retried");
      }

      await db.job.update({
        where: { id: input.id },
        data: { status: "PENDING", progress: 0, error: null },
      });

      await videoGenerationQueue.add("process-video", {
        jobId: job.id,
        topic: job.topic,
      });

      await db.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: "Job retried and re-queued for processing",
        },
      });

      return { success: true };
    }),

  cancel: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const job = await db.job.findUnique({ where: { id: input.id } });
      if (!job) throw new Error("Job not found");

      const cancelableStatuses = ["PENDING", "PLANNING", "SCRIPTING", "ASSETS"];
      if (!cancelableStatuses.includes(job.status)) {
        throw new Error("Job cannot be cancelled in its current status");
      }

      const updated = await db.job.update({
        where: { id: input.id },
        data: { status: "FAILED", error: "Cancelled by user" },
      });

      await db.jobLog.create({
        data: {
          jobId: job.id,
          level: "warn",
          message: "Job cancelled by user",
        },
      });

      return updated;
    }),

  logs: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      return db.jobLog.findMany({
        where: { jobId: input.jobId },
        orderBy: { createdAt: "asc" },
      });
    }),

  artifacts: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      return db.jobArtifact.findMany({
        where: { jobId: input.jobId },
        orderBy: { createdAt: "asc" },
      });
    }),

  getArtifact: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const artifact = await db.jobArtifact.findUnique({
        where: { id: input.id },
      });
      if (!artifact) throw new Error("Artifact not found");
      return artifact;
    }),
});
