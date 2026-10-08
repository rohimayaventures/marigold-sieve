#!/usr/bin/env node
// Local runner. Commands:
//   node cli.js check "script text" [--caption "..."] [--type brand|ambassador] [--kind supplement|rx_compounded|service]
//   node cli.js draft "topic"
//   node cli.js eval
//   node cli.js serve        (page at http://localhost:8787)
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from './src/config.js';
import { reviewScript, draftFromTopic, logRow } from './src/core.js';
import { TESTSET } from './src/testset.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(ROOT, 'results');

// Minimal .env loader (no dependencies). Never prints values.
function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

function localLog(row, notes) {
  mkdirSync(RESULTS, { recursive: true });
  appendFileSync(join(RESULTS, 'runs.jsonl'), JSON.stringify(row) + '\n');
  if (notes?.length) for (const n of notes) console.error(`  note: ${n}`);
}

function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) out[args[i].slice(2)] = args[++i];
    else out._.push(args[i]);
  }
  return out;
}

function requireKey(config) {
  if (!config.mock && !config.apiKey) {
    console.error('No ANTHROPIC_API_KEY found. Add it to .env, or set MOCK_MODE=1 to test without a key.');
    process.exit(1);
  }
}

async function cmdCheck(args) {
  const config = buildConfig(process.env);
  requireKey(config);
  const f = parseFlags(args);
  const input = {
    script: f._.join(' '),
    caption: f.caption || '',
    contentType: f.type || 'brand',
    productKind: f.kind || 'supplement',
  };
  if (!input.script) return console.error('Usage: node cli.js check "script text" [--caption "..."] [--type brand|ambassador] [--kind supplement|rx_compounded|service]');
  const result = await reviewScript(config, input);
  localLog(logRow('check', result), result.notes);
  if (config.mock) console.log('*** MOCK, not real ***');
  console.log(JSON.stringify(result, null, 2));
}

async function cmdDraft(args) {
  const config = buildConfig(process.env);
  requireKey(config);
  const topic = args.join(' ');
  if (!topic) return console.error('Usage: node cli.js draft "topic"');
  try {
    const d = await draftFromTopic(config, topic);
    localLog(logRow('draft', d));
    if (config.mock) console.log('*** MOCK, not real ***');
    console.log(JSON.stringify(d, null, 2));
  } catch (e) {
    console.error('Draft failed:', e.message === 'draft_unparseable' ? 'model output could not be parsed' : e.message);
  }
}

const rulesFound = (r) => [...new Set(r.issues.map((i) => (i.rule.match(/R\d|ESCALATE|SYSTEM/) || [i.rule])[0]))];

async function cmdEval() {
  const config = buildConfig(process.env);
  requireKey(config);
  console.log(`Running ${TESTSET.length} scripts${config.mock ? ' in MOCK mode (MOCK, not real)' : ''}...`);
  console.log(`Cheap model: ${config.cheapModel} | Strong model: ${config.strongModel}`);
  const rows = new Array(TESTSET.length);
  let next = 0;
  const worker = async () => {
    while (next < TESTSET.length) {
      const idx = next++;
      const t = TESTSET[idx];
      const r = await reviewScript(config, t);
      localLog({ ...logRow('eval', r), test_id: t.id }, r.notes);
      const found = rulesFound(r);
      const flagged = r.status === 'fix' || r.status === 'escalate';
      const correct = t.expected === 'flag' ? flagged : !flagged;
      const plantedHits = t.planted.filter((p) => (p === 'ESCALATE' ? r.status === 'escalate' : found.includes(p)));
      rows[idx] = { id: t.id, expected: t.expected, got: r.status, model: r.model_used, routed: r.routed_to_strong, confidence: r.confidence, planted: t.planted, found, plantedHits, correct, cost: r.cost_usd, ms: r.latency_ms };
      console.log(`${t.id}: expected ${t.expected}, got ${r.status} (${r.model_used}${r.routed_to_strong ? ', routed' : ''}) ${correct ? 'OK' : 'MISS'}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const flagRows = rows.filter((r) => r.expected === 'flag');
  const passRows = rows.filter((r) => r.expected === 'pass');
  const plantedTotal = rows.reduce((s, r) => s + r.planted.length, 0);
  const plantedFound = rows.reduce((s, r) => s + r.plantedHits.length, 0);
  const avgCost = rows.reduce((s, r) => s + r.cost, 0) / rows.length;
  const avgMs = rows.reduce((s, r) => s + r.ms, 0) / rows.length;
  const summary = {
    status: 'ok',
    mock: config.mock,
    ran_at: new Date().toISOString(),
    cheap_model: config.cheapModel,
    strong_model: config.strongModel,
    violations_caught: flagRows.filter((r) => r.correct).length,
    violations_total: flagRows.length,
    false_positives: passRows.filter((r) => !r.correct).length,
    clean_total: passRows.length,
    planted_rules_found: plantedFound,
    planted_rules_total: plantedTotal,
    escalated: rows.filter((r) => r.got === 'escalate').length,
    routed_to_strong: rows.filter((r) => r.routed).length,
    avg_cost_usd: Number(avgCost.toFixed(6)),
    cost_per_1000_ads_usd: Number((avgCost * 1000).toFixed(2)),
    avg_latency_ms: Math.round(avgMs),
    rows: rows.map(({ plantedHits, ...r }) => r),
  };

  const md = renderReport(summary);
  mkdirSync(RESULTS, { recursive: true });
  if (config.mock) {
    writeFileSync(join(RESULTS, 'eval-report.mock.md'), md);
    writeFileSync(join(RESULTS, 'eval-summary.mock.json'), JSON.stringify(summary, null, 2));
    console.log('\nMOCK, not real. Wrote results/eval-report.mock.md (real summary untouched).');
  } else {
    writeFileSync(join(RESULTS, 'eval-report.md'), md);
    writeFileSync(join(RESULTS, 'eval-summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(ROOT, 'src', 'eval-summary.js'), `// Written by \`node cli.js eval\` with REAL results only. Mock runs never overwrite this file.\nexport default ${JSON.stringify(summary, null, 2)};\n`);
    updateReadme(md);
    console.log('\nWrote results/eval-report.md, results/eval-summary.json, src/eval-summary.js, and updated README.md.');
  }
  console.log('\n' + md);
}

function renderReport(s) {
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const lines = [
    s.mock ? '**MOCK, not real.**\n' : '',
    `Run: ${new Date(s.ran_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT. Cheap model \`${s.cheap_model}\`, strong model \`${s.strong_model}\`.`,
    '',
    '| Metric | Result |',
    '|---|---|',
    `| Violations caught | ${s.violations_caught} of ${s.violations_total} (${pct(s.violations_caught, s.violations_total)}%) |`,
    `| False positives on clean scripts | ${s.false_positives} of ${s.clean_total} |`,
    `| Planted rules identified | ${s.planted_rules_found} of ${s.planted_rules_total} |`,
    `| Escalated to a human | ${s.escalated} |`,
    `| Routed to the strong model | ${s.routed_to_strong} |`,
    `| Average cost per script | $${s.avg_cost_usd.toFixed(4)} (about $${s.cost_per_1000_ads_usd} per 1,000 ads) |`,
    `| Average time per script | ${(s.avg_latency_ms / 1000).toFixed(1)} s |`,
    '',
    '| ID | Expected | Got | Model | Rules planted | Rules found | Correct |',
    '|---|---|---|---|---|---|---|',
    ...s.rows.map((r) => `| ${r.id} | ${r.expected} | ${r.got} | ${r.model}${r.routed ? ' (routed)' : ''} | ${r.planted.join(', ') || 'none'} | ${r.found.join(', ') || 'none'} | ${r.correct ? 'Yes' : 'No'} |`),
    '',
    '_Costs are estimates from token counts and configured per-model prices._',
  ];
  return lines.join('\n');
}

function updateReadme(md) {
  const p = join(ROOT, 'README.md');
  if (!existsSync(p)) return;
  const txt = readFileSync(p, 'utf8');
  const re = /<!-- EVAL:START -->[\s\S]*<!-- EVAL:END -->/;
  if (re.test(txt)) writeFileSync(p, txt.replace(re, `<!-- EVAL:START -->\n${md}\n<!-- EVAL:END -->`));
}

async function cmdServe() {
  const { handleRequest } = await import('./src/app.js');
  const config = buildConfig(process.env);
  const port = Number(process.env.PORT || 8787);
  createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(`http://localhost:${port}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      const response = await handleRequest(request, process.env, { log: async (row, notes) => localLog(row, notes), ip: 'local', rateLimit: false });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Something went wrong. Please try again.' }));
    }
  }).listen(port, () => {
    console.log(`Creative Compliance Agent running at http://localhost:${port}${config.mock ? '  (MOCK MODE, not real)' : ''}`);
  });
}

loadEnv();
const [cmd, ...rest] = process.argv.slice(2);
const commands = { check: cmdCheck, draft: cmdDraft, eval: cmdEval, serve: cmdServe };
if (!commands[cmd]) {
  console.log('Commands: check "text" | draft "topic" | eval | serve');
} else {
  commands[cmd](rest).catch((e) => {
    console.error('Error:', e?.message || e);
    process.exit(1);
  });
}
