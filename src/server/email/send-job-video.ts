import * as fs from "fs/promises";
import nodemailer from "nodemailer";
import type { VideoMetadata } from "../llm/schemas";
import { env, isEmailDeliveryConfigured } from "../env";

const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024;

export type JobVideoEmailPayload = {
  jobId: string;
  topic: string;
  videoPath: string;
  metadata: VideoMetadata;
  scriptTitle?: string;
  hook?: string;
  sceneCount: number;
  runtimeSeconds: number;
};

function formatRuntime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function buildJobVideoEmailBody(payload: JobVideoEmailPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const title = payload.metadata.title || payload.scriptTitle || payload.topic;
  const subject = `[segfault] ${title}`;

  const tags =
    payload.metadata.tags.length > 0
      ? payload.metadata.tags.join(", ")
      : "—";

  const summaryBlock = [
    `Topic: ${payload.topic}`,
    payload.hook ? `Hook: ${payload.hook}` : null,
    `Runtime: ${formatRuntime(payload.runtimeSeconds)} · ${payload.sceneCount} scenes`,
    `Category: ${payload.metadata.category}`,
    `Language: ${payload.metadata.language}`,
    `Tags: ${tags}`,
    "",
    payload.metadata.description,
    "",
    `Job: ${payload.jobId}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const text = `Your video is ready.\n\n${summaryBlock}\n\nThe MP4 is attached.`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5; color: #1a1614;">
  <p>Your video is ready.</p>
  <h2 style="margin: 0 0 8px; font-size: 20px;">${escapeHtml(title)}</h2>
  <p style="margin: 0 0 16px; color: #6b6560;"><strong>Topic:</strong> ${escapeHtml(payload.topic)}</p>
  ${payload.hook ? `<p style="font-style: italic; color: #6b6560;">${escapeHtml(payload.hook)}</p>` : ""}
  <ul style="padding-left: 20px; color: #3d3835;">
    <li><strong>Runtime:</strong> ${escapeHtml(formatRuntime(payload.runtimeSeconds))} · ${payload.sceneCount} scenes</li>
    <li><strong>Category:</strong> ${escapeHtml(payload.metadata.category)}</li>
    <li><strong>Language:</strong> ${escapeHtml(payload.metadata.language)}</li>
    <li><strong>Tags:</strong> ${escapeHtml(tags)}</li>
  </ul>
  <div style="margin: 20px 0; padding: 16px; background: #f7f3ee; border-radius: 8px; white-space: pre-wrap;">${escapeHtml(payload.metadata.description)}</div>
  <p style="font-size: 12px; color: #a09b96;">Job ${escapeHtml(payload.jobId)} · MP4 attached</p>
</body>
</html>`.trim();

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Email the rendered MP4 + metadata summary to NOTIFY_EMAIL.
 * No-op when SMTP is not configured. Throws on send failure.
 */
export async function sendJobVideoEmail(
  payload: JobVideoEmailPayload
): Promise<void> {
  if (!isEmailDeliveryConfigured()) {
    return;
  }

  const stat = await fs.stat(payload.videoPath);
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Video is ${(stat.size / 1024 / 1024).toFixed(1)} MB — over the ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB email limit`
    );
  }

  const { subject, text, html } = buildJobVideoEmailBody(payload);

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: env.NOTIFY_EMAIL,
    subject,
    text,
    html,
    attachments: [
      {
        filename: "video.mp4",
        path: payload.videoPath,
        contentType: "video/mp4",
      },
    ],
  });
}
