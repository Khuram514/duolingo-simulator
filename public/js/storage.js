const SETTINGS_KEY = 'scoreforge.settings.v1';
const ATTEMPTS_KEY = 'scoreforge.attempts.v1';
const DRAFT_KEY = 'scoreforge.session-draft.v1';
const PRACTICE_PROGRESS_KEY = 'scoreforge.practice-progress.v1';

export const defaultSettings = {
  theme: 'light',
  useAI: true,
  model: '',
  target: 130,
  cameraPreview: true,
  requestFullscreen: false,
  strictMode: true,
  voiceAccent: 'auto',
  voiceRate: 0.94,
  voiceMode: 'auto',
  showTranscriptAfterRecording: false
};

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings() {
  const stored = safeParse(localStorage.getItem(SETTINGS_KEY), {});
  return { ...defaultSettings, ...(stored && typeof stored === 'object' ? stored : {}) };
}

export function saveSettings(settings) {
  const safe = { ...defaultSettings, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(safe));
  return safe;
}

export function loadAttempts() {
  const attempts = safeParse(localStorage.getItem(ATTEMPTS_KEY), []);
  return Array.isArray(attempts) ? attempts : [];
}

function compactReport(report) {
  return {
    id: report.id,
    createdAt: report.createdAt,
    mode: report.mode,
    practiceType: report.practiceType || null,
    source: report.source,
    target: report.target,
    isPartial: report.isPartial,
    assessedSkills: report.assessedSkills,
    overall: report.overall,
    range: report.range,
    cefr: report.cefr,
    individual: report.individual,
    integrated: report.integrated,
    typeScores: report.typeScores,
    recommendations: report.recommendations,
    elapsedSec: report.elapsedSec,
    model: report.model,
    apiUsage: report.apiUsage,
    notices: report.notices,
    grading: report.grading,
    responses: report.responses
  };
}

export function loadPracticeProgress() {
  const stored = safeParse(localStorage.getItem(PRACTICE_PROGRESS_KEY), {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

export function incrementPracticeProgress(type, maximum = 6) {
  const key = String(type || '').trim();
  if (!key) return loadPracticeProgress();
  const progress = loadPracticeProgress();
  const current = Math.max(0, Number(progress[key] || 0));
  progress[key] = Math.min(Math.max(1, Number(maximum) || 6), current + 1);
  localStorage.setItem(PRACTICE_PROGRESS_KEY, JSON.stringify(progress));
  return progress;
}

export function resetPracticeProgress(type = '') {
  const key = String(type || '').trim();
  if (!key) {
    localStorage.removeItem(PRACTICE_PROGRESS_KEY);
    return {};
  }
  const progress = loadPracticeProgress();
  delete progress[key];
  localStorage.setItem(PRACTICE_PROGRESS_KEY, JSON.stringify(progress));
  return progress;
}

export function saveAttempt(report) {
  const attempts = loadAttempts();
  const next = [compactReport(report), ...attempts.filter((item) => item.id !== report.id)].slice(0, 12);
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next));
  } catch {
    // If storage is full, retain summaries without detailed responses.
    const summaries = next.map(({ responses, grading, ...summary }) => summary).slice(0, 20);
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(summaries));
  }
  return next;
}

export function getAttempt(id) {
  return loadAttempts().find((attempt) => attempt.id === id) || null;
}

export function deleteAttempt(id) {
  const next = loadAttempts().filter((attempt) => attempt.id !== id);
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next));
  return next;
}

export function clearAttempts() {
  localStorage.removeItem(ATTEMPTS_KEY);
}

export function saveSessionDraft(session) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(session));
  } catch {
    // Draft persistence is optional.
  }
}

export function loadSessionDraft() {
  return safeParse(sessionStorage.getItem(DRAFT_KEY), null);
}

export function clearSessionDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
