# Setup on Windows (PowerShell)

All commands are for **PowerShell**. Run them from inside the project folder.

> Tip: Windows sometimes blocks `npm` and `npx` in PowerShell with "running scripts is disabled." That's why every command below uses `npx.cmd` and `node`, which sidestep that block.

## 0. Check your tools (1 minute)

```powershell
node -v
git --version
gh --version
```

- **`node -v`** needs to show v18 or higher. If it's missing, run:
  `winget install OpenJS.NodeJS.LTS`
- **If git or gh is missing,** run:
  `winget install Git.Git`
  `winget install GitHub.cli`

After any install, **close PowerShell and open a new window** so it picks up the new tools.

## 1. Open the project folder

```powershell
cd $HOME\Documents\marigold-sieve
dir
```

You should see:
- the files `cli.js`, `package.json`, `wrangler.toml`, and `README.md`
- the folders `src` and `scripts`

## 2. Add your API key (use a separate demo key with a low spend limit)

1. Create the key at https://console.anthropic.com/settings/keys
2. Set the spend limit at https://console.anthropic.com/settings/limits
3. Run these two commands:

```powershell
Copy-Item .env.example .env
notepad .env
```

In Notepad, paste your key after `ANTHROPIC_API_KEY=` with no spaces or quotes. Leave `MOCK_MODE=0`. Then save and close Notepad.

## 3. Test one script

```powershell
node cli.js check "Our NAD+ supplement cures chronic fatigue." --kind supplement
```

You should see JSON with `"status": "fix"`.

**If you see `MODEL NOT FOUND`:**
1. Open `.env`.
2. Change `CHEAP_MODEL` or `STRONG_MODEL` to a model name that works on your account.
3. Make the same change in `wrangler.toml`.

## 4. Run the real evaluation (about 1 to 2 minutes)

```powershell
node cli.js eval
```

This command:
- runs all 20 test scripts
- prints your real numbers
- writes `results\eval-report.md`
- updates `README.md` and the page's eval card

## 5. See the page locally

```powershell
node scripts/build-page.js
node cli.js serve
```

Then:
1. Open http://localhost:8787.
2. To test the phone layout, press **F12**, then **Ctrl+Shift+M**, and pick a phone size.
3. When you're done, press **Ctrl+C** in PowerShell to stop the server.

## 6. Deploy to Cloudflare

Deploy **after** step 4, so the live page shows your real eval numbers.

```powershell
npx.cmd wrangler login
node scripts/build-page.js
npx.cmd wrangler deploy
npx.cmd wrangler secret put ANTHROPIC_API_KEY
```

- **`wrangler login`** opens your browser. Click **Allow**.
- **First deploy only:** if it asks you to pick a `workers.dev` subdomain, choose one (for example, `hannah`).
- **`secret put`** asks for the value. Paste your key and press Enter. It won't show on screen.
- **Your live link** is printed after `deploy`, and looks like:
  https://marigold-sieve.YOUR-SUBDOMAIN.workers.dev
- Put that link on line 5 of `README.md`.

## 7. Push the public repo

```powershell
git init
git add .
git status
```

**STOP and read the `git status` list.** `.env` and `results/` must **not** appear. If `.env` shows up, don't continue. Tell Claude.

```powershell
git config user.name "Hannah Kraulik Pagade"
git config user.email "hannah.pagade@gmail.com"
git commit -m "Initial commit: Marigold Sieve creative compliance agent"

git branch -M main
git remote add origin https://github.com/rohimayaventures/marigold-sieve.git
git push -u origin main
```

The first push opens a browser window to sign in to GitHub. Click **Sign in with your browser** and approve.

Your repo will be at: https://github.com/rohimayaventures/marigold-sieve

## Testing without a key

1. Set `MOCK_MODE=1` in `.env`.
2. Run any command. Every result is labeled "MOCK, not real."
3. Mock runs never overwrite your real eval.

## Watching live logs

```powershell
npx.cmd wrangler tail
```
