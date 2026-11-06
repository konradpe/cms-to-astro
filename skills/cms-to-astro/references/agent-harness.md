# Agent harness: making the site easy to maintain

After go-live the owner changes the site by asking a coding agent ("add a news item", "replace the team photo", "change the opening hours"). The agent starts each session knowing nothing about this project. AGENTS.md is what it reads first; its quality decides whether small edits stay small.

## What to create

| File | Audience | Purpose |
|---|---|---|
| `AGENTS.md` | Any coding agent (Claude Code, Codex, Cursor, …) | How the site works and how to change it safely |
| `CLAUDE.md` | Claude Code | Imports AGENTS.md (`@AGENTS.md`), plus Claude-specific notes if any |
| `docs/EDITING.md` | The owner | What to ask for, what happens next, how to undo |

Start from `assets/templates/AGENTS.md`, `CLAUDE.md` and `EDITING.md`. Replace every placeholder with this site's real paths, fields, commands and examples, and delete sections that don't apply. A generic AGENTS.md is little better than none.

## What makes AGENTS.md work

1. **A content map.** For each content type: folder, file naming, required and optional frontmatter fields with one real example file path, where its images go, which page lists it. This answers 80% of edit requests.
2. **Recipes for the frequent requests,** each as numbered steps ending with the build check: add a post/news item, add or edit a page, change navigation, replace an image, update contact data (edit `src/data/site.json`, then search the whole `src/` for the old value: migrated pages repeat phone numbers and addresses in their text), add a redirect, hide something temporarily (`draft: true`).
3. **Checks before every commit:** `npm run build` must pass; for visual changes, look at the page in the dev server or a screenshot.
4. **The publishing flow** in plain terms (see below).
5. **Guardrails, with reasons:** don't change design tokens, layouts or dependencies unless asked (the owner expects content edits to leave the design alone); never add tracking, chat or other third-party scripts without the owner's explicit OK (privacy policy); no secrets in files; keep old URLs working (add a redirect when a path changes); alt text on every image; keep the owner's wording, fix only obvious typos unless asked.
6. **Where things came from:** a short note that the site was migrated from <CMS> on <date> and that `.migration/` holds the source data (useful when an old page needs to be recovered).
7. **Migration status,** while not all pages are built: which content types exist, which are still placeholder pages (`.migration/pending-pages.txt`), and how to treat raw files marked `needsReview` (edit them like any other content, but don't restructure them). Delete this block at go-live.
8. **Languages and privacy decisions** where they apply: which languages exist and the rule for keeping them in sync; the list of allowed third-party services.

Keep it under about 150 lines; link to docs/ for details.

## Publishing flow (recommend one, write it into AGENTS.md)

- **Preview first (recommended):** the agent works on a branch, pushes, the host builds a preview URL (Cloudflare Workers Builds, Netlify and others do this for branches/pull requests), the agent gives the owner the link, the owner says "publish", the agent merges to `main`, the host deploys. Mistakes never reach the live site unseen.
- **Direct:** the agent commits to `main` after the build check; the host deploys within a minute or two. Simpler; fine for an owner who only makes text edits and checks the live site afterwards.

Either way: CI runs the build on every push, so a broken build never deploys. Undo is always possible: "revert the last change" → `git revert`, push.

## Optional extras

- **Project skills** (`.claude/skills/<name>/SKILL.md`) for complex recurring tasks, e.g. "add a project with gallery" if that involves several files and image processing. Only when a recipe in AGENTS.md gets longer than about 15 steps.
- **Content templates** (`docs/templates/post.md`) the agent copies for new entries.

## Test the harness (required)

Give a fresh subagent nothing but the repository path and one realistic owner request, e.g. "Our phone number changed to +43 1 234 5678, please change it everywhere" or "Add a news post 'Summer break' dated today with this text: …". Afterwards check: did it find the right files from AGENTS.md alone, did it miss places (search for the old value yourself), does the build pass, does the page look right? Fix AGENTS.md wherever it had to guess, then undo the test change. One round usually finds one or two gaps; it is worth it.
