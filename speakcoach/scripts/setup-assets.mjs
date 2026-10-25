// Copies browser-side assets into /public after `npm install`:
//  - the pdf.js worker (script uploads)
//  - the MediaPipe WASM runtime (body-language analysis)
//  - the MediaPipe face and pose models (best effort; the app falls back to Google's CDN)
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pub = path.join(process.cwd(), "public");

function copy(src, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

copy(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"), path.join(pub, "pdf.worker.min.mjs"));

const wasmDir = path.join(process.cwd(), "node_modules", "@mediapipe", "tasks-vision", "wasm");
for (const f of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  copy(path.join(wasmDir, f), path.join(pub, "mediapipe", "wasm", f));
}

const MODELS = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};
mkdirSync(path.join(pub, "mediapipe", "models"), { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dest = path.join(pub, "mediapipe", "models", name);
  if (existsSync(dest)) continue;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    console.warn(`[setup-assets] Couldn't download ${name} (${err.message}); the app will load it from Google's CDN.`);
  }
}
