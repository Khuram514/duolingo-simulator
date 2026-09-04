import { getHealth, generateTest, scoreTest } from './api.js';
import { attachVideoStream, playSpeakerCheck, requestEquipmentStream, startLevelMonitor, stopMediaStream } from './audio.js';
import { mountQuestion, escapeHtml } from './renderers.js';
import {
  buildScoringPayload,
  calculateFinalReport,
  createSessionBlueprint,
  formatDuration,
  scoreObjectiveResponse,
  selectAdaptiveQuestion,
  typeLabel,
  updateAbility
} from './scoring.js';
import {
  clearSessionDraft,
  defaultSettings,
  deleteAttempt,
  downloadJson,
  getAttempt,
  incrementPracticeProgress,
  loadAttempts,
  loadPracticeProgress,
  loadSettings,
  resetPracticeProgress,
  saveAttempt,
  saveSessionDraft,
  saveSettings
} from './storage.js';

const app = document.querySelector('#app');
const state = {
  health: { aiConfigured: false, model: '', sttModel: '' },
  settings: loadSettings(),
  equipmentStream: null,
  stopLevel: null,
  pendingMode: 'full',
  practiceFilter: 'all',
  returnView: 'home',
  pack: null,
  session: null,
  questionCleanup: null,
  currentReport: null,
  generationId: 0
};

const MODE_INFO = {
  full: { title: 'Full Test Simulation', time: '55–65 min', description: 'Every current task type, adaptive difficulty, complete skill report, and estimated 10–160 score.', icon: '◎', tone: 'primary' },
  quick: { title: 'Quick Diagnostic', time: '18–25 min', description: 'A balanced shortened test that identifies your weakest skill and estimates your present range.', icon: '◌', tone: 'violet' },
  blanks: { title: 'Blank Mastery Lab', time: '12–18 min', description: 'Intensive Read and Select, Fill in the Blanks, and Read and Complete practice for your main difficulty.', icon: '▣', tone: 'amber' },
  production: { title: 'Writing & Speaking Lab', time: '20–30 min', description: 'Topic writing, personalized follow-up, image description, speaking prompts, and conversation practice.', icon: '◍', tone: 'cyan' }
};

const PRACTICE_SKILLS = [
  { type: 'read-select', title: 'Read and Select', category: 'reading', icon: 'select', detail: '10 rapid word decisions', time: '1–2 min' },
  { type: 'fill-blank', title: 'Fill in the Blanks', category: 'reading', icon: 'boxes', detail: '6 sentence completions', time: '2–3 min' },
  { type: 'read-complete', title: 'Read and Complete', category: 'reading', icon: 'complete', detail: '1 timed passage', time: '3 min' },
  { type: 'listen-type', title: 'Listen and Type', category: 'listening', icon: 'listen', detail: '4 dictated sentences', time: '4–5 min' },
  { type: 'write-photo', title: 'Write About the Photo', category: 'writing', icon: 'photo-write', detail: '1 image response', time: '1 min' },
  { type: 'speak-photo', title: 'Speak About the Photo', category: 'speaking', icon: 'photo-speak', detail: '20 sec prep + 60 sec speaking', time: '2 min' },
  { type: 'read-then-speak', title: 'Read, Then Speak', category: 'speaking', icon: 'read-speak', detail: '20 sec prep + 60 sec speaking', time: '2 min' },
  { type: 'interactive-reading', title: 'Interactive Reading', category: 'reading', icon: 'interactive-read', detail: '1 complete reading set', time: '7–8 min' },
  { type: 'interactive-listening', title: 'Interactive Listening', category: 'listening', icon: 'interactive-listen', detail: 'Scenario, conversation, summary', time: '7–8 min' },
  { type: 'writing-sample', title: 'Writing Sample', category: 'writing', icon: 'writing', detail: '30 sec prep + 5 min writing', time: '6 min' },
  { type: 'speaking-sample', title: 'Speaking Sample', category: 'speaking', icon: 'speaking', detail: '30 sec prep + 3 min speaking', time: '4 min' },
  { type: 'interactive-writing', title: 'Interactive Writing', category: 'writing', icon: 'interactive-write', detail: 'Main response + follow-up', time: '8–9 min' },
  { type: 'interactive-speaking', title: 'Interactive Speaking', category: 'speaking', icon: 'interactive-speak', detail: '6–8 connected questions', time: '5–6 min' }
];

const PRACTICE_SKILL_MAP = Object.fromEntries(PRACTICE_SKILLS.map((skill) => [skill.type, skill]));

const SECTION_PRESENTATIONS = {
  'read-select': { title: 'Read and Select', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'TIME PER QUESTION', time: '0:05', note: 'Decide quickly whether each item is a real English word.' },
  'fill-blank': { title: 'Fill in the Blanks', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'TIME PER QUESTION', time: '0:20', note: 'Complete the unfinished word by typing one missing character in each box.' },
  'read-complete': { title: 'Read and Complete', countLabel: 'NUMBER OF PASSAGES', timeLabel: 'TIME PER PASSAGE', time: '3:00', note: 'Use context, grammar, collocation, and spelling to complete every unfinished word.' },
  'listen-type': { title: 'Listen and Type', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'TIME PER QUESTION', time: '1:00', note: 'The sentence plays automatically once, and you may replay it two more times.' },
  'interactive-reading': { title: 'Interactive Reading', countLabel: 'NUMBER OF SETS', timeLabel: 'TIME PER SET', time: '7–8 min', note: 'Complete a connected set of vocabulary, sentence, main-idea, title, and evidence tasks.' },
  'interactive-listening': { title: 'Interactive Listening', countLabel: 'NUMBER OF SCENARIOS', timeLabel: 'TIME PER SCENARIO', time: '7–8 min', note: 'Listen to a scenario, take part in the conversation, and write a short summary.' },
  'write-photo': { title: 'Write About the Photo', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'TIME PER QUESTION', time: '1:00', note: 'Describe the main scene, actions, positions, useful details, and likely atmosphere.' },
  'speak-photo': { title: 'Speak About the Photo', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'RESPONSE WINDOW', time: '20 sec + recording', note: 'Observe the scene, then speak continuously with a clear overview and supporting details.' },
  'read-then-speak': { title: 'Read, Then Speak', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'RESPONSE WINDOW', time: '20 sec + recording', note: 'Answer every part of the prompt and support your position with a specific example.' },
  'interactive-speaking': { title: 'Interactive Speaking', countLabel: 'NUMBER OF SETS', timeLabel: 'RESPONSE FORMAT', time: '6–8 turns', note: 'Respond naturally to connected questions as though you were having a real conversation.' },
  'interactive-writing': { title: 'Interactive Writing', countLabel: 'NUMBER OF SETS', timeLabel: 'TOTAL WRITING TIME', time: '8:00', note: 'Develop a focused response and then extend it with a connected follow-up.' },
  'writing-sample': { title: 'Writing Sample', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'WRITING TIME', time: '5:00', note: 'Write a clear, organized response with relevant development and accurate language.' },
  'speaking-sample': { title: 'Speaking Sample', countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'SPEAKING TIME', time: '3:00', note: 'Organize your answer, develop your ideas, and finish with a natural conclusion.' }
};

function practiceTypeFromMode(mode) {
  const value = String(mode || '');
  return value.startsWith('practice:') ? value.slice('practice:'.length) : '';
}

function modeTitle(mode) {
  const practiceType = practiceTypeFromMode(mode);
  if (practiceType) return `${PRACTICE_SKILL_MAP[practiceType]?.title || typeLabel(practiceType)} Practice`;
  return MODE_INFO[mode]?.title || 'Simulation';
}

function modeInfo(mode) {
  const practiceType = practiceTypeFromMode(mode);
  if (!practiceType) return MODE_INFO[mode] || MODE_INFO.full;
  const skill = PRACTICE_SKILL_MAP[practiceType];
  return {
    title: `${skill?.title || typeLabel(practiceType)} Practice`,
    time: skill?.time || 'Focused practice',
    description: skill?.detail || 'Focused question-type practice.',
    icon: '◇',
    tone: 'primary'
  };
}

function applyTheme() {
  const theme = state.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function icon(name) {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    chart: '<path d="M4 19V9m6 10V5m6 14v-7m5 7H2"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08A1.7 1.7 0 0 0 4.64 8.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.58a1.7 1.7 0 0 0 1.03-1.56V3h4v.08A1.7 1.7 0 0 0 15.06 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 21 10.04H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/>',
    spark: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
    camera: '<path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12.5" r="4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    back: '<path d="M19 12H5m5 5-5-5 5-5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/>',
    print: '<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
    practice: '<path d="M5 7h14M5 12h9M5 17h6"/><circle cx="18" cy="16" r="3"/><path d="m20.2 18.2 1.8 1.8"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1Zm16 0h-3v6h2a1 1 0 0 0 1-1Z"/>',
    pencil: '<path d="m4 20 4.3-1 10.9-10.9a2 2 0 0 0-2.8-2.8L5.5 16.2Z"/><path d="m14.8 6.9 2.8 2.8"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5"/>',
    keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>',
    message: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8M8 12h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function logoMarkup(compact = false) {
  return `<div class="brand ${compact ? 'compact' : ''}"><div class="brand-mark"><span>S</span><i></i></div><div><strong>ScoreForge</strong><small>130+ ENGLISH LAB</small></div></div>`;
}

function aiStatusMarkup() {
  return state.health.aiConfigured
    ? `<span class="api-status connected"><i></i> AI connected</span>`
    : `<span class="api-status demo"><i></i> Demo bank</span>`;
}

function backButtonMarkup(id, label = 'Back') {
  return `<button id="${escapeHtml(id)}" class="nav-back-button" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon('back')}</button>`;
}

function unifiedTopbar({ backId = '', backLabel = 'Back' } = {}) {
  return `<header class="practice-topbar unified-topbar"><div class="practice-topbar-start">${backId ? backButtonMarkup(backId, backLabel) : ''}${logoMarkup(true)}</div><div class="practice-topbar-actions">${aiStatusMarkup()}<button class="practice-settings-button" data-action="settings" aria-label="Open settings">${icon('settings')}</button><span class="practice-avatar">S</span></div></header>`;
}

function isScore(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function getAverageScore(attempts) {
  const scores = attempts.map((attempt) => attempt.overall).filter(isScore);
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length / 5) * 5;
}

function renderHome() {
  cleanupActiveQuestion();
  stopEquipment();
  state.returnView = 'home';
  const attempts = loadAttempts();
  const balancedAttempts = attempts.filter((attempt) => !attempt.isPartial && ['full', 'quick'].includes(attempt.mode));
  const last = balancedAttempts[0] || attempts[0];
  const latestIsPartial = Boolean(last?.isPartial || (last && !['full', 'quick'].includes(last.mode)));
  const average = getAverageScore(balancedAttempts.length ? balancedAttempts : attempts);
  const target = Number(state.settings.target || 130);
  const gap = last ? target - last.overall : null;
  const scoreCopy = last
    ? `${latestIsPartial ? 'Assessed-skill' : 'Estimated'} range ${last.range?.[0] || last.overall - 10}–${last.range?.[1] || last.overall + 10}. ${latestIsPartial ? 'Complete a balanced test for a four-skill result.' : (last.overall >= target ? 'Your latest simulation reached the selected target.' : `${Math.max(0, gap)} points remain to reach ${target}.`)}`
    : 'Run a quick diagnostic or full simulation to establish a reliable baseline.';

  app.innerHTML = `
    <div class="practice-hub-shell unified-dashboard-shell">
      ${unifiedTopbar()}
      ${practiceShellNavigation('tests')}
      <main class="practice-main unified-dashboard-main dashboard">
        <section class="dashboard-hero-banner">
          <div><span class="practice-eyebrow">C1 PERFORMANCE TRAINING</span><h1>Your complete ${target}+ preparation workspace</h1><p>Take realistic simulations, practise individual task types, review every mistake, and use AI feedback to target the fastest score improvement.</p></div>
          <div class="header-actions"><button class="ghost-button" data-nav="practice">${icon('practice')} PRACTICE SKILLS</button><button class="primary-button" data-start="full">START FULL TEST ${icon('arrow')}</button></div>
        </section>

        <section class="hero-grid dashboard-score-grid">
          <article class="score-overview-card">
            <div class="score-ring ${last && !latestIsPartial && last.overall >= target ? 'achieved' : ''}" style="--score:${last ? last.overall : 0}">
              <div><span>${last ? last.overall : '—'}</span><small>${last ? (latestIsPartial ? 'LATEST FOCUS SCORE' : 'LATEST ESTIMATE') : 'NO TEST YET'}</small></div>
            </div>
            <div class="score-summary"><span class="section-label">Current position</span><h2>${last ? `${last.cefr || 'Practice'} performance` : 'Establish your baseline'}</h2><p>${scoreCopy}</p><div class="mini-stats"><div><span>Average</span><strong>${average ?? '—'}</strong></div><div><span>Attempts</span><strong>${attempts.length}</strong></div><div><span>Target</span><strong>${target}</strong></div></div></div>
          </article>
          <article class="skill-snapshot-card">
            <div class="card-heading"><div><span class="section-label">Skill snapshot</span><h2>${last ? 'Latest subscores' : 'Awaiting first result'}</h2></div>${last ? `<button class="text-button" data-open-attempt="${escapeHtml(last.id)}">VIEW REPORT ${icon('arrow')}</button>` : ''}</div>
            ${last ? `<div class="skill-bars">${Object.entries(last.individual || {}).map(([skill, score]) => `<div class="skill-bar ${isScore(score) ? '' : 'unassessed'}"><div><span>${escapeHtml(skill)}</span><strong>${isScore(score) ? score : '—'}</strong></div><div class="bar-track"><i style="width:${isScore(score) ? score / 1.6 : 0}%"></i><b style="left:${target / 1.6}%"></b></div></div>`).join('')}</div>` : `<div class="empty-state-graphic"><div class="radar-placeholder"><i></i><i></i><i></i><i></i></div><p>Your reading, writing, listening, and speaking estimates will appear here.</p></div>`}
          </article>
        </section>

        <section class="section-block dashboard-session-block">
          <div class="section-heading"><div><span class="section-label">Choose a session</span><h2>Train with one clear, consistent experience</h2></div><p>Dashboard, practice, and examination screens share the same navigation, typography, cards, and colour system.</p></div>
          <div class="mode-grid">
            ${Object.entries(MODE_INFO).map(([key, mode]) => `<article class="mode-card ${mode.tone}"><div class="mode-card-top"><div class="mode-icon">${mode.icon}</div><div class="mode-time">${icon('clock')} ${mode.time}</div></div><h3>${mode.title}</h3><p>${mode.description}</p><button data-start="${key}" class="mode-button">BEGIN SESSION ${icon('arrow')}</button></article>`).join('')}
          </div>
        </section>

        <section class="bottom-grid">
          <article class="focus-card"><div class="focus-visual"><span>c o n s i s</span><b>t e n t</b></div><div><span class="section-label">Priority training</span><h2>Fill in the Blanks</h2><p>Practise context, word families, collocations, and spelling at the real 20-second pace.</p><button class="outline-button" data-start="blanks">OPEN BLANK MASTERY LAB</button></div></article>
          <article class="recent-card"><div class="card-heading"><div><span class="section-label">Recent activity</span><h2>Test history</h2></div>${attempts.length ? `<button class="text-button" data-nav="history">VIEW ALL</button>` : ''}</div>${renderRecentAttempts(attempts.slice(0, 4))}</article>
        </section>

        <footer class="legal-note"><strong>Independent practice simulator.</strong> Not affiliated with, endorsed by, or a replacement for the official Duolingo English Test. All displayed scores are estimates.</footer>
      </main>
    </div>`;
  bindPracticeShellNavigation();
  bindCommonNavigation();
}

function renderRecentAttempts(attempts) {
  if (!attempts.length) return `<div class="empty-list"><span>◌</span><p>No completed simulations yet.</p></div>`;
  return `<div class="attempt-list">${attempts.map((attempt) => `<button class="attempt-row" data-open-attempt="${escapeHtml(attempt.id)}"><span class="attempt-score">${attempt.overall}</span><span><strong>${escapeHtml(modeTitle(attempt.mode))}</strong><small>${new Date(attempt.createdAt).toLocaleDateString()} · ${attempt.cefr || ''}</small></span><i>${attempt.isPartial || !['full', 'quick'].includes(attempt.mode) ? 'FOCUS' : (attempt.overall >= attempt.target ? 'TARGET' : `${attempt.target - attempt.overall} TO GO`)}</i></button>`).join('')}</div>`;
}

function bindCommonNavigation() {
  app.querySelectorAll('[data-start]').forEach((button) => button.addEventListener('click', () => showEquipment(button.dataset.start)));
  app.querySelectorAll('[data-action="settings"]').forEach((button) => button.addEventListener('click', openSettings));
  app.querySelectorAll('[data-nav="history"]').forEach((button) => button.addEventListener('click', renderHistory));
  app.querySelectorAll('[data-nav="practice"]').forEach((button) => button.addEventListener('click', () => renderPractice()));
  app.querySelectorAll('[data-nav="guide"]').forEach((button) => button.addEventListener('click', renderTestGuide));
  app.querySelectorAll('[data-nav="home"]').forEach((button) => button.addEventListener('click', renderHome));
  app.querySelectorAll('[data-open-attempt]').forEach((button) => button.addEventListener('click', () => {
    const report = getAttempt(button.dataset.openAttempt);
    if (report) { state.currentReport = report; renderResults(report); }
  }));
}

function practiceSkillIcon(skill) {
  const mainIcons = {
    'read-select': 'check',
    'fill-blank': 'keyboard',
    'read-complete': 'book',
    'listen-type': 'headphones',
    'write-photo': 'image',
    'speak-photo': 'image',
    'read-then-speak': 'book',
    'interactive-reading': 'practice',
    'interactive-listening': 'message',
    'writing-sample': 'pencil',
    'speaking-sample': 'mic',
    'interactive-writing': 'pencil',
    'interactive-speaking': 'user'
  };
  const badgeIcons = {
    'read-select': 'close',
    'fill-blank': 'keyboard',
    'read-complete': 'practice',
    'listen-type': 'pencil',
    'write-photo': 'pencil',
    'speak-photo': 'mic',
    'read-then-speak': 'mic',
    'interactive-reading': 'arrow',
    'interactive-listening': 'arrow',
    'interactive-writing': 'arrow',
    'interactive-speaking': 'message'
  };
  return `<span class="practice-card-icon ${escapeHtml(skill.category)}"><span>${icon(mainIcons[skill.type] || 'practice')}</span>${badgeIcons[skill.type] ? `<i>${icon(badgeIcons[skill.type])}</i>` : ''}</span>`;
}

function practiceShellNavigation(active = 'practice') {
  return `
    <aside class="practice-side-nav">
      <button class="${active === 'tests' ? 'active' : ''}" data-practice-nav="tests">${icon('home')}<span>MY TESTS</span></button>
      <button class="${active === 'practice' ? 'active' : ''}" data-practice-nav="practice">${icon('practice')}<span>PRACTICE</span></button>
      <button class="${active === 'guide' ? 'active' : ''}" data-practice-nav="guide">${icon('book')}<span>TEST GUIDE</span></button>
      <button class="${active === 'history' ? 'active' : ''}" data-practice-nav="history">${icon('chart')}<span>HISTORY</span></button>
      <button data-action="settings">${icon('settings')}<span>SETTINGS</span></button>
    </aside>`;
}

function bindPracticeShellNavigation() {
  app.querySelectorAll('[data-practice-nav="tests"]').forEach((button) => button.addEventListener('click', renderHome));
  app.querySelectorAll('[data-practice-nav="practice"]').forEach((button) => button.addEventListener('click', () => renderPractice()));
  app.querySelectorAll('[data-practice-nav="guide"]').forEach((button) => button.addEventListener('click', renderTestGuide));
  app.querySelectorAll('[data-practice-nav="history"]').forEach((button) => button.addEventListener('click', renderHistory));
  app.querySelectorAll('[data-action="settings"]').forEach((button) => button.addEventListener('click', openSettings));
}

function renderPractice(filter = state.practiceFilter) {
  cleanupActiveQuestion();
  stopEquipment();
  state.returnView = 'practice';
  state.practiceFilter = ['all', 'speaking', 'writing', 'reading', 'listening'].includes(filter) ? filter : 'all';
  const progress = loadPracticeProgress();
  const visible = state.practiceFilter === 'all'
    ? PRACTICE_SKILLS
    : PRACTICE_SKILLS.filter((skill) => skill.category === state.practiceFilter);
  const completedRounds = PRACTICE_SKILLS.reduce((sum, skill) => sum + Math.min(6, Number(progress[skill.type] || 0)), 0);
  const totalRounds = PRACTICE_SKILLS.length * 6;

  app.innerHTML = `
    <div class="practice-hub-shell">
      ${unifiedTopbar({ backId: 'practice-back', backLabel: 'Return to dashboard' })}
      ${practiceShellNavigation('practice')}
      <main class="practice-main">
        <div class="practice-heading-row">
          <div><span class="practice-eyebrow">TARGETED TRAINING</span><h1>Practice skills</h1><p>Choose one task type and complete a realistic timed round. Every new round can use fresh AI-generated material.</p></div>
          <div class="practice-total-progress"><strong>${completedRounds}</strong><span>of ${totalRounds} rounds</span><div><i style="width:${Math.round(completedRounds / Math.max(1, totalRounds) * 100)}%"></i></div></div>
        </div>

        <nav class="practice-tabs" aria-label="Filter practice skills">
          ${['all', 'speaking', 'writing', 'reading', 'listening'].map((category) => `<button class="${state.practiceFilter === category ? 'active' : ''}" data-practice-filter="${category}">${category.toUpperCase()}</button>`).join('')}
        </nav>

        <section class="practice-card-grid">
          ${visible.map((skill) => {
            const completed = Math.min(6, Math.max(0, Number(progress[skill.type] || 0)));
            return `<button class="practice-skill-card" data-practice-type="${escapeHtml(skill.type)}" aria-label="Start ${escapeHtml(skill.title)} practice">
              ${practiceSkillIcon(skill)}
              <span class="practice-card-copy"><strong>${escapeHtml(skill.title)}</strong><small>${escapeHtml(skill.detail)} · ${escapeHtml(skill.time)}</small><span class="practice-progress-line"><i><b style="width:${completed / 6 * 100}%"></b></i><em>${completed}/6</em></span></span>
              <span class="practice-start-cue">${icon('arrow')}</span>
            </button>`;
          }).join('')}
        </section>

        <footer class="practice-footer-note"><span>Scores and progress are independent practice estimates.</span><button id="reset-practice-progress" type="button">Reset practice progress</button></footer>
      </main>
    </div>`;

  bindPracticeShellNavigation();
  app.querySelector('#practice-back')?.addEventListener('click', renderHome);
  app.querySelectorAll('[data-practice-filter]').forEach((button) => button.addEventListener('click', () => renderPractice(button.dataset.practiceFilter)));
  app.querySelectorAll('[data-practice-type]').forEach((button) => button.addEventListener('click', () => beginPracticeSkill(button.dataset.practiceType)));
  app.querySelector('#reset-practice-progress').addEventListener('click', () => {
    if (confirm('Reset all practice-card progress to 0/6? Your saved score reports will not be deleted.')) {
      resetPracticeProgress();
      renderPractice(state.practiceFilter);
    }
  });
}

function beginPracticeSkill(type) {
  const skill = PRACTICE_SKILL_MAP[type];
  if (!skill) return;
  state.returnView = 'practice';
  const mode = `practice:${type}`;
  if (skill.category === 'speaking') showEquipment(mode);
  else prepareTest(mode);
}

function renderTestGuide() {
  cleanupActiveQuestion();
  stopEquipment();
  state.returnView = 'guide';
  const categories = ['reading', 'listening', 'writing', 'speaking'];
  app.innerHTML = `
    <div class="practice-hub-shell">
      ${unifiedTopbar({ backId: 'guide-back', backLabel: 'Return to dashboard' })}
      ${practiceShellNavigation('guide')}
      <main class="practice-main guide-main">
        <div class="practice-heading-row"><div><span class="practice-eyebrow">TEST REFERENCE</span><h1>Task guide</h1><p>Review the purpose, timing, and response method for every question family before you begin a simulation.</p></div><button class="primary-button" id="guide-practice">OPEN PRACTICE SKILLS ${icon('arrow')}</button></div>
        <section class="guide-category-grid">
          ${categories.map((category) => `<article class="guide-category"><header><span class="guide-category-icon ${category}">${icon(category === 'reading' ? 'book' : category === 'listening' ? 'headphones' : category === 'writing' ? 'pencil' : 'mic')}</span><div><small>${category.toUpperCase()}</small><h2>${category.charAt(0).toUpperCase() + category.slice(1)} tasks</h2></div></header><div>${PRACTICE_SKILLS.filter((skill) => skill.category === category).map((skill) => `<button data-guide-skill="${escapeHtml(skill.type)}"><strong>${escapeHtml(skill.title)}</strong><span>${escapeHtml(skill.detail)}</span><em>${escapeHtml(skill.time)}</em></button>`).join('')}</div></article>`).join('')}
        </section>
        <section class="guide-tip-panel"><span>${icon('spark')}</span><div><h2>Recommended preparation sequence</h2><p>Complete a Quick Diagnostic, practise your two lowest task types until their cards reach 6/6, then take a full simulation under strict mode.</p></div><button data-start="quick" class="outline-button">START QUICK DIAGNOSTIC</button></section>
      </main>
    </div>`;
  bindPracticeShellNavigation();
  app.querySelector('#guide-back')?.addEventListener('click', renderHome);
  app.querySelector('#guide-practice').addEventListener('click', () => renderPractice());
  app.querySelectorAll('[data-guide-skill]').forEach((button) => button.addEventListener('click', () => beginPracticeSkill(button.dataset.guideSkill)));
  app.querySelectorAll('[data-start]').forEach((button) => button.addEventListener('click', () => showEquipment(button.dataset.start)));
}

function renderHistory() {
  cleanupActiveQuestion();
  stopEquipment();
  state.returnView = 'history';
  const attempts = loadAttempts();
  app.innerHTML = `
    <div class="practice-hub-shell unified-history-shell">
      ${unifiedTopbar({ backId: 'history-back', backLabel: 'Return to dashboard' })}
      ${practiceShellNavigation('history')}
      <main class="practice-main history-page unified-history-page">
        <div class="practice-heading-row"><div><span class="practice-eyebrow">PERFORMANCE ARCHIVE</span><h1>Your simulation history</h1><p>Compare trends, reopen feedback, and decide which skill to train next.</p></div><button class="primary-button" id="history-start">START QUICK DIAGNOSTIC ${icon('arrow')}</button></div>
        ${attempts.length ? `<div class="history-table-wrap"><table class="history-table"><thead><tr><th>Date</th><th>Mode</th><th>Overall</th><th>Reading</th><th>Writing</th><th>Listening</th><th>Speaking</th><th></th></tr></thead><tbody>${attempts.map((attempt) => `<tr><td>${new Date(attempt.createdAt).toLocaleString()}</td><td>${escapeHtml(modeTitle(attempt.mode))}</td><td><strong class="table-score">${attempt.overall}</strong></td><td>${attempt.individual?.reading ?? '—'}</td><td>${attempt.individual?.writing ?? '—'}</td><td>${attempt.individual?.listening ?? '—'}</td><td>${attempt.individual?.speaking ?? '—'}</td><td><button class="text-button" data-open-attempt="${escapeHtml(attempt.id)}">REPORT</button><button class="icon-button danger" data-delete-attempt="${escapeHtml(attempt.id)}" aria-label="Delete attempt">×</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="large-empty"><div>◎</div><h2>No completed tests yet</h2><p>Your results will appear here after your first simulation.</p><button class="primary-button" id="empty-start">START QUICK DIAGNOSTIC</button></div>`}
      </main>
    </div>`;
  bindPracticeShellNavigation();
  app.querySelector('#history-back')?.addEventListener('click', renderHome);
  app.querySelector('#history-start')?.addEventListener('click', () => showEquipment('quick'));
  app.querySelector('#empty-start')?.addEventListener('click', () => showEquipment('quick'));
  app.querySelectorAll('[data-open-attempt]').forEach((button) => button.addEventListener('click', () => {
    const report = getAttempt(button.dataset.openAttempt);
    if (report) { state.currentReport = report; renderResults(report); }
  }));
  app.querySelectorAll('[data-delete-attempt]').forEach((button) => button.addEventListener('click', () => {
    if (confirm('Delete this saved result from this browser?')) { deleteAttempt(button.dataset.deleteAttempt); renderHistory(); }
  }));
}

function openSettings() {
  document.querySelector('.modal-backdrop')?.remove();
  const settings = { ...state.settings };
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal-header"><div><span class="section-label">Simulator configuration</span><h2 id="settings-title">Settings</h2></div><button class="icon-button" id="close-settings">${icon('close')}</button></div>
      <div class="settings-content">
        <section><h3>Score target and AI</h3>
          <label class="field-label">Target score<input id="setting-target" type="number" min="10" max="160" step="5" value="${Number(settings.target)}"></label>
          <label class="toggle-row"><span><strong>Generate fresh questions with AI</strong><small>Uses your server-side OpenRouter key. Demo questions remain available as a fallback.</small></span><input id="setting-ai" type="checkbox" ${settings.useAI ? 'checked' : ''}><i></i></label>
          <label class="field-label">OpenRouter model override<input id="setting-model" type="text" value="${escapeHtml(settings.model)}" placeholder="Leave blank to use ${escapeHtml(state.health.model || 'server default')}"><small>The key is never stored here. Configure it in the project’s .env file.</small></label>
          <div class="api-config-box ${state.health.aiConfigured ? 'connected' : ''}">${state.health.aiConfigured ? `${icon('check')}<span><strong>OpenRouter is configured</strong><small>Text: ${escapeHtml(state.health.model)} · STT: ${escapeHtml(state.health.sttModel)} · Natural voice: ${escapeHtml(state.health.ttsModel || 'server default')}</small></span>` : `<span class="api-key-icon">{ }</span><span><strong>Demo mode is active</strong><small>Copy .env.example to .env, paste OPENROUTER_API_KEY, then restart the app.</small></span>`}</div>
        </section>
        <section><h3>Test environment</h3>
          <label class="toggle-row"><span><strong>Camera preview</strong><small>Show a small local webcam preview during the simulation. Video is not uploaded.</small></span><input id="setting-camera" type="checkbox" ${settings.cameraPreview ? 'checked' : ''}><i></i></label>
          <label class="toggle-row"><span><strong>Request fullscreen</strong><small>Reduces distractions when the browser permits it.</small></span><input id="setting-fullscreen" type="checkbox" ${settings.requestFullscreen ? 'checked' : ''}><i></i></label>
          <label class="toggle-row"><span><strong>Strict simulation mode</strong><small>Hide question transcripts and practice aids during full tests.</small></span><input id="setting-strict" type="checkbox" ${settings.strictMode ? 'checked' : ''}><i></i></label>
          <label class="toggle-row"><span><strong>Show speech transcript after recording</strong><small>Useful in focused practice; turn off for realistic test conditions.</small></span><input id="setting-transcript" type="checkbox" ${settings.showTranscriptAfterRecording ? 'checked' : ''}><i></i></label>
        </section>
        <section><h3>Listening voice</h3>
          <div class="two-fields"><label class="field-label">Voice source<select id="setting-voice-mode"><option value="auto">Natural AI voice + browser fallback</option><option value="openrouter">OpenRouter natural voice only</option><option value="browser">Browser voice only</option></select><small>Automatic mode gives the clearest available voice without blocking a test when the API is unavailable.</small></label><label class="field-label">Preferred browser accent<select id="setting-accent"><option value="auto">Automatic English</option><option value="us">US English</option><option value="gb">UK English</option><option value="au">Australian English</option><option value="ca">Canadian English</option></select><small>Used only for the browser fallback voice.</small></label></div>
          <label class="field-label">Speech speed<input id="setting-rate" type="range" min="0.78" max="1.12" step="0.02" value="${Number(settings.voiceRate)}"><small id="rate-label">${Number(settings.voiceRate).toFixed(2)}×</small></label>
        </section>
        <section><h3>Appearance</h3><div class="theme-options"><button data-theme-option="dark" class="${settings.theme === 'dark' ? 'selected' : ''}"><i class="dark-preview"></i>Dark</button><button data-theme-option="light" class="${settings.theme === 'light' ? 'selected' : ''}"><i class="light-preview"></i>Light</button></div></section>
      </div>
      <div class="modal-footer"><button class="ghost-button" id="cancel-settings">CANCEL</button><button class="primary-button" id="save-settings">SAVE SETTINGS</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#setting-voice-mode').value = settings.voiceMode || 'auto';
  modal.querySelector('#setting-accent').value = settings.voiceAccent;
  modal.querySelector('#setting-rate').addEventListener('input', (event) => { modal.querySelector('#rate-label').textContent = `${Number(event.target.value).toFixed(2)}×`; });
  modal.querySelectorAll('[data-theme-option]').forEach((button) => button.addEventListener('click', () => {
    settings.theme = button.dataset.themeOption;
    modal.querySelectorAll('[data-theme-option]').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  const close = () => modal.remove();
  modal.querySelector('#close-settings').addEventListener('click', close);
  modal.querySelector('#cancel-settings').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelector('#save-settings').addEventListener('click', () => {
    state.settings = saveSettings({
      ...settings,
      target: Math.min(160, Math.max(10, Number(modal.querySelector('#setting-target').value) || 130)),
      useAI: modal.querySelector('#setting-ai').checked,
      model: modal.querySelector('#setting-model').value.trim(),
      cameraPreview: modal.querySelector('#setting-camera').checked,
      requestFullscreen: modal.querySelector('#setting-fullscreen').checked,
      strictMode: modal.querySelector('#setting-strict').checked,
      showTranscriptAfterRecording: modal.querySelector('#setting-transcript').checked,
      voiceMode: modal.querySelector('#setting-voice-mode').value,
      voiceAccent: modal.querySelector('#setting-accent').value,
      voiceRate: Number(modal.querySelector('#setting-rate').value)
    });
    applyTheme();
    close();
    if (app.querySelector('.dashboard')) renderHome();
  });
}

function stopEquipment() {
  state.stopLevel?.();
  state.stopLevel = null;
  stopMediaStream(state.equipmentStream);
  state.equipmentStream = null;
}

function showEquipment(mode) {
  cleanupActiveQuestion();
  stopEquipment();
  state.pendingMode = mode;
  const info = modeInfo(mode);
  const practiceType = practiceTypeFromMode(mode);
  const practiceSkill = PRACTICE_SKILL_MAP[practiceType];
  const backLabel = practiceType ? 'PRACTICE SKILLS' : 'DASHBOARD';
  const environmentCopy = practiceType
    ? `${info.title} · ${info.time}. This round contains ${practiceSkill?.detail || 'focused practice'} and will update the card progress when completed.`
    : `${info.title} · ${info.time}. Your microphone is required for speaking tasks. The camera preview is optional and stays entirely on your device.`;
  app.innerHTML = `
    <div class="practice-hub-shell setup-shell unified-setup-shell">
      ${unifiedTopbar({ backId: 'setup-back', backLabel: `Return to ${backLabel.toLowerCase()}` })}
      ${practiceShellNavigation(practiceType ? 'practice' : 'tests')}
      <main class="practice-main setup-page">
        <div class="setup-copy"><span class="eyebrow">BEFORE YOU BEGIN</span><h1>Prepare a realistic test environment</h1><p>${escapeHtml(environmentCopy)}</p>
          <div class="setup-checklist">
            <div id="camera-check" class="check-item"><span>${icon('camera')}</span><div><strong>Camera</strong><small>Optional local preview</small></div><i>Not checked</i></div>
            <div id="mic-check" class="check-item"><span>${icon('mic')}</span><div><strong>Microphone</strong><small>Required for spoken answers</small></div><i>Not checked</i></div>
            <div id="speaker-check" class="check-item"><span>♪</span><div><strong>Speaker</strong><small>Required for listening tasks</small></div><i>Not checked</i></div>
            <div class="check-item ${state.health.aiConfigured ? 'passed' : 'warning'}"><span>${icon('spark')}</span><div><strong>AI services</strong><small>${state.health.aiConfigured ? 'Fresh questions and OpenRouter transcription available' : 'Demo bank and browser speech fallback available'}</small></div><i>${state.health.aiConfigured ? 'Ready' : 'Demo'}</i></div>
          </div>
          <div class="setup-actions"><button id="run-check" class="outline-button">RUN CAMERA & MIC CHECK</button><button id="test-speaker" class="outline-button">PLAY SPEAKER CHECK</button></div>
          <label class="rules-confirm"><input id="rules-confirm" type="checkbox"><span>I am in a quiet room, notifications are off, and I will complete the simulation without dictionaries, notes, or external assistance.</span></label>
          <button id="begin-test" class="primary-button extra-large" disabled>GENERATE & BEGIN ${icon('arrow')}</button>
        </div>
        <div class="setup-preview"><div class="preview-frame"><video id="setup-video" autoplay muted playsinline></video><div class="camera-placeholder">${icon('camera')}<span>Camera preview</span></div><div class="face-guide"></div><div class="preview-label">LOCAL PREVIEW · NOT UPLOADED</div></div><div class="mic-meter"><span>MIC LEVEL</span><div><i id="mic-level"></i></div><b id="mic-level-text">Awaiting permission</b></div><div class="setup-tips"><h3>Simulation rules</h3><p>Keep looking at the screen except while typing. Use no predictive writing tools. Speak only when recording begins. Complete each response before its timer expires.</p></div></div>
      </main>
    </div>`;
  bindPracticeShellNavigation();
  app.querySelector('#setup-back').addEventListener('click', () => practiceType ? renderPractice() : renderHome());
  const beginButton = app.querySelector('#begin-test');
  app.querySelector('#rules-confirm').addEventListener('change', (event) => { beginButton.disabled = !event.target.checked; });
  app.querySelector('#run-check').addEventListener('click', runEquipmentCheck);
  app.querySelector('#test-speaker').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await playSpeakerCheck();
      markCheck('speaker-check', 'passed', 'Ready');
    } catch {
      markCheck('speaker-check', 'warning', 'Unavailable');
    }
    event.currentTarget.disabled = false;
  });
  beginButton.addEventListener('click', () => prepareTest(mode));
}

function markCheck(id, className, text) {
  const element = app.querySelector(`#${id}`);
  if (!element) return;
  element.classList.remove('passed', 'warning', 'failed');
  element.classList.add(className);
  element.querySelector('i').textContent = text;
}

async function runEquipmentCheck() {
  const button = app.querySelector('#run-check');
  button.disabled = true;
  button.textContent = 'REQUESTING PERMISSION…';
  stopEquipment();
  try {
    state.equipmentStream = await requestEquipmentStream({ camera: state.settings.cameraPreview, microphone: true });
    const video = app.querySelector('#setup-video');
    if (state.settings.cameraPreview && state.equipmentStream.getVideoTracks().length) {
      attachVideoStream(video, state.equipmentStream);
      app.querySelector('.camera-placeholder').classList.add('hidden');
      markCheck('camera-check', 'passed', 'Ready');
    } else {
      markCheck('camera-check', 'warning', 'Disabled');
    }
    if (state.equipmentStream.getAudioTracks().length) {
      markCheck('mic-check', 'passed', 'Ready');
      state.stopLevel = startLevelMonitor(state.equipmentStream, (level) => {
        const meter = app.querySelector('#mic-level');
        if (meter) meter.style.width = `${Math.max(2, level * 100)}%`;
        const label = app.querySelector('#mic-level-text');
        if (label) label.textContent = level > 0.35 ? 'Strong signal' : level > 0.12 ? 'Good signal' : 'Speak to test';
      });
    }
    button.textContent = 'CHECK AGAIN';
  } catch (error) {
    markCheck('camera-check', 'failed', 'Blocked');
    markCheck('mic-check', 'failed', 'Blocked');
    button.textContent = 'TRY AGAIN';
    alert(`The browser could not access your camera or microphone.\n\n${error.message}\n\nUse Chrome or Edge and open the app at http://localhost:3000.`);
  } finally {
    button.disabled = false;
  }
}

async function prepareTest(mode) {
  state.stopLevel?.();
  state.stopLevel = null;
  if (state.equipmentStream) {
    state.equipmentStream.getAudioTracks?.().forEach((track) => track.stop());
    if (!state.settings.cameraPreview || !state.equipmentStream.getVideoTracks?.().some((track) => track.readyState === 'live')) {
      stopMediaStream(state.equipmentStream);
      state.equipmentStream = null;
    }
  }
  if (state.settings.requestFullscreen && document.documentElement.requestFullscreen) {
    await document.documentElement.requestFullscreen().catch(() => {});
  }
  const generationId = ++state.generationId;
  renderGenerating(mode, generationId);
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const response = await generateTest({ target: state.settings.target, seed, useAI: state.settings.useAI, model: state.settings.model });
    if (state.generationId !== generationId) return;
    state.pack = response.pack;
    startSession(response.pack, mode, response);
  } catch (error) {
    try {
      const fallback = await generateTest({ target: state.settings.target, seed, useAI: false, model: '' });
      if (state.generationId !== generationId) return;
      fallback.pack.notices = [...(fallback.pack.notices || []), `AI generation error: ${error.message}`];
      state.pack = fallback.pack;
      startSession(fallback.pack, mode, fallback);
    } catch (fallbackError) {
      if (state.generationId !== generationId) return;
      app.querySelector('.generation-status').innerHTML = `<h2>Test generation failed</h2><p>${escapeHtml(fallbackError.message)}</p><button id="generation-home" class="primary-button">RETURN TO DASHBOARD</button>`;
      app.querySelector('#generation-home').addEventListener('click', renderHome);
    }
  }
}

function renderGenerating(mode, generationId = state.generationId) {
  const messages = [
    'Building a balanced adaptive item pool…',
    'Checking every objective answer and distractor…',
    'Preparing interactive reading and listening scenarios…',
    'Selecting image-description tasks…',
    'Calibrating the simulation toward C1 performance…'
  ];
  const returnToPractice = Boolean(practiceTypeFromMode(mode));
  app.innerHTML = `
    <div class="practice-hub-shell generation-shell">
      ${unifiedTopbar({ backId: 'generation-back', backLabel: returnToPractice ? 'Return to practice skills' : 'Return to dashboard' })}
      ${practiceShellNavigation(returnToPractice ? 'practice' : 'tests')}
      <main class="practice-main generation-page"><div class="generation-visual"><div class="forge-core"><span>S</span><i></i><b></b></div><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div></div><div class="generation-status"><span class="eyebrow">${escapeHtml(modeTitle(mode).toUpperCase())}</span><h1>Creating your test</h1><p id="generation-message">${messages[0]}</p><div class="generation-track"><i></i></div><small>${state.settings.useAI && state.health.aiConfigured ? 'OpenRouter is generating fresh material. Invalid batches are automatically replaced by verified built-in items.' : 'The verified built-in bank is being randomized for this attempt.'}</small></div></main>
    </div>`;
  bindPracticeShellNavigation();
  app.querySelector('#generation-back')?.addEventListener('click', () => {
    if (state.generationId === generationId) state.generationId += 1;
    if (returnToPractice) renderPractice(); else renderHome();
  });
  let index = 0;
  const interval = setInterval(() => {
    const element = app.querySelector('#generation-message');
    if (!element) return clearInterval(interval);
    index = (index + 1) % messages.length;
    element.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300 });
    element.textContent = messages[index];
  }, 3200);
}

function startSession(pack, mode, generationMeta) {
  const blueprint = createSessionBlueprint(pack, mode);
  const initialAbility = Math.min(4.2, Math.max(2.6, 2.8 + (Number(state.settings.target) - 100) / 60));
  state.session = {
    id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    practiceType: practiceTypeFromMode(mode) || null,
    target: Number(state.settings.target),
    packSource: pack.source,
    notices: [...(pack.notices || [])],
    model: generationMeta.model || null,
    generationUsage: generationMeta.usage || null,
    blueprint,
    currentIndex: 0,
    usedIds: [],
    responses: [],
    introducedTypes: [],
    ability: initialAbility,
    startedAt: Date.now()
  };
  renderTestShell();
  renderCurrentQuestion();
}

function renderTestShell() {
  app.innerHTML = `
    <div class="test-shell">
      <header class="test-header">
        <div class="test-timing-block">
          <button id="test-back" class="test-back-button" type="button" aria-label="Return to previous screen" title="Return">${icon('back')}</button>
          <div id="test-timer" class="test-timer"><small>TIME LEFT</small><strong>0:00</strong></div>
          <span id="test-source" class="source-pill ${state.session.packSource}">${escapeHtml(state.session.packSource.toUpperCase())} ITEMS</span>
        </div>
        <div class="test-progress-wrap"><div class="test-progress-label"><span id="question-position">Question 1</span><strong id="question-type">Preparing…</strong><small id="question-substage"></small></div><div class="test-progress"><i id="test-progress-bar"></i></div></div>
        <div class="test-tools">${state.settings.cameraPreview && state.equipmentStream?.getVideoTracks?.().length ? '<div class="webcam-mini"><video id="webcam-mini" autoplay muted playsinline></video><i></i></div>' : ''}<button id="quit-test" class="test-close-button" aria-label="Quit test">${icon('close')}</button></div>
      </header>
      <div class="instruction-bar"><span id="question-instruction">Complete the task before the timer ends.</span><span id="ability-indicator" title="Adaptive practice indicator">Adaptive difficulty active</span></div>
      <main id="question-root" class="question-stage"></main>
      <footer class="test-footer"><span><strong>ScoreForge 130+</strong> · Independent practice simulation</span><span id="autosave-status">Progress saved locally</span></footer>
    </div>`;
  if (state.equipmentStream && app.querySelector('#webcam-mini')) attachVideoStream(app.querySelector('#webcam-mini'), state.equipmentStream);
  app.querySelector('#test-back').addEventListener('click', quitTest);
  app.querySelector('#quit-test').addEventListener('click', quitTest);
}

function materializeStep(step) {
  if (step.question) return step.question;
  const poolMap = {
    'read-select': state.pack.adaptive.readSelect,
    'fill-blank': state.pack.adaptive.fillBlanks,
    'read-complete': state.pack.adaptive.readComplete,
    'listen-type': state.pack.adaptive.listenType
  };
  const question = selectAdaptiveQuestion(poolMap[step.kind] || [], new Set(state.session.usedIds), state.session.ability);
  if (question) {
    step.question = question;
    state.session.usedIds.push(question.id);
  }
  return question;
}

function blueprintType(step) {
  return step?.question?.type || step?.kind || '';
}

function renderSectionIntro(question) {
  const session = state.session;
  const type = question.type;
  const meta = SECTION_PRESENTATIONS[type] || { title: typeLabel(type), countLabel: 'NUMBER OF QUESTIONS', timeLabel: 'TASK TIME', time: 'Timed', note: 'Complete each response before the timer expires.' };
  const orderedTypes = [...new Set(session.blueprint.map(blueprintType).filter(Boolean))];
  const sectionIndex = Math.max(0, orderedTypes.indexOf(type));
  const itemCount = session.blueprint.filter((step) => blueprintType(step) === type).length;
  const position = app.querySelector('#question-position');
  if (position) position.textContent = `Section ${sectionIndex + 1} of ${orderedTypes.length}`;
  app.querySelector('#question-type').textContent = 'Section overview';
  app.querySelector('#question-substage').textContent = '';
  app.querySelector('#question-instruction').textContent = 'Review the task format, then continue when you are ready.';
  app.querySelector('#test-progress-bar').style.width = `${(session.currentIndex / Math.max(1, session.blueprint.length)) * 100}%`;
  app.querySelector('#question-root').innerHTML = `
    <section class="section-intro-card fade-in">
      <div class="section-intro-body">
        <div class="section-progress-visual" aria-label="Section ${sectionIndex + 1} of ${orderedTypes.length}">
          <span>SECTION ${sectionIndex + 1}</span>
          <div>${orderedTypes.map((_, index) => `<i class="${index < sectionIndex ? 'complete' : index === sectionIndex ? 'current' : ''}"></i>`).join('')}</div>
        </div>
        <h1>${escapeHtml(meta.title)}</h1>
        <div class="section-facts">
          <div><small>${escapeHtml(meta.countLabel)}</small><strong>${itemCount}</strong></div>
          <div><small>${escapeHtml(meta.timeLabel)}</small><strong>${escapeHtml(meta.time)}</strong></div>
        </div>
        <p>${escapeHtml(meta.note)}</p>
      </div>
      <div class="section-intro-footer"><span>The introduction will continue automatically.</span><button id="section-continue" class="primary-button" type="button">CONTINUE</button></div>
    </section>`;

  let finished = false;
  const continueToQuestion = () => {
    if (finished) return;
    finished = true;
    timer.stop();
    renderCurrentQuestion({ skipIntro: true });
  };
  const timer = createSectionCountdown(12, continueToQuestion);
  app.querySelector('#section-continue').addEventListener('click', continueToQuestion);
  state.questionCleanup = () => timer.stop();
}

function createSectionCountdown(seconds, onEnd) {
  let remaining = seconds;
  updateTestTimer(remaining, seconds);
  const interval = setInterval(() => {
    remaining -= 1;
    updateTestTimer(Math.max(0, remaining), seconds);
    if (remaining <= 0) {
      clearInterval(interval);
      onEnd();
    }
  }, 1000);
  return { stop: () => clearInterval(interval) };
}

function renderCurrentQuestion({ skipIntro = false } = {}) {
  cleanupActiveQuestion();
  const session = state.session;
  if (!session || session.currentIndex >= session.blueprint.length) return finalizeSession();
  const step = session.blueprint[session.currentIndex];
  const question = materializeStep(step);
  if (!question) {
    session.currentIndex += 1;
    return renderCurrentQuestion();
  }
  session.introducedTypes ||= [];
  if (!skipIntro && !session.introducedTypes.includes(question.type)) {
    session.introducedTypes.push(question.type);
    renderSectionIntro(question);
    return;
  }
  const position = app.querySelector('#question-position');
  position.textContent = `Question ${session.currentIndex + 1} of ${session.blueprint.length}`;
  app.querySelector('#test-progress-bar').style.width = `${(session.currentIndex / session.blueprint.length) * 100}%`;
  app.querySelector('#question-substage').textContent = '';
  const startedAt = performance.now();
  state.questionCleanup = mountQuestion(app.querySelector('#question-root'), {
    question,
    settings: state.settings,
    mode: session.mode,
    setTimer: updateTestTimer,
    setMeta: (title, instruction) => {
      app.querySelector('#question-type').textContent = title;
      app.querySelector('#question-instruction').textContent = instruction;
    },
    setSubstage: (value) => { app.querySelector('#question-substage').textContent = value || ''; },
    onComplete: (answer) => {
      const record = {
        question,
        answer,
        timeUsedSec: Math.round((performance.now() - startedAt) / 100) / 10,
        answeredAt: new Date().toISOString()
      };
      session.responses.push(record);
      const scored = scoreObjectiveResponse(record);
      if (scored.length) session.ability = updateAbility(session.ability, scored);
      session.currentIndex += 1;
      try { saveSessionDraft(session); } catch {}
      app.querySelector('#autosave-status').textContent = 'Response saved';
      setTimeout(() => { const status = app.querySelector('#autosave-status'); if (status) status.textContent = 'Progress saved locally'; }, 900);
      renderCurrentQuestion();
    }
  });
}

function updateTestTimer(remaining, total) {
  const element = app.querySelector('#test-timer');
  if (!element) return;
  element.querySelector('strong').textContent = formatDuration(remaining);
  const ratio = total ? remaining / total : 1;
  element.classList.toggle('urgent', remaining <= 10 || ratio <= 0.12);
  element.style.setProperty('--time-ratio', `${Math.max(0, ratio) * 100}%`);
}

function cleanupActiveQuestion() {
  try { state.questionCleanup?.(); } catch {}
  state.questionCleanup = null;
}

function quitTest() {
  if (!confirm('Quit this simulation? The current attempt will not receive a score.')) return;
  const returnToPractice = Boolean(practiceTypeFromMode(state.session?.mode));
  cleanupActiveQuestion();
  clearSessionDraft();
  state.session = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (returnToPractice) renderPractice();
  else renderHome();
}

async function finalizeSession() {
  cleanupActiveQuestion();
  app.querySelector('#test-progress-bar').style.width = '100%';
  const session = state.session;
  renderScoring();
  const payload = buildScoringPayload(session);
  let grading;
  try {
    grading = await scoreTest({ ...payload, useAI: state.settings.useAI, model: state.settings.model });
  } catch (error) {
    try {
      grading = await scoreTest({ ...payload, useAI: false, model: '' });
      grading.notices = [...(grading.notices || []), `OpenRouter grading was unavailable: ${error.message}`];
    } catch {
      grading = { writing: { items: [], globalAdvice: [], source: 'unavailable' }, speaking: { items: [], globalAdvice: [], source: 'unavailable' }, notices: ['Scoring service failed.'] };
    }
  }
  const report = calculateFinalReport({ session, grading });
  if (session.practiceType) incrementPracticeProgress(session.practiceType);
  state.currentReport = report;
  saveAttempt(report);
  clearSessionDraft();
  state.session = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  renderResults(report);
}

function renderScoring() {
  const messages = ['Scoring objective accuracy…', 'Evaluating writing development and language control…', 'Reviewing speaking transcripts and fluency evidence…', 'Calculating individual and integrated subscores…', 'Building your 130+ improvement plan…'];
  app.innerHTML = `<div class="scoring-page"><div class="analysis-visual"><div class="analysis-ring"><span>${icon('shield')}</span><i></i><b></b></div><div class="analysis-pulse"></div></div><div><span class="eyebrow">TEST COMPLETE</span><h1>Analyzing your performance</h1><p id="scoring-message">${messages[0]}</p><div class="score-dots"><i></i><i></i><i></i><i></i><i></i></div><small>Open-response scores are practice estimates. Only the official test can issue a certified result.</small></div></div>`;
  let index = 0;
  const interval = setInterval(() => {
    const element = app.querySelector('#scoring-message');
    if (!element) return clearInterval(interval);
    index = (index + 1) % messages.length;
    element.textContent = messages[index];
  }, 2800);
}

function scoreTone(score, target) {
  if (!isScore(score)) return 'unassessed';
  if (score >= target) return 'success';
  if (score >= target - 10) return 'near';
  return 'developing';
}

function renderResults(report, activeTab = 'overview') {
  cleanupActiveQuestion();
  stopEquipment();
  const target = report.target || 130;
  const isPartial = Boolean(report.isPartial || !['full', 'quick'].includes(report.mode));
  const targetReached = !isPartial && report.overall >= target;
  const focusReached = isPartial && report.overall >= target;
  const practiceType = report.practiceType || practiceTypeFromMode(report.mode);
  const practiceProgress = practiceType ? Math.min(6, Number(loadPracticeProgress()[practiceType] || 0)) : 0;
  const homeLabel = practiceType ? 'PRACTICE SKILLS' : 'DASHBOARD';
  const newLabel = practiceType ? 'PRACTISE AGAIN' : 'NEW TEST';
  app.innerHTML = `
    <div class="results-shell">
      <header class="results-header"><div class="results-brand-row">${backButtonMarkup('result-back', `Return to ${homeLabel.toLowerCase()}`)}${logoMarkup(true)}</div><div class="result-actions"><button id="result-home" class="ghost-button">${icon(practiceType ? 'practice' : 'home')} ${homeLabel}</button><button id="result-print" class="ghost-button">${icon('print')} PRINT / PDF</button><button id="result-export" class="ghost-button">${icon('download')} EXPORT JSON</button><button id="result-new" class="primary-button">${newLabel} ${icon('arrow')}</button></div></header>
      <main class="results-page">
        <section class="result-hero ${targetReached ? 'target-reached' : ''}">
          <div class="result-score-ring" style="--score:${report.overall};--target:${target}"><div><span>${report.overall}</span><small>${isPartial ? 'ASSESSED-SKILL AVG' : 'ESTIMATED OVERALL'}</small></div><i></i></div>
          <div class="result-headline"><span class="eyebrow">${practiceType ? 'PRACTICE ROUND COMPLETE' : (isPartial ? 'FOCUS SESSION COMPLETE' : (targetReached ? 'TARGET ACHIEVED' : 'SIMULATION COMPLETE'))}</span><h1>${isPartial ? `Your assessed-skill average is ${report.overall}.` : (targetReached ? `You crossed your ${target}+ target.` : `You are ${Math.max(0, target - report.overall)} points from ${target}.`)}</h1><p>Your ${isPartial ? 'focus' : 'estimated'} range is <strong>${report.range?.[0]}–${report.range?.[1]}</strong>, aligned with <strong>${report.cefr}</strong> performance in the skills assessed here. ${isPartial ? 'This is not a four-skill overall estimate; complete a full or quick test for that.' : 'Use the skill breakdown—not the overall number alone—to plan your next session.'}</p><div class="result-meta"><span>${escapeHtml(modeTitle(report.mode))}</span><span>${formatDuration(report.elapsedSec)}</span>${practiceType ? `<span>CARD PROGRESS ${practiceProgress}/6</span>` : ''}<span>${escapeHtml((report.source || 'fallback').toUpperCase())} QUESTIONS</span>${report.model ? `<span>${escapeHtml(report.model)}</span>` : ''}${report.apiUsage?.cost > 0 ? `<span>API ≈ $${Number(report.apiUsage.cost).toFixed(4)}</span>` : ''}</div></div>
          <div class="target-status"><span>${isPartial ? 'FOCUS TARGET' : 'YOUR TARGET'}</span><strong>${target}</strong><div class="target-distance"><i style="width:${Math.min(100, report.overall / target * 100)}%"></i></div><small>${targetReached || focusReached ? `${report.overall - target} points above target` : `${target - report.overall} points remaining`}</small></div>
        </section>

        <nav class="result-tabs"><button data-result-tab="overview" class="${activeTab === 'overview' ? 'active' : ''}">Overview</button><button data-result-tab="review" class="${activeTab === 'review' ? 'active' : ''}">Question review</button><button data-result-tab="writing" class="${activeTab === 'writing' ? 'active' : ''}">Writing feedback</button><button data-result-tab="speaking" class="${activeTab === 'speaking' ? 'active' : ''}">Speaking feedback</button></nav>
        <div id="result-content">${renderResultTab(report, activeTab)}</div>
        <div class="score-disclaimer"><strong>Important:</strong> This is an independent practice estimate produced from simulator rules and optional AI grading. It is not a certified Duolingo English Test result and may differ from the official score.</div>
      </main>
    </div>`;
  app.querySelector('#result-back')?.addEventListener('click', () => practiceType ? renderPractice() : renderHome());
  app.querySelector('#result-home').addEventListener('click', () => practiceType ? renderPractice() : renderHome());
  app.querySelector('#result-new').addEventListener('click', () => practiceType ? beginPracticeSkill(practiceType) : showEquipment(report.mode || 'full'));
  app.querySelector('#result-print').addEventListener('click', () => window.print());
  app.querySelector('#result-export').addEventListener('click', () => downloadJson(`scoreforge-report-${report.overall}-${new Date(report.createdAt).toISOString().slice(0, 10)}.json`, report));
  app.querySelectorAll('[data-result-tab]').forEach((button) => button.addEventListener('click', () => renderResults(report, button.dataset.resultTab)));
}

function renderResultTab(report, tab) {
  if (tab === 'review') return renderQuestionReview(report);
  if (tab === 'writing') return renderWritingFeedback(report);
  if (tab === 'speaking') return renderSpeakingFeedback(report);
  return renderOverview(report);
}

function renderOverview(report) {
  const target = report.target || 130;
  const individualLabels = { reading: 'Reading', writing: 'Writing', listening: 'Listening', speaking: 'Speaking' };
  const integratedLabels = { literacy: 'Literacy', comprehension: 'Comprehension', conversation: 'Conversation', production: 'Production' };
  return `
    <section class="result-section"><div class="section-heading"><div><span class="section-label">Individual subscores</span><h2>Where your score is made</h2></div><p>Overall is the average of reading, writing, listening, and speaking, rounded to the nearest five in this simulator.</p></div>
      <div class="subscore-grid">${Object.entries(report.individual || {}).map(([skill, score]) => `<article class="subscore-card ${scoreTone(score, target)}"><div class="subscore-top"><span>${individualLabels[skill]}</span><strong>${isScore(score) ? score : '—'}</strong></div><div class="subscore-track"><i style="width:${isScore(score) ? score / 1.6 : 0}%"></i><b style="left:${target / 1.6}%"></b></div><small>${!isScore(score) ? 'Not assessed in this session' : (score >= target ? 'At target' : `${target - score} points to target`)}</small></article>`).join('')}</div>
    </section>
    <section class="result-two-column">
      <article class="result-panel"><div class="card-heading"><div><span class="section-label">Integrated subscores</span><h2>Combined language use</h2></div></div><div class="integrated-grid">${Object.entries(report.integrated || {}).map(([skill, score]) => `<div class="${isScore(score) ? '' : 'unassessed'}"><span>${integratedLabels[skill]}</span><strong>${isScore(score) ? score : '—'}</strong><small>${isScore(score) ? integratedDescription(skill) : 'Requires both component skills'}</small></div>`).join('')}</div></article>
      <article class="result-panel"><div class="card-heading"><div><span class="section-label">Objective accuracy</span><h2>Question-type performance</h2></div></div><div class="type-score-list">${Object.entries(report.typeScores || {}).sort((a, b) => a[1] - b[1]).map(([type, score]) => `<div><span>${escapeHtml(typeLabel(type))}</span><div><i style="width:${score}%"></i></div><strong>${score}%</strong></div>`).join('') || '<p>No objective items were included in this focus session.</p>'}</div></article>
    </section>
    <section class="result-section"><div class="section-heading"><div><span class="section-label">Your 130+ action plan</span><h2>Highest-impact next steps</h2></div><p>Priorities combine objective accuracy with AI or heuristic open-response feedback.</p></div><div class="recommendation-grid">${(report.recommendations || []).map((item, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><div><small>${escapeHtml(item.area)}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></div></article>`).join('')}</div></section>
    ${report.notices?.length ? `<section class="notice-panel"><h3>Scoring notes</h3>${report.notices.map((notice) => `<p>${escapeHtml(notice)}</p>`).join('')}</section>` : ''}`;
}

function integratedDescription(skill) {
  return { literacy: 'Reading + writing', comprehension: 'Reading + listening', conversation: 'Speaking + listening', production: 'Speaking + writing' }[skill] || '';
}

function answerSummary(record) {
  const q = record.question;
  if (q.type === 'read-select') return { yours: record.answer === true ? 'YES' : record.answer === false ? 'NO' : 'No answer', expected: q.isReal ? 'YES' : 'NO' };
  if (q.type === 'fill-blank') return { yours: `${q.prefix}${record.answer || ''}`, expected: q.answer };
  if (q.type === 'read-complete') return { yours: Array.isArray(record.answer) ? record.answer.map((part, index) => `${q.segments.filter((s) => s.answer)[index]?.prefix || ''}${part}`).join(', ') : '', expected: q.segments.filter((s) => s.answer).map((s) => s.answer).join(', ') };
  if (q.type === 'listen-type') return { yours: record.answer || 'No answer', expected: q.text };
  if (q.type === 'interactive-reading') return { yours: 'Six connected reading responses submitted', expected: 'See accuracy result below' };
  if (q.type === 'interactive-listening') return { yours: 'Scenario, conversation choices, and summary submitted', expected: 'See listening accuracy and writing feedback' };
  if (typeof record.answer === 'string') return { yours: record.answer || 'No response', expected: 'Open response evaluated by rubric' };
  return { yours: 'Response captured', expected: 'Open response evaluated by rubric' };
}

function renderQuestionReview(report) {
  const records = report.responses || [];
  if (!records.length) return '<div class="large-empty"><h2>Detailed responses are unavailable</h2><p>This older saved result contains only summary data.</p></div>';
  return `<section class="review-list">${records.map((record, index) => {
    const summary = answerSummary(record);
    const scores = scoreObjectiveResponse(record);
    const score = scores.length ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length * 100) : null;
    return `<article class="review-item"><div class="review-number">${index + 1}</div><div class="review-body"><div class="review-head"><span>${escapeHtml(typeLabel(record.question.type))}</span>${score !== null ? `<strong class="${score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low'}">${score}%</strong>` : '<strong>OPEN RESPONSE</strong>'}</div><div class="review-answer"><div><small>Your response</small><p>${escapeHtml(summary.yours).slice(0, 1600)}</p></div><div><small>Expected / basis</small><p>${escapeHtml(summary.expected).slice(0, 1600)}</p></div></div><small class="time-used">Completed in ${formatDuration(record.timeUsedSec || 0)}</small></div></article>`;
  }).join('')}</section>`;
}

function responseTextForEvaluation(report, id) {
  for (const record of report.responses || []) {
    const q = record.question;
    if (q.id === id && typeof record.answer === 'string') return record.answer;
    if (`${q.id}:initial` === id) return record.answer?.initial || '';
    if (`${q.id}:followup` === id) return record.answer?.followup || '';
    if (`${q.id}:summary` === id) return record.answer?.summary || '';
  }
  return '';
}

function renderWritingFeedback(report) {
  const evaluation = report.grading?.writing;
  if (!evaluation?.items?.length) return '<div class="large-empty"><h2>No writing responses in this session</h2><p>Run the full simulation or Writing & Speaking Lab for detailed feedback.</p></div>';
  return `<section class="feedback-list"><div class="feedback-intro"><span>${evaluation.source === 'openrouter' ? 'AI RUBRIC' : 'LOCAL HEURISTIC'}</span><p>Scores are on a 0–100 internal rubric and feed the estimated 10–160 writing subscore.</p></div>${evaluation.items.map((item) => `<article class="feedback-card"><div class="feedback-score"><strong>${item.overall}</strong><span>OVERALL</span></div><div class="feedback-main"><div class="feedback-title"><h3>${escapeHtml(typeLabel(String(item.id).includes('summary') ? 'interactive-listening' : String(item.id).includes('initial') || String(item.id).includes('followup') ? 'interactive-writing' : ((report.responses || []).find((r) => r.question.id === item.id)?.question.type || 'writing-sample')))}</h3><span>${item.wordCount || 0} words</span></div><div class="dimension-grid">${[['Content', item.content], ['Coherence', item.coherence], ['Vocabulary', item.vocabulary], ['Grammar', item.grammar], ['Mechanics', item.mechanics]].map(([label, score]) => `<div><span>${label}</span><strong>${score}</strong><i><b style="width:${score}%"></b></i></div>`).join('')}</div><details class="response-details"><summary>Review response</summary><p>${escapeHtml(responseTextForEvaluation(report, item.id) || 'Response text unavailable.')}</p></details><div class="feedback-columns"><div><h4>What worked</h4>${(item.strengths || []).map((text) => `<p class="positive">${icon('check')}${escapeHtml(text)}</p>`).join('')}</div><div><h4>Improve next</h4>${(item.improvements || []).map((text) => `<p class="improve">→ ${escapeHtml(text)}</p>`).join('')}</div></div>${item.corrections?.length ? `<div class="corrections"><h4>Language corrections</h4>${item.corrections.map((correction) => `<div><del>${escapeHtml(correction.original)}</del><ins>${escapeHtml(correction.improved)}</ins><small>${escapeHtml(correction.reason)}</small></div>`).join('')}</div>` : ''}<div class="model-opening"><span>Possible stronger opening</span><p>${escapeHtml(item.modelOpening || '')}</p></div></div></article>`).join('')}</section>`;
}

function speakingResponseForEvaluation(report, id) {
  for (const record of report.responses || []) {
    if (record.question.id === id) return record.answer;
    if (record.question.type === 'interactive-speaking' && id.startsWith(`${record.question.id}:`)) {
      const index = Number(id.split(':').pop()) - 1;
      return record.answer?.responses?.[index];
    }
  }
  return null;
}

function renderSpeakingFeedback(report) {
  const evaluation = report.grading?.speaking;
  if (!evaluation?.items?.length) return '<div class="large-empty"><h2>No speaking responses in this session</h2><p>Run the full simulation or Writing & Speaking Lab for detailed feedback.</p></div>';
  return `<section class="feedback-list"><div class="feedback-intro"><span>${evaluation.source === 'openrouter' ? 'AI TRANSCRIPT RUBRIC' : 'LOCAL HEURISTIC'}</span><p>${escapeHtml(evaluation.audioLimitation || 'Pronunciation is estimated from transcript and timing evidence.')}</p></div>${evaluation.items.map((item) => {
    const response = speakingResponseForEvaluation(report, item.id) || {};
    return `<article class="feedback-card speaking"><div class="feedback-score"><strong>${item.overall}</strong><span>OVERALL</span></div><div class="feedback-main"><div class="feedback-title"><h3>${escapeHtml(typeLabel(String(item.id).includes(':') ? 'interactive-speaking' : ((report.responses || []).find((r) => r.question.id === item.id)?.question.type || 'speaking-sample')))}</h3><span>${Math.round(response.wordsPerMinute || 0)} WPM · ${response.wordCount || 0} words</span></div><div class="dimension-grid six">${[['Content', item.content], ['Coherence', item.coherence], ['Vocabulary', item.vocabulary], ['Grammar', item.grammar], ['Fluency', item.fluency], ['Intelligibility*', item.intelligibilityEstimate]].map(([label, score]) => `<div><span>${label}</span><strong>${score}</strong><i><b style="width:${score}%"></b></i></div>`).join('')}</div><details class="response-details"><summary>View transcript</summary><p>${escapeHtml(response.transcript || 'No transcript was captured.')}</p></details><div class="feedback-columns"><div><h4>What worked</h4>${(item.strengths || []).map((text) => `<p class="positive">${icon('check')}${escapeHtml(text)}</p>`).join('')}</div><div><h4>Improve next</h4>${(item.improvements || []).map((text) => `<p class="improve">→ ${escapeHtml(text)}</p>`).join('')}</div></div><div class="speaking-notes"><div><span>Filler control</span><p>${escapeHtml(item.fillerFeedback || '')}</p></div><div><span>Stronger structure</span><p>${escapeHtml(item.betterStructure || '')}</p></div></div></div></article>`;
  }).join('')}</section>`;
}

async function boot() {
  applyTheme();
  try { state.health = await getHealth(); } catch { state.health = { aiConfigured: false, model: '', sttModel: '', ttsModel: '', ttsVoice: '' }; }
  renderHome();
}

boot();
