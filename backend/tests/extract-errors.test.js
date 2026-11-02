import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyGeminiError, normalizeExtract, pingGemini } from '../src/services/extract.js';

test('503 high demand is MODEL_OVERLOADED and retryable', () => {
  const err = new Error(
    '[503 Service Unavailable] This model is currently experiencing high demand.',
  );
  err.status = 503;
  const classified = classifyGeminiError(err, 'gemini-flash-latest');
  assert.equal(classified.code, 'MODEL_OVERLOADED');
  assert.equal(classified.retryable, true);
});

test('429 quota is RATE_LIMIT and retryable', () => {
  const err = new Error('[429] quota exceeded');
  err.status = 429;
  const classified = classifyGeminiError(err, 'gemini-flash-latest');
  assert.equal(classified.code, 'RATE_LIMIT');
  assert.equal(classified.retryable, true);
});

test('nested Gemini field objects unwrap to strings', () => {
  const fields = normalizeExtract({
    vendor: {
      value: { value: 'Northline Supplies', confidence: 0.9, sourceSnippet: 'Northline' },
      confidence: 0.9,
      sourceSnippet: { value: 'Northline Supplies', confidence: 1, sourceSnippet: '' },
    },
  });
  assert.equal(fields.vendor.value, 'Northline Supplies');
  assert.equal(fields.vendor.sourceSnippet, 'Northline Supplies');
});

test('timeout keeps TIMEOUT and is not retryable', () => {
  const err = new Error('Gemini timed out');
  err.code = 'TIMEOUT';
  const classified = classifyGeminiError(err, 'gemini-flash-latest');
  assert.equal(classified.code, 'TIMEOUT');
  assert.equal(Boolean(classified.retryable), false);
});

test('pingGemini without a key is NO_API_KEY', async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await pingGemini();
    assert.fail('expected pingGemini to throw');
  } catch (err) {
    assert.equal(err.code, 'NO_API_KEY');
  } finally {
    if (previous == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});
