"use client";

import type { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Frame } from "../types";

const WASM_PATH = "/mediapipe/wasm";
const MODELS = {
  face: {
    local: "/mediapipe/models/face_landmarker.task",
    remote: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
  pose: {
    local: "/mediapipe/models/pose_landmarker_lite.task",
    remote: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  },
};

export interface FaceSample {
  /** Degrees; positive = face turned toward the camera's right. */
  yaw: number;
  /** Degrees; positive = looking up. */
  pitch: number;
  roll: number;
  gazeDown: number;
  gazeUp: number;
  gazeSide: number;
  smile: number;
  brow: number;
  /** Nose position, normalised 0..1. */
  noseX: number;
  noseY: number;
}

export interface PosePoint {
  x: number;
  y: number;
  v: number;
}

export interface PoseSample {
  lShoulder: PosePoint;
  rShoulder: PosePoint;
  lWrist: PosePoint;
  rWrist: PosePoint;
  nose: PosePoint;
}

export interface VisionSample {
  /** Seconds since recording started (negative during calibration). */
  t: number;
  face: FaceSample | null;
  pose: PoseSample | null;
}

export interface VisionCapture {
  samples: VisionSample[];
  calibration: FaceSample | null;
  frames: Frame[];
  error?: string;
}

let loading: Promise<{ face: FaceLandmarker; pose: PoseLandmarker | null }> | null = null;

async function modelUrl(m: { local: string; remote: string }): Promise<string> {
  try {
    const res = await fetch(m.local, { method: "HEAD" });
    if (res.ok) return m.local;
  } catch {
    // fall through
  }
  return m.remote;
}

/** Loads the MediaPipe models once per page (GPU first, CPU fallback). */
export function loadLandmarkers() {
  loading ??= (async () => {
    const { FilesetResolver, FaceLandmarker, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const [faceUrl, poseUrl] = await Promise.all([modelUrl(MODELS.face), modelUrl(MODELS.pose)]);
    const make = async <T,>(fn: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> => {
      try {
        return await fn("GPU");
      } catch {
        return fn("CPU");
      }
    };
    const face = await make((delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: faceUrl, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
    );
    // Pose is a nice-to-have; carry on with face-only if it fails on this device.
    const pose = await make((delegate) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: poseUrl, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    ).catch(() => null);
    return { face, pose };
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

function deg(rad: number) {
  return (rad * 180) / Math.PI;
}

function faceSample(result: ReturnType<FaceLandmarker["detectForVideo"]>): FaceSample | null {
  const lm = result.faceLandmarks?.[0];
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!lm || !matrix) return null;
  const bs = new Map((result.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
  const g = (k: string) => bs.get(k) ?? 0;
  // Column-major 4x4; the face's forward axis is the third column.
  const fx = matrix[8];
  const fy = matrix[9];
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    yaw: deg(Math.asin(clamp(fx))),
    pitch: deg(Math.asin(clamp(fy))),
    roll: deg(Math.atan2(matrix[1], matrix[0])),
    gazeDown: (g("eyeLookDownLeft") + g("eyeLookDownRight")) / 2,
    gazeUp: (g("eyeLookUpLeft") + g("eyeLookUpRight")) / 2,
    gazeSide: Math.max(
      (g("eyeLookOutLeft") + g("eyeLookInRight")) / 2,
      (g("eyeLookInLeft") + g("eyeLookOutRight")) / 2,
    ),
    smile: (g("mouthSmileLeft") + g("mouthSmileRight")) / 2,
    brow: (g("browInnerUp") + g("browOuterUpLeft") + g("browOuterUpRight")) / 3,
    noseX: lm[1]?.x ?? 0.5,
    noseY: lm[1]?.y ?? 0.5,
  };
}

function poseSample(result: ReturnType<PoseLandmarker["detectForVideo"]>): PoseSample | null {
  const lm = result.landmarks?.[0];
  if (!lm) return null;
  const p = (i: number): PosePoint => ({ x: lm[i].x, y: lm[i].y, v: lm[i].visibility ?? 0 });
  return { nose: p(0), lShoulder: p(11), rShoulder: p(12), lWrist: p(15), rWrist: p(16) };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * Samples the live camera preview ~5 times a second while recording. Runs entirely in the
 * browser; nothing is uploaded except a few small still frames at report time.
 */
export class VisionTracker {
  private samples: VisionSample[] = [];
  private calib: FaceSample[] = [];
  private frames: Frame[] = [];
  private timer = 0;
  private running = false;
  private t0 = 0;
  private recording = false;
  private lastTs = 0;
  private tick = 0;
  private nextFrameAt = 0;
  private error?: string;

  constructor(
    private readonly video: HTMLVideoElement,
    /** Seconds between still frames for the AI's qualitative read. */
    private readonly frameEverySec = 0,
  ) {}

  /** Starts sampling (calibration phase until markRecordingStart). */
  async start() {
    this.running = true;
    let lm: Awaited<ReturnType<typeof loadLandmarkers>>;
    try {
      lm = await loadLandmarkers();
    } catch (err) {
      this.error = `Body-language models couldn't load (${err instanceof Error ? err.message : String(err)}).`;
      return;
    }
    let interval = 200;
    const loop = () => {
      if (!this.running) return;
      const began = performance.now();
      this.sampleOnce(lm, began);
      // Back off on slow devices so recording stays smooth.
      const cost = performance.now() - began;
      interval = cost > 120 ? Math.min(600, interval + 100) : Math.max(200, interval - 20);
      this.timer = window.setTimeout(loop, interval);
    };
    loop();
  }

  markRecordingStart() {
    this.recording = true;
    this.t0 = performance.now();
    this.nextFrameAt = this.frameEverySec > 0 ? Math.min(3, this.frameEverySec / 2) : Infinity;
  }

  private sampleOnce(lm: { face: FaceLandmarker; pose: PoseLandmarker | null }, now: number) {
    const v = this.video;
    if (v.readyState < 2 || v.videoWidth === 0) return;
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    let face: FaceSample | null = null;
    let pose: PoseSample | null = null;
    try {
      face = faceSample(lm.face.detectForVideo(v, ts));
      // Pose every other tick: posture changes slowly.
      if (lm.pose && this.tick++ % 2 === 0) pose = poseSample(lm.pose.detectForVideo(v, ts));
    } catch (err) {
      this.error = `Body-language analysis stopped: ${err instanceof Error ? err.message : String(err)}`;
      this.running = false;
      return;
    }
    if (!this.recording) {
      if (face) this.calib.push(face);
      if (this.calib.length > 25) this.calib.shift();
      return;
    }
    const t = (now - this.t0) / 1000;
    this.samples.push({ t, face, pose });
    if (t >= this.nextFrameAt) {
      this.frames.push({ t: Math.round(t * 10) / 10, dataUrl: captureFrame(v) });
      this.nextFrameAt += this.frameEverySec;
    }
  }

  stop(): VisionCapture {
    this.running = false;
    window.clearTimeout(this.timer);
    let calibration: FaceSample | null = null;
    // Prefer the last calibration samples (taken while the countdown asks to look at the lens).
    const src = this.calib.length >= 3 ? this.calib : this.samples.slice(0, 15).flatMap((s) => (s.face ? [s.face] : []));
    if (src.length >= 3) {
      const keys = Object.keys(src[0]) as (keyof FaceSample)[];
      calibration = Object.fromEntries(keys.map((k) => [k, median(src.map((s) => s[k]))])) as unknown as FaceSample;
    }
    return { samples: this.samples, calibration, frames: this.frames, error: this.error };
  }
}

export function captureFrame(video: HTMLVideoElement, width = 480): string {
  const scale = width / (video.videoWidth || width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((video.videoWidth || width) * scale);
  canvas.height = Math.round((video.videoHeight || width * 0.75) * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}
