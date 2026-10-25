export function downloadBlob(blob: Blob, baseName: string) {
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${baseName}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function safeFileName(s: string): string {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "speech";
}
