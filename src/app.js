// HTTP routes shared by the Cloudflare Worker and the local Node server.
import { buildConfig, MAX_INPUT_CHARS, MAX_TOPIC_CHARS, RATE_LIMIT_PER_HOUR } from './config.js';
import { reviewScript, draftFromTopic, logRow } from './core.js';
import { PAGE_HTML } from './page.js';
import EVAL_SUMMARY from './eval-summary.js';

const CONTENT_TYPES = ['brand', 'ambassador'];
const PRODUCT_KINDS = ['supplement', 'rx_compounded', 'service'];

// Best-effort, per-isolate rate limit: about 20 requests per visitor IP per hour.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < hour);
  if (list.length >= RATE_LIMIT_PER_HOUR) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const friendly = (msg, status = 400) => json({ error: msg }, status);

export async function handleRequest(request, env, { log = async () => {}, ip = 'local', rateLimit = true } = {}) {
  const url = new URL(request.url);
  const config = buildConfig(env);

  try {
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return new Response(PAGE_HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/eval') {
      return json(EVAL_SUMMARY);
    }

    if (request.method === 'POST' && (url.pathname === '/api/check' || url.pathname === '/api/draft')) {
      if (rateLimit && rateLimited(ip)) {
        return friendly('You have hit the demo limit of 20 checks per hour. Please try again later.', 429);
      }
      if (!config.mock && !config.apiKey) {
        return friendly('The demo is not configured yet. Please try again later.', 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return friendly('Please send a valid request.');
      }

      if (url.pathname === '/api/check') {
        const script = String(body.script || '').trim();
        const caption = String(body.caption || '').trim();
        const contentType = String(body.contentType || 'brand');
        const productKind = String(body.productKind || 'supplement');
        if (!script) return friendly('Please paste a script to check.');
        if (script.length > MAX_INPUT_CHARS || caption.length > MAX_INPUT_CHARS) {
          return friendly(`Please keep the script and caption under ${MAX_INPUT_CHARS} characters each.`);
        }
        if (!CONTENT_TYPES.includes(contentType) || !PRODUCT_KINDS.includes(productKind)) {
          return friendly('Please pick a content type and product kind.');
        }
        const input = { script, caption, contentType, productKind };
        const result = await reviewScript(config, input);
        await safeLog(log, { ...logRow('check', result), ...(result.zendesk_ticket ? { zendesk_ticket: result.zendesk_ticket } : {}) }, result.notes);
        const { notes, ...publicResult } = result; // never expose internal diagnostics
        return json(publicResult);
      }

      const topic = String(body.topic || '').trim();
      if (!topic) return friendly('Please enter a topic.');
      if (topic.length > MAX_TOPIC_CHARS) return friendly(`Please keep the topic under ${MAX_TOPIC_CHARS} characters.`);
      try {
        const draft = await draftFromTopic(config, topic);
        await safeLog(log, logRow('draft', draft));
        return json(draft);
      } catch {
        return friendly('The draft could not be generated right now. Please try again.', 502);
      }
    }

    return friendly('Not found.', 404);
  } catch {
    return friendly('Something went wrong. Please try again.', 500);
  }
}

// Logging must never break a request.
async function safeLog(log, row, notes) {
  try {
    await log(row, notes);
  } catch {}
}
