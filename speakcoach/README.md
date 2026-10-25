# SpeakCoach

Practise speaking on camera, get questioned like a real audience, and receive detailed feedback on
content, voice and body language. Works in laptop and phone browsers.

## Build status

| Phase | What | Status |
|---|---|---|
| 1 | Setup form, camera recording with timer, playback, save to IndexedDB | ✅ done |
| 2 | Transcription with word timestamps + hard metrics (WPM, fillers, pauses) | next |
| 3 | "Do you want questions?" + spoken Q&A round | |
| 4 | MediaPipe body language + full LLM feedback report | |
| 5 | History dashboard, progress charts, retry/compare | |

## Run it on your laptop

Needs Node.js 20 or later.

```bash
cd speakcoach
npm install
cp .env.example .env.local   # fill in keys when later phases need them
npm run dev
```

Open http://localhost:3000. Browsers allow the camera on `localhost` without https.

## Put it online (needed for your phone)

Phone browsers only allow the camera on **https** addresses, so deploy to Vercel (free tier is fine):

1. Sign in at https://vercel.com with your GitHub account.
2. **Add New → Project**, import the `billal` repository.
3. Set **Root Directory** to `speakcoach` (important — the app lives in this folder).
4. Under **Environment Variables** add `APP_PASSCODE` (pick something only you know). Add the API keys
   when later phases need them.
5. Deploy. Under **Settings → Git**, set the production branch to the branch you're testing
   (or open each branch's preview URL from the Deployments tab).

Every push redeploys automatically. On your phone, open the URL, enter the passcode, then use
**Share → Add to Home Screen** — on iPhone this also stops Safari from clearing the app's saved
sessions after 7 days without use.

## Environment variables

| Name | Needed from | Purpose |
|---|---|---|
| `APP_PASSCODE` | Phase 1 (online) | Gates the app so nobody else can use your API credit. Empty = no gate. |
| `DEEPGRAM_API_KEY` | Phase 2 | Speech-to-text with word timestamps and filler words. |
| `ANTHROPIC_API_KEY` | Phase 3 | Questions, answer evaluation and the feedback report. |
| `CLAUDE_MODEL` | optional | Override the Claude model used. |

Keys are only read by server routes (`src/app/api/*`) and are never sent to the browser.

## Privacy

- Video is recorded and stored **only on your device** (IndexedDB). It's never uploaded.
- A separate small audio-only track is recorded alongside it; from Phase 2 only this audio goes to
  Deepgram for transcription. From Phase 3, the transcript, metrics, your script and a few still
  frames go to Claude.
- Script files (.txt/.docx/.pdf) are read in the browser.
- **Delete session** removes the video, audio and all data for that session from the device.
- Phone and laptop keep separate histories (there's no account or cloud sync in v1).

## Phase 1 test checklist

- [ ] Laptop: create a session, upload a .docx or .pdf script, record, stop early, play back.
- [ ] Let one recording run to the limit: amber warning at 0:30 left, auto-stop at 0:00.
- [ ] Toggle notes during a take; the review page shows "Notes shown x% of the time".
- [ ] Block camera permission → clear message + **Try again** works after allowing it.
- [ ] Phone (via the Vercel URL): same flow; the screen doesn't sleep while recording.
- [ ] Delete a session; it disappears from the list.

## Project layout

```
src/
  proxy.ts                     passcode gate (Next 16 "proxy", formerly middleware)
  app/                         pages and API routes
  components/setup|record|session|ui
  lib/
    db.ts                      IndexedDB (Dexie): sessions + media blobs
    recorder.ts                camera, MediaRecorder (video + separate audio track), mic meter
    script-parse.ts            txt/docx/pdf → text, in the browser
    types.ts
prompts/                       (Phase 3+) editable LLM prompt templates and rubrics
```
