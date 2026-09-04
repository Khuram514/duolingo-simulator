import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createFallbackPack, FALLBACK_COUNTS } from '../server/fallback-pack.mjs';
import { assemblePack } from '../server/pack-builder.mjs';

function assertIndex(index, options, label) {
  assert.ok(Number.isInteger(index), `${label} answer index must be an integer`);
  assert.ok(index >= 0 && index < options.length, `${label} answer index must select an option`);
}

test('verified fallback pack contains every simulator family and valid keys', () => {
  const pack = createFallbackPack({ seed: 'unit-pack', target: 130 });
  assert.equal(pack.source, 'fallback');
  assert.equal(pack.adaptive.readSelect.length, FALLBACK_COUNTS.readSelect);
  assert.equal(pack.adaptive.fillBlanks.length, FALLBACK_COUNTS.fillBlanks);
  assert.equal(pack.adaptive.readComplete.length, FALLBACK_COUNTS.readComplete);
  assert.equal(pack.adaptive.listenType.length, FALLBACK_COUNTS.listenType);
  assert.equal(pack.interactiveReading.length, 2);
  assert.equal(pack.interactiveListening.length, 2);
  assert.equal(pack.openResponses.writePhotos.length, 3);

  for (const item of pack.adaptive.fillBlanks) {
    assert.ok(item.answer.startsWith(item.prefix));
    assert.ok(item.answer.length > item.prefix.length);
  }
  for (const passage of pack.adaptive.readComplete) {
    const blanks = passage.segments.filter((segment) => segment.answer);
    assert.ok(blanks.length >= 4);
    blanks.forEach((segment) => assert.ok(segment.answer.startsWith(segment.prefix)));
  }
  for (const item of pack.interactiveReading) {
    assert.equal(item.completeSentences.length, 5);
    item.completeSentences.forEach((question) => assert.ok(question.options.includes(question.answer)));
    assertIndex(item.completePassage.answerIndex, item.completePassage.options, 'complete passage');
    assert.equal(item.highlight.length, 2);
    item.highlight.forEach((question) => {
      assert.ok(question.acceptedAnswers.some((answer) => item.passage.toLowerCase().includes(answer.toLowerCase())), 'At least one accepted highlight must be selectable verbatim');
    });
    assertIndex(item.identifyIdea.answerIndex, item.identifyIdea.options, 'main idea');
    assertIndex(item.titleQuestion.answerIndex, item.titleQuestion.options, 'title');
  }
  for (const item of pack.interactiveListening) {
    assert.ok(item.scenario.blanks.length >= 3 && item.scenario.blanks.length <= 4);
    assert.ok(item.turns.length >= 5 && item.turns.length <= 6);
    item.turns.forEach((turn) => assertIndex(turn.answerIndex, turn.options, 'listening response'));
    assert.ok(item.summaryMustMention.length >= 3);
  }

  const imageQuestions = [...pack.openResponses.writePhotos, pack.openResponses.speakPhoto];
  for (const question of imageQuestions) {
    const fullPath = path.join(process.cwd(), 'public', question.image.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(fullPath), `Missing image ${fullPath}`);
    assert.ok(question.image.referenceDescription.length > 60);
    assert.ok(question.image.keyDetails.length >= 4);
  }
});

test('invalid AI generations safely assemble into a complete fallback or hybrid pack', () => {
  const pack = assemblePack({ seed: 'invalid-ai', target: 135, generated: { lexical: { readSelect: [{ word: 'x' }] } }, errors: ['test failure'] });
  assert.ok(['fallback', 'hybrid'].includes(pack.source));
  assert.equal(pack.adaptive.readSelect.length, FALLBACK_COUNTS.readSelect);
  assert.equal(pack.adaptive.fillBlanks.length, FALLBACK_COUNTS.fillBlanks);
  assert.equal(pack.interactiveReading.length, 2);
  assert.equal(pack.interactiveListening.length, 2);
  assert.equal(pack.openResponses.writePhotos.length, 3);
  assert.ok(pack.notices.length > 0);
});
