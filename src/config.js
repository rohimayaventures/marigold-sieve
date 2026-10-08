// Runtime configuration shared by the local runner and the Cloudflare Worker.
// Model names come from environment variables, never hardcoded in calls.

// USD per 1M tokens. VERIFY before quoting: https://docs.claude.com/en/docs/about-claude/pricing
// Matched by substring of the model name. Override any of these with env vars
// CHEAP_PRICE_IN, CHEAP_PRICE_OUT, STRONG_PRICE_IN, STRONG_PRICE_OUT.
export const DEFAULT_PRICES_PER_MTOK = {
  haiku: { in: 1.0, out: 5.0 },
  sonnet: { in: 3.0, out: 15.0 },
  opus: { in: 5.0, out: 25.0 },
};

export const CONFIDENCE_THRESHOLD = 0.75;
export const MAX_INPUT_CHARS = 2000;
export const MAX_TOPIC_CHARS = 300;
export const RATE_LIMIT_PER_HOUR = 20;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : undefined;
}

function priceFor(model, inOverride, outOverride) {
  const m = String(model || '').toLowerCase();
  const key = Object.keys(DEFAULT_PRICES_PER_MTOK).find((k) => m.includes(k));
  const base = key ? DEFAULT_PRICES_PER_MTOK[key] : DEFAULT_PRICES_PER_MTOK.sonnet;
  return { in: num(inOverride) ?? base.in, out: num(outOverride) ?? base.out };
}

export function buildConfig(env = {}) {
  const cheapModel = env.CHEAP_MODEL || 'claude-haiku-4-5-20251001';
  const strongModel = env.STRONG_MODEL || 'claude-sonnet-5-5';
  const mock = ['1', 'true', 'yes'].includes(String(env.MOCK_MODE || '').toLowerCase());
  return {
    apiKey: env.ANTHROPIC_API_KEY || '',
    cheapModel,
    strongModel,
    mock,
    prices: {
      [cheapModel]: priceFor(cheapModel, env.CHEAP_PRICE_IN, env.CHEAP_PRICE_OUT),
      [strongModel]: priceFor(strongModel, env.STRONG_PRICE_IN, env.STRONG_PRICE_OUT),
    },
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_SERVICE_KEY || '',
  };
}

export function costFor(config, model, inputTokens, outputTokens) {
  const p = config.prices[model] || priceFor(model);
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}
