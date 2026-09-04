import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createFallbackPack } from './server/fallback-pack.mjs';
import { buildTestGenerationRequests, buildWritingFollowupPrompt, buildSpeakingFollowupPrompt, buildWritingScoringPrompt, buildSpeakingScoringPrompt } from './server/prompts.mjs';
import { callOpenRouterJSON, transcribeWithOpenRouter, synthesizeWithOpenRouter, OpenRouterError, summarizeUsage } from './server/openrouter.mjs';
import { assemblePack } from './server/pack-builder.mjs';
import { deriveSpeechMetrics, localWritingEvaluation, localSpeakingEvaluation, normalizeWritingEvaluation, normalizeSpeakingEvaluation } from './server/scoring.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadEnvFile(filename) {
  const fullPath = path.join(__dirname, filename);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const config = {
  apiKey: process.env.OPENROUTER_API_KEY || '',
  model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
  sttModel: process.env.OPENROUTER_STT_MODEL || 'openai/whisper-large-v3',
  ttsModel: process.env.OPENROUTER_TTS_MODEL || 'openai/gpt-4o-mini-tts-2025-12-15',
  ttsVoice: process.env.OPENROUTER_TTS_VOICE || 'alloy',
  ttsFormat: ['mp3', 'pcm'].includes(String(process.env.OPENROUTER_TTS_FORMAT || '').toLowerCase()) ? String(process.env.OPENROUTER_TTS_FORMAT).toLowerCase() : 'mp3',
  ttsSpeed: Math.min(1.25, Math.max(0.7, Number(process.env.OPENROUTER_TTS_SPEED || 0.96))),
  ttsInstructions: process.env.OPENROUTER_TTS_INSTRUCTIONS || 'Speak in a clear, warm, natural human voice at a moderate English proficiency test pace. Use neutral pronunciation, realistic phrasing, gentle sentence stress, and short natural pauses. Do not sound theatrical, robotic, rushed, or exaggerated.',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  appTitle: process.env.APP_TITLE || 'ScoreForge 130+'
};
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const rateBuckets = new Map();
function rateLimit(req, category = 'default') {
  const ip = req.socket.remoteAddress || 'local';
  const key = `${ip}:${category}`;
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maximum = category === 'generation' ? 12 : category === 'transcription' ? 80 : category === 'speech' ? 120 : category === 'followup' ? 50 : 100;
  const existing = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - existing.start > windowMs) {
    existing.start = now;
    existing.count = 0;
  }
  existing.count += 1;
  rateBuckets.set(key, existing);
  return existing.count <= maximum;
}
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, bucket] of rateBuckets) if (bucket.start < cutoff) rateBuckets.delete(key);
}, 15 * 60 * 1000).unref();

function securityHeaders(contentType = '') {
  return {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), fullscreen=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { ...securityHeaders('application/json; charset=utf-8'), 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJson(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function safeModel(value) {
  const candidate = String(value || '').trim();
  return /^[a-zA-Z0-9._~:/-]{3,160}$/.test(candidate) ? candidate : config.model;
}

async function generateTest(req, res) {
  if (!rateLimit(req, 'generation')) return sendJson(res, 429, { error: 'Too many generation requests. Please use the existing test pack.' });
  const body = await readJson(req);
  const target = Math.min(160, Math.max(10, Number.parseInt(body.target || '130', 10)));
  const seed = String(body.seed || crypto.randomUUID()).slice(0, 120);
  const useAI = body.useAI !== false;
  const model = safeModel(body.model);

  if (!useAI || !config.apiKey) {
    const pack = createFallbackPack({ seed, target });
    if (!config.apiKey && useAI) pack.notices = ['OpenRouter is not configured, so the verified built-in question bank was used.'];
    return sendJson(res, 200, { pack, usage: null, model: null, aiConfigured: Boolean(config.apiKey) });
  }

  const requests = buildTestGenerationRequests({ seed, target });
  const settled = await Promise.allSettled(
    requests.map((batch) => callOpenRouterJSON({ config, model, prompt: batch.prompt, maxTokens: batch.maxTokens, temperature: 0.62 }))
  );
  const generated = {};
  const errors = [];
  const successfulResponses = [];
  settled.forEach((result, index) => {
    const key = requests[index].key;
    if (result.status === 'fulfilled') {
      generated[key] = result.value.data;
      successfulResponses.push(result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${key}: ${message}`);
    }
  });
  const pack = assemblePack({ seed, target, generated, errors });
  return sendJson(res, 200, {
    pack,
    usage: summarizeUsage(successfulResponses),
    model: successfulResponses[0]?.model || model,
    aiConfigured: true
  });
}

async function transcribe(req, res) {
  if (!rateLimit(req, 'transcription')) return sendJson(res, 429, { error: 'Too many transcription requests.' });
  const body = await readJson(req, 36 * 1024 * 1024);
  if (!config.apiKey) return sendJson(res, 503, { error: 'OpenRouter is not configured. Browser speech recognition may still be used.', code: 'MISSING_API_KEY' });
  const format = String(body.format || 'webm').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'webm';
  const result = await transcribeWithOpenRouter({ config, base64: body.base64, format, language: 'en' });
  const metrics = deriveSpeechMetrics(result, Number(body.durationSec || 0));
  return sendJson(res, 200, { ...metrics, transcriptionSource: 'openrouter', model: config.sttModel, usage: result.usage || null });
}

async function speech(req, res) {
  if (!rateLimit(req, 'speech')) return sendJson(res, 429, { error: 'Too many speech requests. Please wait briefly and try again.' });
  const body = await readJson(req, 80 * 1024);
  if (!config.apiKey) return sendJson(res, 503, { error: 'OpenRouter is not configured. The browser voice fallback will be used in automatic mode.', code: 'MISSING_API_KEY' });
  const text = String(body.text || '').trim();
  if (!text) return sendJson(res, 400, { error: 'Speech text is required.', code: 'MISSING_TEXT' });
  const speed = Math.min(1.12, Math.max(0.78, Number(body.speed || config.ttsSpeed)));
  const result = await synthesizeWithOpenRouter({
    config,
    text,
    model: config.ttsModel,
    voice: config.ttsVoice,
    responseFormat: config.ttsFormat,
    speed,
    instructions: config.ttsInstructions
  });
  const responseHeaders = {
    ...securityHeaders(result.contentType),
    'Content-Length': result.bytes.length,
    'Cache-Control': 'private, max-age=3600',
    'X-ScoreForge-Voice-Source': 'openrouter'
  };
  if (result.generationId) responseHeaders['X-Generation-Id'] = result.generationId;
  res.writeHead(200, responseHeaders);
  res.end(result.bytes);
}

async function scoreTest(req, res) {
  if (!rateLimit(req, 'generation')) return sendJson(res, 429, { error: 'Too many scoring requests.' });
  const body = await readJson(req, 5 * 1024 * 1024);
  const writingResponses = Array.isArray(body.writing) ? body.writing.slice(0, 20) : [];
  const speakingResponses = Array.isArray(body.speaking) ? body.speaking.slice(0, 20) : [];
  const model = safeModel(body.model);

  const localWriting = localWritingEvaluation(writingResponses);
  const localSpeaking = localSpeakingEvaluation(speakingResponses);
  if (!config.apiKey || body.useAI === false) {
    return sendJson(res, 200, {
      writing: localWriting,
      speaking: localSpeaking,
      model: null,
      usage: null,
      notices: ['Local heuristic grading was used. Configure OpenRouter for deeper language feedback.']
    });
  }

  const [writingResult, speakingResult] = await Promise.allSettled([
    writingResponses.length
      ? callOpenRouterJSON({ config, model, prompt: buildWritingScoringPrompt(writingResponses), maxTokens: 9000, temperature: 0.15 })
      : Promise.resolve({ data: { items: [], globalAdvice: [] }, usage: null, model }),
    speakingResponses.length
      ? callOpenRouterJSON({ config, model, prompt: buildSpeakingScoringPrompt(speakingResponses), maxTokens: 9000, temperature: 0.15 })
      : Promise.resolve({ data: { items: [], globalAdvice: [] }, usage: null, model })
  ]);

  const notices = [];
  let writing = localWriting;
  let speaking = localSpeaking;
  const usageItems = [];
  if (writingResult.status === 'fulfilled') {
    writing = normalizeWritingEvaluation(writingResult.value.data, writingResponses);
    usageItems.push(writingResult.value);
  } else {
    notices.push(`AI writing grading was unavailable: ${writingResult.reason?.message || writingResult.reason}`);
  }
  if (speakingResult.status === 'fulfilled') {
    speaking = normalizeSpeakingEvaluation(speakingResult.value.data, speakingResponses);
    usageItems.push(speakingResult.value);
  } else {
    notices.push(`AI speaking grading was unavailable: ${speakingResult.reason?.message || speakingResult.reason}`);
  }

  return sendJson(res, 200, {
    writing,
    speaking,
    model: usageItems[0]?.model || model,
    usage: summarizeUsage(usageItems),
    notices
  });
}

async function writingFollowup(req, res) {
  if (!rateLimit(req, 'followup')) return sendJson(res, 429, { error: 'Too many follow-up requests.' });
  const body = await readJson(req);
  const fallback = String(body.fallback || 'Explain one limitation of your position and how it could be addressed.').slice(0, 500);
  const originalPrompt = String(body.originalPrompt || '').slice(0, 2500);
  const response = String(body.response || '').slice(0, 9000);
  if (!config.apiKey || body.useAI === false) return sendJson(res, 200, { followup: fallback, source: 'fallback' });
  try {
    const result = await callOpenRouterJSON({
      config,
      model: safeModel(body.model),
      prompt: buildWritingFollowupPrompt({ originalPrompt, response }),
      maxTokens: 500,
      temperature: 0.45
    });
    const followup = String(result.data?.followup || '').trim();
    return sendJson(res, 200, { followup: followup || fallback, source: followup ? 'ai' : 'fallback' });
  } catch {
    return sendJson(res, 200, { followup: fallback, source: 'fallback' });
  }
}

async function speakingFollowup(req, res) {
  if (!rateLimit(req, 'followup')) return sendJson(res, 429, { error: 'Too many follow-up requests.' });
  const body = await readJson(req);
  const fallback = String(body.fallbackQuestion || 'Could you give a specific example?').slice(0, 500);
  const persona = String(body.persona || 'an English-speaking conversation partner').slice(0, 500);
  const context = String(body.context || '').slice(0, 2500);
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  if (!config.apiKey || body.useAI === false) return sendJson(res, 200, { question: fallback, source: 'fallback' });
  try {
    const result = await callOpenRouterJSON({
      config,
      model: safeModel(body.model),
      prompt: buildSpeakingFollowupPrompt({ persona, context, history, fallbackQuestion: fallback }),
      maxTokens: 400,
      temperature: 0.5
    });
    const question = String(result.data?.question || '').trim();
    return sendJson(res, 200, { question: question || fallback, source: question ? 'ai' : 'fallback' });
  } catch {
    return sendJson(res, 200, { question: fallback, source: 'fallback' });
  }
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(requested);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden.' });
  let resolved = filePath;
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) resolved = path.join(PUBLIC_DIR, 'index.html');
  const extension = path.extname(resolved).toLowerCase();
  const contentType = mimeTypes[extension] || 'application/octet-stream';
  const stat = fs.statSync(resolved);
  const cacheControl = extension === '.html' ? 'no-cache' : 'public, max-age=3600';
  res.writeHead(200, { ...securityHeaders(contentType), 'Content-Length': stat.size, 'Cache-Control': cacheControl });
  fs.createReadStream(resolved).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        app: config.appTitle,
        aiConfigured: Boolean(config.apiKey),
        model: config.model,
        sttModel: config.sttModel,
        ttsModel: config.ttsModel,
        ttsVoice: config.ttsVoice,
        version: '2.1.1'
      });
    }
    if (req.method === 'POST' && pathname === '/api/generate-test') return await generateTest(req, res);
    if (req.method === 'POST' && pathname === '/api/transcribe') return await transcribe(req, res);
    if (req.method === 'POST' && pathname === '/api/speech') return await speech(req, res);
    if (req.method === 'POST' && pathname === '/api/score-test') return await scoreTest(req, res);
    if (req.method === 'POST' && pathname === '/api/writing-followup') return await writingFollowup(req, res);
    if (req.method === 'POST' && pathname === '/api/speaking-followup') return await speakingFollowup(req, res);
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API route not found.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
    return serveStatic(req, res, pathname);
  } catch (error) {
    const status = Number(error?.status || (error instanceof OpenRouterError ? error.status : 500));
    const safeStatus = status >= 400 && status <= 599 ? status : 500;
    if (safeStatus >= 500) console.error(`[${requestId}]`, error);
    return sendJson(res, safeStatus, {
      error: safeStatus >= 500 && !(error instanceof OpenRouterError) ? 'An unexpected server error occurred.' : error?.message || 'Request failed.',
      code: error?.code || 'SERVER_ERROR',
      requestId
    });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = ['127.0.0.1', '::1'].includes(HOST) ? 'localhost' : HOST;
  console.log(`\nScoreForge 130+ is running at http://${displayHost}:${PORT}`);
  console.log(config.apiKey ? `OpenRouter enabled: ${config.model}` : 'OpenRouter key not found: demo mode will be used.');
  console.log('Press Ctrl+C to stop.\n');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
