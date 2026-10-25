export type SpeechType = "client" | "interview" | "exam" | "general";
export type QuestionerMode = "friendly" | "tough";
export type DurationSec = 150 | 180;

export const SPEECH_TYPES: { value: SpeechType; label: string; hint: string }[] = [
  { value: "client", label: "Client presentation", hint: "Tax advice, pitches, meetings" },
  { value: "interview", label: "Interview / Q&A", hint: "Answering on the spot" },
  { value: "exam", label: "Exam or viva answer", hint: "Explaining a study topic out loud" },
  { value: "general", label: "General public speaking", hint: "Any topic" },
];

export const AUDIENCE_SUGGESTIONS: Record<SpeechType, string> = {
  client: "e.g. CFO of a manufacturing client",
  interview: "e.g. hiring panel at a Big 4 firm",
  exam: "e.g. exam panel",
  general: "e.g. general audience",
};

export function speechTypeLabel(t: SpeechType): string {
  return SPEECH_TYPES.find((s) => s.value === t)?.label ?? t;
}

export interface SessionSetup {
  speechType: SpeechType;
  topic: string;
  audience: string;
  goal: string;
  durationSec: DurationSec;
  /** Prepared script or notes, as plain text. */
  script?: string;
  scriptFileName?: string;
  questionerMode: QuestionerMode;
}

export interface NotesToggle {
  /** Seconds from the start of the recording. */
  t: number;
  open: boolean;
}

export interface RecordingInfo {
  durationSec: number;
  videoMimeType: string;
  /** Mime type of the separate audio-only track, if the browser could record one. */
  audioMimeType?: string;
  stoppedEarly: boolean;
  notesOpenSec: number;
  notesToggles: NotesToggle[];
  recordedAt: number;
}

export type SessionStatus = "setup" | "recorded";

export interface SessionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  setup: SessionSetup;
  recording?: RecordingInfo;
  /** The session this one retries, for side-by-side comparison. */
  retryOf?: string;
}

export type MediaKind = "main-video" | "main-audio";

export interface MediaRecord {
  /** `${sessionId}:${kind}` */
  id: string;
  sessionId: string;
  kind: MediaKind;
  blob: Blob;
  mimeType: string;
}
