# Marigold Sieve

**A creative compliance agent for health and wellness ads. A concept by Hannah Kraulik Pagade.**

Live demo: https://marigold-sieve.YOUR-SUBDOMAIN.workers.dev

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
_Not run yet. Run `node cli.js eval` to fill this in with real numbers._
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
