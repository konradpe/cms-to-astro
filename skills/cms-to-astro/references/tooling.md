# Tools and accounts for non-developers

Goal: the fewest, lightest installs that work. No Docker, no virtual machines. Check what is already there before installing anything, and explain each install in one sentence ("Node.js runs the website tools on your computer").

## Contents
1. Node.js
2. git
3. GitHub CLI (optional)
4. A browser for screenshots
5. Accounts: GitHub, GitLab, Cloudflare
6. Signing in safely
7. When something fails

## 1. Node.js (current LTS; Astro 7.4 needs ≥ 22.23.4)

Check: `node -v`. If a version manager is already installed (`nvm`, `fnm`, `volta`, `asdf`, `mise`), use it: `nvm install --lts` / `fnm install --lts`.

| System | Easiest way |
|---|---|
| macOS | Installer (LTS) from nodejs.org, or `brew install node` if Homebrew is present |
| Windows | Installer (LTS) from nodejs.org, or `winget install OpenJS.NodeJS.LTS` in PowerShell |
| Linux | Distribution packages are often too old. Use fnm: the install command from fnm's GitHub README, then `fnm install --lts` |

After installing, open a new terminal so the new `node` is found. Later the project pins the version in `.nvmrc`.

## 2. git

Check: `git --version`.

| System | Easiest way |
|---|---|
| macOS | `xcode-select --install` (installs Apple's command line tools, which include git) or `brew install git` |
| Windows | Installer from git-scm.com, or `winget install Git.Git` (includes the Git Credential Manager, which handles GitHub logins) |
| Linux | `sudo apt install git` / `sudo dnf install git` |

Set the name and e-mail once if `git config --global user.name` is empty: `git config --global user.name "Jane Doe"` and `git config --global user.email "jane@example.com"`. These appear in the history, so use what the owner wants public.

## 3. GitHub CLI (optional, makes stage 9 one command)

`gh` creates repositories and checks CI runs from the terminal. Without it, the owner creates the repository on github.com and you push with plain git.

| System | Install |
|---|---|
| macOS | `brew install gh` |
| Windows | `winget install GitHub.cli` |
| Linux | Follow the "Linux" instructions on cli.github.com (adds the official package repository) |

GitLab has the equivalent `glab`.

## 4. A browser for screenshots

The scripts need the `playwright` npm package, installed in stage 1 into the migration tools folder (`npm i --prefix .migration/tools playwright turndown`, a few MB; the website itself won't depend on it). It then looks for a browser in this order:

1. **Playwright's own Chromium**, if `npx playwright install chromium` was ever run (about 150 MB, stored in the user's cache folder, no admin rights).
2. **Google Chrome**, if installed. Most people have it; nothing to download.
3. **Microsoft Edge**, if installed (preinstalled on Windows).

So on most machines the package install is all it takes. Force one with `--browser chrome|msedge|bundled`.

On Linux servers without a desktop, Chromium may miss system libraries. Then either install Chrome, or run `sudo npx playwright install-deps chromium` (needs admin rights; explain that first).

**Interactive looking around** (optional, not a replacement for the script): Claude Code's browser integration, if the user has it set up, or the Playwright MCP server, added with `claude mcp add playwright -- npx @playwright/mcp@latest`. Use these to inspect a detail interactively; use the script for the repeatable captures and comparisons.

**No browser possible at all:** the inventory, the WordPress export and the asset download still work. Ask the owner to send screenshots of the pages you need to compare.

## 5. Accounts

Accounts are needed from stage 9 (repository) and stage 10 (hosting). Walk the owner through each sign-up; they type their own e-mail and password, never into the chat.

**GitHub** (recommended git host): github.com → Sign up → e-mail, password, username → confirm the e-mail code. Free accounts include unlimited private repositories and CI minutes for small sites. Recommend turning on two-factor authentication (Settings → Password and authentication); explain it protects the website from someone pushing changes in their name.

**GitLab** (if their organisation uses it): gitlab.com → Register, or the company's own GitLab address. CI and Pages are included.

**Cloudflare** (recommended host): dash.cloudflare.com/sign-up → e-mail and password → confirm the e-mail. The free plan covers static sites; no credit card and no domain are needed to start, the site first runs under a `*.workers.dev` address. Moving the domain comes later (go-live) and is optional: Cloudflare can serve the site while DNS stays at the current provider.

**Other hosts** (Netlify, Vercel, an existing web space): see hosting.md. Ask for their existing login only in the form of "please log in yourself in the browser".

## 6. Signing in safely

| Service | Check | Sign in (the owner runs it; a browser window opens) |
|---|---|---|
| GitHub | `gh auth status` | `gh auth login` → GitHub.com → HTTPS → "Login with a web browser" |
| GitLab | `glab auth status` | `glab auth login` |
| Cloudflare | `npx wrangler whoami` | `npx wrangler login` |

Never ask for passwords or tokens in the chat. When a token is unavoidable (CI deployment to a host without git integration), the owner creates it in the provider's dashboard and pastes it directly into the CI secret settings page. If they paste a secret into the chat anyway, tell them to revoke it and create a new one.

## 7. When something fails

- **"command not found" after installing:** open a new terminal window.
- **Permission errors with `npm i -g`:** don't install globally; everything here runs via `npx` or as project dev dependencies.
- **Corporate proxy / blocked downloads:** the installed-Chrome route avoids the browser download; npm may need the company's registry settings, which their IT can provide.
- **Windows paths:** prefer PowerShell or Windows Terminal; avoid project folders inside OneDrive (sync locks files during `npm install`).
