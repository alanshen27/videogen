import { Queue, Worker, type Job as BullJob } from "bullmq";
import { env } from "../env";

const connection = {
  url: env.REDIS_URL,
};

export const videoGenerationQueue = new Queue("video-generation", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

export function createWorker(
  name: string,
  processor: (job: BullJob) => Promise<void>
) {
  const worker = new Worker("video-generation", processor, {
    connection,
    concurrency: 2,
  });

  return { worker };
}
