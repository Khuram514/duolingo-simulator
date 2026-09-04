import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { IMAGE_CATALOG, createFallbackPack } from '../server/fallback-pack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('photo catalog contains local realistic WebP assets with grading metadata', () => {
  assert.equal(IMAGE_CATALOG.length, 9);
  for (const image of IMAGE_CATALOG) {
    assert.match(image.url, /^\/images\/photos\/[a-z0-9-]+\.webp$/);
    assert.ok(image.alt.length >= 35);
    assert.ok(image.credit.length >= 5);
    assert.ok(image.referenceDescription.length >= 80);
    assert.ok(image.keyDetails.length >= 5);
    const diskPath = path.join(root, 'public', image.url.replace(/^\//, ''));
    assert.ok(statSync(diskPath).size > 10_000, `${image.id} should be a usable raster photo`);
  }
  const pack = createFallbackPack({ seed: 'photo-validation' });
  const images = [...pack.openResponses.writePhotos.map((item) => item.image), pack.openResponses.speakPhoto.image];
  assert.ok(images.every((image) => image.url.endsWith('.webp')));
});

test('unified back navigation and credited photo rendering are included in the browser build', () => {
  const app = readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
  const renderers = readFileSync(path.join(root, 'public/js/renderers.js'), 'utf8');
  assert.match(app, /function unifiedTopbar/);
  assert.match(app, /id="test-back"/);
  assert.match(app, /backId: 'practice-back'/);
  assert.match(app, /backId: 'generation-back'/);
  assert.match(app, /generationId/);
  assert.match(renderers, /function photoFigure/);
  assert.match(renderers, /<figcaption>/);
  assert.doesNotMatch(renderers, /park-picnic\.svg/);
});
