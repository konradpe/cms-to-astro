# Git hosting, CI, deployment and go-live

Every step in this file is an outward action: explain it, then ask before doing it.

## Contents
1. Git host and repository
2. CI: build check on every push
3. Deployment targets (Cloudflare default, alternatives)
4. Redirects and headers
5. Go-live checklist

## 1. Git host and repository

| Host | When |
|---|---|
| **GitHub** (default) | Most common; free private repositories; best integration with hosts |
| **GitLab** (gitlab.com or the company's own) | The organisation already uses it |
| **Codeberg / Gitea / Forgejo** | Owner prefers a non-profit or self-hosted option; fewer host integrations |
| No remote | Not recommended: no backup, no CI, no automatic deploys |

First commit: the owner's name as author (git config), no tool or AI attribution in messages, `.gitignore` covering `node_modules/`, `dist/`, `.astro/`, `.env*`, `.claude/settings.local.json`, `.migration/snapshots/`.

Create and push (GitHub, after `gh auth status` is OK):

```bash
gh repo create <owner>/<name> --private --source=. --remote=origin --push
```

Without `gh`: the owner creates an empty private repository on github.com (no README, no .gitignore), then `git remote add origin https://github.com/<owner>/<name>.git && git push -u origin main`. The Git Credential Manager (Windows) or the system keychain (macOS) handles the login in the browser.

GitLab: `glab repo create <name> --private` then push, or create it in the web UI.

## 2. CI: build check on every push

GitHub Actions: copy `assets/templates/ci-github.yml` to `.github/workflows/ci.yml`. It installs dependencies with `npm ci` using the Node version from `.nvmrc` and runs `npm run build` on pushes to `main` and on pull requests. Check the first run with `gh run watch` or in the repository's Actions tab, and show the owner the green check.

GitLab CI (`.gitlab-ci.yml`):

```yaml
build:
  image: node:lts
  script:
    - npm ci
    - npm run build
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Hosts with git integration (Cloudflare, Netlify, Vercel) build on their side too; the CI check is still worth it because it also runs on branches and pull requests and fails loudly.

## 3. Deployment targets

### A · Cloudflare Workers with static assets (default)

Cloudflare recommends Workers (not the older Pages product) for new projects. A static Astro site needs no adapter. Add `wrangler.jsonc` from `assets/templates/wrangler.jsonc` (set `name`; `compatibility_date` = today) and `wrangler` as dev dependency (`npm i -D wrangler`).

Connect the repository (owner in the dashboard, you guide click by click):

1. dash.cloudflare.com → Compute → Workers & Pages → Create → Import a repository.
2. Authorise the Cloudflare GitHub (or GitLab) app for this one repository.
3. Build command `npm run build`, deploy command `npx wrangler deploy`.
4. Node version: the build reads `.nvmrc`; if the build log shows an older Node, add a build variable `NODE_VERSION` with the version from `.nvmrc`.
5. Save and deploy → the site is live on `<name>.<account>.workers.dev`.

Non-production branches can produce preview URLs; check the project's build settings and enable them if the owner wants the preview-first flow (agent-harness.md).

Quick one-off deploy without git integration (e.g. to show a first result): `npx wrangler login`, then `npm run build && npx wrangler deploy`.

Existing Cloudflare **Pages** projects keep working; for them, build command `npm run build`, output directory `dist`, `NODE_VERSION` variable.

**Limits:** single files up to 25 MiB (large videos and PDFs need another home, see incompatibilities.md); generous file counts for normal sites. Check Cloudflare's current limits page if a site is unusually large.

### B · Netlify

Connect the repository in the Netlify UI; build `npm run build`, publish directory `dist`, Node via `.nvmrc`. Branch and pull-request previews are built in. Netlify Forms can replace a contact form without a third-party service.

### C · GitHub Pages

Free with the repository; no server-side redirects (`_redirects` is ignored). Workflow `.github/workflows/deploy.yml` with Astro's official action (`withastro/action`) per Astro's GitHub Pages guide; set `site` (and `base` if not on a custom domain). Settings → Pages → Source: GitHub Actions.

### D · GitLab Pages

`.gitlab-ci.yml` job named `pages` that builds and moves `dist` to `public` (Astro's GitLab guide). Custom domains supported.

### E · Existing web space (classic hosting, SFTP/FTP)

Keep the current hosting contract: build in CI and upload `dist/` via SFTP. GitHub Actions example step (credentials as repository secrets the owner enters in Settings → Secrets → Actions):

```yaml
      - name: Upload via SFTP
        run: |
          sudo apt-get install -y lftp
          lftp -u "$SFTP_USER","$SFTP_PASSWORD" "sftp://$SFTP_HOST" -e "mirror -R --delete --verbose dist/ $SFTP_PATH; quit"
        env:
          SFTP_HOST: ${{ secrets.SFTP_HOST }}
          SFTP_USER: ${{ secrets.SFTP_USER }}
          SFTP_PASSWORD: ${{ secrets.SFTP_PASSWORD }}
          SFTP_PATH: ${{ secrets.SFTP_PATH }}
```

Redirects on Apache web space: `public/.htaccess` with `Redirect 301 /old/ /new/` lines. Prefer SSH keys over passwords where the host supports them. Make sure the upload target is not the folder of the still-running CMS until go-live.

### F · Vercel

Works like Netlify (connect repo, build `npm run build`, output `dist`). Check that the free plan's terms fit (it is meant for non-commercial use).

## 4. Redirects and headers

Cloudflare Workers static assets and Netlify read `public/_redirects`:

```
/?p=123                 /2021/07/29/some-post/   301
/category/news/*        /news/                   301
/old-page/              /new-page/               301
```

Only paths that change or disappear need a line: renamed slugs, dropped archives and demo pages (point them to the closest overview), old query-string links. Paths kept identical (most of them, see `oldPaths` in the export report) need nothing. Before go-live, check that every old path from the inventory either exists on the new site or has a redirect, and test a handful with `curl -sI https://<preview>/old-page/ | grep -i location`. Query strings (`?p=123`, `?lang=en`) can't be matched in `_redirects`; use the host's redirect rules (Cloudflare: Redirect Rules) for those.

Security headers (optional, Cloudflare/Netlify `public/_headers`):

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

## 5. Go-live checklist

Do this with the owner, step by step, at a time they choose. Nothing here is rushed.

1. **Content approved:** every page type compared (stage 7), all `needsReview` flags resolved, MIGRATION.md "not migrated yet" list empty or accepted.
2. **Forms** send real messages end to end; the recipient address is right; spam protection works.
3. **Legal pages and privacy** (privacy-and-legal.md): privacy policy updated for the new setup (host, form service, analytics, removed plugins), confirmed by the owner or their adviser; privacy capture rerun against the preview (only the agreed third parties, no cookies before consent); consent banner tested if one stays.
4. **Redirects** tested on the preview.
5. **Analytics** decided and, if kept, working.
6. **Backup of the old site** (files and database) stored safely.
7. **Custom domain:**
   - Find out where the domain's DNS is managed (registrar or current host). Look up the current records first and save them.
   - **Leave mail records alone:** `MX`, `SPF`/`TXT`, `DKIM`, `autodiscover` keep e-mail working; only the website records (`A`/`AAAA`/`CNAME` for the domain and `www`) change. Breaking e-mail is the most common go-live accident.
   - Optionally lower the TTL of the website records a day before.
   - Add the custom domain in the host's settings (Cloudflare: Worker → Settings → Domains & Routes; the domain must be on Cloudflare DNS for a custom domain, or use a route/CNAME setup as Cloudflare's docs describe).
   - Change the records, wait, check `https://` works on both `example.com` and `www.example.com`, and that one redirects to the other.
8. **Search engines:** submit the new sitemap in Google Search Console / Bing Webmaster Tools if the owner uses them.
9. **Old CMS:** maintenance mode or read-only for a few weeks, then delete it from the server and cancel what is no longer needed (plugins with licences, the old hosting plan if nothing else runs there).
10. **Handover:** remove the pending-pages integration, `src/pages/migration-pending.astro` and `src/pages/migration-status.astro` (`.migration/pending-pages.txt` must be empty; no page left with `wireframe: true`, or the owner accepted those as simple pages), MIGRATION.md moves to `docs/migration.md`, delete the "Migration status" block from AGENTS.md; the owner tries one edit through the agent with you watching (docs/EDITING.md).
