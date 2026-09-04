const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
const integerScore = (value, fallback = 0) => Math.round(clamp(Number.isFinite(Number(value)) ? Number(value) : fallback));

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordsOf(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function tokenSet(value) {
  return new Set(wordsOf(value).filter((word) => word.length > 2));
}

export function tokenSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  const precision = intersection / a.size;
  const recall = intersection / b.size;
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
}

export function levenshtein(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

export function stringSimilarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  const longest = Math.max(left.length, right.length);
  if (!longest) return 1;
  return Math.max(0, 1 - levenshtein(left, right) / longest);
}

function sentenceCount(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;
  return Math.max(1, trimmed.split(/[.!?]+(?:\s|$)/).filter((part) => part.trim()).length);
}

function connectorCount(text) {
  const matches = normalizeText(text).match(/\b(however|therefore|although|because|while|whereas|moreover|furthermore|consequently|for example|for instance|in addition|on the other hand|as a result|nevertheless|overall|firstly|secondly)\b/g);
  return matches?.length || 0;
}

function grammarSignals(text) {
  const raw = String(text || '');
  const normalized = normalizeText(raw);
  let deductions = 0;
  if (/\bi am agree\b/.test(normalized)) deductions += 7;
  if (/\bpeople is\b|\bthey is\b|\bwe was\b|\bhe have\b|\bshe have\b/.test(normalized)) deductions += 8;
  if (/\bin the picture have\b|\bthere have\b/.test(normalized)) deductions += 8;
  if (/\bmore better\b|\bmost easiest\b/.test(normalized)) deductions += 6;
  if (/(^|[.!?]\s+)[a-z]/.test(raw)) deductions += 4;
  if (raw && !/[.!?]$/.test(raw.trim())) deductions += 3;
  const repeated = normalized.match(/\b(very|really|good|bad|thing|things)\b/g)?.length || 0;
  if (repeated > 6) deductions += Math.min(8, repeated - 5);
  return deductions;
}

function lexicalScore(text) {
  const words = wordsOf(text);
  if (!words.length) return 0;
  const unique = new Set(words).size;
  const diversity = unique / Math.sqrt(words.length * 2);
  const longWords = words.filter((word) => word.length >= 8).length / words.length;
  const repetitionPenalty = Math.max(0, (words.length - unique * 1.6) / Math.max(1, words.length));
  return clamp(48 + diversity * 37 + longWords * 55 - repetitionPenalty * 20);
}

function relevanceScore(item, response) {
  const promptSimilarity = tokenSimilarity(response, item.prompt || '');
  const referenceSimilarity = item.reference ? tokenSimilarity(response, item.reference) : 0;
  const required = Array.isArray(item.requiredPoints) ? item.requiredPoints : [];
  const covered = required.length
    ? required.filter((point) => tokenSimilarity(response, point) >= 0.28).length / required.length
    : 0;
  const responseWords = wordsOf(response).length;
  const lengthBase = clamp((responseWords / Math.max(15, item.type?.includes('photo') ? 35 : 90)) * 100);
  return clamp(
    promptSimilarity * 35 +
    referenceSimilarity * (item.reference ? 35 : 0) +
    covered * (required.length ? 40 : 0) +
    lengthBase * (item.reference || required.length ? 0.25 : 0.6) +
    (item.reference || required.length ? 10 : 15)
  );
}

function responseLengthTarget(type) {
  if (String(type).includes('photo')) return 38;
  if (String(type).includes('summary')) return 55;
  if (String(type).includes('followup')) return 70;
  return 105;
}

function writingHeuristic(item) {
  const response = String(item.response || '').trim();
  const words = wordsOf(response);
  const sentences = sentenceCount(response);
  if (!words.length) {
    return {
      id: item.id, content: 0, coherence: 0, vocabulary: 0, grammar: 0, mechanics: 0, overall: 0,
      wordCount: 0,
      strengths: [],
      improvements: ['Provide a relevant response before the timer ends.', 'Use complete sentences.'],
      corrections: [],
      modelOpening: 'Begin with a direct answer to the prompt.'
    };
  }
  const target = responseLengthTarget(item.type);
  const lengthRatio = Math.min(1, words.length / target);
  const content = relevanceScore(item, response);
  const coherence = clamp(42 + lengthRatio * 25 + Math.min(16, connectorCount(response) * 4) + Math.min(12, sentences * 2));
  const vocabulary = lexicalScore(response);
  const grammar = clamp(58 + Math.min(20, sentences * 2.2) + Math.min(10, words.length / 15) - grammarSignals(response));
  const punctuationCount = (response.match(/[,.!?;:]/g) || []).length;
  const mechanics = clamp(55 + Math.min(25, punctuationCount * 2.5) - (response.match(/\s{2,}/g) || []).length * 2 - grammarSignals(response) * 0.4);
  const overall = clamp(content * 0.28 + coherence * 0.20 + vocabulary * 0.18 + grammar * 0.23 + mechanics * 0.11);
  const strengths = [];
  if (content >= 72) strengths.push('The response addresses the task and includes relevant content.');
  if (coherence >= 72) strengths.push('Ideas are organized and connected clearly.');
  if (vocabulary >= 72) strengths.push('Vocabulary shows useful range and precision.');
  if (!strengths.length) strengths.push('The response provides some usable evidence of English ability.');
  const improvements = [];
  if (words.length < target * 0.7) improvements.push('Develop the response with one specific reason or example.');
  if (content < 70) improvements.push('Answer every part of the prompt more directly.');
  if (coherence < 70) improvements.push('Use a clear point, explanation, example, and conclusion.');
  if (grammar < 70) improvements.push('Review sentence boundaries, verb agreement, articles, and word forms.');
  if (vocabulary < 70) improvements.push('Replace repeated general words with precise topic vocabulary.');
  return {
    id: item.id,
    content: integerScore(content), coherence: integerScore(coherence), vocabulary: integerScore(vocabulary),
    grammar: integerScore(grammar), mechanics: integerScore(mechanics), overall: integerScore(overall),
    wordCount: words.length,
    strengths: strengths.slice(0, 2),
    improvements: improvements.slice(0, 3),
    corrections: [],
    modelOpening: 'Start with a direct position or a precise overview, then support it with a specific detail.'
  };
}

function speakingHeuristic(item) {
  const transcript = String(item.transcript || '').trim();
  const words = wordsOf(transcript);
  if (!words.length) {
    return {
      id: item.id, content: 0, coherence: 0, vocabulary: 0, grammar: 0, fluency: 0,
      intelligibilityEstimate: 0, overall: 0, strengths: [],
      improvements: ['Begin speaking promptly and continue until you have developed the answer.', 'Use a direct point followed by a reason and example.'],
      fillerFeedback: 'No usable transcript was captured.',
      betterStructure: 'Point → reason → specific example → result → conclusion.'
    };
  }
  const content = relevanceScore({ ...item, response: transcript }, transcript);
  const coherence = clamp(45 + Math.min(18, sentenceCount(transcript) * 2.5) + Math.min(18, connectorCount(transcript) * 4));
  const vocabulary = lexicalScore(transcript);
  const grammar = clamp(60 + Math.min(18, sentenceCount(transcript) * 2) - grammarSignals(transcript));
  const wpm = Number(item.wordsPerMinute || (words.length / Math.max(1, Number(item.durationSec || 60))) * 60);
  const paceScore = wpm < 55 ? 45 + (wpm / 55) * 20 : wpm <= 175 ? 80 - Math.abs(120 - wpm) * 0.12 : 70 - (wpm - 175) * 0.25;
  const fillerPenalty = Math.min(25, Number(item.fillerCount || 0) * 4);
  const pausePenalty = Math.min(18, Number(item.longPauseCount || 0) * 2.5);
  const fluency = clamp(paceScore + Math.min(12, words.length / 9) - fillerPenalty - pausePenalty);
  const intelligibility = clamp(55 + Math.min(25, words.length / 4) + (item.transcriptionSource === 'openrouter' ? 8 : 2) - (item.transcriptionFailed ? 25 : 0));
  const overall = clamp(content * 0.28 + coherence * 0.17 + vocabulary * 0.16 + grammar * 0.18 + fluency * 0.16 + intelligibility * 0.05);
  const strengths = [];
  if (content >= 72) strengths.push('The answer remains relevant and develops the topic.');
  if (fluency >= 72) strengths.push('The response maintains a generally natural pace and continuity.');
  if (vocabulary >= 72) strengths.push('The transcript shows useful vocabulary range.');
  if (!strengths.length) strengths.push('The response communicates a recognizable main idea.');
  const improvements = [];
  if (words.length < 45 && Number(item.durationSec || 0) >= 60) improvements.push('Extend the answer with a concrete example and its result.');
  if (content < 70) improvements.push('Address every component of the prompt explicitly.');
  if (fluency < 70) improvements.push('Use short silent pauses instead of fillers and restart less often.');
  if (coherence < 70) improvements.push('Organize the response as point, reason, example, and conclusion.');
  return {
    id: item.id,
    content: integerScore(content), coherence: integerScore(coherence), vocabulary: integerScore(vocabulary),
    grammar: integerScore(grammar), fluency: integerScore(fluency), intelligibilityEstimate: integerScore(intelligibility),
    overall: integerScore(overall), strengths: strengths.slice(0, 2), improvements: improvements.slice(0, 3),
    fillerFeedback: Number(item.fillerCount || 0) > 3 ? 'Frequent fillers reduced continuity; replace them with brief silent pauses.' : 'Filler use was limited or not clearly detected.',
    betterStructure: 'Direct answer → main reason → specific example → result or contrast → concise conclusion.'
  };
}

export function localWritingEvaluation(responses) {
  const items = (responses || []).map(writingHeuristic);
  const advice = [
    'Answer the exact task before adding background information.',
    'Use one specific example to develop each main claim.',
    'Reserve the final 15-20 seconds for verbs, articles, plurals, spelling, and punctuation.'
  ];
  return { items, globalAdvice: advice, source: 'local-heuristic' };
}

export function localSpeakingEvaluation(responses) {
  const items = (responses || []).map(speakingHeuristic);
  const advice = [
    'Start with a direct answer rather than a memorized introduction.',
    'Use a point-reason-example-result structure to fill the available time naturally.',
    'Record daily and replace fillers with short silent pauses.'
  ];
  return {
    items,
    globalAdvice: advice,
    audioLimitation: 'Pronunciation is estimated from transcription and timing, not directly certified from acoustic analysis.',
    source: 'local-heuristic'
  };
}

function normalizeStringList(value, fallback = []) {
  const list = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return list.length ? list.slice(0, 5) : fallback;
}

export function normalizeWritingEvaluation(data, responses) {
  const fallback = localWritingEvaluation(responses);
  const byId = new Map((data?.items || []).map((item) => [String(item?.id), item]));
  const items = fallback.items.map((base) => {
    const item = byId.get(String(base.id));
    if (!item) return base;
    return {
      ...base,
      content: integerScore(item.content, base.content),
      coherence: integerScore(item.coherence, base.coherence),
      vocabulary: integerScore(item.vocabulary, base.vocabulary),
      grammar: integerScore(item.grammar, base.grammar),
      mechanics: integerScore(item.mechanics, base.mechanics),
      overall: integerScore(item.overall, base.overall),
      wordCount: Math.max(0, Number.parseInt(item.wordCount, 10) || base.wordCount),
      strengths: normalizeStringList(item.strengths, base.strengths),
      improvements: normalizeStringList(item.improvements, base.improvements),
      corrections: Array.isArray(item.corrections)
        ? item.corrections.slice(0, 5).map((correction) => ({
            original: String(correction?.original || '').slice(0, 240),
            improved: String(correction?.improved || '').slice(0, 320),
            reason: String(correction?.reason || '').slice(0, 320)
          })).filter((correction) => correction.original || correction.improved)
        : base.corrections,
      modelOpening: String(item.modelOpening || base.modelOpening).slice(0, 500)
    };
  });
  return {
    items,
    globalAdvice: normalizeStringList(data?.globalAdvice, fallback.globalAdvice),
    source: 'openrouter'
  };
}

export function normalizeSpeakingEvaluation(data, responses) {
  const fallback = localSpeakingEvaluation(responses);
  const byId = new Map((data?.items || []).map((item) => [String(item?.id), item]));
  const items = fallback.items.map((base) => {
    const item = byId.get(String(base.id));
    if (!item) return base;
    return {
      ...base,
      content: integerScore(item.content, base.content),
      coherence: integerScore(item.coherence, base.coherence),
      vocabulary: integerScore(item.vocabulary, base.vocabulary),
      grammar: integerScore(item.grammar, base.grammar),
      fluency: integerScore(item.fluency, base.fluency),
      intelligibilityEstimate: integerScore(item.intelligibilityEstimate, base.intelligibilityEstimate),
      overall: integerScore(item.overall, base.overall),
      strengths: normalizeStringList(item.strengths, base.strengths),
      improvements: normalizeStringList(item.improvements, base.improvements),
      fillerFeedback: String(item.fillerFeedback || base.fillerFeedback).slice(0, 500),
      betterStructure: String(item.betterStructure || base.betterStructure).slice(0, 700)
    };
  });
  return {
    items,
    globalAdvice: normalizeStringList(data?.globalAdvice, fallback.globalAdvice),
    audioLimitation: String(data?.audioLimitation || fallback.audioLimitation).slice(0, 700),
    source: 'openrouter'
  };
}

export function deriveSpeechMetrics(transcription, fallbackDurationSec = 0) {
  const transcript = String(transcription?.text || '').trim();
  const words = wordsOf(transcript);
  const durationSec = Number(transcription?.duration || fallbackDurationSec || 0);
  const wordEntries = Array.isArray(transcription?.words) ? transcription.words : [];
  const segmentEntries = Array.isArray(transcription?.segments) ? transcription.segments : [];
  let longPauseCount = 0;
  if (wordEntries.length > 1) {
    for (let index = 1; index < wordEntries.length; index += 1) {
      const previousEnd = Number(wordEntries[index - 1]?.end);
      const currentStart = Number(wordEntries[index]?.start);
      if (Number.isFinite(previousEnd) && Number.isFinite(currentStart) && currentStart - previousEnd >= 1.2) longPauseCount += 1;
    }
  } else if (segmentEntries.length > 1) {
    for (let index = 1; index < segmentEntries.length; index += 1) {
      const previousEnd = Number(segmentEntries[index - 1]?.end);
      const currentStart = Number(segmentEntries[index]?.start);
      if (Number.isFinite(previousEnd) && Number.isFinite(currentStart) && currentStart - previousEnd >= 1.5) longPauseCount += 1;
    }
  }
  const fillers = transcript.match(/\b(um+|uh+|erm+|hmm+|you know|like|basically|actually)\b/gi) || [];
  return {
    transcript,
    durationSec,
    wordCount: words.length,
    wordsPerMinute: durationSec > 0 ? Math.round((words.length / durationSec) * 600) / 10 : 0,
    fillerCount: fillers.length,
    longPauseCount,
    language: transcription?.language || 'en',
    segments: segmentEntries.slice(0, 300),
    words: wordEntries.slice(0, 1200)
  };
}
