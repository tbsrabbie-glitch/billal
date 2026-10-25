"use client";

import type { TimeRange, VoiceMetrics } from "../types";

const RATE = 8000;
const FRAME = 512; // 64 ms
const HOP = 400; // 50 ms
const MIN_LAG = Math.floor(RATE / 400); // 400 Hz
const MAX_LAG = Math.floor(RATE / 75); // 75 Hz

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Autocorrelation pitch estimate for one frame; null if unvoiced. */
function pitchOf(buf: Float32Array, offset: number): number | null {
  let energy = 0;
  for (let i = 0; i < FRAME; i++) energy += buf[offset + i] ** 2;
  if (energy < 1e-4) return null;
  let bestLag = -1;
  let best = 0;
  for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
    let sum = 0;
    for (let i = 0; i < FRAME - lag; i++) sum += buf[offset + i] * buf[offset + i + lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  // Require a clear periodic peak relative to the frame's energy.
  if (bestLag < 0 || best / energy < 0.45) return null;
  return RATE / bestLag;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pitch and loudness variation from the recording — the measurable side of "vocal variety and
 * energy". Accent doesn't affect these numbers; they only describe how much the voice moves.
 */
export async function analyseVoice(audio: Blob): Promise<VoiceMetrics> {
  const empty: VoiceMetrics = {
    analysed: false,
    pitchVariationSt: 0,
    loudnessVariationDb: 0,
    segments: [],
    monotoneRanges: [],
    quietRanges: [],
  };
  try {
    const Offline =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Offline) return { ...empty, unavailableReason: "This browser can't analyse audio." };
    const bytes = await audio.arrayBuffer();
    // Decode at the native rate to learn the duration, then resample to 8 kHz.
    const probe = new Offline(1, 1, 44100);
    const decoded = await probe.decodeAudioData(bytes.slice(0));
    const ctx = new Offline(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(ctx.destination);
    src.start();
    const rendered = await ctx.startRendering();
    const buf = rendered.getChannelData(0);

    const frames: { t: number; db: number; pitch: number | null }[] = [];
    for (let off = 0; off + FRAME < buf.length; off += HOP) {
      let e = 0;
      for (let i = 0; i < FRAME; i++) e += buf[off + i] ** 2;
      frames.push({ t: off / RATE, db: 20 * Math.log10(Math.sqrt(e / FRAME) + 1e-9), pitch: null });
    }
    // Voiced = clearly louder than the quietest third; only estimate pitch there (cheaper).
    const sortedDb = frames.map((f) => f.db).sort((a, b) => a - b);
    const noiseFloor = median(sortedDb.slice(0, Math.ceil(sortedDb.length / 3)));
    for (let k = 0; k < frames.length; k++) {
      if (frames[k].db > noiseFloor + 10) frames[k].pitch = pitchOf(buf, k * HOP);
    }
    const voiced = frames.filter((f) => f.pitch !== null);
    if (voiced.length < 40) return { ...empty, unavailableReason: "Not enough clear speech to analyse pitch." };

    const refHz = median(voiced.map((f) => f.pitch as number));
    const toSt = (hz: number) => 12 * Math.log2(hz / refHz);
    // Drop octave errors before measuring spread.
    const st = voiced.map((f) => toSt(f.pitch as number)).filter((s) => Math.abs(s) < 10);
    const meanDb = voiced.reduce((a, f) => a + f.db, 0) / voiced.length;

    const segments: VoiceMetrics["segments"] = [];
    const monotoneRanges: TimeRange[] = [];
    const quietRanges: TimeRange[] = [];
    for (let start = 0; start < decoded.duration; start += 30) {
      const end = Math.min(start + 30, decoded.duration);
      const seg = voiced.filter((f) => f.t >= start && f.t < end);
      if (seg.length < 20) continue;
      const segSt = seg.map((f) => toSt(f.pitch as number)).filter((s) => Math.abs(s) < 10);
      const rel = seg.reduce((a, f) => a + f.db, 0) / seg.length - meanDb;
      const pv = std(segSt);
      segments.push({ start, end: round1(end), relLoudnessDb: round1(rel), pitchVariationSt: round1(pv) });
      if (pv < 1.8) monotoneRanges.push({ start, end: Math.round(end) });
      if (rel < -4) quietRanges.push({ start, end: Math.round(end) });
    }

    return {
      analysed: true,
      pitchVariationSt: round1(std(st)),
      loudnessVariationDb: round1(std(voiced.map((f) => f.db))),
      segments,
      monotoneRanges,
      quietRanges,
    };
  } catch (err) {
    return { ...empty, unavailableReason: `Audio analysis failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
