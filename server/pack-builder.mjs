import crypto from 'node:crypto';
import { createFallbackPack, IMAGE_CATALOG, seededRandom, shuffle } from './fallback-pack.mjs';

const text = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
const integer = (value, fallback, min = 0, max = 99999) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const array = (value) => (Array.isArray(value) ? value : []);

function uniqueId(prefix, value, index) {
  const safe = text(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
  return safe || `${prefix}-${index + 1}`;
}

function normalizeReadSelect(items) {
  return array(items)
    .map((item, index) => ({
      id: uniqueId('ai-rs', item?.id, index),
      type: 'read-select',
      word: text(item?.word),
      isReal: item?.isReal === true,
      difficulty: integer(item?.difficulty, 3, 1, 5),
      explanation: text(item?.explanation, item?.isReal ? 'This is a valid English word.' : 'This is not a valid standard English word.')
    }))
    .filter((item) => /^[a-zA-Z-]{3,24}$/.test(item.word));
}

function normalizeFillBlanks(items) {
  return array(items)
    .map((item, index) => {
      const answer = text(item?.answer).toLowerCase();
      let prefix = text(item?.prefix).toLowerCase();
      if (!answer.startsWith(prefix) || prefix.length >= answer.length) prefix = answer.slice(0, Math.max(2, Math.floor(answer.length / 2)));
      return {
        id: uniqueId('ai-fb', item?.id, index),
        type: 'fill-blank',
        difficulty: integer(item?.difficulty, 3, 1, 5),
        sentenceBefore: text(item?.sentenceBefore),
        prefix,
        answer,
        sentenceAfter: text(item?.sentenceAfter),
        explanation: text(item?.explanation, `The completed word is “${answer}.”`)
      };
    })
    .filter((item) => item.answer.length >= 4 && item.prefix.length >= 2 && item.sentenceBefore.length + item.sentenceAfter.length >= 20);
}

function normalizeSegments(segments) {
  return array(segments)
    .map((segment) => {
      if (typeof segment?.text === 'string') return { text: segment.text };
      const answer = text(segment?.answer).toLowerCase();
      let prefix = text(segment?.prefix).toLowerCase();
      if (!answer.startsWith(prefix) || prefix.length >= answer.length) prefix = answer.slice(0, Math.max(2, Math.floor(answer.length / 2)));
      if (!answer || !prefix) return null;
      return { prefix, answer };
    })
    .filter(Boolean);
}

function normalizeReadComplete(items) {
  return array(items)
    .map((item, index) => ({
      id: uniqueId('ai-rc', item?.id, index),
      type: 'read-complete',
      difficulty: integer(item?.difficulty, 3, 1, 5),
      title: text(item?.title, `Reading passage ${index + 1}`),
      segments: normalizeSegments(item?.segments)
    }))
    .filter((item) => item.segments.filter((segment) => segment.answer).length >= 4 && item.segments.some((segment) => segment.text));
}

function normalizeListenType(items) {
  return array(items)
    .map((item, index) => ({
      id: uniqueId('ai-lt', item?.id, index),
      type: 'listen-type',
      text: text(item?.text),
      difficulty: integer(item?.difficulty, 3, 1, 5)
    }))
    .filter((item) => item.text.split(/\s+/).length >= 5 && item.text.split(/\s+/).length <= 25);
}

function normalizeOptions(value, minimum = 4) {
  const options = array(value).map((option) => text(option)).filter(Boolean);
  return options.length >= minimum ? options.slice(0, Math.max(minimum, 6)) : [];
}

function normalizeInteractiveReading(items) {
  return array(items)
    .map((item, index) => {
      const passage = text(item?.passage);
      const completeSentences = array(item?.completeSentences)
        .map((question, qIndex) => {
          const options = normalizeOptions(question?.options, 4).slice(0, 4);
          const answer = text(question?.answer);
          return {
            id: uniqueId(`ai-ir${index + 1}-cs`, question?.id, qIndex),
            before: text(question?.before),
            after: text(question?.after),
            options,
            answer
          };
        })
        .filter((question) => question.options.includes(question.answer) && question.before && question.after)
        .slice(0, 5);

      const cpOptions = normalizeOptions(item?.completePassage?.options, 4).slice(0, 4);
      const cpAnswer = integer(item?.completePassage?.answerIndex, 0, 0, Math.max(0, cpOptions.length - 1));
      const highlight = array(item?.highlight)
        .map((question, qIndex) => ({
          id: uniqueId(`ai-ir${index + 1}-h`, question?.id, qIndex),
          question: text(question?.question),
          acceptedAnswers: array(question?.acceptedAnswers).map((answer) => text(answer)).filter((answer) => answer && passage.toLowerCase().includes(answer.toLowerCase()))
        }))
        .filter((question) => question.question && question.acceptedAnswers.length)
        .slice(0, 2);
      const ideaOptions = normalizeOptions(item?.identifyIdea?.options, 4).slice(0, 4);
      const titleOptions = normalizeOptions(item?.titleQuestion?.options, 4).slice(0, 4);

      return {
        id: uniqueId('ai-ir', item?.id, index),
        type: 'interactive-reading',
        durationSec: index === 0 ? 420 : 480,
        difficulty: integer(item?.difficulty, index === 0 ? 3 : 4, 1, 5),
        title: text(item?.title, `Interactive reading ${index + 1}`),
        passage,
        completeSentences,
        completePassage: {
          id: uniqueId(`ai-ir${index + 1}-cp`, item?.completePassage?.id, 0),
          before: text(item?.completePassage?.before),
          after: text(item?.completePassage?.after),
          options: cpOptions,
          answerIndex: cpAnswer
        },
        highlight,
        identifyIdea: {
          id: uniqueId(`ai-ir${index + 1}-idea`, item?.identifyIdea?.id, 0),
          options: ideaOptions,
          answerIndex: integer(item?.identifyIdea?.answerIndex, 0, 0, Math.max(0, ideaOptions.length - 1))
        },
        titleQuestion: {
          id: uniqueId(`ai-ir${index + 1}-title`, item?.titleQuestion?.id, 0),
          options: titleOptions,
          answerIndex: integer(item?.titleQuestion?.answerIndex, 0, 0, Math.max(0, titleOptions.length - 1))
        }
      };
    })
    .filter((item) =>
      item.passage.length >= 500 &&
      item.completeSentences.length === 5 &&
      item.completePassage.options.length === 4 &&
      item.highlight.length === 2 &&
      item.identifyIdea.options.length === 4 &&
      item.titleQuestion.options.length === 4
    )
    .slice(0, 2);
}

function normalizeInteractiveListening(items) {
  return array(items)
    .map((item, index) => {
      const blanks = array(item?.scenario?.blanks)
        .map((question, qIndex) => ({
          id: uniqueId(`ai-il${index + 1}-lc`, question?.id, qIndex),
          before: text(question?.before),
          after: text(question?.after),
          acceptedAnswers: array(question?.acceptedAnswers).map((answer) => text(answer)).filter(Boolean).slice(0, 6)
        }))
        .filter((question) => question.before && question.acceptedAnswers.length)
        .slice(0, 4);
      const turns = array(item?.turns)
        .map((turn, tIndex) => {
          const options = normalizeOptions(turn?.options, 4).slice(0, 4);
          const answerIndex = integer(turn?.answerIndex, 0, 0, Math.max(0, options.length - 1));
          return {
            id: uniqueId(`ai-il${index + 1}-t`, turn?.id, tIndex),
            speaker: text(turn?.speaker, 'Speaker'),
            audioText: text(turn?.audioText),
            options,
            answerIndex,
            correctResponse: text(turn?.correctResponse, options[answerIndex] || '')
          };
        })
        .filter((turn) => turn.audioText && turn.options.length === 4 && turn.correctResponse)
        .slice(0, 5);
      return {
        id: uniqueId('ai-il', item?.id, index),
        type: 'interactive-listening',
        durationSec: 390,
        summaryDurationSec: 75,
        difficulty: integer(item?.difficulty, index === 0 ? 3 : 4, 1, 5),
        scenario: {
          text: text(item?.scenario?.text),
          blanks
        },
        turns,
        summaryMustMention: array(item?.summaryMustMention).map((point) => text(point)).filter(Boolean).slice(0, 6)
      };
    })
    .filter((item) => item.scenario.text.length >= 150 && item.scenario.blanks.length >= 3 && item.turns.length === 5 && item.summaryMustMention.length >= 3)
    .slice(0, 2);
}

function normalizeProduction(item, fallback) {
  const interactiveWriting = item?.interactiveWriting || {};
  const readThenSpeak = item?.readThenSpeak || {};
  const interactiveSpeaking = item?.interactiveSpeaking || {};
  const writingSample = item?.writingSample || {};
  const speakingSample = item?.speakingSample || {};
  return {
    interactiveWriting: {
      ...fallback.interactiveWriting,
      id: uniqueId('ai-iw', interactiveWriting.id, 0),
      prompt: text(interactiveWriting.prompt, fallback.interactiveWriting.prompt),
      followup: text(interactiveWriting.followup, fallback.interactiveWriting.followup)
    },
    readThenSpeak: {
      ...fallback.readThenSpeak,
      id: uniqueId('ai-rts', readThenSpeak.id, 0),
      prompt: text(readThenSpeak.prompt, fallback.readThenSpeak.prompt)
    },
    interactiveSpeaking: {
      ...fallback.interactiveSpeaking,
      id: uniqueId('ai-is', interactiveSpeaking.id, 0),
      persona: text(interactiveSpeaking.persona, fallback.interactiveSpeaking.persona),
      context: text(interactiveSpeaking.context, fallback.interactiveSpeaking.context),
      questions: array(interactiveSpeaking.questions).map((question) => text(question)).filter(Boolean).slice(0, 8)
    },
    writingSample: {
      ...fallback.writingSample,
      id: uniqueId('ai-ws', writingSample.id, 0),
      prompt: text(writingSample.prompt, fallback.writingSample.prompt)
    },
    speakingSample: {
      ...fallback.speakingSample,
      id: uniqueId('ai-ss', speakingSample.id, 0),
      prompt: text(speakingSample.prompt, fallback.speakingSample.prompt)
    }
  };
}

function takeOrFallback(generated, fallback, needed) {
  if (!Array.isArray(generated) || generated.length < needed) return fallback;
  return generated.slice(0, fallback.length);
}

export function assemblePack({ seed = crypto.randomUUID(), target = 130, generated = {}, errors = [] } = {}) {
  const fallback = createFallbackPack({ seed, target });
  const lexical = generated.lexical || {};
  const comprehension = generated.comprehension || {};
  const ir = generated.interactiveReading || {};
  const il = generated.interactiveListening || {};
  const production = generated.production || {};

  const normalized = {
    readSelect: normalizeReadSelect(lexical.readSelect),
    fillBlanks: normalizeFillBlanks(lexical.fillBlanks),
    readComplete: normalizeReadComplete(comprehension.readComplete),
    listenType: normalizeListenType(comprehension.listenType),
    interactiveReading: normalizeInteractiveReading(ir.interactiveReading),
    interactiveListening: normalizeInteractiveListening(il.interactiveListening)
  };

  const random = seededRandom(`${seed}-images`);
  const images = shuffle(IMAGE_CATALOG, random);
  const normalizedProduction = normalizeProduction(production, fallback.openResponses);
  normalizedProduction.writePhotos = images.slice(0, 3).map((image, index) => ({
    id: `ai-wp-${index + 1}`,
    type: 'write-photo',
    difficulty: 3 + (index % 2),
    image
  }));
  normalizedProduction.speakPhoto = {
    id: 'ai-sp-1',
    type: 'speak-photo',
    difficulty: 4,
    image: images[3]
  };

  if (normalizedProduction.interactiveSpeaking.questions.length < 6) {
    normalizedProduction.interactiveSpeaking.questions = fallback.openResponses.interactiveSpeaking.questions;
  }

  const aiSections = [
    normalized.readSelect.length >= 15,
    normalized.fillBlanks.length >= 6,
    normalized.readComplete.length >= 3,
    normalized.listenType.length >= 6,
    normalized.interactiveReading.length === 2,
    normalized.interactiveListening.length === 2,
    Boolean(production?.interactiveWriting?.prompt && production?.readThenSpeak?.prompt)
  ];
  const successfulSections = aiSections.filter(Boolean).length;
  const source = successfulSections === aiSections.length ? 'ai' : successfulSections > 0 ? 'hybrid' : 'fallback';
  const notices = [];
  if (source === 'hybrid') notices.push('Some AI batches were invalid or unavailable, so verified built-in items filled the gaps.');
  if (source === 'fallback') notices.push('The verified built-in question bank was used because AI generation was unavailable.');
  for (const error of errors.slice(0, 5)) notices.push(text(error));

  return {
    id: `test-${crypto.randomUUID()}`,
    seed: String(seed),
    source,
    generatedAt: new Date().toISOString(),
    target,
    notices,
    adaptive: {
      readSelect: takeOrFallback(normalized.readSelect, fallback.adaptive.readSelect, 15),
      fillBlanks: takeOrFallback(normalized.fillBlanks, fallback.adaptive.fillBlanks, 6),
      readComplete: takeOrFallback(normalized.readComplete, fallback.adaptive.readComplete, 3),
      listenType: takeOrFallback(normalized.listenType, fallback.adaptive.listenType, 6)
    },
    interactiveReading: normalized.interactiveReading.length === 2 ? normalized.interactiveReading : fallback.interactiveReading,
    interactiveListening: normalized.interactiveListening.length === 2 ? normalized.interactiveListening : fallback.interactiveListening,
    openResponses: normalizedProduction
  };
}
