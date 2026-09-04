import { synthesizeSpeech } from './api.js';

let activeUtterance = null;
let activeAudio = null;
const naturalSpeechCache = new Map();

function waitForVoices(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis?.getVoices?.() || [];
    if (existing.length) return resolve(existing);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis?.removeEventListener?.('voiceschanged', finish);
      resolve(window.speechSynthesis?.getVoices?.() || []);
    };
    window.speechSynthesis?.addEventListener?.('voiceschanged', finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
}

function voiceMatchesAccent(voice, accent) {
  const lang = String(voice.lang || '').toLowerCase();
  if (accent === 'us') return lang.startsWith('en-us');
  if (accent === 'gb') return lang.startsWith('en-gb');
  if (accent === 'au') return lang.startsWith('en-au');
  if (accent === 'ca') return lang.startsWith('en-ca');
  return lang.startsWith('en');
}

export async function getEnglishVoices() {
  const voices = await waitForVoices();
  return voices.filter((voice) => String(voice.lang || '').toLowerCase().startsWith('en'));
}

export function cancelSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  activeUtterance = null;
  if (activeAudio) {
    const current = activeAudio;
    activeAudio = null;
    try { current.audio.pause(); } catch {}
    try { current.audio.removeAttribute('src'); } catch {}
    try { URL.revokeObjectURL(current.url); } catch {}
    current.resolve?.();
  }
}

async function speakWithBrowser(text, { accent = 'auto', rate = 0.94, pitch = 1, volume = 1, onStart, onEnd, onError } = {}) {
  if (!('speechSynthesis' in window)) {
    const error = new Error('Speech synthesis is not supported by this browser.');
    onError?.(error);
    throw error;
  }
  cancelSpeech();
  const voices = await getEnglishVoices();
  const matching = voices.filter((voice) => voiceMatchesAccent(voice, accent));
  const preferred = matching.find((voice) => /natural|neural|premium|enhanced|google|microsoft/i.test(voice.name)) || matching[0] || voices[0];
  const utterance = new SpeechSynthesisUtterance(String(text || ''));
  if (preferred) utterance.voice = preferred;
  utterance.lang = preferred?.lang || (accent === 'gb' ? 'en-GB' : accent === 'au' ? 'en-AU' : 'en-US');
  utterance.rate = Math.min(1.25, Math.max(0.72, Number(rate) || 0.94));
  utterance.pitch = Math.min(1.4, Math.max(0.7, Number(pitch) || 1));
  utterance.volume = Math.min(1, Math.max(0, Number(volume) || 1));
  activeUtterance = utterance;
  return new Promise((resolve, reject) => {
    utterance.onstart = () => onStart?.();
    utterance.onend = () => {
      activeUtterance = null;
      onEnd?.();
      resolve();
    };
    utterance.onerror = (event) => {
      activeUtterance = null;
      const error = new Error(event.error === 'canceled' || event.error === 'interrupted' ? 'Speech playback was interrupted.' : `Speech playback failed: ${event.error || 'unknown error'}`);
      onError?.(error);
      if (event.error === 'canceled' || event.error === 'interrupted') resolve();
      else reject(error);
    };
    window.speechSynthesis.speak(utterance);
  });
}

async function speakWithNaturalVoice(text, { rate = 0.94, volume = 1, onStart, onEnd, onError } = {}) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return;
  const safeRate = Math.min(1.12, Math.max(0.78, Number(rate) || 0.94));
  const cacheKey = `${safeRate.toFixed(2)}:${normalizedText}`;
  let blob = naturalSpeechCache.get(cacheKey);
  if (!blob) {
    const result = await synthesizeSpeech({ text: normalizedText, speed: safeRate });
    blob = result.blob;
    naturalSpeechCache.set(cacheKey, blob);
    if (naturalSpeechCache.size > 24) naturalSpeechCache.delete(naturalSpeechCache.keys().next().value);
  }
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = Math.min(1, Math.max(0, Number(volume) || 1));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (activeAudio?.audio === audio) activeAudio = null;
      URL.revokeObjectURL(url);
      if (error) {
        onError?.(error);
        reject(error);
      } else {
        onEnd?.();
        resolve();
      }
    };
    activeAudio = { audio, url, resolve: () => finish() };
    audio.onplay = () => onStart?.();
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('Natural speech audio could not be played.'));
    audio.play().catch((error) => finish(new Error(error?.message || 'The browser blocked audio playback.')));
  });
}

export async function speakText(text, { accent = 'auto', rate = 0.94, pitch = 1, volume = 1, mode = 'auto', onStart, onEnd, onError } = {}) {
  cancelSpeech();
  const selectedMode = ['auto', 'openrouter', 'browser'].includes(mode) ? mode : 'auto';
  if (selectedMode !== 'browser') {
    try {
      return await speakWithNaturalVoice(text, { rate, volume, onStart, onEnd, onError });
    } catch (error) {
      if (selectedMode === 'openrouter') throw error;
    }
  }
  return speakWithBrowser(text, { accent, rate, pitch, volume, onStart, onEnd, onError });
}

export function playSpeakerCheck() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return Promise.reject(new Error('Web Audio is not supported.'));
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
  gain.connect(context.destination);
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(520, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(740, context.currentTime + 0.25);
  oscillator.connect(gain);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.58);
  return new Promise((resolve) => {
    oscillator.onended = async () => {
      await context.close().catch(() => {});
      resolve();
    };
  });
}

export async function requestEquipmentStream({ camera = true, microphone = true } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera and microphone access require a modern browser on localhost or HTTPS.');
  return navigator.mediaDevices.getUserMedia({
    video: camera ? { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' } : false,
    audio: microphone ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } : false
  });
}

export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export function attachVideoStream(videoElement, stream) {
  if (!videoElement) return;
  videoElement.srcObject = stream;
  videoElement.muted = true;
  videoElement.playsInline = true;
  videoElement.play().catch(() => {});
}

export function startLevelMonitor(stream, onLevel) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !stream?.getAudioTracks?.().length) return () => {};
  const context = new AudioContextClass();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.72;
  const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let frame = 0;
  const loop = () => {
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
    onLevel?.(Math.min(1, average / 95));
    frame = requestAnimationFrame(loop);
  };
  loop();
  return () => {
    cancelAnimationFrame(frame);
    source.disconnect();
    context.close().catch(() => {});
  };
}

function chooseMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function formatFromMime(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'mp4';
  if (normalized.includes('wav')) return 'wav';
  return 'webm';
}

function createSpeechRecognition(onText) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;
  try {
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalText = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalText += `${text} `;
        else interim += text;
      }
      onText?.(`${finalText}${interim}`.trim(), finalText.trim());
    };
    recognition.onerror = () => {};
    return recognition;
  } catch {
    return null;
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read audio recording.'));
    reader.readAsDataURL(blob);
  });
}

export class AudioRecorderSession {
  constructor({ maxDurationSec = 90, onTick, onLevel, onTranscript, onAutoStop } = {}) {
    this.maxDurationSec = maxDurationSec;
    this.onTick = onTick;
    this.onLevel = onLevel;
    this.onTranscript = onTranscript;
    this.onAutoStop = onAutoStop;
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.interval = null;
    this.stopLevelMonitor = null;
    this.recognition = null;
    this.browserTranscript = '';
    this.finalBrowserTranscript = '';
    this.stopPromise = null;
    this.resolveStop = null;
    this.stopped = false;
  }

  async start() {
    if (!window.MediaRecorder) throw new Error('Audio recording is not supported by this browser.');
    this.stream = await requestEquipmentStream({ camera: false, microphone: true });
    const mimeType = chooseMimeType();
    this.mediaRecorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    };
    this.stopPromise = new Promise((resolve) => {
      this.resolveStop = resolve;
    });
    this.mediaRecorder.onstop = () => this.finalize();
    this.recognition = createSpeechRecognition((allText, finalText) => {
      this.browserTranscript = allText;
      this.finalBrowserTranscript = finalText;
      this.onTranscript?.(allText);
    });
    try { this.recognition?.start(); } catch {}
    this.stopLevelMonitor = startLevelMonitor(this.stream, this.onLevel);
    this.startedAt = performance.now();
    this.mediaRecorder.start(250);
    this.onTick?.(this.maxDurationSec, 0);
    this.interval = setInterval(() => {
      const elapsed = (performance.now() - this.startedAt) / 1000;
      const remaining = Math.max(0, this.maxDurationSec - elapsed);
      this.onTick?.(remaining, elapsed);
      if (remaining <= 0.05) {
        this.onAutoStop?.();
        this.stop();
      }
    }, 100);
    return this;
  }

  async stop() {
    if (this.stopped) return this.stopPromise;
    this.stopped = true;
    clearInterval(this.interval);
    try { this.recognition?.stop(); } catch {}
    if (this.mediaRecorder?.state && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    else this.finalize();
    return this.stopPromise;
  }

  async finalize() {
    if (!this.resolveStop) return;
    clearInterval(this.interval);
    this.stopLevelMonitor?.();
    const durationSec = Math.max(0, (performance.now() - this.startedAt) / 1000);
    const mimeType = this.mediaRecorder?.mimeType || this.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    stopMediaStream(this.stream);
    const result = {
      blob,
      mimeType,
      format: formatFromMime(mimeType),
      durationSec: Math.round(durationSec * 10) / 10,
      browserTranscript: (this.finalBrowserTranscript || this.browserTranscript || '').trim()
    };
    const resolve = this.resolveStop;
    this.resolveStop = null;
    resolve(result);
  }
}

export function recordingSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}
