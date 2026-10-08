# Marigold Sieve

**A creative compliance agent for health and wellness ads. A concept by Hannah Kraulik Pagade.**

Live demo: https://marigold-sieve.rohimayapublishing.workers.dev

> First-pass screen to support human reviewers. Not legal or medical advice. Independent concept, not a commercial product. Sample scripts only; no patient data.

## The problem

Health and wellness brands ship a lot of short-form creative: voiceover scripts, hooks, captions, and creator posts. One phrase like "cures," "FDA-approved," or "no doctor needed" can get an ad rejected by Meta or create regulatory risk. Manual review does not scale with creative volume, and a fully automated reviewer that never asks for help is risky in health.

## What it does

1. **Draft** (optional): Claude Haiku turns a science topic into a 30-second voiceover script, 3 hooks, and a caption. One click sends the draft to the check.
2. **Check**: paste a script and caption, pick the content type (brand or ambassador) and the product kind (supplement, compounded prescription, or service).
3. **Review**: Claude Haiku screens it against 9 rules at temperature 0 and returns strict JSON: status, issues with exact quotes, a compliant rewrite, and a confidence score.
4. **Route**: if Haiku's JSON is unparseable, its confidence is under 0.75, or it says escalate, the review re-runs on Claude Sonnet. The model that made the final call is recorded.
5. **Guardrails**: two rule-based checks run in code after the model, so they can only make a result stricter. Ambassador content without `#ad`, `#sponsored`, or "paid partnership" is always at least a Fix. Pregnancy, dosing, side-effect, or interaction language is always an Escalate.
6. **Escalate**: escalations become a ticket payload in Zendesk's create-ticket format (shown and logged, not sent).
7. **Never fail silently**: up to 3 retries with backoff on network errors and on 408, 429, 5xx, and 529 responses. If both models still fail, the result is `escalate` with a SYSTEM issue and confidence 0, so it goes to a human instead of shipping.
8. **Log**: every run records status, model, routing, confidence, token counts, estimated cost, and latency. Optional Supabase logging stores that metadata only, never the ad text. It is built in (`supabase.sql`) but not enabled on the live demo.

## How a request flows

| Step | Where in the code |
|---|---|
| Request comes in, rate limit, input checks (400, 429, 503) | `src/worker.js`, `handleRequest` in `src/app.js` |
| The 9 rules and the JSON contract | `RULES_TEXT` and `REVIEW_SYSTEM` in `src/prompts.js` |
| Haiku review, routing to Sonnet | `reviewScript` in `src/core.js`, threshold in `src/config.js` |
| Retries and error handling | `callClaude` in `src/core.js` |
| Guardrails after the model | `applyGuardrails` in `src/core.js` |
| Zendesk-format ticket | `buildZendeskTicket` in `src/core.js` |
| Cost estimate | `DEFAULT_PRICES_PER_MTOK` and `costFor` in `src/config.js` |
| Evaluation runner | `TESTSET` in `src/testset.js`, `cmdEval` in `cli.js` |

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

20 fixed test scripts: 15 with planted violations and 5 clean. The scripts in `src/testset.js` are never edited to improve the score.

**How to read the numbers.** "Violations caught" means the script was flagged (Fix or Escalate). It does not mean every script got the exact expected action. T11 should have escalated and came back Fix; that miss is why planted rules show 23 of 24. T06 needed a Fix and was escalated by the clinical guardrail, a deliberately cautious result.

**How testing changed it.** The first run caught 13 of 15. T03 (an ambassador post without #ad) passed, and T14 (a pregnancy script) came back Fix instead of Escalate. The two guardrails were added for those cases, and the next run caught 15 of 15. Because the guardrails were written in response to misses on these same scripts, that result shows the fix works here. It is not an independent holdout test. A fresh set of unseen scripts is next.

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

## Testing

- **Unit tests:** `node --test test/guardrails.test.js` runs 9 offline tests (no API calls, no key needed) for the guardrails, JSON parsing, the 0.75 routing threshold, and the fail-closed fallback. They caught a real bug: `#adventure` used to count as a disclosure.
- **Evaluation:** `node cli.js eval` runs the 20 scripts against the real models. It is run by hand after changes, and it rewrites the section above.

## Known limits

- **T11:** a testimonial with a specific weight-loss result came back Fix instead of Escalate.
- **The clinical guardrail is a keyword list.** It over-escalates harmless uses of words like "dose" or "side effect" (T06) and does not understand context.
- **Guardrails cover 2 of the 9 rules.** The other 7 rely on the model.
- **Confidence is self-reported** by the model, clamped to 0 to 1, and not calibrated.
- **Sonnet has the final say.** When Haiku escalates, Sonnet re-reviews, and its answer is final. Unless a guardrail catches it, Sonnet can downgrade an escalation.
- **Prompt injection:** the rules live in the system prompt and the guardrails run in code, so injected text cannot switch those off. The prompt itself is not hardened with delimiters, and there are no injection test cases yet.
- **Rate limit:** about 20 requests per IP per hour, kept in memory inside one Worker instance. It will not hold under real traffic.
- **Cost is an estimate** from token counts. Prices in `src/config.js` are matched by model family name, so set `CHEAP_PRICE_IN` and `CHEAP_PRICE_OUT` (or the `STRONG_` versions) when switching to a model with different pricing.
- **Escalation tickets are displayed, not sent**, and nothing is saved between runs on the live demo.
- **The test set is 20 written scripts**, not real creative. The sample buttons on the page come from the test set.

## Stack

- Plain JavaScript (ES modules), Node 18+, zero npm dependencies. Anthropic Messages API called with `fetch`.
- One shared core module (`src/core.js`) used by both the local runner and the Worker, so the evaluation tests the same code that is deployed.
- Cloudflare Workers for hosting. The API key is a Worker secret.
- Optional Supabase logging (`supabase.sql`, row-level security on, no public policies). Not enabled on the live demo.

## Project layout

| Path | What it is |
|---|---|
| `src/core.js` | Review, routing, retries, guardrails, ticket builder |
| `src/app.js`, `src/worker.js` | HTTP routes and the Cloudflare Worker entry |
| `src/prompts.js`, `src/config.js` | Prompts, rules, model prices, thresholds |
| `src/testset.js` | The 20 evaluation scripts |
| `src/page.html` | The demo page. Edit this one. |
| `src/page.js` | Generated from `page.html` by `node scripts/build-page.js`. Do not edit by hand. |
| `src/eval-summary.js` | Written by `node cli.js eval` with real results only. Do not edit by hand. |
| `test/` | Offline unit tests |

## Run locally

Full Windows steps are in [SETUP-WINDOWS.md](SETUP-WINDOWS.md). In PowerShell:

```powershell
Copy-Item .env.example .env        # then add your ANTHROPIC_API_KEY
node cli.js check "Our supplement cures fatigue" --kind supplement
node cli.js draft "NAD+ and cellular energy"
node --test test/guardrails.test.js
node cli.js eval                   # runs the 20 test scripts, writes results/ and updates this README
node scripts/build-page.js
node cli.js serve                  # page at http://localhost:8787
```

On macOS or Linux, use `cp .env.example .env` instead of `Copy-Item`.

Set `MOCK_MODE=1` in `.env` to test the plumbing without an API key. Mock results are labeled "MOCK, not real" and never overwrite the real evaluation.

## Deploy

```powershell
npx.cmd wrangler login
npx.cmd wrangler secret put ANTHROPIC_API_KEY
node scripts/build-page.js
npx.cmd wrangler deploy
```

Model names are set in `wrangler.toml` under `[vars]`. Public demo protections: about 20 requests per visitor IP per hour, 2,000 character input cap, and friendly errors only.

## What's next

- A holdout set of unseen scripts, and scoring "flagged" separately from "right action"
- Rule-based checks for R1 and R4, and a rule for testimonials with specific results (T11)
- Prompt injection test cases and clearer delimiters around the script
- Pin both models to dated versions, and evaluate Haiku 5.5 on cost and catch rate
- Save every run and reviewer decision, version the prompts, and run the evaluation in CI
- Real Zendesk API calls for escalations
- Playwright end-to-end tests
- ElevenLabs voiceover and Higgsfield visuals for approved scripts and hooks

## License

MIT. See [LICENSE](LICENSE).
