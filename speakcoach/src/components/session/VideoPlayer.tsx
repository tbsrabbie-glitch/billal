"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface VideoPlayerHandle {
  seek(seconds: number): void;
}

/**
 * Plays a recorded Blob. Works around Chrome's MediaRecorder webm files, which have no
 * duration in their header and so can't be seeked until the duration is forced.
 */
export const VideoPlayer = forwardRef<VideoPlayerHandle, { blob: Blob; className?: string }>(function VideoPlayer({ blob, className }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  useImperativeHandle(ref, () => ({
    seek(seconds: number) {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, seconds);
      void v.play().catch(() => {});
      v.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  }));

  function onLoadedMetadata() {
    const v = videoRef.current;
    if (!v || Number.isFinite(v.duration)) return;
    const reset = () => {
      v.removeEventListener("timeupdate", reset);
      v.currentTime = 0;
    };
    v.addEventListener("timeupdate", reset);
    v.currentTime = 1e101;
  }

  if (!url) return <div className="aspect-video w-full rounded-2xl bg-black" />;
  return (
    <video
      ref={videoRef}
      src={url}
      controls
      playsInline
      preload="metadata"
      onLoadedMetadata={onLoadedMetadata}
      className={`mx-auto w-full rounded-2xl bg-black ${className ?? "max-h-[70vh]"}`}
    />
  );
});
