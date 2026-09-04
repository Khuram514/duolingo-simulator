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

export function levenshtein(leftValue, rightValue) {
  const left = normalizeText(leftValue);
  const right = normalizeText(rightValue);
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length];
}

export function stringSimilarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  const longest = Math.max(a.length, b.length);
  return longest ? Math.max(0, 1 - levenshtein(a, b) / longest) : 1;
}

export function tokenF1(left, right) {
  const a = wordsOf(left);
  const b = wordsOf(right);
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const remaining = [...b];
  let matches = 0;
  for (const word of a) {
    let bestIndex = -1;
    let bestScore = 0;
    remaining.forEach((candidate, index) => {
      const score = stringSimilarity(word, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestScore >= 0.82) {
      matches += bestScore;
      remaining.splice(bestIndex, 1);
    }
  }
  const precision = matches / a.length;
  const recall = matches / b.length;
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
}

function bestAccepted(answer, accepted = []) {
  if (!String(answer || '').trim()) return 0;
  return Math.max(0, ...accepted.map((candidate) => Math.max(stringSimilarity(answer, candidate), tokenF1(answer, candidate))));
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function scoreReadSelect(question, answer) {
  return answer === question.isReal ? 1 : 0;
}

function scoreFillBlank(question, answer) {
  const typed = normalizeText(answer);
  const full = typed.startsWith(normalizeText(question.prefix)) ? typed : `${question.prefix}${typed}`;
  const similarity = stringSimilarity(full, question.answer);
  if (similarity >= 0.995) return 1;
  if (similarity >= 0.9) return 0.7;
  if (similarity >= 0.78) return 0.35;
  return 0;
}

function scoreReadComplete(question, answer) {
  const expected = question.segments.filter((segment) => segment.answer);
  const values = Array.isArray(answer) ? answer : [];
  if (!expected.length) return 0;
  const earned = expected.reduce((sum, segment, index) => {
    const typed = normalizeText(values[index] || '');
    const full = typed.startsWith(normalizeText(segment.prefix)) ? typed : `${segment.prefix}${typed}`;
    const similarity = stringSimilarity(full, segment.answer);
    return sum + (similarity >= 0.995 ? 1 : similarity >= 0.9 ? 0.7 : similarity >= 0.78 ? 0.3 : 0);
  }, 0);
  return earned / expected.length;
}

function scoreListenType(question, answer) {
  const tokenScore = tokenF1(answer, question.text);
  const charScore = stringSimilarity(answer, question.text);
  return clamp(tokenScore * 0.72 + charScore * 0.28);
}

function scoreInteractiveReading(question, answer = {}) {
  const details = [];
  for (const item of question.completeSentences) {
    const correct = answer.completeSentences?.[item.id] === item.answer;
    details.push({ id: item.id, type: 'complete-sentences', score: correct ? 1 : 0, skills: ['reading'] });
  }
  details.push({
    id: question.completePassage.id,
    type: 'complete-passage',
    score: Number(answer.completePassage) === question.completePassage.answerIndex ? 1 : 0,
    skills: ['reading']
  });
  for (const item of question.highlight) {
    const selected = answer.highlight?.[item.id] || '';
    const similarity = bestAccepted(selected, item.acceptedAnswers);
    details.push({ id: item.id, type: 'highlight-answer', score: similarity >= 0.92 ? 1 : similarity >= 0.7 ? 0.5 : 0, skills: ['reading'] });
  }
  details.push({
    id: question.identifyIdea.id,
    type: 'identify-idea',
    score: Number(answer.identifyIdea) === question.identifyIdea.answerIndex ? 1 : 0,
    skills: ['reading']
  });
  details.push({
    id: question.titleQuestion.id,
    type: 'title-passage',
    score: Number(answer.titleQuestion) === question.titleQuestion.answerIndex ? 1 : 0,
    skills: ['reading']
  });
  return details;
}

function scoreInteractiveListening(question, answer = {}) {
  const details = [];
  for (const item of question.scenario.blanks) {
    const similarity = bestAccepted(answer.blanks?.[item.id] || '', item.acceptedAnswers);
    details.push({ id: item.id, type: 'listen-complete', score: similarity >= 0.86 ? 1 : similarity >= 0.55 ? 0.5 : 0, skills: ['listening'] });
  }
  for (const item of question.turns) {
    details.push({
      id: item.id,
      type: 'listen-respond',
      score: Number(answer.turns?.[item.id]) === item.answerIndex ? 1 : 0,
      skills: ['listening']
    });
  }
  return details;
}

export function scoreObjectiveResponse(record) {
  const question = record.question;
  switch (question.type) {
    case 'read-select':
      return [{ id: question.id, type: question.type, score: scoreReadSelect(question, record.answer), skills: ['reading'], difficulty: question.difficulty }];
    case 'fill-blank':
      return [{ id: question.id, type: question.type, score: scoreFillBlank(question, record.answer), skills: ['reading'], difficulty: question.difficulty }];
    case 'read-complete':
      return [{ id: question.id, type: question.type, score: scoreReadComplete(question, record.answer), skills: ['reading'], difficulty: question.difficulty }];
    case 'listen-type':
      return [{ id: question.id, type: question.type, score: scoreListenType(question, record.answer), skills: ['listening'], difficulty: question.difficulty }];
    case 'interactive-reading':
      return scoreInteractiveReading(question, record.answer).map((detail) => ({ ...detail, difficulty: question.difficulty }));
    case 'interactive-listening':
      return scoreInteractiveListening(question, record.answer).map((detail) => ({ ...detail, difficulty: question.difficulty }));
    default:
      return [];
  }
}

export function scoreAllObjective(records = []) {
  return records.flatMap(scoreObjectiveResponse);
}

export function updateAbility(currentAbility, scoredDetails) {
  if (!scoredDetails?.length) return currentAbility;
  const average = scoredDetails.reduce((sum, item) => sum + item.score, 0) / scoredDetails.length;
  const difficulty = scoredDetails.reduce((sum, item) => sum + Number(item.difficulty || 3), 0) / scoredDetails.length;
  const expected = 1 / (1 + Math.exp((difficulty - currentAbility) * 1.2));
  const adjustment = (average - expected) * 0.7;
  return Math.min(5, Math.max(1, currentAbility + adjustment));
}

export function selectAdaptiveQuestion(pool, usedIds, ability) {
  const remaining = pool.filter((item) => !usedIds.has(item.id));
  if (!remaining.length) return null;
  return [...remaining].sort((a, b) => {
    const aDistance = Math.abs(Number(a.difficulty || 3) - ability);
    const bDistance = Math.abs(Number(b.difficulty || 3) - ability);
    return aDistance - bDistance || Math.random() - 0.5;
  })[0];
}

export function createSessionBlueprint(pack, mode = 'full') {
  const practiceType = String(mode || '').startsWith('practice:')
    ? String(mode).slice('practice:'.length)
    : '';
  if (practiceType) {
    const adaptiveCounts = {
      'read-select': 10,
      'fill-blank': 6,
      'read-complete': 1,
      'listen-type': 4
    };
    if (adaptiveCounts[practiceType]) {
      const poolMap = {
        'read-select': pack.adaptive.readSelect,
        'fill-blank': pack.adaptive.fillBlanks,
        'read-complete': pack.adaptive.readComplete,
        'listen-type': pack.adaptive.listenType
      };
      const count = Math.min(adaptiveCounts[practiceType], poolMap[practiceType]?.length || 0);
      return Array.from({ length: count }, () => ({ category: 'adaptive', kind: practiceType }));
    }

    const fixedMap = {
      'interactive-reading': pack.interactiveReading?.[0],
      'interactive-listening': pack.interactiveListening?.[0],
      'write-photo': pack.openResponses?.writePhotos?.[0],
      'speak-photo': pack.openResponses?.speakPhoto,
      'read-then-speak': pack.openResponses?.readThenSpeak,
      'interactive-speaking': pack.openResponses?.interactiveSpeaking,
      'writing-sample': pack.openResponses?.writingSample,
      'speaking-sample': pack.openResponses?.speakingSample,
      'interactive-writing': pack.openResponses?.interactiveWriting
    };
    const selected = fixedMap[practiceType];
    if (!selected) return [];
    const question = JSON.parse(JSON.stringify(selected));
    if (['speak-photo', 'read-then-speak'].includes(practiceType)) question.recordDurationSec = 60;
    return [{ category: 'fixed', question }];
  }

  const maximums = {
    full: { rs: [15, 18], fb: [6, 9], rc: [3, 6], lt: [6, 9] },
    quick: { rs: [8, 8], fb: [4, 4], rc: [1, 1], lt: [3, 3] },
    blanks: { rs: [6, 6], fb: [Math.min(9, pack.adaptive.fillBlanks.length), Math.min(9, pack.adaptive.fillBlanks.length)], rc: [2, 2], lt: [0, 0] },
    production: { rs: [0, 0], fb: [0, 0], rc: [0, 0], lt: [0, 0] }
  }[mode] || { rs: [15, 18], fb: [6, 9], rc: [3, 6], lt: [6, 9] };
  const randomCount = ([min, max], available) => Math.min(available, min + Math.floor(Math.random() * (max - min + 1)));
  const queues = {
    'read-select': randomCount(maximums.rs, pack.adaptive.readSelect.length),
    'fill-blank': randomCount(maximums.fb, pack.adaptive.fillBlanks.length),
    'read-complete': randomCount(maximums.rc, pack.adaptive.readComplete.length),
    'listen-type': randomCount(maximums.lt, pack.adaptive.listenType.length)
  };
  const objectiveKinds = [];
  const pattern = ['read-select', 'fill-blank', 'listen-type', 'read-select', 'read-complete', 'listen-type', 'read-select', 'fill-blank'];
  while (Object.values(queues).some((count) => count > 0)) {
    let added = false;
    for (const kind of pattern) {
      if (queues[kind] > 0) {
        objectiveKinds.push({ category: 'adaptive', kind });
        queues[kind] -= 1;
        added = true;
      }
    }
    if (!added) break;
  }

  if (mode === 'blanks') return objectiveKinds;
  if (mode === 'production') {
    return [
      ...pack.openResponses.writePhotos.slice(0, 2).map((question) => ({ category: 'fixed', question })),
      { category: 'fixed', question: pack.openResponses.interactiveWriting },
      { category: 'fixed', question: pack.openResponses.speakPhoto },
      { category: 'fixed', question: pack.openResponses.readThenSpeak },
      { category: 'fixed', question: pack.openResponses.interactiveSpeaking }
    ];
  }

  const fullTail = [
    ...pack.interactiveReading.map((question) => ({ category: 'fixed', question })),
    ...pack.interactiveListening.map((question) => ({ category: 'fixed', question })),
    ...pack.openResponses.writePhotos.map((question) => ({ category: 'fixed', question })),
    { category: 'fixed', question: pack.openResponses.interactiveWriting },
    { category: 'fixed', question: pack.openResponses.speakPhoto },
    { category: 'fixed', question: pack.openResponses.readThenSpeak },
    { category: 'fixed', question: pack.openResponses.interactiveSpeaking },
    { category: 'fixed', question: pack.openResponses.writingSample },
    { category: 'fixed', question: pack.openResponses.speakingSample }
  ];
  if (mode === 'quick') {
    return [
      ...objectiveKinds,
      { category: 'fixed', question: pack.interactiveReading[0] },
      { category: 'fixed', question: pack.interactiveListening[0] },
      { category: 'fixed', question: pack.openResponses.writePhotos[0] },
      { category: 'fixed', question: pack.openResponses.interactiveWriting },
      { category: 'fixed', question: pack.openResponses.speakPhoto },
      { category: 'fixed', question: pack.openResponses.readThenSpeak }
    ].filter((step) => step.question || step.category === 'adaptive');
  }
  return [...objectiveKinds, ...fullTail];
}

function average(items, selector = (item) => item) {
  const values = items.map(selector).filter((value) => Number.isFinite(Number(value))).map(Number);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function weightedAverage(groups) {
  let numerator = 0;
  let denominator = 0;
  for (const [value, weight] of groups) {
    if (Number.isFinite(Number(value)) && weight > 0) {
      numerator += Number(value) * weight;
      denominator += weight;
    }
  }
  return denominator ? numerator / denominator : 0;
}

export function rawToDet(raw) {
  const score = 10 + Math.min(100, Math.max(0, raw)) * 1.5;
  return Math.min(160, Math.max(10, Math.round(score / 5) * 5));
}

export function cefrForScore(score) {
  if (score >= 155) return 'C2';
  if (score >= 130) return 'C1';
  if (score >= 100) return 'B2';
  if (score >= 60) return 'B1';
  return 'A1–A2';
}

function evaluationMap(evaluation) {
  return new Map((evaluation?.items || []).map((item) => [String(item.id), item]));
}


function aggregateApiUsage(session, grading) {
  const usageItems = [];
  if (session?.generationUsage) usageItems.push(session.generationUsage);
  if (grading?.usage) usageItems.push(grading.usage);
  for (const record of session?.responses || []) {
    const answer = record?.answer;
    if (answer?.usage) usageItems.push(answer.usage);
    for (const response of answer?.responses || []) if (response?.usage) usageItems.push(response.usage);
  }
  const total = usageItems.reduce((acc, usage) => {
    acc.promptTokens += Number(usage?.promptTokens ?? usage?.prompt_tokens ?? usage?.input_tokens ?? 0) || 0;
    acc.completionTokens += Number(usage?.completionTokens ?? usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0;
    acc.totalTokens += Number(usage?.totalTokens ?? usage?.total_tokens ?? 0) || 0;
    acc.cost += Number(usage?.cost ?? usage?.total_cost ?? 0) || 0;
    acc.calls += 1;
    return acc;
  }, { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, calls: 0 });
  if (!total.totalTokens) total.totalTokens = total.promptTokens + total.completionTokens;
  total.cost = Math.round(total.cost * 1e6) / 1e6;
  return total.calls ? total : null;
}

export function calculateFinalReport({ session, grading }) {
  const objective = scoreAllObjective(session.responses);
  const writingMap = evaluationMap(grading?.writing);
  const speakingMap = evaluationMap(grading?.speaking);
  const readingItems = objective.filter((item) => item.skills.includes('reading'));
  const listeningItems = objective.filter((item) => item.skills.includes('listening'));
  const readingRaw = average(readingItems, (item) => item.score * 100);
  const listeningObjectiveRaw = average(listeningItems, (item) => item.score * 100);

  const writingRecords = session.responses.filter((record) => ['write-photo', 'interactive-writing', 'interactive-listening', 'writing-sample'].includes(record.question.type));
  const writingScores = [];
  for (const record of writingRecords) {
    if (record.question.type === 'interactive-writing') {
      const first = writingMap.get(`${record.question.id}:initial`);
      const followup = writingMap.get(`${record.question.id}:followup`);
      if (first) writingScores.push([first.overall, 1.2]);
      if (followup) writingScores.push([followup.overall, 0.8]);
    } else if (record.question.type === 'interactive-listening') {
      const item = writingMap.get(`${record.question.id}:summary`);
      if (item) writingScores.push([item.overall, 0.8]);
    } else {
      const item = writingMap.get(record.question.id);
      if (item) writingScores.push([item.overall, record.question.type === 'writing-sample' ? 1.4 : 0.7]);
    }
  }
  const writingRaw = weightedAverage(writingScores);

  const speakingRecords = session.responses.filter((record) => ['speak-photo', 'read-then-speak', 'interactive-speaking', 'speaking-sample'].includes(record.question.type));
  const speakingScores = [];
  for (const record of speakingRecords) {
    if (record.question.type === 'interactive-speaking') {
      (record.answer?.responses || []).forEach((response, index) => {
        const item = speakingMap.get(`${record.question.id}:${index + 1}`);
        if (item) speakingScores.push([item.overall, 0.55]);
      });
    } else {
      const item = speakingMap.get(record.question.id);
      if (item) speakingScores.push([item.overall, record.question.type === 'speaking-sample' ? 1.4 : 1]);
    }
  }
  const speakingRaw = weightedAverage(speakingScores);

  const summaryListeningScores = session.responses
    .filter((record) => record.question.type === 'interactive-listening')
    .map((record) => writingMap.get(`${record.question.id}:summary`))
    .filter(Boolean)
    .map((item) => item.content);
  const listeningRaw = weightedAverage([
    [listeningObjectiveRaw, 0.88],
    [average(summaryListeningScores), summaryListeningScores.length ? 0.12 : 0]
  ]);

  const individual = {
    reading: readingItems.length ? rawToDet(readingRaw) : null,
    writing: writingScores.length ? rawToDet(writingRaw) : null,
    listening: (listeningItems.length || summaryListeningScores.length) ? rawToDet(listeningRaw) : null,
    speaking: speakingScores.length ? rawToDet(speakingRaw) : null
  };
  const assessedEntries = Object.entries(individual).filter(([, score]) => Number.isFinite(score));
  const assessedSkills = assessedEntries.map(([skill]) => skill);
  const isPartial = assessedEntries.length < 4;
  const overall = assessedEntries.length
    ? Math.round(average(assessedEntries.map(([, score]) => score)) / 5) * 5
    : 10;
  const combine = (left, right) => Number.isFinite(left) && Number.isFinite(right)
    ? Math.round(((left + right) / 2) / 5) * 5
    : null;
  const integrated = {
    literacy: combine(individual.reading, individual.writing),
    comprehension: combine(individual.reading, individual.listening),
    conversation: combine(individual.speaking, individual.listening),
    production: combine(individual.speaking, individual.writing)
  };
  const relevantAiSources = [];
  if (writingScores.length) relevantAiSources.push(grading?.writing?.source === 'openrouter');
  if (speakingScores.length) relevantAiSources.push(grading?.speaking?.source === 'openrouter');
  const aiConfidence = relevantAiSources.length > 0 && relevantAiSources.every(Boolean);
  const sufficient = isPartial
    ? (readingItems.length >= 8 || writingScores.length + speakingScores.length >= 4)
    : readingItems.length >= 12 && listeningItems.length >= 8 && writingScores.length >= 3 && speakingScores.length >= 3;
  const margin = aiConfidence && sufficient ? 5 : 10;
  const range = [Math.max(10, overall - margin), Math.min(160, overall + margin)];

  const byType = {};
  for (const item of objective) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type].push(item.score * 100);
  }
  const typeScores = Object.fromEntries(Object.entries(byType).map(([type, values]) => [type, Math.round(average(values))]));
  const target = Number(session.target || 130);
  const weakestSkills = assessedEntries.sort((a, b) => a[1] - b[1]);
  const recommendations = createRecommendations({ individual, typeScores, grading, target });

  return {
    id: session.id,
    createdAt: new Date().toISOString(),
    mode: session.mode,
    practiceType: String(session.mode || '').startsWith('practice:') ? String(session.mode).slice('practice:'.length) : null,
    source: session.packSource,
    target,
    isPartial,
    assessedSkills,
    overall,
    range,
    cefr: cefrForScore(overall),
    individual,
    integrated,
    raw: { reading: readingRaw, writing: writingRaw, listening: listeningRaw, speaking: speakingRaw },
    objective,
    typeScores,
    weakestSkills,
    recommendations,
    grading,
    responses: session.responses,
    elapsedSec: Math.round((Date.now() - session.startedAt) / 1000),
    abilityEnd: session.ability,
    model: grading?.model || session.model || null,
    apiUsage: aggregateApiUsage(session, grading),
    notices: [...(session.notices || []), ...(grading?.notices || [])]
  };
}

export function buildScoringPayload(session) {
  const writing = [];
  const speaking = [];
  for (const record of session.responses) {
    const question = record.question;
    if (question.type === 'write-photo') {
      writing.push({
        id: question.id, type: 'write-photo', prompt: 'Describe the image in detail.', response: record.answer,
        reference: question.image.referenceDescription, requiredPoints: question.image.keyDetails, timeLimitSec: 60
      });
    }
    if (question.type === 'interactive-writing') {
      writing.push({ id: `${question.id}:initial`, type: 'interactive-writing-initial', prompt: question.prompt, response: record.answer?.initial || '', timeLimitSec: 300 });
      writing.push({ id: `${question.id}:followup`, type: 'interactive-writing-followup', prompt: record.answer?.followupPrompt || question.followup, response: record.answer?.followup || '', timeLimitSec: 180 });
    }
    if (question.type === 'interactive-listening') {
      writing.push({
        id: `${question.id}:summary`, type: 'conversation-summary', prompt: 'Summarize the conversation: who spoke, what the issue was, and the outcome.',
        response: record.answer?.summary || '', requiredPoints: question.summaryMustMention, timeLimitSec: 75
      });
    }
    if (question.type === 'writing-sample') {
      writing.push({ id: question.id, type: 'writing-sample', prompt: question.prompt, response: record.answer || '', timeLimitSec: 300 });
    }
    if (['speak-photo', 'read-then-speak', 'speaking-sample'].includes(question.type)) {
      const speech = record.answer || {};
      speaking.push({
        id: question.id,
        type: question.type,
        prompt: question.type === 'speak-photo' ? 'Describe the image in detail.' : question.prompt,
        reference: question.type === 'speak-photo' ? question.image.referenceDescription : undefined,
        transcript: speech.transcript || '', durationSec: speech.durationSec || 0, wordCount: speech.wordCount || 0,
        wordsPerMinute: speech.wordsPerMinute || 0, fillerCount: speech.fillerCount || 0,
        longPauseCount: speech.longPauseCount || 0, transcriptionSource: speech.transcriptionSource || 'unknown'
      });
    }
    if (question.type === 'interactive-speaking') {
      (record.answer?.responses || []).forEach((speech, index) => {
        speaking.push({
          id: `${question.id}:${index + 1}`, type: 'interactive-speaking', prompt: speech.question,
          transcript: speech.transcript || '', durationSec: speech.durationSec || 0, wordCount: speech.wordCount || 0,
          wordsPerMinute: speech.wordsPerMinute || 0, fillerCount: speech.fillerCount || 0,
          longPauseCount: speech.longPauseCount || 0, transcriptionSource: speech.transcriptionSource || 'unknown'
        });
      });
    }
  }
  return { writing, speaking };
}

function createRecommendations({ individual, typeScores, grading, target }) {
  const result = [];
  const weakest = Object.entries(individual).filter(([, score]) => Number.isFinite(score)).sort((a, b) => a[1] - b[1]);
  const [weakSkill, weakScore] = weakest[0] || [null, target];
  if ((typeScores['fill-blank'] ?? 100) < 78) {
    result.push({
      title: 'Make word completion automatic',
      detail: 'Practise word families, suffixes, collocations, and spelling under a 20-second limit. Read the whole sentence before completing the word.',
      area: 'Fill in the Blanks', priority: 1
    });
  }
  if ((typeScores['read-complete'] ?? 100) < 75) {
    result.push({
      title: 'Use passage-level context',
      detail: 'Complete obvious grammar words first, then revisit difficult content words. Finish by reading the entire passage naturally.',
      area: 'Read and Complete', priority: 1
    });
  }
  if (Number.isFinite(individual.writing) && (weakSkill === 'writing' || individual.writing < target)) {
    result.push({
      title: 'Develop one clear example',
      detail: 'Use direct answer → reason → specific example → implication → conclusion. Reserve the final seconds for grammar and spelling.',
      area: 'Writing', priority: weakScore < 120 ? 1 : 2
    });
  }
  if (Number.isFinite(individual.speaking) && (weakSkill === 'speaking' || individual.speaking < target)) {
    result.push({
      title: 'Build 90-second speaking control',
      detail: 'Use point → reason → example → result → conclusion. Replace “um” and repeated restarts with short silent pauses.',
      area: 'Speaking', priority: weakScore < 120 ? 1 : 2
    });
  }
  if (Number.isFinite(individual.listening) && individual.listening < target) {
    result.push({
      title: 'Strengthen exact listening',
      detail: 'Practise short dictations, function words, endings, and clause boundaries. On replay, compare what you wrote instead of restarting.',
      area: 'Listening', priority: 2
    });
  }
  const aiAdvice = [...(grading?.writing?.globalAdvice || []), ...(grading?.speaking?.globalAdvice || [])];
  for (const advice of aiAdvice.slice(0, 2)) result.push({ title: 'AI examiner note', detail: advice, area: 'Personal feedback', priority: 3 });
  return result.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function typeLabel(type) {
  const labels = {
    'read-select': 'Read and Select',
    'fill-blank': 'Fill in the Blanks',
    'read-complete': 'Read and Complete',
    'listen-type': 'Listen and Type',
    'interactive-reading': 'Interactive Reading',
    'complete-sentences': 'Complete the Sentences',
    'complete-passage': 'Complete the Passage',
    'highlight-answer': 'Highlight the Answer',
    'identify-idea': 'Identify the Idea',
    'title-passage': 'Title the Passage',
    'interactive-listening': 'Interactive Listening',
    'listen-complete': 'Listen and Complete',
    'listen-respond': 'Listen and Respond',
    'write-photo': 'Write About the Photo',
    'interactive-writing': 'Interactive Writing',
    'speak-photo': 'Speak About the Photo',
    'read-then-speak': 'Read, Then Speak',
    'interactive-speaking': 'Interactive Speaking',
    'writing-sample': 'Writing Sample',
    'speaking-sample': 'Speaking Sample'
  };
  return labels[type] || String(type || 'Question');
}
