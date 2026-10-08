# Marigold Sieve

**A creative compliance agent for health and wellness ads. A concept by Hannah Kraulik Pagade.**

Live demo: https://marigold-sieve.rohimayapublishing.workers.dev

> First-pass screen to support human reviewers. Not legal or medical advice. Independent concept, not a commercial product. Sample scripts only; no patient data.

## The problem

Health and wellness brands ship a lot of short-form creative: voiceover scripts, hooks, captions, and creator posts. One phrase like "cures," "FDA-approved," or "no doctor needed" can get an ad rejected by Meta or create regulatory risk. Manual review does not scale with creative volume, and a fully automated reviewer that never asks for help is risky in health.

## What it does

1. **Draft** (optional): Claude Haiku turns a science topic into a 30-second voiceover script, 3 hooks, and a caption.
2. **Check**: paste a script and caption, pick the content type (brand or ambassador) and the product kind (supplement, compounded prescription, or service).
3. **Review**: Claude Haiku screens it against 9 rules at temperature 0 and returns strict JSON: status, issues with exact quotes, a compliant rewrite, and a confidence score.
4. **Route**: if Haiku's JSON is unparseable, its confidence is under 0.75, or it says escalate, the review re-runs on Claude Sonnet. The model that made the final call is recorded.
5. **Escalate**: escalations become a ticket payload in Zendesk's create-ticket format (shown and logged, not sent).
6. **Never fail silently**: up to 3 retries with backoff on 429 and 5xx errors. If the review still fails, the result is `escalate` with a SYSTEM issue, so it goes to a human instead of shipping.
7. **Log**: every run records status, model, routing, confidence, token counts, estimated cost, and latency (JSONL locally, optional Supabase when deployed).

## The 9 rules

| Rule | What it checks |
|---|---|
| R1 Disease claims | No claims that a product cures, treats, prevents, or reverses a disease or "aging." |
| R2 Guaranteed results | No "guaranteed," no specific outcomes promised to everyone. |
| R3 Safety overclaims | No "no side effects," "completely safe," "risk-free." |
| R4 FDA status | Compounded medications and supplements are never called FDA-approved. |
| R5 Provider framing | Prescriptions framed as "if a licensed provider determines it's right for you." |
| R6 Paid partnership | Ambassador content includes #ad or "paid partnership." |
| R7 Superlatives | No "#1," "the best," "better than [drug]," "doctors don't want you to know." |
| R8 Meta personal attributes | No asserting the viewer's age, weight, or health condition; no shaming. |
| R9 Supplement disclaimer | Structure or function claims carry the FDA disclaimer. |

Escalate to a human for dosing or medical advice, pregnancy, drug interactions, side-effect guidance, testimonials with specific results, or genuine uncertainty.

## Evaluation

20 fixed test scripts: 15 with planted violations and 5 clean. The scripts and rules were not tuned to improve the score.

<!-- EVAL:START -->

Run: 10/8/2026, 5:42:32 PM CT. Cheap model `claude-haiku-4-5-20251001`, strong model `claude-sonnet-5-5`.

| Metric | Result |
|---|---|
| Violations caught | 15 of 15 (100%) |
| False positives on clean scripts | 0 of 5 |
| Planted rules identified | 23 of 24 |
| Escalated to a human | 3 |
| Routed to the strong model | 1 |
| Average cost per script | $0.0022 (about $2.2 per 1,000 ads) |
| Average time per script | 2.1 s |

| ID | Expected | Got | Model | Rules planted | Rules found | Correct |
|---|---|---|---|---|---|---|
| T01 | flag | fix | claude-haiku-4-5-20251001 | R1, R9 | R1, R2, R9 | Yes |
| T02 | flag | fix | claude-haiku-4-5-20251001 | R2, R5 | R2, R5 | Yes |
| T03 | flag | fix | claude-haiku-4-5-20251001 | R6 | R6 | Yes |
| T04 | flag | fix | claude-haiku-4-5-20251001 | R4, R5 | R4, R1, R5 | Yes |
| T05 | flag | fix | claude-haiku-4-5-20251001 | R5 | R5 | Yes |
| T06 | flag | escalate | claude-haiku-4-5-20251001 | R3 | R3, ESCALATE | Yes |
| T07 | flag | fix | claude-haiku-4-5-20251001 | R8 | R8 | Yes |
| T08 | flag | fix | claude-haiku-4-5-20251001 | R7 | R7, R2 | Yes |
| T09 | flag | fix | claude-haiku-4-5-20251001 | R9 | R9 | Yes |
| T10 | flag | escalate | claude-sonnet-5-5 (routed) | ESCALATE | ESCALATE, R3, R5 | Yes |
| T11 | flag | fix | claude-haiku-4-5-20251001 | R2, ESCALATE | R2 | Yes |
| T12 | flag | fix | claude-haiku-4-5-20251001 | R1 | R1 | Yes |
| T13 | flag | fix | claude-haiku-4-5-20251001 | R7, R3, R6, R5 | R7, R1, R3, R5, R6 | Yes |
| T14 | flag | escalate | claude-haiku-4-5-20251001 | ESCALATE | ESCALATE | Yes |
| T15 | flag | fix | claude-haiku-4-5-20251001 | R8, R1, R9 | R1, R8, R9 | Yes |
| C01 | pass | pass | claude-haiku-4-5-20251001 | none | none | Yes |
| C02 | pass | pass | claude-haiku-4-5-20251001 | none | none | Yes |
| C03 | pass | pass | claude-haiku-4-5-20251001 | none | none | Yes |
| C04 | pass | pass | claude-haiku-4-5-20251001 | none | none | Yes |
| C05 | pass | pass | claude-haiku-4-5-20251001 | none | none | Yes |

_Costs are estimates from token counts and configured per-model prices._
<!-- EVAL:END -->

## Stack

- Plain JavaScript (ES modules), Node 18+, zero npm dependencies. Anthropic Messages API called with `fetch`.
- One shared core module (`src/core.js`) used by both the local runner and the Worker.
- Cloudflare Workers for hosting. The API key is a Worker secret.
- Optional Supabase logging (`supabase.sql`, row-level security on).

## Run locally

```bash
cp .env.example .env        # then add your ANTHROPIC_API_KEY
node cli.js check "Our supplement cures fatigue" --kind supplement
node cli.js draft "NAD+ and cellular energy"
node cli.js eval            # runs the 20 test scripts, writes results/ and updates this README
npm run serve               # page at http://localhost:8787
```

Set `MOCK_MODE=1` in `.env` to test the plumbing without an API key. Mock results are labeled "MOCK, not real" and never overwrite the real evaluation.

## Deploy

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

Model names are set in `wrangler.toml` under `[vars]`. Public demo protections: about 20 requests per visitor IP per hour, 2,000 character input cap, and friendly errors only.

## What's next

- ElevenLabs voiceover for approved scripts
- Higgsfield visuals for approved hooks
- Real Zendesk API calls for escalations
- Playwright end-to-end tests
- Feeding winning Meta hooks back into drafts

## License

MIT. See [LICENSE](LICENSE).
