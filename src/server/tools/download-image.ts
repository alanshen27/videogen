import * as path from "path";
import * as fs from "fs/promises";
import { existsSync } from "fs";

const IMAGES_DIR = path.join(process.cwd(), "public", "reference-images");

export async function downloadImage(
  url: string,
  filename: string
): Promise<string> {
  if (!existsSync(IMAGES_DIR)) {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
  }

  const filePath = path.join(IMAGES_DIR, filename);

  if (existsSync(filePath)) {
    return filePath;
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

    await fs.writeFile(filePath, buffer);
    return filePath;
  } catch (error) {
    throw new Error(
      `Image download failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
