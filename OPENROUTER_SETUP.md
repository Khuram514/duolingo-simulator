# OpenRouter setup for ScoreForge 130+

ScoreForge keeps your OpenRouter key on the local Node.js server. The browser calls only the local `/api/*` routes and never receives the key.

## 1. Create the environment file

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Windows Command Prompt:

```cmd
copy .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

## 2. Add the key

Open `.env` and replace the example value:

```env
OPENROUTER_API_KEY=sk-or-v1-your-real-key
```

Do not put the key in `public/js/app.js`, `public/js/api.js`, browser Local Storage, screenshots, or a GitHub commit.

## 3. Default model configuration

```env
# Question generation, follow-ups, and open-response feedback
OPENROUTER_MODEL=google/gemini-2.5-flash

# Speaking-response transcription
OPENROUTER_STT_MODEL=openai/whisper-large-v3

# Natural listening voice
OPENROUTER_TTS_MODEL=openai/gpt-4o-mini-tts-2025-12-15
OPENROUTER_TTS_VOICE=alloy
OPENROUTER_TTS_FORMAT=mp3
OPENROUTER_TTS_SPEED=0.96

# Keep this value on one line
OPENROUTER_TTS_INSTRUCTIONS=Speak in a clear, warm, natural human voice at a moderate English proficiency test pace. Use neutral pronunciation, realistic phrasing, gentle sentence stress, and short natural pauses. Do not sound theatrical, robotic, rushed, or exaggerated.
```

The text model should support chat completions and produce reliable structured JSON. The server retries once without `response_format` when a provider rejects that option. The STT and TTS IDs must be models supported by OpenRouter’s dedicated audio endpoints.

## 4. Voice modes inside ScoreForge

Open **Settings → Listening voice source**:

- **Natural AI + browser fallback**: tries OpenRouter TTS first and automatically uses the best installed English browser voice if the API request fails.
- **OpenRouter natural voice only**: exposes account, model, credit, or network errors instead of falling back.
- **Browser voice only**: makes no TTS API request and uses Windows/browser voices.

Listen and Type uses one automatic play plus two optional replays. Audio is cached in the current browser session so replaying the same sentence does not normally create another TTS request.

## 5. Optional application metadata and port

```env
APP_URL=http://localhost:3000
APP_TITLE=ScoreForge 130+
HOST=127.0.0.1
PORT=3000
```

Keep `APP_URL` synchronized with the actual local port. `HOST=127.0.0.1` keeps the server available only on your own computer.

## 6. Restart after changing `.env`

Stop the server with `Ctrl+C`, then run:

```powershell
npm start
```

The interface should show **AI connected**. Settings and `/api/health` display the active text, STT, and TTS model IDs without exposing the key.

## Local API routes

| Local route | Purpose |
|---|---|
| `GET /api/health` | Reports configuration and active model IDs |
| `POST /api/generate-test` | Builds an AI, hybrid, or fallback question pack |
| `POST /api/transcribe` | Sends a speaking recording to OpenRouter STT |
| `POST /api/speech` | Returns natural speech audio for listening tasks |
| `POST /api/writing-followup` | Creates a connected Interactive Writing follow-up |
| `POST /api/speaking-followup` | Creates a connected Interactive Speaking question |
| `POST /api/score-test` | Evaluates writing and speaking responses |

## Recommended account safeguards

- Create a separate key for this project.
- Apply a conservative key-level spending limit.
- Review usage in OpenRouter periodically.
- Revoke and replace the key if it is ever exposed.
- Keep `.env` out of any ZIP you publish publicly.

## Error and fallback behavior

- Missing key: verified built-in questions, local grading, and browser voice remain available.
- Failed generation batch: only that batch is replaced by verified built-in content.
- Malformed JSON: the batch is rejected and replaced.
- Failed STT: browser speech-recognition text is retained where supported.
- Failed TTS in Automatic mode: the browser voice is used.
- Failed AI grading: local heuristic feedback is returned.

## Test without spending API credit

Turn off **Generate fresh questions with AI** in Settings and choose **Browser voice only**, or remove the API key and restart. All practice cards, demo questions, timers, recording, local scoring, history, and reports remain available.
