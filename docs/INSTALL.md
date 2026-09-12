# Installing `@nike-release-checker/bot`

One-line installers that detect your OS, install Node.js 24+ if missing, install
the bot globally, and fetch the Playwright Chromium runtime.

Both scripts are **idempotent** and **fail-fast** — safe to re-run.

## macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/nike-release-checker/master/install.sh | bash
```

What it does:

1. Detects OS (Darwin/Linux) and architecture.
2. Checks for Node 24+; installs [nvm](https://github.com/nvm-sh/nvm) 0.39.7 and
   Node 24 if missing or outdated.
3. `npm install -g @nike-release-checker/bot`.
4. Installs Chromium to `~/.nike-bot/browsers` via `npx playwright install chromium`.

## Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/<owner>/nike-release-checker/master/install.ps1 | iex
```

What it does:

1. Checks for Node 24+; installs [fnm](https://github.com/Schniz/fnm) and Node 24
   if missing or outdated.
2. `npm install -g '@nike-release-checker/bot'`.
3. Installs Chromium to `%LOCALAPPDATA%\nike-bot\browsers`.

## Post-install

```bash
nike-bot init
```

> Replace `<owner>` above with the actual GitHub org/user once the repo is public.
