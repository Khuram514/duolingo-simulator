# ScoreForge 130+

**Release 2.1.1 — Unified Design + Real Photographs + Back Navigation**

**ScoreForge 130+** is a complete, independent English proficiency test simulator designed for learners targeting a practice score above 130. It uses realistic time pressure, adaptive question selection, optional OpenRouter question generation, speech transcription, AI feedback, and a detailed 10–160 practice score report.

> **Important:** ScoreForge is not affiliated with, endorsed by, or a replacement for the official Duolingo English Test. Its results are estimates for practice only. Only the official test provider can issue a certified result.

## What is included

- One polished visual system across the dashboard, Practice Skills, task guide, history, equipment check, generation, and examination workspace, with an optional dark theme.
- Clear back-arrow navigation on Practice, Guide, History, equipment, generation, and active-test screens.
- A bundled offline library of high-resolution real photographs for Write About the Photo and Speak About the Photo; the previous vector scene illustrations were removed.
- A dedicated **Practice Skills** hub with Reading, Listening, Writing, and Speaking filters, 13 task cards, and six-round progress on every card.
- Section-introduction screens that explain the task count, timing, and response method before each new question family.
- A full simulation covering every current task family represented in the project snapshot.
- Fresh AI-generated text questions on every test when OpenRouter is enabled.
- A verified built-in question bank when no API key is configured or an AI batch fails validation.
- Adaptive difficulty for Read and Select, Fill in the Blanks, Read and Complete, and Listen and Type.
- Per-character missing-letter boxes for Fill in the Blanks and Read and Complete, including auto-advance, Backspace navigation, arrow-key navigation, and paste distribution.
- Two complete Interactive Reading sets.
- Two complete Interactive Listening sets, including scenario completion, conversation choices, and 75-second summaries.
- Timed photo writing, interactive writing, photo speaking, read-then-speak, interactive speaking, writing sample, and speaking sample tasks.
- Real browser microphone recording.
- OpenRouter speech-to-text support with browser speech-recognition fallback where available.
- OpenRouter natural text-to-speech for listening tasks, with a warm exam-delivery instruction and automatic fallback to the best installed English browser voice.
- AI grading for writing and speaking, with detailed dimensions, corrections, strengths, and recommendations.
- Local heuristic grading when OpenRouter is unavailable.
- Estimated overall, individual, and integrated scores on a 10–160 scale.
- Focus modes for blank completion and writing/speaking practice.
- Test history stored locally in the browser.
- JSON report export and browser Print/PDF support.
- Server-side API-key protection, localhost-only binding by default, request limits, input validation, security headers, and AI-output validation.
- Zero npm dependencies: Node.js is the only runtime requirement.


## Visual and navigation improvements in 2.1

- Dashboard and Practice Skills now share the same fixed top bar, left navigation, spacing scale, cards, typography, and blue/green accent system.
- The active test runs inside a centered examination workspace instead of an unbounded full-screen white page.
- Photo tasks use a balanced two-column layout with the real photograph and response field at equal visual weight.
- Every photograph includes meaningful alternative text, a source credit, a reference description for grading, and key visual details.
- Back navigation safely exits the current workflow. During test generation, cancellation tokens prevent a completed background request from reopening a test after the learner has gone back.
- Responsive rules preserve the same design on tablet and mobile, where photo and editor panels stack vertically.

## Simulation modes

| Mode | Approximate practice time | Purpose |
|---|---:|---|
| Full Test Simulation | 55–65 minutes | Complete adaptive and productive-skills simulation with a four-skill estimate |
| Quick Diagnostic | 18–25 minutes | Short balanced baseline covering reading, writing, listening, and speaking |
| Blank Mastery Lab | 12–18 minutes | Intensive Read and Select, Fill in the Blanks, and Read and Complete practice |
| Writing & Speaking Lab | 20–30 minutes | Topic writing, personalized follow-up, image description, and conversational speaking |

Focus modes show scores only for the skills they actually assess. They do not manufacture low values for untested skills.

The Practice Skills hub provides focused rounds for:

- Read and Select
- Fill in the Blanks
- Read and Complete
- Listen and Type
- Write About the Photo
- Speak About the Photo
- Read, Then Speak
- Interactive Reading
- Interactive Listening
- Writing Sample
- Speaking Sample
- Interactive Writing
- Interactive Speaking

Each card records up to six completed rounds in browser storage. Finishing a focused round advances that card from `0/6` toward `6/6`.

## Quick start on Windows

### 1. Install Node.js

Install **Node.js 20 or newer**. Confirm it in PowerShell or Command Prompt:

```powershell
node --version
```

### 2. Open the project

Extract the ZIP, open the `ScoreForge-130-Plus-v2.1.1` folder in VS Code, and open a terminal in that folder.

### 3. Configure OpenRouter

In PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

with your real key. Do not add quotation marks or spaces around it.

The default models are:

```env
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_STT_MODEL=openai/whisper-large-v3
OPENROUTER_TTS_MODEL=openai/gpt-4o-mini-tts-2025-12-15
OPENROUTER_TTS_VOICE=alloy
OPENROUTER_TTS_FORMAT=mp3
OPENROUTER_TTS_SPEED=0.96
```

These can be changed to compatible OpenRouter model IDs. The text model should reliably return structured JSON, the STT model must support transcription, and the TTS model must support the dedicated speech endpoint.

### 4. Run the app

No `npm install` is required because the project has no external packages.

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

Chrome or Microsoft Edge is recommended because microphone recording, speech synthesis, and browser speech recognition are best supported there.

You can also double-click `RUN_SCORE_FORGE.cmd`.

## Run without an API key

The app remains fully usable in **Demo Bank** mode. It will:

- Randomize a verified built-in item bank.
- Use browser speech recognition when available.
- Use the best available browser English voice when natural OpenRouter speech is unavailable.
- Use local heuristic writing and speaking feedback.
- Produce practice scores and recommendations.

OpenRouter improves variety, transcription reliability, and language feedback, but it is not required to launch or test the application.

## How AI question generation works

Each AI-enabled test sends five independent structured generation requests:

1. Lexical items: Read and Select + Fill in the Blanks.
2. Reading/listening items: Read and Complete + Listen and Type.
3. Interactive Reading sets.
4. Interactive Listening sets.
5. Writing and speaking prompts.

The server then validates every batch. It checks counts, types, visible word prefixes, answer indices, passage length, highlight answers, conversation structure, and required fields. A missing or malformed batch is replaced with verified built-in content, producing a **hybrid** test rather than failing the entire session.

OpenRouter is also used for:

- A personalized second Interactive Writing prompt.
- Connected Interactive Speaking follow-up questions.
- Speech transcription.
- Natural speech synthesis for Listen and Type and Interactive Listening.
- Detailed writing and speaking rubric feedback.

## How scoring works

### Objective questions

The browser scores objective responses with exact and partial-credit rules:

- Read and Select: exact classification.
- Fill in the Blanks: full-word reconstruction plus spelling similarity.
- Read and Complete: per-blank partial credit.
- Listen and Type: token and character similarity.
- Interactive Reading: sentence completion, passage completion, highlights, main idea, and title.
- Interactive Listening: scenario completion and conversation responses.

### Writing

Writing is evaluated for:

- Task fulfillment and development.
- Coherence and organization.
- Vocabulary range and precision.
- Grammar range and accuracy.
- Spelling and punctuation.

### Speaking

Speaking is evaluated from transcript and timing evidence for:

- Task fulfillment.
- Coherence.
- Vocabulary.
- Grammar.
- Fluency.
- An intelligibility estimate.

The app cannot reproduce the official examiner’s proprietary acoustic model. Pronunciation/intelligibility is therefore clearly labelled as an estimate based on the available transcript, timing, pauses, and fluency evidence.

### Reported scores

A balanced simulation reports:

- Overall estimated score.
- Reading, Writing, Listening, and Speaking.
- Literacy, Comprehension, Conversation, and Production.
- Estimated score range.
- CEFR-oriented practice label.
- Question-type accuracy.
- Detailed writing and speaking feedback.
- A prioritized action plan for the selected target.

All scores are rounded to five-point increments from 10 to 160. The formulas are transparent practice approximations, not a reconstruction of a private official scoring algorithm.

## Privacy and security

- The OpenRouter key is read only by `server.mjs` from `.env` or `.env.local`.
- The key is never sent to browser JavaScript and never stored in Local Storage.
- Webcam preview remains local and is never uploaded.
- Audio is sent to the local server only when transcription is requested; the server forwards it to the configured OpenRouter speech model.
- The finished audio blob is not written to disk by this project.
- Reports and history are stored only in the current browser.
- `.env` and `.env.local` are excluded by `.gitignore`.
- Content Security Policy and other protective HTTP headers are enabled.
- Request-body limits and local rate limits reduce accidental abuse. The server binds to `127.0.0.1` by default so it is not exposed to other devices on your network.

Do not commit your `.env` file to GitHub.

## API usage and cost

A full AI-enabled session can make:

- Five question-generation calls.
- Several short speech-transcription calls.
- One AI-generated Interactive Writing follow-up and several adaptive Interactive Speaking follow-ups during a full AI-enabled test.
- Two final rubric-grading calls.

Actual cost depends on the models, response lengths, and OpenRouter pricing. When OpenRouter returns cost metadata, ScoreForge records an approximate combined API cost in the report. Set spending limits in your OpenRouter account before extensive practice.

For the lowest-cost workflow, use the built-in bank for routine practice and enable AI for periodic fresh full simulations.

## Settings

Open **Settings** from the dashboard to configure:

- Target score from 10 to 160.
- AI generation on/off.
- Per-browser text model override.
- Optional camera preview.
- Fullscreen request.
- Strict simulation mode.
- Transcript visibility after recording.
- Preferred English browser-voice accent.
- Voice source: natural OpenRouter voice with fallback, OpenRouter only, or browser only.
- Speech speed.
- Dark or light theme.

The model override changes the text model only. The STT model remains server-controlled in `.env`.

## Project structure

```text
scoreforge-130-plus/
├─ public/
│  ├─ index.html                 Main single-page application shell
│  ├─ styles.css                 Complete responsive visual system
│  ├─ favicon.svg
│  ├─ manifest.webmanifest
│  ├─ images/photos/             Bundled realistic WebP photo-description scenes
│  └─ js/
│     ├─ app.js                  Navigation, sessions, reporting, history
│     ├─ renderers.js            Every timed question renderer
│     ├─ scoring.js              Objective/adaptive/final score engine
│     ├─ audio.js                TTS, microphone, recording, speech fallback
│     ├─ api.js                  Browser-to-server API client
│     └─ storage.js              Settings, draft, and history storage
├─ server/
│  ├─ prompts.mjs               AI generation and rubric prompts
│  ├─ openrouter.mjs            OpenRouter text, STT, and TTS client
│  ├─ pack-builder.mjs          AI validation and hybrid fallback assembly
│  ├─ fallback-pack.mjs         Verified built-in question bank
│  └─ scoring.mjs               Local writing/speaking analysis
├─ test/                         Automated integrity, photo, UI, practice, and scoring tests
├─ server.mjs                   Secure Node HTTP/API server
├─ .env.example
├─ package.json
├─ RUN_SCORE_FORGE.cmd
├─ VERIFY_PROJECT.cmd
├─ run-scoreforge.sh
├─ OPENROUTER_SETUP.md
├─ CUSTOMIZATION.md
└─ CREDITS.md                    Bundled photo-source and attribution notes
```

## Verify the project

Run syntax checks and tests:

```powershell
npm run check
npm test
```

Or double-click:

```text
VERIFY_PROJECT.cmd
```

## Common problems

### `node` is not recognized

Install Node.js 20+ and reopen the terminal or VS Code.

### Port 3000 is already in use

Change `.env`:

```env
PORT=3100
APP_URL=http://localhost:3100
```

Then open `http://localhost:3100`.

### OpenRouter shows 401

The key is missing, invalid, disabled, or contains extra characters. Recopy it into `.env` and restart the server.

### OpenRouter shows 402 or spending-limit errors

Add credit or adjust the spending limit in the OpenRouter dashboard. Demo Bank mode still works.

### OpenRouter shows 404 for a model

The selected model ID is unavailable or no provider can serve it. Restore the default model or choose another compatible model.

### A model does not support JSON response format

The server automatically retries once without the `response_format` parameter and reinforces the JSON-only instruction. If the result is still malformed, the affected batch is replaced by verified fallback items.

### Microphone is blocked

Use Chrome or Edge, open the app through `http://localhost:<port>`, click the site-permission icon, allow the microphone, and reload. Do not open `index.html` directly from the filesystem.

### Listening audio is silent

Click **Play Speaker Check** on the setup page. Verify Windows output-device selection and browser tab volume. In **Automatic** voice mode, listening tasks request the configured OpenRouter natural voice first and fall back to the best installed English browser voice. Use **Browser only** in Settings when you do not want TTS API usage.

### The transcript is empty

Confirm the OpenRouter STT model is available. The app retains browser speech-recognition text when supported. A manual emergency transcript box appears when recording is unavailable, but it should be used only for accessibility/testing—not for a strict simulation.

## Development commands

```bash
npm start        # Start the server
npm run dev      # Start with Node watch mode
npm run check    # Syntax-check all JavaScript modules
npm test         # Run automated tests
npm run verify   # Run syntax checks and all tests
```

## License

MIT. See `LICENSE`.
