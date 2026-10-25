import type { TimeRange, VisionMetrics } from "../types";
import type { FaceSample, PoseSample, VisionCapture, VisionSample } from "./tracker";

// Thresholds relative to the calibrated "looking at the lens" pose.
const YAW_TOL = 14;
const PITCH_TOL = 11;
const GAZE_DOWN_TOL = 0.22;
const GAZE_SIDE_TOL = 0.28;
const MIN_LOOK_AWAY_SEC = 1.5;
const SHOULDER_TILT_DEG = 8;

const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

type LookState = "contact" | "down" | "up" | "side" | "off-screen";

function lookState(face: FaceSample | null, base: FaceSample): LookState {
  if (!face) return "off-screen";
  const dPitch = face.pitch - base.pitch;
  const dYaw = face.yaw - base.yaw;
  if (face.gazeDown - base.gazeDown > GAZE_DOWN_TOL || dPitch < -PITCH_TOL) return "down";
  if (face.gazeUp - base.gazeUp > GAZE_DOWN_TOL || dPitch > PITCH_TOL + 4) return "up";
  if (Math.abs(dYaw) > YAW_TOL || face.gazeSide - base.gazeSide > GAZE_SIDE_TOL) return "side";
  return "contact";
}

/** Merges consecutive samples matching `pred` into time ranges at least `minSec` long. */
function ranges(samples: VisionSample[], pred: (s: VisionSample) => boolean, minSec: number, gapSec = 0.7): TimeRange[] {
  const out: TimeRange[] = [];
  let cur: TimeRange | null = null;
  for (const s of samples) {
    if (pred(s)) {
      if (cur && s.t - cur.end <= gapSec) cur.end = s.t;
      else {
        if (cur && cur.end - cur.start >= minSec) out.push(cur);
        cur = { start: s.t, end: s.t };
      }
    }
  }
  if (cur && cur.end - cur.start >= minSec) out.push(cur);
  return out.map((r) => ({ start: round(r.start, 1), end: round(r.end, 1) }));
}

function shoulderTilt(p: PoseSample): number | null {
  if (p.lShoulder.v < 0.5 || p.rShoulder.v < 0.5) return null;
  const dy = p.lShoulder.y - p.rShoulder.y;
  const dx = p.lShoulder.x - p.rShoulder.x;
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  return Math.min(ang, Math.abs(180 - ang));
}

/** Nose-to-shoulder-line height relative to shoulder width; drops when slumping. */
function uprightness(p: PoseSample): number | null {
  if (p.lShoulder.v < 0.5 || p.rShoulder.v < 0.5 || p.nose.v < 0.5) return null;
  const width = Math.hypot(p.lShoulder.x - p.rShoulder.x, p.lShoulder.y - p.rShoulder.y);
  if (width < 0.05) return null;
  return ((p.lShoulder.y + p.rShoulder.y) / 2 - p.nose.y) / width;
}

export function emptyVision(reason: string): VisionMetrics {
  return {
    analysed: false,
    unavailableReason: reason,
    samples: 0,
    faceVisiblePct: 0,
    eyeContactPct: 0,
    lookAwayRanges: [],
    headMovement: "low",
    headMovementDegStd: 0,
    postureFlags: [],
    handsVisiblePct: 0,
    gestureRatePerMin: 0,
    faceTouchRanges: [],
    smilePct: 0,
    expressiveness: "moderate",
    eyeContactSegments: [],
  };
}

export function computeVisionMetrics(capture: VisionCapture, durationSec: number): VisionMetrics {
  const samples = capture.samples.filter((s) => s.t <= durationSec + 0.5);
  if (samples.length < 10) return emptyVision(capture.error ?? "Too few video frames were analysed (the device may be too slow).");
  const faces = samples.filter((s) => s.face);
  if (faces.length < 5) return { ...emptyVision("No face was detected — check lighting and that your face is in frame."), samples: samples.length };
  const base = capture.calibration ?? faces[0].face!;

  const states = samples.map((s) => lookState(s.face, base));
  const stateOf = new Map(samples.map((s, i) => [s, states[i]]));
  const contact = states.filter((s) => s === "contact").length;

  const lookAwayRanges: VisionMetrics["lookAwayRanges"] = [];
  for (const dir of ["down", "up", "side", "off-screen"] as const) {
    for (const r of ranges(samples, (s) => stateOf.get(s) === dir, MIN_LOOK_AWAY_SEC)) {
      lookAwayRanges.push({ ...r, direction: dir });
    }
  }
  lookAwayRanges.sort((a, b) => a.start - b.start);

  const eyeContactSegments: VisionMetrics["eyeContactSegments"] = [];
  for (let start = 0; start < durationSec; start += 30) {
    const end = Math.min(start + 30, durationSec);
    const idx = samples.map((s, i) => (s.t >= start && s.t < end ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 5) continue;
    eyeContactSegments.push({ start, end: round(end, 1), pct: pct(idx.filter((i) => states[i] === "contact").length, idx.length) });
  }

  // Head movement: spread of yaw/pitch while facing the camera roughly.
  const yaw = faces.map((s) => s.face!.yaw);
  const pitch = faces.map((s) => s.face!.pitch);
  const headStd = Math.sqrt(std(yaw) ** 2 + std(pitch) ** 2);
  const headMovement = headStd < 4 ? "low" : headStd < 10 ? "moderate" : "high";

  // Posture from pose samples.
  const poses = samples.filter((s) => s.pose);
  const postureFlags: VisionMetrics["postureFlags"] = [];
  if (poses.length >= 5) {
    for (const r of ranges(poses, (s) => (shoulderTilt(s.pose!) ?? 0) > SHOULDER_TILT_DEG, 3, 1.2)) {
      postureFlags.push({ ...r, issue: "shoulders_tilted" });
    }
    const up = poses.map((s) => uprightness(s.pose!)).filter((x): x is number => x !== null);
    if (up.length >= 10) {
      const baseline = up.slice(0, Math.max(5, Math.floor(up.length / 6))).sort((a, b) => a - b)[Math.floor(up.length / 12)] ?? up[0];
      for (const r of ranges(poses, (s) => {
        const u = uprightness(s.pose!);
        return u !== null && u < baseline * 0.8;
      }, 4, 1.2)) {
        postureFlags.push({ ...r, issue: "slumping" });
      }
    }
    for (const r of ranges(poses, (s) => s.pose!.lShoulder.v < 0.3 && s.pose!.rShoulder.v < 0.3, 3, 1.2)) {
      postureFlags.push({ ...r, issue: "leaning_out_of_frame" });
    }
    postureFlags.sort((a, b) => a.start - b.start);
  }

  // Hands: visibility, gesture bursts (fast wrist movement), touching the face.
  let handsVisible = 0;
  let gestures = 0;
  let moving = false;
  const touching: VisionSample[] = [];
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i].pose!;
    const vis = p.lWrist.v > 0.5 || p.rWrist.v > 0.5;
    if (vis) handsVisible++;
    const sw = Math.hypot(p.lShoulder.x - p.rShoulder.x, p.lShoulder.y - p.rShoulder.y) || 0.3;
    for (const w of [p.lWrist, p.rWrist]) {
      if (w.v > 0.5 && Math.hypot(w.x - p.nose.x, w.y - p.nose.y) < sw * 0.55) {
        touching.push(poses[i]);
        break;
      }
    }
    if (i > 0) {
      const q = poses[i - 1].pose!;
      const dt = Math.max(poses[i].t - poses[i - 1].t, 0.1);
      const speed = Math.max(
        p.lWrist.v > 0.5 && q.lWrist.v > 0.5 ? Math.hypot(p.lWrist.x - q.lWrist.x, p.lWrist.y - q.lWrist.y) : 0,
        p.rWrist.v > 0.5 && q.rWrist.v > 0.5 ? Math.hypot(p.rWrist.x - q.rWrist.x, p.rWrist.y - q.rWrist.y) : 0,
      ) / sw / dt;
      if (speed > 0.6 && !moving) gestures++;
      moving = speed > 0.6;
    }
  }
  const touchSet = new Set(touching);
  const faceTouchRanges = ranges(poses, (s) => touchSet.has(s), 1, 0.8);

  const smiles = faces.filter((s) => s.face!.smile > 0.35).length;
  const expr = std(faces.map((s) => s.face!.smile)) + std(faces.map((s) => s.face!.brow));
  const minutes = Math.max(durationSec, 1) / 60;

  return {
    analysed: true,
    samples: samples.length,
    faceVisiblePct: pct(faces.length, samples.length),
    eyeContactPct: pct(contact, samples.length),
    lookAwayRanges,
    headMovement,
    headMovementDegStd: round(headStd, 1),
    postureFlags,
    handsVisiblePct: poses.length ? pct(handsVisible, poses.length) : 0,
    gestureRatePerMin: round(gestures / minutes, 1),
    faceTouchRanges,
    smilePct: pct(smiles, faces.length),
    expressiveness: expr < 0.08 ? "flat" : expr < 0.2 ? "moderate" : "animated",
    eyeContactSegments,
  };
}
