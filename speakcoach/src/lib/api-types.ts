import type {
  AnswerEvaluation,
  Frame,
  Question,
  RecordingInfo,
  Report,
  SessionSetup,
  SpeechMetrics,
  VisionMetrics,
  VoiceMetrics,
  Word,
} from "./types";

export interface QuestionsRequest {
  setup: Omit<SessionSetup, "script">;
  words: Word[];
}
export interface QuestionsResponse {
  questions: Question[];
}

export interface AnswerPayload {
  question: Question;
  skipped: boolean;
  words: Word[];
  metrics?: SpeechMetrics;
  vision?: VisionMetrics;
}

export interface EvaluateRequest {
  setup: SessionSetup;
  recording: Pick<RecordingInfo, "durationSec" | "stoppedEarly" | "notesOpenSec" | "notesToggles">;
  words: Word[];
  metrics: SpeechMetrics;
  voice?: VoiceMetrics;
  vision?: VisionMetrics;
  frames: Frame[];
  answers: AnswerPayload[] | null;
}
export interface EvaluateResponse {
  report: Report;
}

export interface EvaluateAnswerRequest {
  setup: Omit<SessionSetup, "script">;
  answer: AnswerPayload;
}
export interface EvaluateAnswerResponse {
  evaluation: AnswerEvaluation;
}

export interface ConfigResponse {
  transcription: boolean;
  analysis: boolean;
  model: string;
  mock: boolean;
}
