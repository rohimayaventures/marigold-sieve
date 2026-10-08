// Core logic shared by the local runner (Node 18+) and the Cloudflare Worker.
// Zero dependencies: calls the Anthropic Messages API with fetch.

import { CONFIDENCE_THRESHOLD, costFor } from './config.js';
import { REVIEW_SYSTEM, reviewUserMessage, DRAFT_SYSTEM, draftUserMessage } from './prompts.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_RETRIES = 3;

export class ApiError extends Error {
  constructor(status, type, message, model) {
    super(message);
    this.status = status;
    this.type = type;
    this.model = model;
  }
  get modelNotFound() {
    return this.status === 404 || this.type === 'not_found_error';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One Messages API call with up to 3 retries (backoff) on 429, 5xx, and network errors.
export async function callClaude(config, { model, system, user, maxTokens = 1500, temperature = 0 }) {
  let includeTemperature = true;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] };
      if (includeTemperature) body.temperature = temperature;
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        return {
          text,
          model,
          inputTokens: data.usage?.input_tokens || 0,
          outputTokens: data.usage?.output_tokens || 0,
        };
      }
      let errType = 'api_error';
      let errMsg = `HTTP ${res.status}`;
      try {
        const e = await res.json();
        errType = e?.error?.type || errType;
        errMsg = e?.error?.message || errMsg;
      } catch {}
      // Some newer models reject the temperature parameter. Retry once without it.
      if (res.status === 400 && includeTemperature && /temperature/i.test(errMsg)) {
        includeTemperature = false;
        attempt--;
        continue;
      }
      lastErr = new ApiError(res.status, errType, errMsg, model);
      if (!RETRYABLE.has(res.status)) throw lastErr;
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10000)
        : 1000 * 2 ** attempt + Math.random() * 300;
      if (attempt < MAX_RETRIES) await sleep(wait);
    } catch (err) {
      if (err instanceof ApiError && !RETRYABLE.has(err.status)) throw err;
      lastErr = err instanceof ApiError ? err : new ApiError(0, 'network_error', String(err?.message || err), model);
      if (attempt < MAX_RETRIES) await sleep(1000 * 2 ** attempt + Math.random() * 300);
    }
  }
  throw lastErr;
}

// Pull the first JSON object out of model text (handles stray prose or code fences).
export function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeReview(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const status = String(obj.status || '').toLowerCase();
  if (!['pass', 'fix', 'escalate'].includes(status)) return null;
  if (!Array.isArray(obj.issues)) return null;
  const confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence)) return null;
  const issues = obj.issues.map((i) => ({
    rule: String(i?.rule || '').trim().toUpperCase(),
    quote: String(i?.quote || ''),
    why: String(i?.why || ''),
    severity: ['high', 'medium', 'low'].includes(String(i?.severity).toLowerCase())
      ? String(i.severity).toLowerCase()
      : 'medium',
  }));
  return {
    status,
    issues,
    rewritten_script: status === 'fix' && obj.rewritten_script ? String(obj.rewritten_script) : null,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

// ---------------- Mock mode (no API key needed) ----------------
function mockReview({ script, caption, contentType, productKind }) {
  const t = `${script} ${caption}`.toLowerCase();
  const issues = [];
  const add = (rule, re, why, severity = 'high') => {
    const m = t.match(re);
    if (m) issues.push({ rule, quote: m[0], why: `MOCK: ${why}`, severity });
  };
  add('R1', /\b(cures?|reverses aging|prevents? [a-z ]*disease|treats? wrinkles)\b/, 'disease claim');
  add('R2', /\bguaranteed\b/, 'guaranteed result');
  add('R3', /\b(no side effects|completely safe|risk-free)\b/, 'safety overclaim');
  add('R4', /\bfda-approved\b(?! *\.)/, 'FDA status');
  add('R7', /\b(better than|number one|the best|doctors don't want you to know)\b/, 'superlative', 'medium');
  add('R8', /\b(are you over \d+|overweight|your skin is broken)\b/, 'personal attribute', 'medium');
  if (contentType === 'ambassador' && !/#ad|paid partnership/.test(t)) {
    issues.push({ rule: 'R6', quote: script.slice(0, 40), why: 'MOCK: missing #ad', severity: 'medium' });
  }
  if (/not fda-approved/.test(t)) {
    const i = issues.findIndex((x) => x.rule === 'R4');
    if (i >= 0) issues.splice(i, 1);
  }
  const esc = /\b(milligrams|dose|dosing|pregnant|nauseous|i lost \d+)\b/.test(t);
  if (esc) issues.push({ rule: 'ESCALATE', quote: (t.match(/milligrams|pregnant|i lost \d+|nauseous/) || [''])[0], why: 'MOCK: needs a human', severity: 'high' });
  const status = esc ? 'escalate' : issues.length ? 'fix' : 'pass';
  return {
    status,
    issues,
    rewritten_script: status === 'fix' ? 'MOCK rewrite, not real.\nCaption: MOCK caption.' : null,
    confidence: status === 'pass' ? 0.9 : 0.8,
  };
}

// ---------------- Review with routing and safe fallback ----------------
async function runReviewModel(config, model, input) {
  const t0 = Date.now();
  const r = await callClaude(config, {
    model,
    system: REVIEW_SYSTEM,
    user: reviewUserMessage(input),
    maxTokens: 1500,
    temperature: 0,
  });
  const parsed = normalizeReview(extractJson(r.text));
  return { parsed, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: Date.now() - t0, model };
}

// Deterministic checks after the model answer. They do not change the prompt or routing.
const DISCLOSURE_RE = /#ad|paid partnership|#sponsored/i;
const CLINICAL_RE = /\b(?:pregnant|pregnancy|breastfeeding)\b|trying to conceive|\b\d+(?:\.\d+)?\s*(?:milligrams|mcg|mg|units)\b|\b(?:dose|dosing)\b|side effect|\binteraction/i;

export function applyGuardrails(input, result) {
  const script = String(input.script || '');
  const caption = String(input.caption || '');
  const text = `${script}\n${caption}`;
  const issues = result.issues.map((i) => ({ ...i }));
  let status = result.status;
  let rewritten = result.rewritten_script;

  if (input.contentType === 'ambassador' && !DISCLOSURE_RE.test(text)) {
    issues.push({
      rule: 'R6',
      quote: caption,
      why: 'Ambassador content must include #ad or a paid partnership disclosure.',
      severity: 'high',
      guardrail: true,
    });
    if (status === 'pass') {
      status = 'fix';
      rewritten = `${script}\n${caption} #ad`;
    }
  }

  const clinical = text.match(CLINICAL_RE);
  if (clinical) {
    status = 'escalate';
    issues.push({
      rule: 'ESCALATE',
      quote: clinical[0],
      why: 'Clinical content (pregnancy, dosing, side effects, or interactions) always requires human review.',
      severity: 'high',
      guardrail: true,
    });
  }

  return { ...result, status, issues, rewritten_script: rewritten };
}

function normQuote(quote) {
  return String(quote || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameQuote(a, b) {
  const left = normQuote(a);
  const right = normQuote(b);
  if (left === right) return true;
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

// If the model and a rule-based check flag the same rule on the same quote, keep the rule-based issue.
function dedupeIssues(issues) {
  const kept = [];
  for (const issue of issues) {
    const idx = kept.findIndex((existing) => existing.rule === issue.rule && sameQuote(existing.quote, issue.quote));
    if (idx === -1) kept.push(issue);
    else if (issue.guardrail && !kept[idx].guardrail) kept[idx] = issue;
  }
  return kept;
}

function systemEscalation(reason) {
  return {
    status: 'escalate',
    issues: [{
      rule: 'SYSTEM',
      quote: '',
      why: `The automated review failed (${reason}), so this goes to a human instead of shipping.`,
      severity: 'high',
    }],
    rewritten_script: null,
    confidence: 0,
  };
}

export async function reviewScript(config, input) {
  const started = Date.now();
  const calls = [];
  const notes = [];
  let final = null;
  let modelUsed = null;
  let routed = false;

  if (config.mock) {
    final = mockReview(input);
    modelUsed = 'mock';
  } else {
    // 1) Cheap model first.
    let cheap = null;
    try {
      cheap = await runReviewModel(config, config.cheapModel, input);
      calls.push(cheap);
    } catch (err) {
      notes.push(describeError(err));
    }
    const cheapOk = cheap?.parsed;
    const needsStrong = !cheapOk
      || cheap.parsed.confidence < CONFIDENCE_THRESHOLD
      || cheap.parsed.status === 'escalate';

    if (!needsStrong) {
      final = cheap.parsed;
      modelUsed = config.cheapModel;
    } else {
      // 2) Route to the strong model.
      routed = true;
      notes.push(!cheapOk
        ? 'Routed: cheap model output missing or unparseable.'
        : cheap.parsed.status === 'escalate'
          ? 'Routed: cheap model said escalate.'
          : `Routed: cheap model confidence ${cheap.parsed.confidence} < ${CONFIDENCE_THRESHOLD}.`);
      try {
        const strong = await runReviewModel(config, config.strongModel, input);
        calls.push(strong);
        if (strong.parsed) {
          final = strong.parsed;
          modelUsed = config.strongModel;
        } else {
          notes.push('Strong model output could not be parsed.');
        }
      } catch (err) {
        notes.push(describeError(err));
      }
    }
    if (!final) {
      final = systemEscalation('no valid model response');
      modelUsed = 'system-fallback';
    }
  }

  final = applyGuardrails(input, final);
  final = { ...final, issues: dedupeIssues(final.issues) };

  const inputTokens = calls.reduce((s, c) => s + c.inputTokens, 0);
  const outputTokens = calls.reduce((s, c) => s + c.outputTokens, 0);
  const cost = calls.reduce((s, c) => s + costFor(config, c.model, c.inputTokens, c.outputTokens), 0);

  const result = {
    ...final,
    model_used: modelUsed,
    routed_to_strong: routed,
    mock: !!config.mock,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: Number(cost.toFixed(6)),
    latency_ms: Date.now() - started,
    notes, // internal diagnostics, never raw API bodies
  };
  if (result.status === 'escalate') result.zendesk_ticket = buildZendeskTicket(input, result);
  return result;
}

function describeError(err) {
  if (err instanceof ApiError) {
    if (err.modelNotFound) return `MODEL NOT FOUND: "${err.model}". Swap it in your env vars.`;
    if (err.status === 401) return 'API key rejected (401). Check ANTHROPIC_API_KEY.';
    return `API error ${err.status || ''} ${err.type} on ${err.model}`.trim();
  }
  return 'Unexpected error during review.';
}

// ---------------- Zendesk create-ticket payload (not sent) ----------------
export function buildZendeskTicket(input, result) {
  const anyHigh = result.issues.some((i) => i.severity === 'high');
  const issueLines = result.issues.length
    ? result.issues.map((i) => `- [${i.rule}] (${i.severity}) "${i.quote}": ${i.why}`).join('\n')
    : '- (none listed)';
  const body = [
    'Automated creative compliance review escalated this ad for human review.',
    '',
    `Content type: ${input.contentType}`,
    `Product kind: ${input.productKind}`,
    `Model: ${result.model_used} (routed to strong model: ${result.routed_to_strong ? 'yes' : 'no'})`,
    `Confidence: ${result.confidence}`,
    '',
    'SCRIPT:',
    input.script,
    '',
    'CAPTION:',
    input.caption || '(none)',
    '',
    'ISSUES:',
    issueLines,
  ].join('\n');
  const modelTag = String(result.model_used || 'unknown').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
  return {
    ticket: {
      subject: `Creative compliance review needed: ${input.productKind} ${input.contentType} ad`,
      comment: { body, public: false },
      priority: anyHigh ? 'high' : 'normal',
      type: 'task',
      tags: ['ai_compliance', 'creative_review', `model_${modelTag}`, `kind_${input.productKind}`],
    },
  };
}

// ---------------- Draft from a topic ----------------
export async function draftFromTopic(config, topic) {
  const started = Date.now();
  if (config.mock) {
    return {
      voiceover_script: `MOCK, not real. A short script about ${topic}.`,
      hooks: ['MOCK hook one', 'MOCK hook two', 'MOCK hook three'],
      caption: 'MOCK caption.',
      model_used: 'mock', mock: true, input_tokens: 0, output_tokens: 0, cost_usd: 0,
      latency_ms: Date.now() - started,
    };
  }
  const r = await callClaude(config, {
    model: config.cheapModel,
    system: DRAFT_SYSTEM,
    user: draftUserMessage(topic),
    maxTokens: 800,
    temperature: 0.7,
  });
  const obj = extractJson(r.text);
  if (!obj || typeof obj.voiceover_script !== 'string' || !Array.isArray(obj.hooks)) {
    throw new Error('draft_unparseable');
  }
  return {
    voiceover_script: obj.voiceover_script,
    hooks: obj.hooks.slice(0, 3).map(String),
    caption: String(obj.caption || ''),
    model_used: config.cheapModel,
    mock: false,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    cost_usd: Number(costFor(config, config.cheapModel, r.inputTokens, r.outputTokens).toFixed(6)),
    latency_ms: Date.now() - started,
  };
}

// One log row per run.
export function logRow(kind, result) {
  return {
    time: new Date().toISOString(),
    kind,
    status: result.status ?? null,
    model_used: result.model_used,
    routed_to_strong: !!result.routed_to_strong,
    confidence: result.confidence ?? null,
    issue_count: Array.isArray(result.issues) ? result.issues.length : 0,
    input_tokens: result.input_tokens || 0,
    output_tokens: result.output_tokens || 0,
    cost_usd: result.cost_usd || 0,
    latency_ms: result.latency_ms || 0,
    mock: !!result.mock,
  };
}
