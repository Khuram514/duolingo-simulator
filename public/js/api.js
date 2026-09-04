async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `Request failed with status ${response.status}.` };
  }
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}.`);
    error.status = response.status;
    error.code = payload.code;
    error.requestId = payload.requestId;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function getHealth() {
  return request('/api/health', { method: 'GET' });
}

export function generateTest({ target, seed, useAI, model }) {
  return request('/api/generate-test', {
    method: 'POST',
    body: JSON.stringify({ target, seed, useAI, model })
  });
}

export function transcribeAudio({ base64, format, durationSec }) {
  return request('/api/transcribe', {
    method: 'POST',
    body: JSON.stringify({ base64, format, durationSec })
  });
}

export async function synthesizeSpeech({ text, speed = 0.96 }) {
  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speed })
  });
  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch { payload = { error: await response.text().catch(() => '') }; }
    const error = new Error(payload.error || `Speech request failed with status ${response.status}.`);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('The speech service returned empty audio.');
  return {
    blob,
    contentType: response.headers.get('content-type') || blob.type || 'audio/mpeg',
    generationId: response.headers.get('x-generation-id') || '',
    source: response.headers.get('x-scoreforge-voice-source') || 'openrouter'
  };
}

export function scoreTest({ writing, speaking, useAI, model }) {
  return request('/api/score-test', {
    method: 'POST',
    body: JSON.stringify({ writing, speaking, useAI, model })
  });
}

export function getWritingFollowup({ originalPrompt, response, fallback, useAI, model }) {
  return request('/api/writing-followup', {
    method: 'POST',
    body: JSON.stringify({ originalPrompt, response, fallback, useAI, model })
  });
}

export function getSpeakingFollowup({ persona, context, history, fallbackQuestion, useAI, model }) {
  return request('/api/speaking-followup', {
    method: 'POST',
    body: JSON.stringify({ persona, context, history, fallbackQuestion, useAI, model })
  });
}
