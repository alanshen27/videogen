import { probeImageBuffer, evaluateImageBuffer } from "../src/server/tools/image-eval";

/* Build a minimal valid PNG header for a 1600x900 image. */
function makePngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  /* PNG signature */
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  /* IHDR length (13) + type 'IHDR' */
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  /* width/height */
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function makeJpegHeader(width: number, height: number): Buffer {
  /* SOI + SOF0 marker with dummy length, precision, dims, components. */
  const buf = Buffer.alloc(20);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xc0; // SOF0
  buf.writeUInt16BE(8, 4); // segment length
  buf[6] = 8; // precision
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  buf[11] = 3; // components
  return buf;
}

function makeGifHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(13);
  buf.write("GIF89a", 0, "ascii");
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function check(name: string, pass: boolean, extra?: unknown) {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${extra !== undefined ? "  " + JSON.stringify(extra) : ""}`);
}

/* --- Probe --- */
const pngBuf = Buffer.concat([makePngHeader(1600, 900), Buffer.alloc(10_000)]);
const jpegBuf = Buffer.concat([makeJpegHeader(1920, 1080), Buffer.alloc(20_000)]);
const gifBuf = Buffer.concat([makeGifHeader(48, 48), Buffer.alloc(50)]);
const tinyPng = Buffer.concat([makePngHeader(100, 100), Buffer.alloc(50)]);
const svgBuf = Buffer.from(
  `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="400"/></svg>`
);

console.log("=== Probe ===");
check("png 1600x900", (() => {
  const p = probeImageBuffer(pngBuf);
  return p.format === "png" && p.width === 1600 && p.height === 900;
})());
check("jpeg 1920x1080", (() => {
  const p = probeImageBuffer(jpegBuf);
  return p.format === "jpeg" && p.width === 1920 && p.height === 1080;
})());
check("gif 48x48", (() => {
  const p = probeImageBuffer(gifBuf);
  return p.format === "gif" && p.width === 48 && p.height === 48;
})());
check("svg viewBox 1024x1024", (() => {
  const p = probeImageBuffer(svgBuf);
  return p.format === "svg" && p.width === 1024 && p.height === 1024;
})());
check("garbage = unknown", probeImageBuffer(Buffer.from("not an image")).format === "unknown");

console.log("\n=== Evaluate ===");
check("large png accepted", evaluateImageBuffer(pngBuf).ok);
check("large jpeg accepted", evaluateImageBuffer(jpegBuf).ok);
check("tiny png rejected (byteLength)", !evaluateImageBuffer(tinyPng).ok);
check("tiny gif rejected", !evaluateImageBuffer(gifBuf).ok);
check("svg vector accepted (no dim check)", evaluateImageBuffer(svgBuf).ok);
check("garbage rejected", !evaluateImageBuffer(Buffer.from("html garbage")).ok);
/* Watermark stripe — extreme aspect */
const stripeBuf = Buffer.concat([makePngHeader(4000, 200), Buffer.alloc(30_000)]);
check("watermark stripe rejected (aspect)", !evaluateImageBuffer(stripeBuf).ok);
const portraitBuf = Buffer.concat([makePngHeader(800, 1200), Buffer.alloc(30_000)]);
check("portrait accepted", evaluateImageBuffer(portraitBuf).ok);
