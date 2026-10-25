"use client";

const VIDEO_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
];

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

/** A user-facing explanation of why the camera or recorder could not start. */
export class MediaError extends Error {
  constructor(
    message: string,
    public readonly help: string,
  ) {
    super(message);
  }
}

export function explainMediaError(err: unknown): MediaError {
  if (err instanceof MediaError) return err;
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return new MediaError(
        "Camera or microphone permission was blocked.",
        "Tap the camera/lock icon in the address bar and allow Camera and Microphone, then press Try again. On iPhone: Settings → Safari → Camera / Microphone → Allow.",
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return new MediaError(
        "No camera or microphone was found.",
        "Check that a camera and mic are connected and not disabled, then press Try again.",
      );
    case "NotReadableError":
    case "TrackStartError":
      return new MediaError(
        "The camera or microphone is being used by another app.",
        "Close Zoom, Teams, WhatsApp calls or other tabs using the camera, then press Try again.",
      );
    case "OverconstrainedError":
      return new MediaError(
        "Your camera doesn't support the requested settings.",
        "Press Try again — the app will fall back to basic settings.",
      );
    default:
      return new MediaError(
        "The camera could not be started.",
        err instanceof Error && err.message ? `Details: ${err.message}` : "Reload the page and try again.",
      );
  }
}

export function checkRecordingSupport(): MediaError | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return new MediaError(
      "This page isn't on a secure (https) connection.",
      "Browsers only allow the camera on https:// addresses or on localhost. Open the app through its https link.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return new MediaError(
      "This browser can't access the camera.",
      "Use a recent version of Chrome, Safari, Edge or Firefox.",
    );
  }
  if (typeof MediaRecorder === "undefined" || !pickType(VIDEO_TYPES)) {
    return new MediaError(
      "This browser can't record video.",
      "Update your browser (iPhone needs iOS 14.3 or later) or switch to Chrome / Safari.",
    );
  }
  return null;
}

export async function openCamera(): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    }
    throw err;
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

export interface RecordingResult {
  video: Blob;
  /** Small audio-only file for transcription; absent if the browser couldn't record it. */
  audio?: Blob;
}

/**
 * Records the camera stream to a video file and, in parallel, the mic alone to a small
 * audio file. Only the audio file is ever sent for transcription; the video stays on the device.
 */
export class SessionRecorder {
  private videoRec: MediaRecorder;
  private audioRec: MediaRecorder | null = null;
  private videoChunks: Blob[] = [];
  private audioChunks: Blob[] = [];
  private readonly videoDone: Promise<Blob>;
  private readonly audioDone: Promise<Blob | undefined>;

  constructor(stream: MediaStream) {
    const videoType = pickType(VIDEO_TYPES);
    this.videoRec = new MediaRecorder(stream, {
      mimeType: videoType,
      videoBitsPerSecond: 1_200_000,
      audioBitsPerSecond: 96_000,
    });
    this.videoRec.ondataavailable = (e) => e.data.size > 0 && this.videoChunks.push(e.data);
    this.videoDone = new Promise((resolve, reject) => {
      this.videoRec.onstop = () =>
        resolve(new Blob(this.videoChunks, { type: this.videoRec.mimeType || videoType || "video/webm" }));
      this.videoRec.onerror = (e) => reject((e as unknown as { error?: Error }).error ?? new Error("Recorder error"));
    });

    const audioType = pickType(AUDIO_TYPES);
    const audioTracks = stream.getAudioTracks();
    if (audioType && audioTracks.length > 0) {
      try {
        this.audioRec = new MediaRecorder(new MediaStream(audioTracks), {
          mimeType: audioType,
          audioBitsPerSecond: 48_000,
        });
        this.audioRec.ondataavailable = (e) => e.data.size > 0 && this.audioChunks.push(e.data);
      } catch {
        this.audioRec = null;
      }
    }
    this.audioDone = new Promise((resolve) => {
      if (!this.audioRec) return resolve(undefined);
      const rec = this.audioRec;
      rec.onstop = () => resolve(new Blob(this.audioChunks, { type: rec.mimeType || audioType }));
      rec.onerror = () => resolve(undefined);
    });
  }

  start() {
    // Timeslices so data is flushed regularly and a crash near the end loses little.
    this.videoRec.start(1000);
    try {
      this.audioRec?.start(1000);
    } catch {
      this.audioRec = null;
    }
  }

  async stop(): Promise<RecordingResult> {
    if (this.videoRec.state !== "inactive") this.videoRec.stop();
    if (this.audioRec && this.audioRec.state !== "inactive") this.audioRec.stop();
    const [video, audio] = await Promise.all([this.videoDone, this.audioRec ? this.audioDone : undefined]);
    return { video, audio: audio && audio.size > 0 ? audio : undefined };
  }
}

/** Live input level 0..1, for the mic check before recording. Call the returned fn to stop. */
export function watchMicLevel(stream: MediaStream, onLevel: (level: number) => void): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || stream.getAudioTracks().length === 0) return () => {};
  const ctx = new Ctx();
  void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    source.disconnect();
    void ctx.close().catch(() => {});
  };
}

/** Keeps a phone screen awake while recording. Returns a release fn. */
export async function keepScreenAwake(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    const lock = await nav.wakeLock?.request("screen");
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
