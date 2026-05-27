/**
 * Lightweight image evaluator. Runs on the downloaded buffer to decide
 * whether the image is worth showing to viewers before it lands in the
 * spec. The goal is to filter the obvious junk that slips through Google
 * Image search:
 *
 *   - Tracking pixels (1x1 GIFs, 8B payloads)
 *   - Watermark stripes from stock sites (wide-but-short banners)
 *   - Wrong-aspect crops that the renderer will letterbox into nothing
 *   - HTML/JSON misadvertised as `image/*` (already handled in
 *     download-image.ts via content-type, but we double-check on bytes)
 *
 * We avoid pulling in `sharp` / `jimp` (these triple the worker install
 * size) by reading dimensions straight out of file headers for the four
 * formats we actually see (PNG, JPEG, GIF, WebP).
 */

import * as fs from "fs/promises";

export type ImageProbe = {
  format: "png" | "jpeg" | "gif" | "webp" | "svg" | "unknown";
  width: number;
  height: number;
  byteLength: number;
};

function readUInt32BE(buf: Buffer, off: number): number {
  return (
    (buf[off]! << 24) |
    (buf[off + 1]! << 16) |
    (buf[off + 2]! << 8) |
    buf[off + 3]!
  );
}

function probePng(buf: Buffer): { w: number; h: number } | null {
  /* PNG signature: 89 50 4E 47 0D 0A 1A 0A. IHDR chunk starts at byte 8,
   * the width/height are at bytes 16..23 (big-endian). */
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47)
    return null;
  return { w: readUInt32BE(buf, 16), h: readUInt32BE(buf, 20) };
}

function probeJpeg(buf: Buffer): { w: number; h: number } | null {
  /* JPEG: FF D8, then a sequence of segments. We scan for SOFn (FF C0..C3,
   * C5..C7, C9..CB, CD..CF) and read height (2B) + width (2B) after the
   * 5-byte marker + length + precision. */
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1]!;
    /* Skip RSTn (D0-D7) and SOI / EOI / TEM */
    if (marker === 0x00 || marker === 0xff) {
      i++;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd9) {
      i += 2;
      continue;
    }
    const segLen = (buf[i + 2]! << 8) | buf[i + 3]!;
    /* SOFn markers (Start Of Frame) carry the dimensions. */
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      const h = (buf[i + 5]! << 8) | buf[i + 6]!;
      const w = (buf[i + 7]! << 8) | buf[i + 8]!;
      return { w, h };
    }
    i += 2 + segLen;
  }
  return null;
}

function probeGif(buf: Buffer): { w: number; h: number } | null {
  /* GIF87a / GIF89a. Width: bytes 6-7 little-endian, height: 8-9. */
  if (buf.length < 10) return null;
  if (
    buf[0] !== 0x47 ||
    buf[1] !== 0x49 ||
    buf[2] !== 0x46 ||
    buf[3] !== 0x38
  )
    return null;
  return {
    w: buf[6]! | (buf[7]! << 8),
    h: buf[8]! | (buf[9]! << 8),
  };
}

function probeWebp(buf: Buffer): { w: number; h: number } | null {
  /* RIFF .... WEBP VP8(.) ....  — three sub-formats: VP8, VP8L, VP8X. */
  if (buf.length < 30) return null;
  const magic = buf.subarray(0, 4).toString("ascii");
  const webp = buf.subarray(8, 12).toString("ascii");
  if (magic !== "RIFF" || webp !== "WEBP") return null;
  const sub = buf.subarray(12, 16).toString("ascii");
  if (sub === "VP8 ") {
    /* 26-byte VP8 keyframe header. Width/height at byte 26-29
     * after the 0x9d 0x01 0x2a sync code at byte 23. */
    if (buf.length < 30) return null;
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    const w = (buf[26]! | (buf[27]! << 8)) & 0x3fff;
    const h = (buf[28]! | (buf[29]! << 8)) & 0x3fff;
    return { w, h };
  } else if (sub === "VP8L") {
    /* Lossless: width-1 (14 bits) + height-1 (14 bits) packed after 1B sig. */
    if (buf.length < 25) return null;
    const b0 = buf[21]!;
    const b1 = buf[22]!;
    const b2 = buf[23]!;
    const b3 = buf[24]!;
    const w = 1 + (((b1 & 0x3f) << 8) | b0);
    const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { w, h };
  } else if (sub === "VP8X") {
    /* Extended: 24-bit width-1 + 24-bit height-1 at byte 24. */
    if (buf.length < 30) return null;
    const w = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
    const h = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
    return { w, h };
  }
  return null;
}

function probeSvg(buf: Buffer): { w: number; h: number } | null {
  /* SVGs don't have a fixed dimension — read viewBox or width/height if
   * present. Mostly we just need to confirm it parses. */
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString("utf-8");
  if (!head.includes("<svg")) return null;
  const vb = head.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (vb) {
    const parts = vb[1]!.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { w: Math.round(parts[2]!), h: Math.round(parts[3]!) };
    }
  }
  const w = head.match(/<svg[^>]*\bwidth\s*=\s*["']?(\d+)/i);
  const h = head.match(/<svg[^>]*\bheight\s*=\s*["']?(\d+)/i);
  if (w && h) return { w: Number(w[1]!), h: Number(h[1]!) };
  /* SVG is vector; if there's no explicit size, assume it's usable. */
  return { w: 1024, h: 1024 };
}

export function probeImageBuffer(buf: Buffer): ImageProbe {
  const byteLength = buf.byteLength;
  if (buf.length >= 8) {
    const png = probePng(buf);
    if (png) return { format: "png", width: png.w, height: png.h, byteLength };
    const jpeg = probeJpeg(buf);
    if (jpeg) return { format: "jpeg", width: jpeg.w, height: jpeg.h, byteLength };
    const gif = probeGif(buf);
    if (gif) return { format: "gif", width: gif.w, height: gif.h, byteLength };
    const webp = probeWebp(buf);
    if (webp) return { format: "webp", width: webp.w, height: webp.h, byteLength };
    const svg = probeSvg(buf);
    if (svg) return { format: "svg", width: svg.w, height: svg.h, byteLength };
  }
  return { format: "unknown", width: 0, height: 0, byteLength };
}

export type ImageEvalResult =
  | { ok: true; probe: ImageProbe }
  | { ok: false; probe: ImageProbe; reason: string };

/**
 * Heuristic acceptance: every check below is calibrated to reject the
 * common junk classes we've seen empirically, not to be aggressive about
 * "low quality" in general. False positives matter more than false negatives
 * here \u2014 we'd rather show a mediocre image than a blank pane.
 */
export function evaluateImageBuffer(
  buf: Buffer,
  opts: { minWidth?: number; minHeight?: number; minBytes?: number; maxBytes?: number } = {}
): ImageEvalResult {
  const minWidth = opts.minWidth ?? 480;
  const minHeight = opts.minHeight ?? 270;
  const minBytes = opts.minBytes ?? 8 * 1024;
  const maxBytes = opts.maxBytes ?? 12 * 1024 * 1024;

  const probe = probeImageBuffer(buf);

  if (probe.format === "unknown") {
    return { ok: false, probe, reason: "unknown format (not png/jpeg/gif/webp/svg)" };
  }
  /* SVG is vector text — byte size doesn't reflect quality, and an 800B
   * hand-drawn icon is just as crisp as an 8KB one. Skip size and aspect
   * checks; if it parsed, accept it. */
  if (probe.format === "svg") {
    return { ok: true, probe };
  }
  if (probe.byteLength < minBytes) {
    return { ok: false, probe, reason: `too small (${probe.byteLength}B)` };
  }
  if (probe.byteLength > maxBytes) {
    return { ok: false, probe, reason: `too large (${probe.byteLength}B)` };
  }
  if (probe.width <= 0 || probe.height <= 0) {
    return { ok: false, probe, reason: "zero dimensions" };
  }
  if (probe.width < minWidth || probe.height < minHeight) {
    return {
      ok: false,
      probe,
      reason: `dimensions ${probe.width}x${probe.height} below ${minWidth}x${minHeight}`,
    };
  }
  /* Aspect: 0.4..3.0 covers everything reasonable. Tighter than this and we
   * start rejecting legitimate portrait shots / wide screenshots. */
  const aspect = probe.width / probe.height;
  if (aspect < 0.4 || aspect > 3.0) {
    return {
      ok: false,
      probe,
      reason: `extreme aspect ratio ${aspect.toFixed(2)}`,
    };
  }
  return { ok: true, probe };
}

/** Convenience wrapper for files on disk. */
export async function evaluateImageFile(
  filePath: string,
  opts?: Parameters<typeof evaluateImageBuffer>[1]
): Promise<ImageEvalResult> {
  const buf = await fs.readFile(filePath);
  return evaluateImageBuffer(buf, opts);
}
