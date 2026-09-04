# ScoreForge 130+ Release Verification

Release: **2.1.1**  
Verification date: **2026-09-04**  
Runtime tested: **Node.js 22.16.0**

## Automated verification

The complete source package was checked with:

```bash
npm run verify
```

Results:

- JavaScript syntax checks: **passed** for the server and every browser module.
- Automated tests: **12 passed, 0 failed**.
- Built-in question-bank structure and answer-key integrity: passed.
- Invalid AI-generation fallback and hybrid-pack assembly: passed.
- All 13 Practice Skills cards create runnable focused sessions: passed.
- Practice item counts and one-minute speaking windows: passed.
- Character-box input controls and natural-voice integration hooks: passed.
- Real-photo catalog validation, WebP asset presence, grading metadata, and local file-size checks: passed.
- Unified back-navigation hooks and credited photo rendering: passed.
- Objective scoring, balanced four-skill integration, and unassessed-skill handling: passed.

## HTTP and static-asset smoke verification

A local server was started from the release source and checked for:

- Default localhost-only binding (`127.0.0.1`).
- `GET /api/health` returning HTTP 200 and release version `2.1.1`.
- Main HTML, CSS, JavaScript, manifest, and WebP photo delivery.
- Correct `image/webp` MIME type for the bundled photographic assets.
- Content Security Policy, frame protection, MIME-sniffing protection, and media-permission headers.
- Complete fallback test-pack generation.
- Photo-based fallback questions using local `/images/photos/*.webp` assets.
- Correct no-key fallback behavior for AI speech and generation features.

## Source-package checks

- The package contains the actual application source: `server.mjs`, `server/*.mjs`, `public/js/*.js`, `public/styles.css`, tests, launch scripts, documentation, and local photographs.
- `package.json` and `manifest.webmanifest` are valid JSON.
- No `.env`, `.env.local`, private key, real OpenRouter key, `node_modules`, cache, or browser profile is included.
- The obsolete vector question illustrations are not included.
- The final ZIP was integrity-tested after creation.

## Visual-verification boundary

A live Chromium screenshot run was not completed in the packaging environment because the browser process timed out. The production HTML/CSS/JavaScript, navigation hooks, responsive rules, photo assets, automated browser-build assertions, and HTTP delivery were verified. You should still perform a final visual pass in Chrome or Edge on your own display after extraction.

## Live OpenRouter boundary

No personal OpenRouter key was available during packaging, so no billable live text-generation, transcription, or speech request was made. The server routes, request validation, no-key behavior, audio-response handling, and browser fallbacks are included and covered by source and smoke checks.

## Score disclaimer

ScoreForge reports independent practice estimates. It does not reproduce an official provider's private item calibration, acoustic model, or scoring engine, and it cannot issue a certified language-test result.
