import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFallbackPack } from '../server/fallback-pack.mjs';
import { createSessionBlueprint } from '../public/js/scoring.js';

const practiceTypes = [
  'read-select',
  'fill-blank',
  'read-complete',
  'listen-type',
  'write-photo',
  'speak-photo',
  'read-then-speak',
  'interactive-reading',
  'interactive-listening',
  'writing-sample',
  'speaking-sample',
  'interactive-writing',
  'interactive-speaking'
];

test('every practice card creates a runnable focused blueprint', () => {
  const pack = createFallbackPack({ seed: 'practice-blueprints', target: 130 });
  for (const type of practiceTypes) {
    const blueprint = createSessionBlueprint(pack, `practice:${type}`);
    assert.ok(blueprint.length > 0, `${type} produced an empty blueprint`);
    for (const step of blueprint) {
      const actualType = step.question?.type || step.kind;
      assert.equal(actualType, type, `${type} practice included ${actualType}`);
    }
  }
});

test('rapid practice rounds use the intended item counts', () => {
  const pack = createFallbackPack({ seed: 'practice-counts', target: 130 });
  assert.equal(createSessionBlueprint(pack, 'practice:read-select').length, 10);
  assert.equal(createSessionBlueprint(pack, 'practice:fill-blank').length, 6);
  assert.equal(createSessionBlueprint(pack, 'practice:read-complete').length, 1);
  assert.equal(createSessionBlueprint(pack, 'practice:listen-type').length, 4);
});

test('photo and read-then-speak practice provide a one-minute response window', () => {
  const pack = createFallbackPack({ seed: 'practice-speaking-time', target: 130 });
  for (const type of ['speak-photo', 'read-then-speak']) {
    const [step] = createSessionBlueprint(pack, `practice:${type}`);
    assert.equal(step.question.recordDurationSec, 60);
  }
});

test('character boxes and natural voice hooks are present in the browser build', () => {
  const renderers = fs.readFileSync(new URL('../public/js/renderers.js', import.meta.url), 'utf8');
  const audio = fs.readFileSync(new URL('../public/js/audio.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(renderers, /characterBoxesMarkup/);
  assert.match(renderers, /REPLAYS LEFT: 2/);
  assert.match(audio, /synthesizeSpeech/);
  assert.match(server, /\/api\/speech/);
});
