# SpeakCoach

Practise speaking on camera, get questioned like a real audience, and receive detailed, evidence-based
feedback on content, voice and body language. Works in laptop and phone browsers.

Built for practising **client presentations, interviews, exam/viva answers and general speeches**, in
English with a Sri Lankan accent. The feedback never penalises accent — only clarity.

## What it does

1. **Setup** — speech type, topic, audience, goal, 2.5 or 3 minutes, optional script (.txt/.docx/.pdf, read in the browser), Friendly or Tough panel.
2. **Record** — camera + mic check, "look at the lens" calibration during the 3-2-1 countdown, timer with a 30-second warning and auto-stop, optional teleprompter notes (usage is tracked).
3. **Transcript** — word-level timestamps; fillers and hedges highlighted; then *"Would you like to take questions?"*
4. **Spoken Q&A** — 3–5 questions generated from your actual transcript, read aloud; you answer on camera (90 s max each) or skip.
5. **Feedback report** — overall + rubric scores, measured metrics and charts, clickable timestamped moments, strengths, top 3 fixes with "say it like this instead", drills, rewritten opening/closing, script coverage, per-answer Q&A feedback.
6. **History** — dashboard with filters and progress charts (score, pace, fillers, eye contact), "Retry this speech", side-by-side comparison, backup export/import.

## How the feedback stays real (not generic)

- **Every number is measured in code**, never by the AI: pace (overall and per 30 s), fillers and hedges with timestamps, pauses > 2 s, rushed sections, eye contact %, look-away ranges, posture flags, gestures, face-touching, pitch and loudness variation.
- **Body language** is measured in your browser with Google MediaPipe (face + pose landmarks, ~5 frames/sec), plus 8 still frames sent to Claude for a qualitative read.
- **Every quote is checked against your transcript.** Quotes that aren't found word-for-word are removed, timestamps are snapped to where you actually said the words, and Claude gets one retry with the list of problems. The report footer says how many items were removed.
- Rubric weights change by speech type — edit them in `prompts/rubrics.json`.

## Run it on your laptop

Needs Node.js 20+.

```bash
cd speakcoach
npm install            # also copies the MediaPipe + pdf.js assets into public/
cp .env.example .env.local
# put your keys in .env.local (or set MOCK_AI=1 to try the whole flow with sample data)
npm run dev
```

Open http://localhost:3000. Browsers allow the camera on `localhost` without https.

## Put it online (needed for your phone)

Phone browsers only allow the camera on **https**, so deploy to Vercel (free tier is fine):

1. Sign in at https://vercel.com with GitHub → **Add New → Project** → import the `billal` repository.
2. Set **Root Directory** to `speakcoach`.
3. Add the environment variables below (at least `APP_PASSCODE`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`).
4. Deploy. Use the deployment for your branch (Deployments tab), or set the production branch under Settings → Git.

On your phone, open the URL, enter the passcode, then **Share → Add to Home Screen** (on iPhone this
also stops Safari clearing saved sessions after 7 days without use).

## Environment variables

| Name | Required | Purpose |
|---|---|---|
| `APP_PASSCODE` | yes, when online | Gates the whole app (pages + API) so nobody else can use your API credit. Empty = no gate. |
| `DEEPGRAM_API_KEY` | yes | Transcription (Deepgram Nova-3, word timestamps, filler words kept, primed with tax vocabulary from `prompts/vocabulary.json`). |
| `ANTHROPIC_API_KEY` | yes | Questions, answer evaluation and the report (Claude). |
| `CLAUDE_MODEL` | no | Default `claude-sonnet-5-5` (fast). `claude-opus-5-5` gives deeper feedback but is slower and ~2× the cost. |
| `CLAUDE_EFFORT` | no | `low` (default, fastest), `medium` or `high`. Higher = more thorough, slower. |
| `MOCK_AI` | no | `1` = demo mode with built-in sample transcripts and feedback; no API calls. |

Keys are only read by server routes (`src/app/api/*`) and never reach the browser. Requests to Claude
use the server-side refusal fallback (`fallbacks: "default"`), so a rare refusal is retried on
another model automatically.

## Estimated API cost per session

For a 3-minute speech with 4 answered questions (≈ 7 minutes of audio). Prices as of Oct 2026 —
check the providers' pricing pages for current rates.

| Item | Rough usage | Cost (USD) |
|---|---|---|
| Deepgram Nova-3 transcription | ~7 min audio at ~$0.008/min | ≈ $0.05 |
| Question generation (Sonnet 5.5, $2 / $10 per M tokens in/out) | ~3k in, ~1.5k out | ≈ $0.02 |
| Speech report (8 frames + transcript + metrics) | ~8k in, ~6k out | ≈ $0.08 |
| Answer evaluations ×4 | ~2k in, ~1k out each | ≈ $0.05 |
| **Total** | | **≈ $0.20 per session (≈ Rs 60)**; ~$0.12 without Q&A |

A corrective retry (if Claude's quotes don't check out) adds up to ~$0.08. With `claude-opus-5-5` expect
about twice the Claude part (≈ $0.35 total).

## Speed

The report is generated right after Q&A (the speech is transcribed while you read the transcript, and
answers are transcribed in the background while you answer the next question). With Sonnet 5.5 at
`low` effort the report is expected to take roughly 20–45 s for a 3-minute speech (estimate — the report
page shows a timer and the report footer records the actual time, so you can check). If it's slower,
leave `CLAUDE_EFFORT` at `low` and keep `CLAUDE_MODEL` on Sonnet.

## Privacy

- Video is recorded and stored **only on your device** (IndexedDB). It's never uploaded.
- A small audio-only track is recorded alongside the video; only this audio goes to Deepgram.
- The transcript, computed metrics, your script and 8 small still frames go to Claude.
- **Delete session** removes the video, audio, transcript and report from the device.
- Phone and laptop keep separate histories. Use **Export backup** (reports and transcripts, no videos) to move them.

## Errors and retrying

Nothing is lost on failure: recordings are saved to the device before any upload, and every step
(transcription, questions, report) shows a clear message with a **Retry** button. Camera-permission,
camera-in-use, no-speech-detected, poor-audio, storage-full, missing-API-key and rate-limit cases all
have specific messages.

## Editing the prompts and rubrics

Everything the AI is told lives in `prompts/`:

| File | What it controls |
|---|---|
| `question-generator.md` | How questions are generated (Friendly vs Tough panel). |
| `speech-evaluator.md` | The main report: rules, rubric, required sections. |
| `answer-evaluator.md` | Per-answer scoring and feedback. |
| `rubrics.json` | Weights and emphasis per speech type. |
| `filler-words.json` | Which fillers and hedges are counted. |
| `vocabulary.json` | Terms Deepgram is primed to recognise (add client names, acronyms). |

`{{placeholders}}` in the `.md` files are filled in by `src/lib/server/prompts.ts`.

## Browser support

Chrome / Edge (desktop and Android) and Safari (macOS, iOS 14.3+). Firefox works for recording;
body-language analysis needs WebGL or falls back to CPU. On slow devices the analysis samples less
often so recording stays smooth.

## Project layout

```
prompts/                         editable prompt templates and rubrics
scripts/setup-assets.mjs         copies MediaPipe/pdf.js assets into public/ (runs on npm install)
src/
  proxy.ts                       passcode gate
  app/
    page.tsx                     dashboard: progress charts, sessions, backup
    session/new                  Step 1 setup (?retry=<id> pre-fills)
    session/[id]/record          Step 2 recording
    session/[id]/review          Step 3 transcript + "take questions?"
    session/[id]/qa              Step 4 spoken Q&A
    session/[id]/report          Step 5 feedback report
    compare                      side-by-side attempts
    api/                         transcribe, questions, evaluate, evaluate-answer, auth, config
  lib/
    recorder.ts                  camera, MediaRecorder (video + separate audio track)
    vision/                      MediaPipe tracker + body-language metrics
    metrics/                     speech metrics (WPM, fillers, pauses…) + voice pitch/loudness
    pipeline.ts                  transcription → metrics → report orchestration (browser)
    server/                      Deepgram, Claude (strict JSON + retry), prompts, evidence checks
    db.ts                        IndexedDB storage, export/import
```
