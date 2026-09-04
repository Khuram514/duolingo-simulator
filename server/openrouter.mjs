const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export class OpenRouterError extends Error {
  constructor(message, { status = 500, code = 'OPENROUTER_ERROR', details = null } = {}) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function withTimeout(timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function headers(config) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': config.appUrl || 'http://localhost:3000',
    'X-OpenRouter-Title': config.appTitle || 'ScoreForge 130+'
  };
}

function extractContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  if (content && typeof content === 'object') return JSON.stringify(content);
  throw new OpenRouterError('The model returned no usable message content.', {
    status: 502,
    code: 'EMPTY_MODEL_RESPONSE',
    details: payload
  });
}

export function parseJsonContent(raw) {
  if (raw && typeof raw === 'object') return raw;
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(text.slice(objectStart, objectEnd + 1));
      } catch {
        // Continue to the explicit error below.
      }
    }
  }
  throw new OpenRouterError('The model did not return valid JSON.', {
    status: 502,
    code: 'INVALID_MODEL_JSON',
    details: text.slice(0, 2000)
  });
}

async function performChatRequest({ config, model, prompt, maxTokens, responseFormat = true, temperature = 0.55 }) {
  const timeout = withTimeout(120_000);
  try {
    const body = {
      model: model || config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_completion_tokens: maxTokens || 7000,
      stream: false
    };
    if (responseFormat) body.response_format = { type: 'json_object' };

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
      signal: timeout.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `OpenRouter request failed with status ${response.status}.`;
      throw new OpenRouterError(message, {
        status: response.status,
        code: payload?.error?.code || 'OPENROUTER_HTTP_ERROR',
        details: payload
      });
    }

    return {
      data: parseJsonContent(extractContent(payload)),
      usage: payload.usage || null,
      model: payload.model || model || config.model,
      id: payload.id || null
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new OpenRouterError('OpenRouter request timed out.', { status: 504, code: 'OPENROUTER_TIMEOUT' });
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

export async function callOpenRouterJSON(options) {
  if (!options?.config?.apiKey) {
    throw new OpenRouterError('OPENROUTER_API_KEY is not configured.', { status: 503, code: 'MISSING_API_KEY' });
  }
  try {
    return await performChatRequest({ ...options, responseFormat: true });
  } catch (error) {
    // Some low-cost/free models do not support response_format. Retry once with prompt-only JSON enforcement.
    if (error instanceof OpenRouterError && [400, 404, 422].includes(error.status)) {
      return performChatRequest({
        ...options,
        responseFormat: false,
        prompt: `${options.prompt}\n\nIMPORTANT: Return one valid JSON object only. No markdown or commentary.`
      });
    }
    throw error;
  }
}

async function performTranscriptionRequest({ config, cleanBase64, format, language, verbose }) {
  const timeout = withTimeout(90_000);
  try {
    const body = {
      model: config.sttModel || 'openai/whisper-large-v3',
      input_audio: { data: cleanBase64, format },
      language,
      response_format: verbose ? 'verbose_json' : 'json',
      temperature: 0
    };
    if (verbose) body.timestamp_granularities = ['segment', 'word'];

    const response = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
      signal: timeout.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      throw new OpenRouterError(
        payload?.error?.message || payload?.message || `Transcription failed with status ${response.status}.`,
        {
          status: response.status,
          code: payload?.error?.code || 'STT_HTTP_ERROR',
          details: payload
        }
      );
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new OpenRouterError('Speech transcription timed out.', { status: 504, code: 'STT_TIMEOUT' });
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

export async function transcribeWithOpenRouter({ config, base64, format = 'webm', language = 'en' }) {
  if (!config?.apiKey) {
    throw new OpenRouterError('OPENROUTER_API_KEY is not configured.', { status: 503, code: 'MISSING_API_KEY' });
  }
  if (!base64 || typeof base64 !== 'string') {
    throw new OpenRouterError('No audio data was supplied.', { status: 400, code: 'MISSING_AUDIO' });
  }
  const cleanBase64 = base64.replace(/^data:audio\/[^;]+;base64,/, '');
  const estimatedBytes = Math.ceil((cleanBase64.length * 3) / 4);
  if (estimatedBytes > 25 * 1024 * 1024) {
    throw new OpenRouterError('Audio recording is larger than 25 MB.', { status: 413, code: 'AUDIO_TOO_LARGE' });
  }

  try {
    return await performTranscriptionRequest({ config, cleanBase64, format, language, verbose: true });
  } catch (error) {
    // Timestamp-rich output is provider-dependent. Retry once with the broadly supported JSON response.
    if (error instanceof OpenRouterError && [400, 404, 422].includes(error.status)) {
      return performTranscriptionRequest({ config, cleanBase64, format, language, verbose: false });
    }
    throw error;
  }
}

export async function synthesizeWithOpenRouter({
  config,
  text,
  model,
  voice = 'alloy',
  responseFormat = 'mp3',
  speed = 0.96,
  instructions = ''
}) {
  if (!config?.apiKey) {
    throw new OpenRouterError('OPENROUTER_API_KEY is not configured.', { status: 503, code: 'MISSING_API_KEY' });
  }
  const input = String(text || '').trim();
  if (!input) throw new OpenRouterError('No text was supplied for speech synthesis.', { status: 400, code: 'MISSING_TEXT' });
  if (input.length > 6000) throw new OpenRouterError('Speech text is longer than 6,000 characters.', { status: 413, code: 'TTS_TEXT_TOO_LONG' });

  const format = ['mp3', 'pcm'].includes(String(responseFormat).toLowerCase()) ? String(responseFormat).toLowerCase() : 'mp3';
  const selectedModel = String(model || config.ttsModel || 'openai/gpt-4o-mini-tts-2025-12-15');
  const body = {
    model: selectedModel,
    input,
    voice: String(voice || config.ttsVoice || 'alloy'),
    response_format: format,
    speed: Math.min(1.25, Math.max(0.7, Number(speed) || 0.96))
  };
  if (instructions && selectedModel.startsWith('openai/')) {
    body.provider = { options: { openai: { instructions: String(instructions).slice(0, 1000) } } };
  }

  const timeout = withTimeout(90_000);
  try {
    const response = await fetch(`${OPENROUTER_BASE}/audio/speech`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
      signal: timeout.signal
    });
    if (!response.ok) {
      const raw = await response.text();
      let payload;
      try { payload = JSON.parse(raw); } catch { payload = { raw }; }
      throw new OpenRouterError(
        payload?.error?.message || payload?.message || `Speech synthesis failed with status ${response.status}.`,
        { status: response.status, code: payload?.error?.code || 'TTS_HTTP_ERROR', details: payload }
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new OpenRouterError('The speech provider returned empty audio.', { status: 502, code: 'EMPTY_TTS_AUDIO' });
    return {
      bytes,
      contentType: response.headers.get('content-type') || (format === 'pcm' ? 'audio/pcm' : 'audio/mpeg'),
      generationId: response.headers.get('x-generation-id') || '',
      model: selectedModel,
      format
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new OpenRouterError('Speech synthesis timed out.', { status: 504, code: 'TTS_TIMEOUT' });
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

export function summarizeUsage(responses = []) {
  return responses.reduce(
    (total, response) => {
      const usage = response?.usage || {};
      total.promptTokens += Number(usage.prompt_tokens || 0);
      total.completionTokens += Number(usage.completion_tokens || 0);
      total.totalTokens += Number(usage.total_tokens || 0);
      total.cost += Number(usage.cost || 0);
      return total;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
  );
}
