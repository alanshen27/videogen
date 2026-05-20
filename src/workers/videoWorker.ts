import "dotenv/config";

import { createWorker } from "../server/queue";
import { executePipeline } from "../server/queue/pipeline";
import { db } from "../server/db";

const { worker } = createWorker("video-generation", async (job) => {
  const { jobId } = job.data as { jobId: string };
  console.log(`[Worker] Processing job: ${jobId}`);

  const dbJob = await db.job.findUnique({ where: { id: jobId } });
  if (!dbJob) {
    throw new Error(`Job ${jobId} not found`);
  }

  await executePipeline(dbJob);
});

console.log("[Worker] Video generation worker started");
console.log("[Worker] Listening for jobs on queue: video-generation");

const gracefulShutdown = async () => {
  console.log("[Worker] Shutting down...");
  await worker.close();
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
