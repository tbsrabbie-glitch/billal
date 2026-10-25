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

export type SessionStatus = "setup" | "recorded" | "transcribed" | "qa" | "reported";

/* ---------- Transcription ---------- */

export interface Word {
  /** Word as displayed, with punctuation/capitalisation. */
  w: string;
  /** Lower-case word without punctuation, for matching. */
  raw: string;
  start: number;
  end: number;
  conf: number;
}

export interface Transcript {
  text: string;
  words: Word[];
  /** Average word confidence 0..1. Low values usually mean poor audio, not accent. */
  avgConfidence: number;
  provider: string;
}

/* ---------- Speech metrics (computed in code, never by the LLM) ---------- */

export interface TimeRange {
  start: number;
  end: number;
}

export interface SpeechMetrics {
  durationSec: number;
  timeAllowedSec: number;
  wordCount: number;
  wpmOverall: number;
  wpmSegments: { start: number; end: number; wpm: number }[];
  fillers: { count: number; perMinute: number; items: { word: string; t: number }[] };
  hedges: { count: number; items: { phrase: string; t: number }[] };
  longPauses: (TimeRange & { dur: number })[];
  rushedSections: (TimeRange & { wpm: number })[];
  /** Words the transcriber was unsure of — a clarity signal, not an accent one. */
  unclearWords: { word: string; t: number; conf: number }[];
}

/* ---------- Voice (pitch/loudness, computed in the browser from the audio) ---------- */

export interface VoiceMetrics {
  analysed: boolean;
  unavailableReason?: string;
  /** Spread of pitch in semitones; under ~2 sounds monotone, 3–6 is lively. */
  pitchVariationSt: number;
  /** Spread of loudness (dB) across voiced moments. */
  loudnessVariationDb: number;
  /** 30-second segments with relative loudness (dB vs. the speech average) and pitch spread. */
  segments: { start: number; end: number; relLoudnessDb: number; pitchVariationSt: number }[];
  monotoneRanges: TimeRange[];
  quietRanges: TimeRange[];
}

/* ---------- Body language (computed in the browser with MediaPipe) ---------- */

export interface VisionMetrics {
  analysed: boolean;
  /** Why analysis didn't run, when it didn't. */
  unavailableReason?: string;
  samples: number;
  faceVisiblePct: number;
  eyeContactPct: number;
  lookAwayRanges: (TimeRange & { direction: "down" | "up" | "side" | "off-screen" })[];
  headMovement: "low" | "moderate" | "high";
  headMovementDegStd: number;
  postureFlags: (TimeRange & { issue: "shoulders_tilted" | "slumping" | "leaning_out_of_frame" })[];
  handsVisiblePct: number;
  gestureRatePerMin: number;
  faceTouchRanges: TimeRange[];
  smilePct: number;
  expressiveness: "flat" | "moderate" | "animated";
  /** Eye-contact % per 30-second segment. */
  eyeContactSegments: { start: number; end: number; pct: number }[];
}

export interface Frame {
  t: number;
  /** JPEG data URL. */
  dataUrl: string;
}

/* ---------- Q&A ---------- */

export type QuestionKind = "clarify" | "extend" | "evidence" | "objection" | "gap";

export interface Question {
  id: string;
  question: string;
  reason: string;
  targets_t: number | null;
  kind: QuestionKind;
}

export interface AnswerEvaluation {
  score: number;
  sub: { directness: number; structure: number; composure: number; answered_the_question: number };
  feedback: string;
  quote: { t: number; quote: string } | null;
  better_answer_outline: string[];
}

export interface QAAnswer {
  questionId: string;
  skipped: boolean;
  durationSec?: number;
  transcript?: Transcript;
  metrics?: SpeechMetrics;
  vision?: VisionMetrics;
  evaluation?: AnswerEvaluation;
}

export interface QARound {
  questions: Question[];
  answers: QAAnswer[];
}

/* ---------- Feedback report ---------- */

export type RubricKey = "content_structure" | "delivery_voice" | "body_language" | "qa_handling";

export interface Evidence {
  t: number;
  quote: string;
}

export interface RubricScore {
  score: number;
  reason: string;
  sub: Record<string, number>;
  evidence: Evidence[];
}

export interface LlmReport {
  rubric: {
    content_structure: RubricScore;
    delivery_voice: RubricScore;
    body_language: RubricScore;
    qa_handling: RubricScore | null;
  };
  accuracy_flags: { t: number; quote: string; concern: string; confidence: "low" | "medium" }[];
  script_coverage: {
    covered: { point: string; t: number; quote: string }[];
    missed: { point: string }[];
    added: { point: string; t: number; quote: string }[];
  } | null;
  moments: { t: number; polarity: "positive" | "negative"; category: "content" | "voice" | "body"; label: string; quote: string | null }[];
  strengths: { title: string; detail: string; t: number; quote: string }[];
  fixes: { title: string; why: string; original: Evidence; say_instead: string }[];
  drills: { name: string; targets: string; instructions: string; minutes: number }[];
  rewrite: { opening: string; closing: string };
  notes_usage_comment: string | null;
}

export interface Report extends LlmReport {
  overallScore: number;
  weights: Record<RubricKey, number>;
  generatedAt: number;
  model: string;
  generationMs: number;
  /** Items dropped because their quotes couldn't be found in the transcript. */
  droppedUnverified: number;
}

export interface SessionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  setup: SessionSetup;
  recording?: RecordingInfo;
  transcript?: Transcript;
  metrics?: SpeechMetrics;
  vision?: VisionMetrics;
  voice?: VoiceMetrics;
  /** null = the user chose not to take questions. */
  qa?: QARound | null;
  report?: Report;
  /** The session this one retries, for side-by-side comparison. */
  retryOf?: string;
}

/** "main-video" | "main-audio" | "frames" | `answer-video-${qid}` | `answer-audio-${qid}` */
export type MediaKind = string;

export interface MediaRecord {
  /** `${sessionId}:${kind}` */
  id: string;
  sessionId: string;
  kind: MediaKind;
  blob: Blob;
  mimeType: string;
}
