// Unit tests for the deterministic parts of the review: no API calls, no key needed.
// Run from the project root: node --test test/guardrails.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGuardrails, extractJson, reviewScript } from '../src/core.js';
import { buildConfig } from '../src/config.js';

const modelPass = { status: 'pass', issues: [], rewritten_script: null, confidence: 0.95 };
const ambassador = (script, caption) => ({ script, caption, contentType: 'ambassador', productKind: 'supplement' });
const brand = (script, caption = '') => ({ script, caption, contentType: 'brand', productKind: 'supplement' });

test('disclosure: #adventure is not a disclosure', () => {
  const r = applyGuardrails(ambassador('Loving this blend.', 'Weekend #adventure'), modelPass);
  assert.equal(r.status, 'fix');
  assert.ok(r.issues.some((i) => i.rule === 'R6' && i.guardrail));
  assert.match(r.rewritten_script, /#ad$/);
});

test('disclosure: #ad, #AD., #sponsored, and "paid partnership" all count', () => {
  for (const caption of ['My routine #ad', 'My routine #AD.', 'My routine #sponsored', 'Paid partnership with the brand']) {
    const r = applyGuardrails(ambassador('Loving this blend.', caption), modelPass);
    assert.equal(r.status, 'pass', caption);
  }
});

test('disclosure: brand content does not need #ad', () => {
  const r = applyGuardrails(brand('Loving this blend.', 'Link in bio'), modelPass);
  assert.equal(r.status, 'pass');
});

test('clinical: pregnancy, dosing, side effects, and interactions escalate', () => {
  for (const script of [
    'Great to stay on while you are pregnant.',
    'Start with 0.25 milligrams once a week.',
    'Take 5 mg at night.',
    'Ask about your dose.',
    'Some people notice a side effect at first.',
    'No interaction with your other meds.',
  ]) {
    const r = applyGuardrails(brand(script), modelPass);
    assert.equal(r.status, 'escalate', script);
    assert.ok(r.issues.some((i) => i.rule === 'ESCALATE' && i.guardrail), script);
  }
});

test('guardrails only make a result stricter, never looser', () => {
  const clean = brand('Supports a healthy routine.');
  assert.equal(applyGuardrails(clean, { ...modelPass, status: 'fix', rewritten_script: 'x' }).status, 'fix');
  assert.equal(applyGuardrails(clean, { ...modelPass, status: 'escalate' }).status, 'escalate');
  assert.equal(applyGuardrails(clean, modelPass).status, 'pass');
});

test('extractJson: reads JSON wrapped in prose or code fences, rejects junk', () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"status":"pass"}\n```'), { status: 'pass' });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{"status": broken'), null);
});

// Fake the Anthropic API so routing and failure handling can be tested offline.
function fakeApi(byModel) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const { model } = JSON.parse(init.body);
    const reply = byModel[model];
    if (reply.status) return new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'rejected' } }), { status: reply.status });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: reply.text }], usage: { input_tokens: 100, output_tokens: 50 } }), { status: 200 });
  };
  return () => { globalThis.fetch = original; };
}

const config = buildConfig({ ANTHROPIC_API_KEY: 'test-key', CHEAP_MODEL: 'cheap-haiku', STRONG_MODEL: 'strong-sonnet' });
const json = (o) => ({ text: JSON.stringify(o) });

test('routing: unparseable Haiku output goes to Sonnet', async () => {
  const restore = fakeApi({ 'cheap-haiku': { text: 'not json' }, 'strong-sonnet': json(modelPass) });
  try {
    const r = await reviewScript(config, brand('Supports a healthy routine.'));
    assert.equal(r.routed_to_strong, true);
    assert.equal(r.model_used, 'strong-sonnet');
    assert.equal(r.status, 'pass');
  } finally { restore(); }
});

test('routing: confidence exactly at 0.75 stays on Haiku, below it goes to Sonnet', async () => {
  let restore = fakeApi({ 'cheap-haiku': json({ ...modelPass, confidence: 0.75 }), 'strong-sonnet': json(modelPass) });
  try { assert.equal((await reviewScript(config, brand('Supports a healthy routine.'))).model_used, 'cheap-haiku'); } finally { restore(); }
  restore = fakeApi({ 'cheap-haiku': json({ ...modelPass, confidence: 0.74 }), 'strong-sonnet': json(modelPass) });
  try { assert.equal((await reviewScript(config, brand('Supports a healthy routine.'))).model_used, 'strong-sonnet'); } finally { restore(); }
});

test('fails closed: if both models are rejected, the result is an escalation', async () => {
  const restore = fakeApi({ 'cheap-haiku': { status: 401 }, 'strong-sonnet': { status: 401 } });
  try {
    const r = await reviewScript(config, brand('Supports a healthy routine.'));
    assert.equal(r.status, 'escalate');
    assert.equal(r.model_used, 'system-fallback');
    assert.equal(r.confidence, 0);
    assert.ok(r.issues.some((i) => i.rule === 'SYSTEM'));
    assert.ok(r.zendesk_ticket);
  } finally { restore(); }
});
