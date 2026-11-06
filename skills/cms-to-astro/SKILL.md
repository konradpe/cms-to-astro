---
name: cms-to-astro
description: Guides a website owner, step by step and in plain language, from a WordPress, TYPO3, Joomla, Drupal or other CMS website to a static Astro site (Tailwind, React islands only where needed) that lives in git and is maintained by asking a coding agent. Covers intake, a page and plugin inventory, a report of features that will not port 1:1 (forms, galleries, sliders, search, shops, languages, cookie banners), content and design extraction, a near 1:1 rebuild or a new design on the same content, visual and content comparison, git repo, CI, deployment (Cloudflare by default, any static host possible) and an agent harness (AGENTS.md/CLAUDE.md) for later edits. Use this skill whenever someone wants to get rid of WordPress or another CMS, move or copy their existing website, make a site static, cut plugin-update or security hassle, rebuild a site in Astro, or continue such a migration (a MIGRATION.md file is present), even if they never say "migration" or "Astro".
---

# CMS → static Astro site

Help a website owner replace a CMS website with a static site: plain files in a git repository, built by Astro, hosted on any static host. Afterwards nobody has to update plugins or patch a database, and every change ("add a news item", "fix the phone number") is a request to a coding agent that edits files, checks the build and publishes.

The person you guide is usually **not a web developer**. Treat the migration as a guided project with clear stages, not as a coding task you rush through.

## How to work with the owner

- **Speak their language** (the language they write in) and use plain words. When a technical term is unavoidable, explain it in half a sentence the first time ("a *repository*: a folder whose full history git remembers").
- **One stage at a time.** At the start of each stage say what it does and why it matters for them, in two or three sentences. At the end show what came out (screenshots, a short list, a link) and ask before moving on.
- **Recommend, don't survey.** When there is a choice, give your recommendation and the reason, mention the alternative in one line, and let them decide. Ask one question at a time, except the kick-off questions in stage 0, which go together as one form.
- **Show, don't tell.** Prefer old-vs-new screenshots over descriptions. A non-expert judges the result by looking at it.
- **Keep the screen calm.** The owner sees every tool call scroll by, and no skill can hide them. File names, commands and config files mean nothing to them and look like something is going wrong. So:
  - Before each step, write one plain status line in their language ("Reading all pages of your website…", "Collecting colours and fonts…"); after it, one line of result. Don't narrate files, tools or settings ("updated .gitignore") unless they ask.
  - Use few, big tool calls: the bundled scripts do whole batches in one call; write a file in one go instead of many small edits; do setup chores (folders, ignore files, config) in one command.
  - Run mechanical batches as background subagents. The owner then sees one row per task instead of every step, so name each task in plain words in their language ("Copying the texts of 140 pages").
  - Give every shell command a short, plain description.
  - Keep a short checklist of the stages in plain words (in Claude Code, the to-do list) and tick it off as you go.
- **Keep the old website running** until the very last step. Nothing in this process touches the live CMS.

## Ground rules (these protect the owner)

1. **Ownership first.** Before copying anything, ask whether they own the site or are authorized by the owner. Content, photos and the theme's design may be copyrighted: a bought (premium) theme's images and CSS are licensed, not owned; a design made by an agency belongs to whatever the agency contract says; commercial web fonts need a licence that allows self-hosting. Mention the ones that apply (a new design on the same content avoids copying a licensed design). If they are not authorized, stop.
2. **Read-only on the old site.** Only read pages, public APIs and exports. Never log in and change anything in the CMS, never install plugins there.
3. **Ask before every outward action.** Creating a repository, pushing, adding secrets, connecting a host, deploying, changing DNS, signing up for a service: explain what will happen, then ask. A "yes" covers that one action, not the next.
4. **Credentials.** Never ask for passwords in chat. If something needs access, they run the login command themselves (`gh auth login`, `npx wrangler login`) or create a token in the provider's dashboard and store it as a CI secret. Never commit secrets; `.env*` stays in `.gitignore`.
5. **Be polite to their server.** Crawl with low concurrency (the scripts default to 4 parallel requests) and cap very large sites.
6. **No legal advice.** Privacy, cookies and imprint questions get orientation and a recommendation, and the owner confirms with whoever handles their legal texts.

## Working economically

Owners pay for usage or have limits; treat tokens like their money. Scripts do the mechanical work and print short summaries: read those, not raw output files. Delegate mechanical batches (snapshots of many URLs, content conversion and clean-up, downloads) to a subagent on a cheaper model with a self-contained brief, and keep decisions, design, comparison judgment and owner communication in the main session. One template per content type, wireframes before styling, and stop measuring when a page is good enough. The biggest lever is the design choice at the kick-off: pixel-matching an old theme costs more than a similar look, and that costs more than a clean new design on the same content. Details and ready-made briefs: `references/delegation.md`.

## Design quality

Left to defaults, agents produce generated-looking sites: content chopped into identical rounded cards, one accent colour on everything, the old site's character flattened into plain bands, a theme's demo look with the logo swapped in. Owners notice, and they shouldn't have to steer every choice. So whenever you decide how something looks (a new design, a similar look, a theme's look, a later restyle; not an exact copy):

1. **Load the `frontend-design` skill** (installed with this plugin) and follow its two passes: a short design plan (4–6 named colours, type roles, a layout concept with ASCII sketches, principles), checked against the generic defaults it lists, then build and critique from screenshots.
2. **Ground it in the subject:** the owner's trade, audience and the one thing visitors must be able to do, from the intake and `structure.md`. A logistics firm, a dentist and an architect should not end up with the same page.
3. **Show real alternatives:** two or three directions that differ in substance (type, colour use, density, hero), never one safe version plus two variants of it.
4. **Critique before the owner sees it:** look at desktop and phone screenshots of the pilot against the plan and the list of generic defaults; if the `impeccable` skill is installed, run its `critique` and `audit` on the pilot pages and `polish` before showing them. Fix what they find first.

Details per route: `references/new-design.md` §5 (new design), `references/design-extraction.md` §7 (similar look).

## Progress, sessions and handovers

A migration spans several sessions, and sessions end unexpectedly (usage limits, time). Three files make any session resumable, by you or by another agent:

- **`MIGRATION.md`** (project root, from `assets/templates/MIGRATION.md`): source site, decisions, stage checklist, open questions, incompatibility decisions. Update it at the end of every stage, before you report to the owner.
- **`PLAN.md`** + `.migration/plan.json`: every page of the old site with its status (todo, extracted, wireframe, styled, compared, approved, issue, skipped) and rough token estimates for what is left. `scripts/plan.mjs` derives the status from the project itself; run `plan.mjs report` after each unit of work.
- **`HANDOVER.md`** (from `assets/templates/HANDOVER.md`): where things stand, what is half-done, the next steps, and a ready-to-paste resume prompt. Write it at the end of every stage, whenever the owner says they have to stop, when the session has been long, or when you notice usage limits approaching. Then make a local git checkpoint (`git add -A && git commit`, local only).

Work in small, finished units (one stage, one content type, one template) so an interruption never leaves a half-built mess.

**Resuming:** if the user mentions a migration and a `MIGRATION.md` exists in the working directory (or a folder they name), read `HANDOVER.md` first, then MIGRATION.md and `PLAN.md` (run `plan.mjs report` to refresh it), summarize in three or four sentences where things stand, and continue with the next step.

## Stages

Each stage ends with a short report to the owner and a confirmation (✋). Tick it off in MIGRATION.md.

### 0 · Kick-off: the big choices, tools, accounts

Greet them and explain in three or four bullets what will happen: the content is copied from the live site, the new site is built on this computer, they look at it and decide, and it goes online only when they are happy. The old site stays online until then.

Then ask the **kick-off questions together**, as one form with choices: in Claude Code with the AskUserQuestion tool; elsewhere as a short numbered list they can answer in one line ("1a 2a 3a 4a"). Mark your recommendation in each. Skip what their first message already answered. These answers steer everything after:

1. **What should the new site be?**
   - **Content and structure, new clean design.** All texts, images, pages, menus and addresses move over and are checked for completeness; logo and colours stay; the look is built fresh. Cheapest and cleanest to maintain; needs a few design decisions. Recommend it unless they like the current look. (`plan.mjs --mode new`; `references/new-design.md`)
   - **Similar look.** Recognisably the same site (colours, fonts, arrangement of each page), but not pixel-exact; obvious fixes (contrast, mobile layout) are welcome. (`--mode similar`; `references/design-extraction.md` §7)
   - **Exact 1:1 copy.** Visitors notice nothing; verified pixel by pixel. The most expensive route: matching an old theme takes several comparison rounds per page type. (`--mode copy`)
2. **Where should the website's files live?** GitHub (recommended: free, private) · their company's git (GitLab or other) · not decided, keep everything on this computer for now.
3. **Put it online already?** Later: see the result on this computer first (recommended) · set up Cloudflare now (free) · another host they already have.
4. **Do they own the site, or are they authorized by the owner?** Ground rule 1; if not, stop.

If they also want to rewrite texts or reorganise pages and menus, recommend doing that after the move, on the new site. After the kick-off, ask one question at a time again.

**Tools** (check quietly; only if something is missing or too old, read `references/tooling.md` and fix it together with them; nothing here needs Docker):

- `node -v`: use the **current Node LTS**. Current Astro needs a recent 22.x or newer and states its exact minimum in `engines` after scaffolding. If the system Node is older, look for a version manager (`nvm`, `fnm`, `volta`) before installing anything.
- `git --version`.
- A browser for screenshots: Chrome, Edge, or Playwright's own Chromium (installed with the migration tools in stage 1, no extra download if Chrome or Edge exists).

**Accounts,** only for what they want now (accounts are needed from stage 9 on):

- **Git host chosen:** check `gh auth status` (or `glab auth status`). If it shows an account, **confirm the account name with the owner**: the machine may be signed in as someone else. If signed out, they run `gh auth login` themselves. No account yet: walk them through the sign-up.
- **Cloudflare now:** check `npx wrangler whoami`; they run `npx wrangler login` themselves; no account yet: walk them through the sign-up (free plan, no credit card for static sites). Another host: `references/hosting.md`.
- **Later:** note it in MIGRATION.md, skip the checks (they contact the providers) and ask again before stage 9.

✋ Choices recorded, tools ready.

### 1 · Intake

Collect the rest, one question at a time:

- **Website address,** if not given yet.
- **Languages:** if the site has (or should have) more than one language, which languages stay, and who maintains each. Details and the decisions to make: `references/multilingual.md` (after the inventory in stage 2 you will know what exists).
- **What else they have** (each optional): admin access to the CMS (for an export file), the theme's source or a git repo, the pages that matter most, pages that can be dropped.
- **Who edits the site later** and how often. This shapes the content structure.

Then set up the project folder. Default name: the host name without `www.` and without the domain ending, dots as hyphens, plus `-web` (`www.example.at` → `example-web`, `shop.example.co.uk` → `shop-example-web`).

```bash
mkdir -p <project>/.migration && cd <project>
npm i --prefix .migration/tools playwright turndown   # migration tools only; the site itself won't depend on them
```

Copy `assets/templates/MIGRATION.md` into the project root and fill in the intake section, including the kick-off answers from stage 0. Initialise git locally (`git init`; nothing leaves the computer) so every stage can end with a checkpoint commit; mention it to the owner in one sentence.

✋ Intake summary confirmed.

### 2 · Inventory and report

Run the inventory and the privacy capture on the live site (from the project folder):

```bash
node <skill-dir>/scripts/inventory.mjs https://example.com --out .migration/inventory.json
node <skill-dir>/scripts/snapshot.mjs https://example.com/ <a page with video, map or form> \
  --out .migration/snapshots/live --privacy --no-screenshots
```

The inventory detects CMS, theme, page builder and plugins, reads the sitemaps (or crawls), groups URLs by content type (all languages of a page type in one group; translations follow their default-language version via hreflang), and scans the pages spread across all groups. It follows links from scanned pages to pages nobody listed (news and project detail pages behind list pages). It separates **features in use** (visible markup on pages) from **installed but no visible use** (plugin files load, nothing on the page uses them), and lists languages (`lang`, `hreflang`, URL prefixes, translation plugins). The privacy capture records which third parties a first visit contacts and which cookies it sets before any consent.

Then create the page plan: `node <skill-dir>/scripts/plan.mjs init --mode <new|similar|copy> && node <skill-dir>/scripts/plan.mjs report` (writes PLAN.md with all pages by content type and rough token estimates; the mode is the kick-off answer: new design, similar look, or exact copy). Groups are URL folders; the estimates assume one template per group. Merge groups that are really one kind of page (plain text pages in several folders, hidden pages under scrambled folder names) with `plan.mjs group <group> <name>` before you report the numbers.

Verify each "in use" finding by looking at one example page before you report it: the scan reads markup, and markup can be hidden by CSS (a share widget set to `display:none` is not a feature). The inventory also lists pages linked from the home page or in other languages that the sitemap omits, self-hosted video/audio files with their size, and pages whose `lang` attribute doesn't match their text. Then read `references/incompatibilities.md` (plus `wordpress.md` or `other-cms.md`) and write the report for the owner, in plain language:

1. **What the site is:** CMS, number of real pages, posts and other content types.
2. **What moves over easily** (most text, images, layout).
3. **What needs a decision:** each feature in use, what it does on their site today, and your recommendation. **Recommend the simplest thing that does the job,** which is often removing the feature or replacing it with a link or an e-mail address, and say plainly what keeping it would cost: setup effort, monthly fees, privacy-policy changes, someone checking that it keeps working. Owners don't know this; a web developer would tell them. Example: a contact form needs a sending service, spam protection and a privacy notice, and has to be tested and watched; an e-mail address and a phone number need none of that, and every visitor knows how to use them. Mark items that cannot be static at all (shop with stock, members area) and recommend keeping them as a separate service.
4. **Languages** (if more than one, or mixed-language pages): what kind of multilingual site it is and the decisions from `references/multilingual.md`.
5. **Privacy and legal:** third parties contacted and cookies set before consent today, whether the new site will need a cookie banner (often not), the legal pages found. Read `references/privacy-and-legal.md` first.
6. **What can probably go:** installed-but-unused plugins, archive pages, demo content from the theme, trashed leftovers.
7. **Search,** if the site has one: what it covers and the recommendation from `references/search.md`.
8. **Scope and effort:** the content types from PLAN.md with their rough token estimates, and the recommended order: everything as wireframes first (cheap, the whole site browsable early), then styled templates type by type, most visible first. Say clearly that the numbers are rough estimates. If they chose an exact copy and the estimates look high for their budget, mention once the lower figures PLAN.md gives for the other two routes.

The report necessarily bundles several decisions. That is intended: give each its recommendation, then ask for one overall OK plus the few questions that really need the owner's input.

✋ Decisions per item recorded in MIGRATION.md; order of content types agreed.

### 3 · Scaffold the project

Read `references/astro-setup.md` and set up Astro + Tailwind, `.nvmrc`, and the scaffold clean-ups listed there (package name, favicon, the scaffold's own README/AGENTS.md). Then install the **migration kit**: `node <skill-dir>/scripts/install-kit.mjs --old-origin <url> --locales <de,en> --url-style <directory|preserve|file>`. It copies the plumbing every migration needs into `src/migration/` and `src/pages/` (every page at its old URL, languages and hreflang, aliases, draft layouts, placeholders for pages not moved yet, the status page, sitemap filter, plain default blocks) and prints the `astro.config.mjs` lines to add; `src/migration/KIT.md` explains it. Don't rebuild any of this by hand. The design plugs in at three points (`src/migration/theme/index.ts`: page shell, page templates, block components). If the scaffold can't download its template (no GitHub access), use the manual fallback in astro-setup.md §1. Before porting theme CSS, read the Tailwind collisions note there (§8). Check `engines` in the new package.json against the Node version. Add React only when a confirmed feature needs interaction in the browser, shadcn/ui only when such a feature benefits from ready-made components. A purely static site needs neither.

✋ The empty site runs (`npm run dev`); tell them how to open it.

### 4 · Design extraction (or brand and structure)

**New design, same content:** skip the detailed capture below. Read `references/new-design.md` §3–4: capture the home page and one page per content type with `--styles --content --hide-consent`, run `scripts/structure.mjs` (menus, footer, page types, section outlines, logo, colours, fonts in one short file), settle the brand basics and ask where the design comes from: a clean design from their brand (recommended), a theme they like as a model (its look rebuilt on the project's own components; adopting a theme's code costs several times more, new-design.md §4), or a designer's files.

✋ (new design) Structure, brand basics and design source confirmed.

**Design review add-on** (new design or similar look): offer the `impeccable` plugin, which adds design critique, audit and polish. Say in one sentence what it does and that it runs small checks after file edits and at the end of each turn, in this project only. With their OK, run from the project folder `claude plugin install impeccable@cms-to-astro --scope local`. It applies from the next session started in the project folder (the handover's resume prompt starts there anyway). If they decline, the frontend-design critique alone is fine.

**Similar look:** read `references/design-extraction.md` §7: the same captures as for a new design plus `--interactions` on the home page (menu behaviour, hover colours), then design values from `styles.json` as tokens. No layout measuring.

✋ (similar look) Short report: colours, fonts (and their licence), the page types and their sections, fixes you suggest.

**Exact 1:1 copy:** read `references/design-extraction.md`. Capture the pilot pages (home plus the one or two pages agreed for stage 6) at desktop and phone width; other page types when you build them:

```bash
node <skill-dir>/scripts/snapshot.mjs https://example.com/ https://example.com/about/ \
  --out .migration/snapshots/live --styles --content --interactions --layout --hide-consent
```

`--hide-consent` hides common cookie banners (add `--hide "<selector>"` for others; `--no-animations` if scroll-in effects leave content half-faded). Without it, the banner pollutes design values, hover captures and every later comparison. Use the same flags for the new site's captures.

The script scrolls each page first (lazy and scroll-revealed content appear), takes full-page screenshots at 1440 and 390 px, and writes design values (`styles.json`), the box structure with spacing (`layout-<width>.json`), and interaction states: hover of navigation, buttons and image tiles, dropdowns, sticky header, opened mobile menu (`interactions-<width>.json` and screenshots). Look at the screenshots yourself; numbers alone miss things.

Turn the values into Tailwind tokens (colours by role, fonts, sizes, container width), self-host the fonts, and rebuild effects from the recorded parameters instead of guessing. List fixes for problems of the old theme (contrast, mobile layout) as suggestions next to the extracted values.

✋ (exact copy) Short report: the design values found, effects to rebuild, anything unusual.

### 5 · Content extraction

Extract **everything** now as content files (cheap, and it shows the real size of the job); they render as **wireframes** (site frame, unstyled content, a visible "draft layout" note) until their type gets a styled template. **Clean up and download images per content type** when you style that type.

```bash
# WordPress: pages, posts and API-exposed types
node <skill-dir>/scripts/wp-export.mjs https://example.com --out src/content --types pages,posts
# Everything else, per URL group (custom types, builder pages, other CMSs):
node <skill-dir>/scripts/snapshot.mjs --urls-file .migration/urls-<type>.txt \
  --out .migration/snapshots/live --content --no-screenshots
node <skill-dir>/scripts/content-to-md.mjs --snapshots .migration/snapshots/live \
  --urls-file .migration/urls-<type>.txt --out src/content/<type>
# WordPress builder pages with empty bodies: fill them from their snapshots
node <skill-dir>/scripts/content-to-md.mjs --snapshots .migration/snapshots/live --fill src/content/pages
node <skill-dir>/scripts/plan.mjs report
```

These are mechanical batches: delegate them per content type to a cheaper model (brief in `references/delegation.md`) and run them in the background. Details per system: `references/wordpress.md`, `references/other-cms.md`; for several languages `references/multilingual.md`.

`content-to-md.mjs` mirrors the URL path in the file path (so nested pages never overwrite each other; it reports collisions), sets `translationKey` from the hreflang alternates and `date` where the page states one, and adds review comments for text the old page shows outside its main content (hero, badges) and for numbers its scripts compute (animated counters). The export writes `.migration/wp-export-report.json` (flagged items, the front page, `oldPaths`) and `.migration/media-urls.txt`. Keep `oldUrl` in frontmatter. The WordPress front page is content for the home template, not a page route.

✋ Short report: how much content of which type (PLAN.md), what needs manual clean-up.

### 6 · Pilot: home page plus one or two key pages

**New design, same content:** follow `references/new-design.md` §5–7 instead of the pixel comparison below: two or three small design directions for the owner to pick from (with option A), then tokens, base layout, the components for the section kinds in `structure.md`, the wireframe layout and catch-all route, and the pilot pages. Check them with `compare.mjs --content-only` (nothing dropped; old and new side by side), the new pages' screenshots and the accessibility basics. No pixel matching.

**Similar look:** build as below, but by eye from the screenshots instead of by measurement, and check with `compare.mjs --content-only` plus one or two rounds of "what looks noticeably different" in the side-by-side images (design-extraction.md §7). Skip `--layout` and `layout-diff.mjs`.

**Exact 1:1 copy:** build the layout (header, navigation, footer) as the kit's page shell, then the home page plus one or two typical pages as a near 1:1 copy (the kit already provides routes, draft layouts and placeholders). A pilot surfaces design questions before they are repeated across fifty pages. With the wireframes and placeholder pages in place, the whole preview is browsable from the start; `/migration-status/` shows the owner the progress (template `migration-status.astro`). For images of these pages: `scripts/download-assets.mjs` (see astro-setup.md for crops vs. originals).

Compare from the production build, not the dev server (no dev toolbar, same output as live):

```bash
npm run build && npx astro preview --host --port 4321   # Astro 7 starts it in the background itself
#   read the URL it prints: if the port is taken it silently uses the next one; stop with `npx astro preview stop`
node <skill-dir>/scripts/snapshot.mjs http://<ip>:4321/ http://<ip>:4321/about/ \
  --out .migration/snapshots/new --layout --content --hide-consent
node <skill-dir>/scripts/compare.mjs .migration/snapshots/live .migration/snapshots/new \
  --out .migration/comparison --lang <owner's language: en|de> --notes .migration/known-differences.txt
node <skill-dir>/scripts/layout-diff.mjs .migration/snapshots/live/about/layout-1440.json \
  .migration/snapshots/new/about/layout-1440.json
```

Rebuild and restart preview after changes (`npx astro preview stop`, then build and start again), and check that the URL you capture is the one it printed. For quick fix-and-check rounds, capture only what you need (`--layout --no-screenshots --widths 390`); the full capture with screenshots is for the gallery. `layout-diff.mjs` pairs blocks by text and images and names the first vertical drift: fix that first, then rerun.

`compare.mjs` writes old | new | difference images, pixel-difference statistics with the worst bands, a list of visible text and links that exist on only one side (dropped content, or elements the old site hides but the new one shows), and `index.html`, a gallery for the owner in their language; accepted differences (no cookie banner any more, a video that now starts on click) go into the notes file so the owner sees them explained. Fix the content differences and the worst bands first, top to bottom (a 1 px offset higher up turns every photo below it red); compare `layout-<width>.json` of old and new for exact spacing values (`--measure "<selectors>"` for targeted checks). Aim for "looks the same at a glance". Where the old theme has problems (unreadable grey text, broken mobile layout), keep the original first and list the fix as a suggestion.

✋ Show the comparison gallery and get the owner's verdict on the pilot before building the rest.

### 7 · Build the rest and compare

Work through PLAN.md type by type, in the agreed order: clean up the type's content (delegate), download its images, build its template (one per type, never hand-built pages), remove `wireframe: true` from its files, compare as in stage 6 (with `--content-only` for a new design or a similar look), then `plan.mjs report`, a handover note and a checkpoint commit. Internal links stay relative; pages not built yet show as wireframes or placeholders, so the preview stays navigable.

**Search,** if agreed in stage 2: build it with the template from `references/search.md` once the main content types exist, and check it as described there.

`npm run build` must pass after every type.

✋ Owner approves the site (comparison gallery).

### 8 · Agent harness and owner guide

This is what makes the site easy to maintain. Read `references/agent-harness.md`, then create from `assets/templates/`: `AGENTS.md` (how the site works and how to change it safely), `CLAUDE.md` (imports AGENTS.md) and `docs/EDITING.md` (a guide for the owner). Replace the scaffold's own AGENTS.md. Fill them with this site's real content types, paths, commands, languages, search and the privacy decisions; if pages are still unbuilt, keep the "Migration status" block.

**Test the harness (required):** give a fresh subagent only the repository and one realistic owner request (e.g. "our phone number changed to …, change it everywhere"). Check it found the right files from AGENTS.md alone and the build passes; fix AGENTS.md where it had to guess; undo the test change.

### 9 · Repository and CI

Read `references/hosting.md`. Recommend GitHub (private) unless they use another git host. Explain repository and CI in one sentence each. With their go-ahead:

1. `git init`, `.gitignore`, first commit (the owner's name as author, no tool attribution).
2. Create the remote repository and push.
3. Add `assets/templates/ci-github.yml` as `.github/workflows/ci.yml` (or the GitLab variant): it builds on every push and pull request, so a broken change never goes live.

✋ Repository link and a green CI run shown to the owner.

### 10 · Deploy a preview

Recommend Cloudflare Workers with static assets (free, connected to the repository so every push deploys) and offer the alternatives from `references/hosting.md`. The connection step usually needs the owner in the provider's dashboard: walk them through it click by click. The new site runs under the provider's preview address, the old site stays live. Rerun the privacy capture against the preview: only the agreed third parties, no cookies before consent.

✋ Owner has clicked through the preview on their own phone and computer.

### 11 · Go-live (when the owner is ready)

Use the go-live checklist in `references/hosting.md`: redirects for every changed or dropped old path, forms tested end to end, legal pages updated (`references/privacy-and-legal.md`), custom domain and DNS without touching e-mail records, HTTPS check, then switch. Keep the old CMS read-only for a few weeks; offer a full backup of it first.

## Pitfalls seen in real migrations

- **Hidden content.** Scroll-reveal themes hide content from quick screenshots and extraction; the snapshot script scrolls first.
- **Page builders.** Elementor, Divi, WPBakery, GoodLayers, Avada and similar keep content outside the post body; the API returns little, the rendered page is the source. Their layouts become fixed templates with editable text sections (astro-setup.md).
- **Installed ≠ used.** Themes load slider, map and search plugins on every page whether used or not. Report only what pages visibly use.
- **Hidden ≠ content.** Themes ship markup that visitors never see (`display:none` blocks, off-canvas menus, transparent overlays, widgets switched off per page). Rebuild from what is visible: `layout-<width>.json` lists only visible blocks, `content.html` drops hidden elements, and the comparison lists visible text and links present on only one side.
- **Theme demo content.** Imported demo pages (team members with placeholder text, a front page named after the demo) and trashed items (`__trashed` in the URL) show up in sitemaps. Ask before migrating them.
- **Node version.** System Node is often too old for current Astro; pin `.nvmrc`, check `engines`, set it on the host too.
- **Lost spaces.** Astro drops a line break between text and a following inline tag (`see the</a>⏎(PDF)` renders `the(PDF)`). Keep the space on one line; after a build grep the HTML (astro-setup.md).
- **Absolute links to the old domain** in migrated content send visitors back to the old site. Keep internal links relative; the pending-pages build step converts leftovers and lists pages not built yet.
- **Tailwind vs. theme CSS.** Tailwind's base reset makes `img`/`svg` block-level and strips list and heading styles that WordPress themes rely on; ported class names like `outline`, `list-item`, `hidden`, `container`, `columns` are also Tailwind utilities and silently change the layout. See astro-setup.md §8.
- **Whitespace between elements.** Astro also drops whitespace between elements emitted by `.map()` or written on separate lines (two buttons, social icons): add `{' '}` or use `gap`. The visible-text comparison catches it ("Read moreBrochure").
- **Servers that start themselves.** Astro 7's `dev` and `preview` detach and move to the next free port when theirs is taken; an old server keeps answering on the old port. Read the printed URL, stop servers at the end of each stage.
- **Browser can't reach the server.** A browser in a container cannot open `localhost`; use `--host` and the machine's network IP.
- **Theme effects.** Effects like parallax have exact parameters in the markup (`data-parallax-speed`); read them.
- **Inline SVG.** Icons pasted into templates as path data are hard to find and change and bypass Vite; keep each as a `.svg` file under `src/assets/icons/` and import it (astro-setup.md §9).
- **Contact data in many places.** Migrated pages repeat phone numbers and addresses in body text; central data files don't catch those, a search does. Different values in different places (another address in the English footer) are a question for the owner.
- **Detail pages behind list pages.** News, projects and events often appear in no sitemap; the inventory follows links from list pages, but check the count against what the owner expects.
- **Computed numbers.** Count-up counters and "live" statistics are produced by scripts (sometimes prorated by date); what a capture records is a moment, not content. Ask the owner for the real figures and show them as fixed numbers someone updates.
- **Content outside the main element.** Heroes, badges and logo rows often sit outside `<main>`; build composed pages from the screenshot and `raw.html`, not from the Markdown alone.

## Reference files

| File | Read when |
|---|---|
| `references/delegation.md` | Before stage 5 and whenever a batch of mechanical work comes up: token rules, cheaper-model briefs, estimates |
| `references/tooling.md` | Stage 0, only if a tool is missing: installs per operating system, account sign-up, safe sign-in |
| `references/incompatibilities.md` | Stage 2: report and replacements |
| `references/multilingual.md` | More than one language, mixed-language pages, translation plugins |
| `references/privacy-and-legal.md` | Stage 2 report, cookie banners, legal pages, accessibility, go-live |
| `references/search.md` | The old site has a search: stage 2 decision, stage 7 build |
| `references/wordpress.md` | WordPress (stages 2 and 5) |
| `references/other-cms.md` | TYPO3, Joomla, Drupal, Wix, Squarespace, Jimdo, Webflow, static HTML |
| `references/astro-setup.md` | Stage 3 and whenever you touch project structure |
| `references/design-extraction.md` | Stages 4, 6 and 7 for an exact copy or a similar look |
| `references/new-design.md` | Stages 4, 6 and 7 for a new design on the same content |
| `references/agent-harness.md` | Stage 8 |
| `references/hosting.md` | Stages 9 to 11 |

Scripts (Node ≥ 22; run from the project folder; each prints its options with `--help`). Playwright and Turndown are found in `.migration/tools` (stage 1) or the project. The browser is Playwright's Chromium if installed, else Chrome, else Edge.

| Script | Does |
|---|---|
| `scripts/inventory.mjs` | CMS, theme, plugins, URL groups, languages, features in use vs. installed-only |
| `scripts/snapshot.mjs` | Screenshots (desktop/phone) and, per flag: `--styles`, `--content` (+ raw DOM, menus, section outline, logo), `--interactions`, `--layout`, `--measure`, `--css-rules`, `--privacy`; capture hygiene `--hide-consent`, `--hide`, `--click`, `--no-animations` |
| `scripts/compare.mjs` | Old vs. new: side-by-side + difference images, statistics, visible text/link differences, gallery for the owner (`--lang`, `--notes`; `--content-only` for a new design: side by side and text/link check, no pixel diff) |
| `scripts/structure.mjs` | Site structure from `--content` captures: menus, footer, page types, section outlines and kinds, brand basics → `.migration/structure.md` |
| `scripts/layout-diff.mjs` | Old vs. new box structure: first vertical drift, largest size/spacing/typography differences |
| `scripts/content-to-md.mjs` | Snapshots → Markdown content files (new files per URL group, or fill empty bodies), marked as wireframes |
| `scripts/plan.mjs` | Page plan: statuses derived from the project, manual approved/issue/skipped, PLAN.md with token estimates per design mode (`--mode new`, `similar` or `copy`) |
| `scripts/wp-export.mjs` | WordPress REST → Markdown, flags builder pages and the front page, media list |
| `scripts/download-assets.mjs` | Downloads images/files with URL-safe names, prefers originals, rewrites URLs in content |
