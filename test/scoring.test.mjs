import test from 'node:test';
import assert from 'node:assert/strict';
import { createFallbackPack } from '../server/fallback-pack.mjs';
import { localWritingEvaluation, localSpeakingEvaluation } from '../server/scoring.mjs';
import {
  buildScoringPayload,
  calculateFinalReport,
  createSessionBlueprint,
  scoreObjectiveResponse
} from '../public/js/scoring.js';

function perfectRecord(question) {
  switch (question.type) {
    case 'read-select': return { question, answer: question.isReal, timeUsedSec: 1 };
    case 'fill-blank': return { question, answer: question.answer, timeUsedSec: 4 };
    case 'read-complete': return { question, answer: question.segments.filter((segment) => segment.answer).map((segment) => segment.answer), timeUsedSec: 30 };
    case 'listen-type': return { question, answer: question.text, timeUsedSec: 20 };
    case 'interactive-reading':
      return {
        question,
        answer: {
          completeSentences: Object.fromEntries(question.completeSentences.map((item) => [item.id, item.answer])),
          completePassage: question.completePassage.answerIndex,
          highlight: Object.fromEntries(question.highlight.map((item) => [item.id, item.acceptedAnswers[0]])),
          identifyIdea: question.identifyIdea.answerIndex,
          titleQuestion: question.titleQuestion.answerIndex
        },
        timeUsedSec: 180
      };
    case 'interactive-listening':
      return {
        question,
        answer: {
          blanks: Object.fromEntries(question.scenario.blanks.map((item) => [item.id, item.acceptedAnswers[0]])),
          turns: Object.fromEntries(question.turns.map((item) => [item.id, item.answerIndex])),
          summary: 'I spoke with the staff member, explained the issue and requirements, and agreed on the recommended next step.'
        },
        timeUsedSec: 200
      };
    default: throw new Error(`No perfect answer for ${question.type}`);
  }
}

const strongWriting = 'I support this position because it combines specialist knowledge with broader practical judgment. First, students often face problems that cannot be solved within one discipline. For example, a software engineer who studies psychology can design technology that is easier and safer for people to use. A limited outside-subject requirement would therefore strengthen rather than replace the main degree. Although extra modules may add pressure, universities can reduce this problem by offering a carefully chosen list of relevant courses. Overall, the policy would produce adaptable graduates while preserving deep subject expertise.';
const strongSpeech = 'In my view, the most effective approach is to begin with a clear goal and then practise in realistic conditions. For example, when I was learning public speaking, I recorded short presentations, listened for unclear sections, and repeated them with fewer notes. This method helped me improve both confidence and organization. It also taught me that steady practice is more useful than memorizing a perfect script. Overall, a difficult skill becomes manageable when progress is divided into specific steps.';

function speechAnswer(questionText = '') {
  return {
    question: questionText,
    transcript: strongSpeech,
    durationSec: 45,
    wordCount: strongSpeech.split(/\s+/).length,
    wordsPerMinute: 128,
    fillerCount: 0,
    longPauseCount: 1,
    transcriptionSource: 'test'
  };
}

test('every objective family awards full credit for exact answers', () => {
  const pack = createFallbackPack({ seed: 'perfect', target: 130 });
  const questions = [
    pack.adaptive.readSelect[0],
    pack.adaptive.fillBlanks[0],
    pack.adaptive.readComplete[0],
    pack.adaptive.listenType[0],
    pack.interactiveReading[0],
    pack.interactiveListening[0]
  ];
  for (const question of questions) {
    const details = scoreObjectiveResponse(perfectRecord(question));
    assert.ok(details.length > 0);
    assert.ok(details.every((detail) => detail.score === 1), `${question.type} did not receive full credit`);
  }
});

test('session blueprints include all required full-test production and interactive tasks', () => {
  const pack = createFallbackPack({ seed: 'blueprint', target: 130 });
  const blueprint = createSessionBlueprint(pack, 'full');
  const fixedTypes = blueprint.filter((step) => step.question).map((step) => step.question.type);
  assert.equal(fixedTypes.filter((type) => type === 'interactive-reading').length, 2);
  assert.equal(fixedTypes.filter((type) => type === 'interactive-listening').length, 2);
  assert.equal(fixedTypes.filter((type) => type === 'write-photo').length, 3);
  for (const type of ['interactive-writing', 'speak-photo', 'read-then-speak', 'interactive-speaking', 'writing-sample', 'speaking-sample']) {
    assert.ok(fixedTypes.includes(type), `Blueprint missing ${type}`);
  }
  const adaptive = blueprint.filter((step) => !step.question).reduce((map, step) => map.set(step.kind, (map.get(step.kind) || 0) + 1), new Map());
  assert.ok(adaptive.get('read-select') >= 15 && adaptive.get('read-select') <= 18);
  assert.ok(adaptive.get('fill-blank') >= 6 && adaptive.get('fill-blank') <= 9);
  assert.ok(adaptive.get('read-complete') >= 3 && adaptive.get('read-complete') <= 6);
  assert.ok(adaptive.get('listen-type') >= 6 && adaptive.get('listen-type') <= 9);
});

test('focus sessions report only assessed skills instead of artificial minimum scores', () => {
  const pack = createFallbackPack({ seed: 'partial', target: 130 });
  const responses = [
    ...pack.adaptive.fillBlanks.slice(0, 6).map(perfectRecord),
    ...pack.adaptive.readComplete.slice(0, 2).map(perfectRecord)
  ];
  const session = { id: 'partial', mode: 'blanks', target: 130, packSource: 'fallback', responses, startedAt: Date.now() - 1000, ability: 4, notices: [] };
  const report = calculateFinalReport({ session, grading: { writing: { items: [] }, speaking: { items: [] } } });
  assert.equal(report.isPartial, true);
  assert.deepEqual(report.assessedSkills, ['reading']);
  assert.equal(report.individual.reading, 160);
  assert.equal(report.individual.writing, null);
  assert.equal(report.individual.listening, null);
  assert.equal(report.individual.speaking, null);
  assert.equal(report.overall, 160);
});

test('balanced session integrates objective and open-response evidence into four subscores', () => {
  const pack = createFallbackPack({ seed: 'balanced', target: 130 });
  const responses = [
    ...pack.adaptive.readSelect.slice(0, 15).map(perfectRecord),
    ...pack.adaptive.fillBlanks.slice(0, 6).map(perfectRecord),
    ...pack.adaptive.readComplete.slice(0, 3).map(perfectRecord),
    ...pack.adaptive.listenType.slice(0, 6).map(perfectRecord),
    ...pack.interactiveReading.map(perfectRecord),
    ...pack.interactiveListening.map(perfectRecord),
    ...pack.openResponses.writePhotos.map((question) => ({ question, answer: strongWriting, timeUsedSec: 50 })),
    { question: pack.openResponses.interactiveWriting, answer: { initial: strongWriting, followup: strongWriting, followupPrompt: pack.openResponses.interactiveWriting.followup }, timeUsedSec: 420 },
    { question: pack.openResponses.speakPhoto, answer: speechAnswer(), timeUsedSec: 60 },
    { question: pack.openResponses.readThenSpeak, answer: speechAnswer(), timeUsedSec: 60 },
    { question: pack.openResponses.interactiveSpeaking, answer: { responses: pack.openResponses.interactiveSpeaking.questions.slice(0, 6).map(speechAnswer) }, timeUsedSec: 210 },
    { question: pack.openResponses.writingSample, answer: strongWriting, timeUsedSec: 260 },
    { question: pack.openResponses.speakingSample, answer: speechAnswer(), timeUsedSec: 150 }
  ];
  const session = { id: 'balanced', mode: 'full', target: 130, packSource: 'fallback', responses, startedAt: Date.now() - 1000, ability: 5, notices: [] };
  const payload = buildScoringPayload(session);
  const grading = {
    writing: localWritingEvaluation(payload.writing),
    speaking: localSpeakingEvaluation(payload.speaking),
    notices: []
  };
  const report = calculateFinalReport({ session, grading });
  assert.equal(report.isPartial, false);
  assert.deepEqual(report.assessedSkills.sort(), ['listening', 'reading', 'speaking', 'writing']);
  Object.values(report.individual).forEach((score) => assert.ok(score >= 10 && score <= 160));
  Object.values(report.integrated).forEach((score) => assert.ok(score >= 10 && score <= 160));
  assert.ok(report.overall >= 100 && report.overall <= 160);
  assert.ok(report.recommendations.length > 0);
});
