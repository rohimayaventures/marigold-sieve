# Setup on Windows (PowerShell)

All commands are for **PowerShell**. Run them from inside the project folder.

> Tip: Windows sometimes blocks `npm` and `npx` in PowerShell with "running scripts is disabled." That's why every command below uses `npx.cmd` and `node`, which sidestep that block.

## 0. Check your tools (1 minute)

```powershell
node -v
git --version
```

- **`node -v`** needs to show v18 or higher. If it's missing, run:
  `winget install OpenJS.NodeJS.LTS`
- **If git is missing,** run:
  `winget install Git.Git`

After any install, **close PowerShell and open a new window** so it picks up the new tools.

## 1. Get the code

```powershell
cd $HOME\Documents
git clone https://github.com/rohimayaventures/marigold-sieve.git
cd marigold-sieve
dir
```

You should see:
- the files `cli.js`, `package.json`, `wrangler.toml`, and `README.md`
- the folders `src`, `scripts`, and `test`

## 2. Run the unit tests (no key needed)

```powershell
node --test test/guardrails.test.js
```

You should see `# pass 9` and `# fail 0`. These tests make no API calls.

## 3. Add your API key (use a separate demo key with a low spend limit)

1. Create the key at https://console.anthropic.com/settings/keys
2. Set the spend limit at https://console.anthropic.com/settings/limits
3. Run these two commands:

```powershell
Copy-Item .env.example .env
notepad .env
```

In Notepad, paste your key after `ANTHROPIC_API_KEY=` with no spaces or quotes. Leave `MOCK_MODE=0`. Then save and close Notepad.

`.env` is listed in `.gitignore`, so it is never committed.

## 4. Test one script

```powershell
node cli.js check "Our NAD+ supplement cures chronic fatigue." --kind supplement
```

You should see JSON with `"status": "fix"`.

**If you see `MODEL NOT FOUND`:**
1. Open `.env`.
2. Change `CHEAP_MODEL` or `STRONG_MODEL` to a model name that works on your account.
3. Make the same change in `wrangler.toml`.
4. If the new model is priced differently, also set `CHEAP_PRICE_IN` and `CHEAP_PRICE_OUT` (or the `STRONG_` versions) in `.env`, in US dollars per million tokens, so cost estimates stay accurate.

## 5. Run the real evaluation (about 1 to 2 minutes)

```powershell
node cli.js eval
```

This command:
- runs all 20 test scripts against the real models
- prints the real numbers
- writes `results\eval-report.md`
- updates `README.md` and the page's eval card

## 6. See the page locally

```powershell
node scripts/build-page.js
node cli.js serve
```

Then:
1. Open http://localhost:8787.
2. To test the phone layout, press **F12**, then **Ctrl+Shift+M**, and pick a phone size.
3. When you're done, press **Ctrl+C** in PowerShell to stop the server.

## 7. Deploy to Cloudflare

Deploy **after** step 5, so the live page shows the latest real eval numbers.

```powershell
npx.cmd wrangler login
node scripts/build-page.js
npx.cmd wrangler deploy
npx.cmd wrangler secret put ANTHROPIC_API_KEY
```

- **`wrangler login`** opens your browser. Click **Allow**.
- **First deploy only:** if it asks you to pick a `workers.dev` subdomain, choose one.
- **`secret put`** asks for the value. Paste your key and press Enter. It won't show on screen. You only need to do this once per Worker.
- **The live link** is printed after `deploy`, and looks like:
  https://marigold-sieve.YOUR-SUBDOMAIN.workers.dev

## 8. Before you commit

```powershell
node --test test/guardrails.test.js
git status
```

- The unit tests must still show `# pass 9`.
- In the `git status` list, `.env`, `.dev.vars`, and `results/` must **not** appear. If `.env` shows up, stop and do not commit.
- Edit `src/page.html`, not `src/page.js`. Run `node scripts/build-page.js` to regenerate `page.js`.
- Don't edit `src/eval-summary.js` or the README's evaluation block by hand. `node cli.js eval` writes both.

## Testing without a key

1. Set `MOCK_MODE=1` in `.env`.
2. Run any command. Every result is labeled "MOCK, not real."
3. Mock runs never overwrite the real eval.

## Watching live logs

```powershell
npx.cmd wrangler tail
```
