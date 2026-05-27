import * as path from "path";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import { evaluateImageBuffer, type ImageEvalResult } from "./image-eval";

const IMAGES_DIR = path.join(process.cwd(), "public", "reference-images");

export type DownloadOptions = {
  /** Run the image evaluator (size/aspect/format) and reject failures. */
  evaluate?: boolean;
  /** Custom min dims if needed (e.g., logos can be smaller). */
  minWidth?: number;
  minHeight?: number;
  minBytes?: number;
};

export type DownloadResult = {
  filePath: string;
  eval: ImageEvalResult | null;
};

/**
 * Download an image URL, write it to `public/reference-images/<filename>`,
 * and (optionally) evaluate the bytes for likely-junk patterns.
 *
 * On evaluator failure the file is deleted and we throw so the caller can
 * try the next candidate. On success the returned path is what the spec
 * builder should use.
 */
export async function downloadImage(
  url: string,
  filename: string,
  opts: DownloadOptions = {}
): Promise<DownloadResult> {
  if (!existsSync(IMAGES_DIR)) {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
  }

  const filePath = path.join(IMAGES_DIR, filename);

  if (existsSync(filePath)) {
    return { filePath, eval: null };
  }

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.google.com/",
      },
    });
    if (!response.ok) throw new Error(`Failed to download: HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await response.arrayBuffer());

    /* Reject empty or HTML payloads early — some image hosts return a 200 HTML
     * "blocked" page instead of the bitmap. */
    if (buffer.byteLength < 1024) {
      throw new Error(`Suspiciously small payload (${buffer.byteLength}B, content-type=${contentType})`);
    }
    if (
      contentType.includes("text/html") ||
      contentType.startsWith("text/") ||
      contentType.includes("application/json")
    ) {
      throw new Error(`Wrong content-type: ${contentType}`);
    }

    /* Run the heuristic evaluator on bytes BEFORE persisting so we don't
     * litter the disk with rejects. */
    let evalResult: ImageEvalResult | null = null;
    if (opts.evaluate !== false) {
      evalResult = evaluateImageBuffer(buffer, {
        minWidth: opts.minWidth,
        minHeight: opts.minHeight,
        minBytes: opts.minBytes,
      });
      if (!evalResult.ok) {
        throw new Error(
          `Image rejected by evaluator: ${evalResult.reason} (probe: ${evalResult.probe.format} ${evalResult.probe.width}x${evalResult.probe.height}, ${evalResult.probe.byteLength}B)`
        );
      }
    }

    await fs.writeFile(filePath, buffer);
    return { filePath, eval: evalResult };
  } catch (error) {
    throw new Error(
      `Image download failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
