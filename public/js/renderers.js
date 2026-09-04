import { getWritingFollowup, getSpeakingFollowup, transcribeAudio } from './api.js';
import { AudioRecorderSession, blobToBase64, cancelSpeech, speakText, recordingSupported } from './audio.js';
import { formatDuration, typeLabel, wordsOf } from './scoring.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function paragraphHtml(text) {
  return escapeHtml(text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
}

function createCountdown(durationSec, { onTick, onEnd } = {}) {
  const startedAt = performance.now();
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const elapsed = (performance.now() - startedAt) / 1000;
    const remaining = Math.max(0, durationSec - elapsed);
    onTick?.(remaining, elapsed);
    if (remaining <= 0.04) {
      stopped = true;
      clearInterval(interval);
      onEnd?.();
    }
  };
  const interval = setInterval(tick, 100);
  tick();
  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
    remaining() {
      return Math.max(0, durationSec - (performance.now() - startedAt) / 1000);
    }
  };
}

function wordCount(value) {
  return wordsOf(value).length;
}

function bindWordCounter(textarea, counter) {
  const update = () => {
    counter.textContent = `${wordCount(textarea.value)} words`;
  };
  textarea.addEventListener('input', update);
  update();
  return () => textarea.removeEventListener('input', update);
}

function optionButtons(options, selected, name = 'option') {
  return options.map((option, index) => `
    <button type="button" class="choice-button ${Number(selected) === index ? 'selected' : ''}" data-${name}="${index}">
      <span class="choice-marker">${String.fromCharCode(65 + index)}</span>
      <span>${escapeHtml(option)}</span>
    </button>`).join('');
}

function statusBadge(text, kind = 'neutral') {
  return `<span class="status-badge ${kind}">${escapeHtml(text)}</span>`;
}

function metricFromBrowserTranscript(transcript, durationSec) {
  const words = wordsOf(transcript);
  const fillers = String(transcript || '').match(/\b(um+|uh+|erm+|hmm+|you know|like|basically|actually)\b/gi) || [];
  return {
    transcript: String(transcript || '').trim(),
    durationSec: Math.round(Number(durationSec || 0) * 10) / 10,
    wordCount: words.length,
    wordsPerMinute: durationSec > 0 ? Math.round((words.length / durationSec) * 600) / 10 : 0,
    fillerCount: fillers.length,
    longPauseCount: 0,
    transcriptionSource: transcript ? 'browser' : 'none'
  };
}

async function transcribeRecording(recording, settings, onStatus) {
  const browserMetrics = metricFromBrowserTranscript(recording.browserTranscript, recording.durationSec);
  if (!recording.blob?.size) return { ...browserMetrics, transcriptionFailed: true };
  try {
    onStatus?.('Transcribing your response…');
    const base64 = await blobToBase64(recording.blob);
    const result = await transcribeAudio({ base64, format: recording.format, durationSec: recording.durationSec });
    return {
      ...browserMetrics,
      ...result,
      transcript: String(result.transcript || result.text || browserMetrics.transcript || '').trim(),
      transcriptionSource: 'openrouter',
      audioBytes: recording.blob.size
    };
  } catch (error) {
    onStatus?.(browserMetrics.transcript ? 'OpenRouter transcription was unavailable; browser transcription was retained.' : 'Transcription was unavailable. The recording duration will still be scored conservatively.');
    return {
      ...browserMetrics,
      transcriptionFailed: true,
      transcriptionError: error.message,
      audioBytes: recording.blob.size
    };
  }
}

function mountReadSelect(root, context) {
  const { question, onComplete, setTimer } = context;
  root.innerHTML = `
    <section class="question-card narrow-card fade-in">
      <div class="question-kicker">Is this a real English word?</div>
      <div class="word-display">${escapeHtml(question.word)}</div>
      <div class="binary-actions">
        <button class="answer-button no" type="button" data-answer="false"><span>×</span> NO</button>
        <button class="answer-button yes" type="button" data-answer="true"><span>✓</span> YES</button>
      </div>
      <p class="keyboard-hint">Choose an answer before the five-second timer ends.</p>
    </section>`;
  let done = false;
  const finish = (answer) => {
    if (done) return;
    done = true;
    timer.stop();
    onComplete(answer);
  };
  const timer = createCountdown(5, { onTick: (remaining) => setTimer(remaining, 5), onEnd: () => finish(null) });
  root.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => finish(button.dataset.answer === 'true')));
  const keyHandler = (event) => {
    if (event.key.toLowerCase() === 'y') finish(true);
    if (event.key.toLowerCase() === 'n') finish(false);
  };
  window.addEventListener('keydown', keyHandler);
  return () => { timer.stop(); window.removeEventListener('keydown', keyHandler); };
}

function characterBoxesMarkup(prefix, missingLength, groupId, compact = false) {
  const fixed = [...String(prefix || '')]
    .map((letter) => `<span class="character-box fixed" aria-hidden="true">${escapeHtml(letter)}</span>`)
    .join('');
  const editable = Array.from({ length: Math.max(1, missingLength) }, (_, index) => `
    <input class="character-box editable" data-character-index="${index}" maxlength="1" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Missing character ${index + 1}">`).join('');
  return `<span class="character-box-group ${compact ? 'compact' : ''}" data-character-group="${escapeHtml(groupId)}">${fixed}${editable}</span>`;
}

function bindCharacterBoxes(group, { onChange } = {}) {
  const inputs = [...group.querySelectorAll('[data-character-index]')];
  const normalizeLetters = (value) => String(value || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  const value = () => inputs.map((input) => input.value).join('');
  const update = () => onChange?.(value(), inputs.every((input) => input.value.length === 1));
  const distribute = (startIndex, text) => {
    const letters = [...normalizeLetters(text)];
    if (!letters.length) return;
    let cursor = startIndex;
    for (const letter of letters) {
      if (!inputs[cursor]) break;
      inputs[cursor].value = letter;
      cursor += 1;
    }
    (inputs[Math.min(cursor, inputs.length - 1)] || inputs.at(-1))?.focus();
    update();
  };

  inputs.forEach((input, index) => {
    input.addEventListener('input', (event) => {
      const letters = normalizeLetters(event.target.value);
      event.target.value = letters.slice(-1);
      if (letters.length > 1) distribute(index, letters);
      else if (event.target.value && inputs[index + 1]) inputs[index + 1].focus();
      update();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && inputs[index - 1]) {
        event.preventDefault();
        inputs[index - 1].value = '';
        inputs[index - 1].focus();
        update();
      }
      if (event.key === 'ArrowLeft' && inputs[index - 1]) {
        event.preventDefault();
        inputs[index - 1].focus();
      }
      if (event.key === 'ArrowRight' && inputs[index + 1]) {
        event.preventDefault();
        inputs[index + 1].focus();
      }
    });
    input.addEventListener('paste', (event) => {
      event.preventDefault();
      distribute(index, event.clipboardData?.getData('text') || '');
    });
    input.addEventListener('focus', () => input.select());
  });

  return {
    value,
    complete: () => inputs.every((input) => input.value.length === 1),
    focus: () => inputs[0]?.focus()
  };
}

function mountFillBlank(root, context) {
  const { question, onComplete, setTimer } = context;
  const missingLength = Math.max(1, question.answer.length - question.prefix.length);
  root.innerHTML = `
    <section class="question-card medium-card character-question fade-in">
      <div class="question-kicker">Complete the sentence with the correct word</div>
      <div class="sentence-completion character-sentence">
        <span>${escapeHtml(question.sentenceBefore)}</span>
        ${characterBoxesMarkup(question.prefix, missingLength, 'single-blank')}
        <span>${escapeHtml(question.sentenceAfter)}</span>
      </div>
      <div class="card-footer"><span class="keyboard-hint">Type one letter in each blue-outlined box.</span><button id="continue" class="primary-button" type="button" disabled>SUBMIT</button></div>
    </section>`;
  const button = root.querySelector('#continue');
  const boxes = bindCharacterBoxes(root.querySelector('[data-character-group="single-blank"]'), {
    onChange: (_value, complete) => { button.disabled = !complete; }
  });
  boxes.focus();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timer.stop();
    onComplete(boxes.value());
  };
  const timer = createCountdown(20, { onTick: (remaining) => setTimer(remaining, 20), onEnd: finish });
  button.addEventListener('click', finish);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && boxes.complete()) finish();
  });
  return () => timer.stop();
}

function mountReadComplete(root, context) {
  const { question, onComplete, setTimer } = context;
  let blankIndex = 0;
  const passage = question.segments.map((segment) => {
    if (segment.text !== undefined) return escapeHtml(segment.text);
    const index = blankIndex++;
    const missingLength = Math.max(1, segment.answer.length - segment.prefix.length);
    return characterBoxesMarkup(segment.prefix, missingLength, `passage-${index}`, true);
  }).join('');
  root.innerHTML = `
    <section class="question-card wide-card read-complete-card fade-in">
      <div class="question-kicker">Complete the text with the correct words</div>
      <h2 class="passage-title">${escapeHtml(question.title)}</h2>
      <div class="reading-passage completion-passage character-passage">${passage}</div>
      <div class="card-footer"><span id="completion-progress" class="keyboard-hint">0 of ${blankIndex} words completed</span><button id="continue" class="primary-button" type="button" disabled>SUBMIT</button></div>
    </section>`;
  const controllers = [...root.querySelectorAll('[data-character-group]')].map((group) => bindCharacterBoxes(group, { onChange: update }));
  const button = root.querySelector('#continue');
  function update() {
    const completed = controllers.filter((controller) => controller.complete()).length;
    root.querySelector('#completion-progress').textContent = `${completed} of ${controllers.length} words completed`;
    button.disabled = completed !== controllers.length;
  }
  controllers[0]?.focus();
  update();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timer.stop();
    onComplete(controllers.map((controller) => controller.value()));
  };
  const timer = createCountdown(180, { onTick: (remaining) => setTimer(remaining, 180), onEnd: finish });
  button.addEventListener('click', finish);
  return () => timer.stop();
}

function mountListenType(root, context) {
  const { question, onComplete, setTimer, settings } = context;
  root.innerHTML = `
    <section class="question-card medium-card listen-type-card fade-in">
      <div class="question-kicker">Type what you hear</div>
      <div class="listening-stage listening-stage-clean">
        <button id="play-audio" class="audio-button transcript-audio-button" type="button" aria-label="Play sentence">
          <span class="audio-speaker-svg" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M7 19h9l11-9v28L16 29H7z" fill="currentColor"/><path d="M33 17c3.7 3.7 3.7 10.3 0 14M38 12c6.5 6.5 6.5 17.5 0 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></span>
        </button>
        <div id="listen-wave" class="audio-wave-track" aria-hidden="true">${'<i></i>'.repeat(28)}</div>
        <span id="plays-left" class="replay-counter">REPLAYS LEFT: 2</span>
        <span id="audio-status" class="audio-status-text">The sentence will play automatically.</span>
      </div>
      <textarea id="listen-answer" class="response-area short listen-response" placeholder="Your response" spellcheck="false" aria-label="Type the sentence you hear"></textarea>
      <div class="card-footer"><span class="keyboard-hint">The first play is automatic. You may replay it two more times.</span><button id="continue" class="primary-button" type="button" disabled>SUBMIT</button></div>
    </section>`;
  let plays = 0;
  let speaking = false;
  const playButton = root.querySelector('#play-audio');
  const status = root.querySelector('#audio-status');
  const replayCounter = root.querySelector('#plays-left');
  const textarea = root.querySelector('#listen-answer');
  const submit = root.querySelector('#continue');
  const play = async () => {
    if (plays >= 3 || speaking) return;
    plays += 1;
    speaking = true;
    playButton.disabled = true;
    playButton.classList.add('playing');
    root.querySelector('#listen-wave').classList.add('playing');
    replayCounter.textContent = `REPLAYS LEFT: ${Math.max(0, 3 - plays)}`;
    status.textContent = statefulVoiceStatus(settings.voiceMode);
    try {
      await speakText(question.text, { accent: settings.voiceAccent, rate: settings.voiceRate, mode: settings.voiceMode || 'auto' });
      status.textContent = plays < 3 ? 'Press the speaker to replay.' : 'No replays remaining.';
    } catch (error) {
      status.textContent = error.message || 'Audio playback was unavailable.';
    }
    speaking = false;
    playButton.classList.remove('playing');
    root.querySelector('#listen-wave').classList.remove('playing');
    playButton.disabled = plays >= 3;
    textarea.focus();
  };
  playButton.addEventListener('click', play);
  textarea.addEventListener('input', () => { submit.disabled = !textarea.value.trim(); });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timer.stop();
    cancelSpeech();
    onComplete(textarea.value);
  };
  const timer = createCountdown(60, { onTick: (remaining) => setTimer(remaining, 60), onEnd: finish });
  submit.addEventListener('click', finish);
  setTimeout(() => play().catch(() => {}), 450);
  return () => { timer.stop(); cancelSpeech(); };
}

function statefulVoiceStatus(mode) {
  if (mode === 'browser') return 'Playing with the best available browser voice…';
  if (mode === 'openrouter') return 'Loading the natural AI voice…';
  return 'Loading the clearest available voice…';
}

function mountInteractiveReading(root, context) {
  const { question, onComplete, setTimer, setSubstage } = context;
  const state = { completeSentences: {}, completePassage: null, highlight: {}, identifyIdea: null, titleQuestion: null };
  const phases = [
    { type: 'complete-sentences' },
    { type: 'complete-passage' },
    ...question.highlight.map((item, index) => ({ type: 'highlight', item, index })),
    { type: 'identify-idea' },
    { type: 'title-passage' }
  ];
  let phaseIndex = 0;
  let done = false;
  const timer = createCountdown(question.durationSec, {
    onTick: (remaining) => setTimer(remaining, question.durationSec),
    onEnd: () => finish()
  });
  const finish = () => {
    if (done) return;
    done = true;
    timer.stop();
    onComplete(state);
  };
  const next = () => {
    if (phaseIndex >= phases.length - 1) return finish();
    phaseIndex += 1;
    renderPhase();
  };

  function passageBlock() {
    return `<div class="reading-passage"><p>${paragraphHtml(question.passage)}</p></div>`;
  }

  function renderPhase() {
    const phase = phases[phaseIndex];
    setSubstage(`${phaseIndex + 1} of ${phases.length}`);
    if (phase.type === 'complete-sentences') {
      root.innerHTML = `
        <section class="question-card wide-card fade-in">
          <div class="question-kicker">Select the best option for each missing word.</div>
          <h2 class="passage-title">${escapeHtml(question.title)}</h2>
          <div class="sentence-list">
            ${question.completeSentences.map((item, index) => `
              <label class="sentence-row"><span class="sentence-number">${index + 1}</span><span>${escapeHtml(item.before)}</span>
                <select data-cs="${escapeHtml(item.id)}" aria-label="Select missing word ${index + 1}">
                  <option value="">Select…</option>${item.options.map((option) => `<option value="${escapeHtml(option)}" ${state.completeSentences[item.id] === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
                </select><span>${escapeHtml(item.after)}</span>
              </label>`).join('')}
          </div>
          <div class="card-footer"><span class="keyboard-hint">Complete all five sentences before moving on.</span><button id="ir-next" class="primary-button" type="button">NEXT</button></div>
        </section>`;
      const selects = [...root.querySelectorAll('[data-cs]')];
      selects.forEach((select) => select.addEventListener('change', () => { state.completeSentences[select.dataset.cs] = select.value; }));
      root.querySelector('#ir-next').addEventListener('click', () => {
        selects.forEach((select) => { state.completeSentences[select.dataset.cs] = select.value; });
        next();
      });
      return;
    }
    if (phase.type === 'complete-passage') {
      root.innerHTML = `
        <section class="question-card wide-card fade-in">
          <div class="question-kicker">Select the best sentence to fill in the blank.</div>
          <h2 class="passage-title">${escapeHtml(question.title)}</h2>
          <div class="passage-gap"><p>${escapeHtml(question.completePassage.before)}</p><div class="missing-sentence">Select the missing sentence</div><p>${escapeHtml(question.completePassage.after)}</p></div>
          <div class="choice-list">${optionButtons(question.completePassage.options, state.completePassage, 'cp')}</div>
          <div class="card-footer"><span></span><button id="ir-next" class="primary-button" type="button">NEXT</button></div>
        </section>`;
      root.querySelectorAll('[data-cp]').forEach((button) => button.addEventListener('click', () => {
        state.completePassage = Number(button.dataset.cp);
        root.querySelectorAll('[data-cp]').forEach((item) => item.classList.toggle('selected', item === button));
      }));
      root.querySelector('#ir-next').addEventListener('click', next);
      return;
    }
    if (phase.type === 'highlight') {
      root.innerHTML = `
        <section class="question-card wide-card fade-in">
          <div class="question-kicker">Click and drag to highlight the answer in the passage.</div>
          <div class="highlight-question">${escapeHtml(phase.item.question)}</div>
          <div id="selectable-passage" class="reading-passage selectable"><p>${paragraphHtml(question.passage)}</p></div>
          <div class="selection-box"><span>Your selected answer</span><p id="selected-text">${escapeHtml(state.highlight[phase.item.id] || 'No text selected yet.')}</p></div>
          <div class="card-footer"><span class="keyboard-hint">Select only the words needed to answer the question.</span><button id="ir-next" class="primary-button" type="button">NEXT</button></div>
        </section>`;
      const passage = root.querySelector('#selectable-passage');
      const capture = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
        if (!passage.contains(container)) return;
        const selected = selection.toString().replace(/\s+/g, ' ').trim();
        if (selected) {
          state.highlight[phase.item.id] = selected.slice(0, 500);
          root.querySelector('#selected-text').textContent = selected;
        }
      };
      passage.addEventListener('mouseup', capture);
      passage.addEventListener('keyup', capture);
      root.querySelector('#ir-next').addEventListener('click', next);
      return;
    }
    const data = phase.type === 'identify-idea' ? question.identifyIdea : question.titleQuestion;
    const title = phase.type === 'identify-idea' ? 'Select the idea that is expressed in the passage.' : 'Select the best title for the passage.';
    const current = phase.type === 'identify-idea' ? state.identifyIdea : state.titleQuestion;
    root.innerHTML = `
      <section class="question-card wide-card fade-in">
        <div class="question-kicker">${title}</div>
        ${passageBlock()}
        <div class="choice-list">${optionButtons(data.options, current, 'final-choice')}</div>
        <div class="card-footer"><span></span><button id="ir-next" class="primary-button" type="button">${phaseIndex === phases.length - 1 ? 'CONTINUE' : 'NEXT'}</button></div>
      </section>`;
    root.querySelectorAll('[data-final-choice]').forEach((button) => button.addEventListener('click', () => {
      const value = Number(button.dataset.finalChoice);
      if (phase.type === 'identify-idea') state.identifyIdea = value;
      else state.titleQuestion = value;
      root.querySelectorAll('[data-final-choice]').forEach((item) => item.classList.toggle('selected', item === button));
    }));
    root.querySelector('#ir-next').addEventListener('click', next);
  }

  renderPhase();
  return () => timer.stop();
}

function mountInteractiveListening(root, context) {
  const { question, onComplete, setTimer, setSubstage, settings } = context;
  const answer = { blanks: {}, turns: {}, summary: '' };
  let phase = 'complete';
  let turnIndex = 0;
  let combinedTimer;
  let summaryTimer;
  let questionPlayed = false;
  let done = false;
  const conversation = [];

  const finish = () => {
    if (done) return;
    done = true;
    combinedTimer?.stop();
    summaryTimer?.stop();
    cancelSpeech();
    onComplete(answer);
  };

  const startSummary = () => {
    combinedTimer?.stop();
    cancelSpeech();
    phase = 'summary';
    setSubstage('Conversation summary');
    render();
    summaryTimer = createCountdown(question.summaryDurationSec, {
      onTick: (remaining) => setTimer(remaining, question.summaryDurationSec),
      onEnd: finish
    });
  };

  combinedTimer = createCountdown(question.durationSec, {
    onTick: (remaining) => { if (phase !== 'summary') setTimer(remaining, question.durationSec); },
    onEnd: startSummary
  });

  async function playScenario(button) {
    if (button) button.classList.add('playing');
    try { await speakText(question.scenario.text, { accent: settings.voiceAccent, rate: settings.voiceRate, mode: settings.voiceMode || 'auto' }); } catch {}
    if (button) button.classList.remove('playing');
  }

  async function playTurn(button) {
    if (questionPlayed) return;
    questionPlayed = true;
    button.disabled = true;
    button.classList.add('playing');
    try { await speakText(question.turns[turnIndex].audioText, { accent: settings.voiceAccent, rate: settings.voiceRate, mode: settings.voiceMode || 'auto' }); } catch {}
    button.classList.remove('playing');
  }

  function renderConversation() {
    if (!conversation.length) return '<div class="empty-conversation">The conversation will appear here as it develops.</div>';
    return conversation.map((entry) => `<div class="conversation-line ${entry.role}"><strong>${escapeHtml(entry.speaker)}</strong><span>${escapeHtml(entry.text)}</span></div>`).join('');
  }

  function render() {
    if (phase === 'complete') {
      setSubstage('Listen and Complete');
      root.innerHTML = `
        <section class="question-card wide-card fade-in">
          <div class="question-kicker">Listen to the scenario and complete the information.</div>
          <div class="scenario-player"><div class="scenario-avatar">S</div><div><strong>Scenario audio</strong><p>You may replay this scenario while the section timer continues.</p></div><button id="scenario-play" class="audio-button compact" type="button"><span class="audio-icon">▶</span> PLAY</button></div>
          <div class="sentence-list listening-blanks">
            ${question.scenario.blanks.map((item, index) => `<label class="sentence-row"><span class="sentence-number">${index + 1}</span><span>${escapeHtml(item.before)}</span><input data-listen-blank="${escapeHtml(item.id)}" value="${escapeHtml(answer.blanks[item.id] || '')}" autocomplete="off" spellcheck="false"><span>${escapeHtml(item.after)}</span></label>`).join('')}
          </div>
          <div class="card-footer"><span class="keyboard-hint">Short paraphrases are acceptable.</span><button id="il-next" class="primary-button" type="button">CONTINUE</button></div>
        </section>`;
      root.querySelector('#scenario-play').addEventListener('click', (event) => playScenario(event.currentTarget));
      root.querySelector('#il-next').addEventListener('click', () => {
        root.querySelectorAll('[data-listen-blank]').forEach((input) => { answer.blanks[input.dataset.listenBlank] = input.value; });
        phase = 'turn';
        render();
      });
      setTimeout(() => playScenario(root.querySelector('#scenario-play')).catch(() => {}), 300);
      return;
    }

    if (phase === 'turn') {
      const turn = question.turns[turnIndex];
      setSubstage(`Listen and Respond ${turnIndex + 1} of ${question.turns.length}`);
      questionPlayed = false;
      root.innerHTML = `
        <section class="question-card extra-wide-card fade-in">
          <div class="question-kicker">Participate in the conversation. You can hear the current question once.</div>
          <div class="interactive-listening-layout">
            <div class="conversation-panel"><h3>Conversation</h3><div class="conversation-scroll">${renderConversation()}</div></div>
            <div class="respond-panel">
              <div class="speaker-card"><div class="scenario-avatar">${escapeHtml(turn.speaker.charAt(0))}</div><div><strong>${escapeHtml(turn.speaker)}</strong><p>Listen to the next message.</p></div><button id="turn-play" class="audio-button compact" type="button"><span class="audio-icon">▶</span> PLAY ONCE</button></div>
              <div class="choice-list" id="turn-options">${optionButtons(turn.options, null, 'turn-option')}</div>
              <div id="turn-feedback" class="inline-feedback" aria-live="polite"></div>
            </div>
          </div>
        </section>`;
      const playButton = root.querySelector('#turn-play');
      playButton.addEventListener('click', () => playTurn(playButton));
      root.querySelectorAll('[data-turn-option]').forEach((button) => button.addEventListener('click', () => {
        const selected = Number(button.dataset.turnOption);
        answer.turns[turn.id] = selected;
        root.querySelectorAll('[data-turn-option]').forEach((item) => { item.disabled = true; });
        const correct = selected === turn.answerIndex;
        button.classList.add(correct ? 'correct' : 'incorrect');
        const correctButton = root.querySelector(`[data-turn-option="${turn.answerIndex}"]`);
        correctButton?.classList.add('correct');
        root.querySelector('#turn-feedback').innerHTML = correct ? `${statusBadge('Correct', 'success')}` : `${statusBadge('Best response shown', 'warning')}`;
        conversation.push({ role: 'other', speaker: turn.speaker, text: turn.audioText });
        conversation.push({ role: 'learner', speaker: 'You', text: turn.correctResponse });
        setTimeout(() => {
          turnIndex += 1;
          if (turnIndex >= question.turns.length) startSummary();
          else render();
        }, 950);
      }));
      setTimeout(() => playTurn(playButton).catch(() => {}), 350);
      return;
    }

    root.innerHTML = `
      <section class="question-card wide-card fade-in">
        <div class="question-kicker">Write a summary of the conversation you just had.</div>
        <div class="summary-guide"><span>Include:</span><strong>who was speaking</strong><strong>the main issue</strong><strong>the outcome</strong></div>
        <textarea id="conversation-summary" class="response-area tall" placeholder="Write one complete paragraph…" spellcheck="true">${escapeHtml(answer.summary)}</textarea>
        <div class="card-footer"><span id="summary-count" class="word-counter">0 words</span><button id="summary-continue" class="primary-button" type="button">CONTINUE</button></div>
      </section>`;
    const textarea = root.querySelector('#conversation-summary');
    bindWordCounter(textarea, root.querySelector('#summary-count'));
    textarea.focus();
    textarea.addEventListener('input', () => { answer.summary = textarea.value; });
    root.querySelector('#summary-continue').addEventListener('click', () => { answer.summary = textarea.value; finish(); });
  }

  render();
  return () => { combinedTimer?.stop(); summaryTimer?.stop(); cancelSpeech(); };
}

function photoFigure(image, className = '') {
  const safeImage = image || {};
  const classNames = ['test-photo', className].filter(Boolean).join(' ');
  const credit = safeImage.credit ? `<figcaption>${escapeHtml(safeImage.credit)}</figcaption>` : '';
  return `<figure class="${classNames}"><img src="${escapeHtml(safeImage.url || '')}" alt="${escapeHtml(safeImage.alt || 'Photograph to describe')}" loading="eager" decoding="async">${credit}</figure>`;
}

function mountWritePhoto(root, context) {
  const { question, onComplete, setTimer } = context;
  root.innerHTML = `
    <section class="question-card extra-wide-card photo-question fade-in">
      <div class="question-kicker">Write a description of the image below for one minute.</div>
      <div class="photo-writing-layout">
        ${photoFigure(question.image)}
        <div class="writing-panel"><textarea id="photo-response" class="response-area photo-area" placeholder="Describe the setting, people or objects, actions, spatial details, and overall atmosphere…" spellcheck="true"></textarea><div class="writing-tips"><span>Overview</span><span>Actions</span><span>Position</span><span>Inference</span><span>Atmosphere</span></div></div>
      </div>
      <div class="card-footer"><span id="photo-count" class="word-counter">0 words</span><button id="continue" class="primary-button" type="button">CONTINUE</button></div>
    </section>`;
  const textarea = root.querySelector('#photo-response');
  bindWordCounter(textarea, root.querySelector('#photo-count'));
  textarea.focus();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timer.stop();
    onComplete(textarea.value);
  };
  const timer = createCountdown(60, { onTick: (remaining) => setTimer(remaining, 60), onEnd: finish });
  root.querySelector('#continue').addEventListener('click', finish);
  return () => timer.stop();
}

function mountInteractiveWriting(root, context) {
  const { question, onComplete, setTimer, setSubstage, settings } = context;
  let prepTimer;
  let writingTimer;
  let stage = 'prep';
  let initial = '';
  let followup = '';
  let followupPrompt = question.followup;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    prepTimer?.stop();
    writingTimer?.stop();
    onComplete({ initial, followup, followupPrompt });
  };

  async function moveToFollowup() {
    writingTimer?.stop();
    const textarea = root.querySelector('#writing-response');
    if (textarea) initial = textarea.value;
    stage = 'loading';
    setSubstage('Preparing follow-up');
    setTimer(0, 1);
    render();
    try {
      const result = await getWritingFollowup({
        originalPrompt: question.prompt,
        response: initial,
        fallback: question.followup,
        useAI: settings.useAI,
        model: settings.model
      });
      followupPrompt = result.followup || question.followup;
    } catch {
      followupPrompt = question.followup;
    }
    stage = 'followup';
    render();
    writingTimer = createCountdown(180, { onTick: (remaining) => setTimer(remaining, 180), onEnd: finish });
  }

  function startInitial() {
    prepTimer?.stop();
    stage = 'initial';
    setSubstage('Step 1 of 2');
    render();
    writingTimer = createCountdown(300, { onTick: (remaining) => setTimer(remaining, 300), onEnd: moveToFollowup });
  }

  function render() {
    if (stage === 'prep') {
      setSubstage('30-second preparation');
      root.innerHTML = `
        <section class="question-card wide-card prep-card fade-in">
          <div class="prep-icon">✦</div><div class="question-kicker">Read the prompt and prepare your response.</div>
          <blockquote class="prompt-block">${escapeHtml(question.prompt)}</blockquote>
          <div class="prep-note">Plan a direct answer, two reasons, one specific example, and a conclusion.</div>
          <button id="start-writing" class="primary-button large" type="button">START WRITING NOW</button>
        </section>`;
      root.querySelector('#start-writing').addEventListener('click', startInitial);
      return;
    }
    if (stage === 'loading') {
      root.innerHTML = `<section class="question-card medium-card loading-card fade-in"><div class="loader-orbit"><i></i><i></i><i></i></div><h2>Preparing your personalized follow-up</h2><p>The next prompt will extend an idea from your first response.</p></section>`;
      return;
    }
    if (stage === 'initial') {
      root.innerHTML = `
        <section class="question-card wide-card fade-in">
          <div class="question-kicker">Write about the topic below for five minutes.</div>
          <blockquote class="prompt-block compact">${escapeHtml(question.prompt)}</blockquote>
          <textarea id="writing-response" class="response-area essay" placeholder="Write your response here…" spellcheck="true">${escapeHtml(initial)}</textarea>
          <div class="card-footer"><span id="writing-count" class="word-counter">0 words</span><button id="writing-next" class="primary-button" type="button">CONTINUE</button></div>
        </section>`;
      const textarea = root.querySelector('#writing-response');
      bindWordCounter(textarea, root.querySelector('#writing-count'));
      textarea.focus();
      root.querySelector('#writing-next').addEventListener('click', moveToFollowup);
      return;
    }
    setSubstage('Step 2 of 2');
    root.innerHTML = `
      <section class="question-card wide-card fade-in">
        <div class="question-kicker">Write a follow-up response for three minutes.</div>
        <blockquote class="prompt-block compact accent">${escapeHtml(followupPrompt)}</blockquote>
        <details class="previous-response"><summary>Review your first response</summary><p>${escapeHtml(initial)}</p></details>
        <textarea id="followup-response" class="response-area essay" placeholder="Add a new angle rather than repeating your first answer…" spellcheck="true">${escapeHtml(followup)}</textarea>
        <div class="card-footer"><span id="followup-count" class="word-counter">0 words</span><button id="writing-finish" class="primary-button" type="button">CONTINUE</button></div>
      </section>`;
    const textarea = root.querySelector('#followup-response');
    bindWordCounter(textarea, root.querySelector('#followup-count'));
    textarea.focus();
    textarea.addEventListener('input', () => { followup = textarea.value; });
    root.querySelector('#writing-finish').addEventListener('click', () => { followup = textarea.value; finish(); });
  }

  render();
  prepTimer = createCountdown(30, { onTick: (remaining) => setTimer(remaining, 30), onEnd: startInitial });
  return () => { prepTimer?.stop(); writingTimer?.stop(); };
}

function speakingDisplay(question) {
  if (question.type === 'speak-photo') {
    return photoFigure(question.image, 'speaking-photo');
  }
  return `<blockquote class="prompt-block speaking-prompt">${escapeHtml(question.prompt)}</blockquote>`;
}

function mountSingleSpeaking(root, context) {
  const { question, onComplete, setTimer, setSubstage, settings, mode } = context;
  const prepSec = question.type === 'speaking-sample' ? 30 : 20;
  const recordSec = Number(question.recordDurationSec || (question.type === 'speaking-sample' ? 180 : 90));
  let prepTimer;
  let recorder;
  let stage = 'prep';
  let recordingResult = null;
  let done = false;
  let autoStarted = false;

  const finish = (answer) => {
    if (done) return;
    done = true;
    prepTimer?.stop();
    recorder?.stop?.().catch(() => {});
    cancelSpeech();
    onComplete(answer || recordingResult || metricFromBrowserTranscript('', 0));
  };

  async function beginRecording() {
    if (autoStarted) return;
    autoStarted = true;
    stage = 'recording';
    setSubstage('Recording');
    render();
    if (!recordingSupported()) {
      root.querySelector('#recording-status').textContent = 'This browser cannot record audio. Use current Chrome or Edge on localhost.';
      root.querySelector('#manual-transcript-wrap')?.classList.remove('hidden');
      return;
    }
    try {
      recorder = new AudioRecorderSession({
        maxDurationSec: recordSec,
        onTick: (remaining) => setTimer(remaining, recordSec),
        onLevel: (level) => {
          root.querySelectorAll('.live-wave i').forEach((bar, index) => { bar.style.transform = `scaleY(${0.25 + level * (0.7 + (index % 3) * 0.24)})`; });
        },
        onAutoStop: () => completeRecording()
      });
      await recorder.start();
      root.querySelector('#recording-status').textContent = 'Recording now — speak naturally and continue developing your answer.';
    } catch (error) {
      root.querySelector('#recording-status').textContent = error.message;
      root.querySelector('#manual-transcript-wrap')?.classList.remove('hidden');
    }
  }

  async function completeRecording() {
    if (stage !== 'recording') return;
    stage = 'processing';
    setSubstage('Processing response');
    const manual = root.querySelector('#manual-transcript')?.value || '';
    render();
    let recorded;
    try { recorded = recorder ? await recorder.stop() : { blob: null, durationSec: 0, browserTranscript: manual }; }
    catch { recorded = { blob: null, durationSec: 0, browserTranscript: manual }; }
    recordingResult = await transcribeRecording(recorded, settings, (message) => {
      const status = root.querySelector('#processing-status');
      if (status) status.textContent = message;
    });
    if (!recordingResult.transcript && manual) Object.assign(recordingResult, metricFromBrowserTranscript(manual, recorded.durationSec));
    stage = 'complete';
    render();
    if (mode === 'full' && !settings.showTranscriptAfterRecording) setTimeout(() => finish(recordingResult), 800);
  }

  function render() {
    if (stage === 'prep') {
      setSubstage(`${prepSec}-second preparation`);
      root.innerHTML = `
        <section class="question-card ${question.type === 'speak-photo' ? 'extra-wide-card' : 'wide-card'} prep-card speaking-prep fade-in">
          <div class="question-kicker">${question.type === 'speak-photo' ? 'Look at the image and prepare to describe it.' : 'Read the prompt and prepare to speak.'}</div>
          ${speakingDisplay(question)}
          <div class="prep-note">Think in keywords: point, reason, example, result, conclusion.</div>
          <button id="record-now" class="primary-button large" type="button">RECORD NOW</button>
        </section>`;
      root.querySelector('#record-now').addEventListener('click', beginRecording);
      return;
    }
    if (stage === 'recording') {
      root.innerHTML = `
        <section class="question-card ${question.type === 'speak-photo' ? 'extra-wide-card' : 'wide-card'} recording-card fade-in">
          <div class="recording-layout">${speakingDisplay(question)}<div class="recording-control">
            <div class="record-dot"><span></span></div><h2>Recording</h2><p id="recording-status">Starting your microphone…</p>
            <div class="live-wave" aria-hidden="true">${'<i></i>'.repeat(24)}</div>
            <button id="stop-recording" class="primary-button" type="button">FINISH RECORDING</button>
            <div id="manual-transcript-wrap" class="manual-transcript hidden"><label>Emergency transcript</label><textarea id="manual-transcript" placeholder="Use only if browser recording is unavailable."></textarea></div>
          </div></div>
        </section>`;
      root.querySelector('#stop-recording').addEventListener('click', completeRecording);
      return;
    }
    if (stage === 'processing') {
      root.innerHTML = `<section class="question-card medium-card loading-card fade-in"><div class="loader-orbit microphone"><i></i><i></i><i></i></div><h2>Analyzing your spoken response</h2><p id="processing-status">Preparing the recording for transcription…</p></section>`;
      return;
    }
    const reveal = settings.showTranscriptAfterRecording || mode !== 'full';
    root.innerHTML = `
      <section class="question-card medium-card fade-in response-captured">
        <div class="success-ring">✓</div><h2>Response captured</h2>
        <div class="capture-metrics"><span><strong>${recordingResult.wordCount || 0}</strong> words</span><span><strong>${Math.round(recordingResult.wordsPerMinute || 0)}</strong> WPM</span><span><strong>${formatDuration(recordingResult.durationSec || 0)}</strong> duration</span></div>
        ${reveal ? `<div class="transcript-preview"><span>Practice transcript</span><p>${escapeHtml(recordingResult.transcript || 'No transcript was available.')}</p></div>` : '<p>Your transcript will be reviewed in the final report.</p>'}
        <button id="speech-continue" class="primary-button" type="button">CONTINUE</button>
      </section>`;
    root.querySelector('#speech-continue').addEventListener('click', () => finish(recordingResult));
  }

  render();
  prepTimer = createCountdown(prepSec, { onTick: (remaining) => setTimer(remaining, prepSec), onEnd: beginRecording });
  return () => { prepTimer?.stop(); recorder?.stop?.().catch(() => {}); cancelSpeech(); };
}

function mountInteractiveSpeaking(root, context) {
  const { question, onComplete, setTimer, setSubstage, settings, mode } = context;
  const responses = [];
  const history = [];
  const questions = [...question.questions];
  const count = Math.min(8, Math.max(6, questions.length));
  let index = 0;
  let currentQuestion = questions[0];
  let recorder = null;
  let stage = 'listen';
  let played = false;
  let recordingResult = null;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    recorder?.stop?.().catch(() => {});
    cancelSpeech();
    onComplete({ responses, persona: question.persona, context: question.context });
  };

  async function playQuestion() {
    if (played) return;
    played = true;
    const button = root.querySelector('#character-play');
    if (button) { button.disabled = true; button.classList.add('playing'); }
    try { await speakText(currentQuestion, { accent: settings.voiceAccent, rate: settings.voiceRate, mode: settings.voiceMode || 'auto' }); } catch {}
    if (button) button.classList.remove('playing');
    root.querySelector('#start-answer')?.removeAttribute('disabled');
  }

  async function startAnswer() {
    stage = 'recording';
    render();
    try {
      recorder = new AudioRecorderSession({
        maxDurationSec: 35,
        onTick: (remaining) => setTimer(remaining, 35),
        onLevel: (level) => root.querySelectorAll('.live-wave i').forEach((bar, barIndex) => { bar.style.transform = `scaleY(${0.25 + level * (0.65 + (barIndex % 4) * 0.2)})`; }),
        onAutoStop: () => completeAnswer()
      });
      await recorder.start();
      root.querySelector('#recording-status').textContent = 'Speak as much as you can while answering the question directly.';
    } catch (error) {
      root.querySelector('#recording-status').textContent = error.message;
      root.querySelector('#manual-transcript-wrap')?.classList.remove('hidden');
    }
  }

  async function completeAnswer() {
    if (stage !== 'recording') return;
    const manual = root.querySelector('#manual-transcript')?.value || '';
    stage = 'processing';
    render();
    let recorded;
    try { recorded = recorder ? await recorder.stop() : { blob: null, durationSec: 0, browserTranscript: manual }; }
    catch { recorded = { blob: null, durationSec: 0, browserTranscript: manual }; }
    recordingResult = await transcribeRecording(recorded, settings, (message) => {
      const status = root.querySelector('#processing-status');
      if (status) status.textContent = message;
    });
    if (!recordingResult.transcript && manual) Object.assign(recordingResult, metricFromBrowserTranscript(manual, recorded.durationSec));
    const response = { question: currentQuestion, ...recordingResult };
    responses.push(response);
    history.push({ question: currentQuestion, answer: recordingResult.transcript || '' });
    if (index >= count - 1) return finish();

    stage = 'next';
    render();
    const fallbackQuestion = questions[index + 1] || 'Could you explain that idea with a specific example?';
    try {
      const next = await getSpeakingFollowup({
        persona: question.persona,
        context: question.context,
        history,
        fallbackQuestion,
        useAI: settings.useAI,
        model: settings.model
      });
      currentQuestion = next.question || fallbackQuestion;
    } catch {
      currentQuestion = fallbackQuestion;
    }
    index += 1;
    stage = 'listen';
    played = false;
    recorder = null;
    render();
  }

  function render() {
    setSubstage(`Question ${index + 1} of ${count}`);
    if (stage === 'listen') {
      setTimer(35, 35);
      root.innerHTML = `
        <section class="question-card wide-card interactive-speaking-card fade-in">
          <div class="question-kicker">Listen to the question, then record a 35-second answer.</div>
          <div class="character-stage"><div class="character-avatar"><span>${escapeHtml(question.persona.charAt(0))}</span><i></i></div><div class="character-info"><h2>${escapeHtml(question.persona)}</h2><p>${escapeHtml(question.context)}</p></div></div>
          <button id="character-play" class="audio-button character-audio" type="button"><span class="audio-icon">▶</span><span>LISTEN TO QUESTION</span><small>Available once</small></button>
          <button id="start-answer" class="primary-button large" type="button" disabled>CLICK TO RECORD</button>
          ${mode !== 'full' ? `<details class="practice-question-text"><summary>Practice accessibility: show question text</summary><p>${escapeHtml(currentQuestion)}</p></details>` : ''}
        </section>`;
      root.querySelector('#character-play').addEventListener('click', playQuestion);
      root.querySelector('#start-answer').addEventListener('click', startAnswer);
      setTimeout(() => playQuestion().catch(() => {}), 350);
      return;
    }
    if (stage === 'recording') {
      root.innerHTML = `
        <section class="question-card medium-card recording-card fade-in">
          <div class="recording-control"><div class="record-dot"><span></span></div><h2>Your answer</h2><p id="recording-status">Starting your microphone…</p>
          <div class="live-wave" aria-hidden="true">${'<i></i>'.repeat(24)}</div>
          <button id="finish-answer" class="primary-button" type="button">CONTINUE</button>
          <div id="manual-transcript-wrap" class="manual-transcript hidden"><textarea id="manual-transcript" placeholder="Emergency transcript if recording is unavailable."></textarea></div></div>
        </section>`;
      root.querySelector('#finish-answer').addEventListener('click', completeAnswer);
      return;
    }
    root.innerHTML = `<section class="question-card medium-card loading-card fade-in"><div class="loader-orbit microphone"><i></i><i></i><i></i></div><h2>${stage === 'next' ? 'Preparing the next question' : 'Transcribing your answer'}</h2><p id="processing-status">${stage === 'next' ? 'The conversation is adapting to your response…' : 'Converting speech into a practice transcript…'}</p></section>`;
  }

  render();
  return () => { recorder?.stop?.().catch(() => {}); cancelSpeech(); };
}

function mountWritingSample(root, context) {
  const { question, onComplete, setTimer, setSubstage } = context;
  let prepTimer;
  let timer;
  let stage = 'prep';
  let answer = '';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    prepTimer?.stop();
    timer?.stop();
    const textarea = root.querySelector('#sample-response');
    if (textarea) answer = textarea.value;
    onComplete(answer);
  };
  const start = () => {
    prepTimer?.stop();
    stage = 'write';
    setSubstage('Writing sample');
    render();
    timer = createCountdown(300, { onTick: (remaining) => setTimer(remaining, 300), onEnd: finish });
  };
  function render() {
    if (stage === 'prep') {
      setSubstage('30-second preparation');
      root.innerHTML = `<section class="question-card wide-card prep-card fade-in"><div class="prep-icon">✎</div><div class="question-kicker">Read the topic and prepare to write for five minutes.</div><blockquote class="prompt-block">${escapeHtml(question.prompt)}</blockquote><div class="prep-note">This sample should read like a focused short essay.</div><button id="sample-start" class="primary-button large" type="button">START WRITING</button></section>`;
      root.querySelector('#sample-start').addEventListener('click', start);
      return;
    }
    root.innerHTML = `<section class="question-card wide-card fade-in"><div class="question-kicker">Write about the topic below for five minutes.</div><blockquote class="prompt-block compact">${escapeHtml(question.prompt)}</blockquote><textarea id="sample-response" class="response-area essay" spellcheck="true">${escapeHtml(answer)}</textarea><div class="card-footer"><span id="sample-count" class="word-counter">0 words</span><button id="sample-finish" class="primary-button" type="button">CONTINUE</button></div></section>`;
    const textarea = root.querySelector('#sample-response');
    bindWordCounter(textarea, root.querySelector('#sample-count'));
    textarea.focus();
    root.querySelector('#sample-finish').addEventListener('click', finish);
  }
  render();
  prepTimer = createCountdown(30, { onTick: (remaining) => setTimer(remaining, 30), onEnd: start });
  return () => { prepTimer?.stop(); timer?.stop(); };
}

export function mountQuestion(root, context) {
  const { question, setMeta } = context;
  setMeta(typeLabel(question.type), instructionFor(question.type));
  switch (question.type) {
    case 'read-select': return mountReadSelect(root, context);
    case 'fill-blank': return mountFillBlank(root, context);
    case 'read-complete': return mountReadComplete(root, context);
    case 'listen-type': return mountListenType(root, context);
    case 'interactive-reading': return mountInteractiveReading(root, context);
    case 'interactive-listening': return mountInteractiveListening(root, context);
    case 'write-photo': return mountWritePhoto(root, context);
    case 'interactive-writing': return mountInteractiveWriting(root, context);
    case 'speak-photo':
    case 'read-then-speak':
    case 'speaking-sample': return mountSingleSpeaking(root, context);
    case 'interactive-speaking': return mountInteractiveSpeaking(root, context);
    case 'writing-sample': return mountWritingSample(root, context);
    default:
      root.innerHTML = `<section class="question-card medium-card"><h2>Unsupported question</h2><p>${escapeHtml(question.type)}</p><button id="skip" class="primary-button">CONTINUE</button></section>`;
      root.querySelector('#skip').addEventListener('click', () => context.onComplete(null));
      return () => {};
  }
}

function instructionFor(type) {
  const instructions = {
    'read-select': 'Decide whether the word is valid English.',
    'fill-blank': 'Use grammar, meaning, collocation, and spelling clues.',
    'read-complete': 'Complete every unfinished word in the passage.',
    'listen-type': 'Listen carefully and transcribe the sentence.',
    'interactive-reading': 'Complete six connected reading tasks before the section timer ends.',
    'interactive-listening': 'Follow the scenario, participate in the conversation, and summarize it.',
    'write-photo': 'Describe more than objects: include actions, position, and atmosphere.',
    'interactive-writing': 'Develop an answer, then extend it in a personalized follow-up.',
    'speak-photo': 'Describe the image naturally for the full recording time.',
    'read-then-speak': 'Answer every component and support your point with an example.',
    'interactive-speaking': 'Respond naturally to a sequence of connected questions.',
    'writing-sample': 'Produce a focused, well-organized short essay.',
    'speaking-sample': 'Speak at length, organize your ideas, and conclude naturally.'
  };
  return instructions[type] || 'Complete the task before the timer ends.';
}
