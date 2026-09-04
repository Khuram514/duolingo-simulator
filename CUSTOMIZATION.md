# Customizing ScoreForge 130+

## Change AI question prompts

Edit:

```text
server/prompts.mjs
```

The file is divided into:

- `GENERATOR_SYSTEM`: global quality and safety rules.
- `lexicalPrompt`: Read and Select + Fill in the Blanks.
- `comprehensionPrompt`: Read and Complete + Listen and Type.
- `interactiveReadingPrompt`.
- `interactiveListeningPrompt`.
- `productionPrompt`: writing and speaking prompts.
- Dynamic writing/speaking follow-up prompts.
- Writing and speaking scoring-rubric prompts.

Keep the documented JSON shapes unchanged unless you also update validation in `server/pack-builder.mjs` and rendering in `public/js/renderers.js`.

## Change the built-in question bank

Edit:

```text
server/fallback-pack.mjs
```

Every objective answer should be manually verified. Run `npm test` after any change. In Interactive Reading highlight tasks, at least one accepted answer must occur verbatim in the passage because the learner selects actual passage text.

## Add image-description photographs

1. Add a properly licensed or original photographic WebP, PNG, or JPEG file to `public/images/photos/`. WebP is preferred for a smaller offline package.
2. Add its metadata to `IMAGE_CATALOG` in `server/fallback-pack.mjs`.
3. Include:
   - `id`
   - browser URL such as `/images/photos/new-scene.webp`
   - accurate accessible `alt` text
   - a visible `credit` string
   - a factual `referenceDescription`
   - at least four `keyDetails`
4. Use a source image of at least 1,000 × 700 pixels so it remains clear on a large test screen.
5. Add or update the source note in `CREDITS.md`, then run `npm test`.

Do not use official test screenshots, official brand artwork, unlicensed web images, or simplistic vector illustrations as graded photo prompts.

## Change score behavior

Objective and final score logic is located in:

```text
public/js/scoring.js
```

Local open-response analysis is located in:

```text
server/scoring.mjs
```

The practice scale is intentionally labelled as an estimate. Do not present modified formulas as an official scoring algorithm.

## Change timing or test composition

- Per-question timers: `public/js/renderers.js`
- Full/quick/focus/practice composition: `createSessionBlueprint` in `public/js/scoring.js`
- Practice cards and section overview labels: `PRACTICE_SKILLS` and `SECTION_PRESENTATIONS` in `public/js/app.js`
- Built-in set durations: `server/fallback-pack.mjs`
- AI-generated set durations: `server/pack-builder.mjs`

Keep the practice-card details, section overview, and renderer timers synchronized.

## Change character boxes or natural voice

- Missing-character markup and keyboard behavior: `characterBoxesMarkup` and `bindCharacterBoxes` in `public/js/renderers.js`
- Character-box dimensions and focus states: `public/styles.css`
- Browser/OpenRouter voice routing and in-session audio cache: `public/js/audio.js`
- Local `/api/speech` route: `server.mjs`
- OpenRouter speech request: `synthesizeWithOpenRouter` in `server/openrouter.mjs`
- Default model, voice, speed, and delivery instruction: `.env.example`

Keep API keys on the server. Do not add an OpenRouter key to browser code.

## Change branding or design

- Application name and interface copy: `public/js/app.js` and `public/index.html`
- Unified dashboard, navigation, examination workspace, photo layout, colors, spacing, and breakpoints: `public/styles.css`
- Browser/PWA metadata: `public/manifest.webmanifest`
- Icon: `public/favicon.svg`
- OpenRouter attribution title: `.env`

The design uses only system fonts and local assets, so it works without loading Google Fonts or a CDN.

## Add a database or login later

This version is deliberately local-first. Results are stored in browser Local Storage. A future multi-user version could replace `public/js/storage.js` with authenticated server endpoints and a database while leaving most question rendering and score logic unchanged.

Before deploying publicly, add:

- Real authentication and user isolation.
- Persistent database storage.
- HTTPS.
- Distributed rate limiting.
- CSRF strategy for authenticated writes.
- Server-side session ownership checks.
- Privacy policy and data-retention controls.
- Monitoring and structured logs.
- A queue or job strategy for long AI generation requests.
