# cms-to-astro

A Claude Code plugin that guides a website owner, step by step, from a WordPress, TYPO3 or other CMS website to a static [Astro](https://astro.build) site that lives in git and is maintained by asking a coding agent.

Static sites have no database, no plugins to update and almost nothing to attack. The hard parts are the migration itself and the editing afterwards. This skill handles both: it copies content and design, lists what needs a replacement, sets up git, CI and hosting, and leaves the project with agent instructions, so that "add a news post" stays a one-sentence request.

Written for non-developers. The agent explains each stage, recommends a choice, and asks before anything leaves the computer (repositories, deployments, DNS).

## Install

In Claude Code:

```
/plugin marketplace add konradpe/cms-to-astro
/plugin install cms-to-astro@cms-to-astro
```

## Use

Start Claude Code in an empty folder and say what you want, for example:

> I want to get rid of WordPress on example.com and have a simple static site instead.

> Can you copy our TYPO3 website to something we can host on Cloudflare?

Only migrate websites you own or are authorized to copy; the skill asks first.

**What you'll see.** Claude Code shows every step it takes (commands, files). The agent keeps its own messages short and in plain words; you can ignore the steps in between. For a calmer view, use the Claude desktop app, which collapses steps into summaries, or switch the terminal to its focus view if your version has it (`/focus`).

To continue later, start Claude Code in the project folder and say "let's continue the website migration". The agent picks up from `HANDOVER.md`, `MIGRATION.md` and `PLAN.md`.

## What it does

| Stage | |
|---|---|
| 0 · Kick-off | Three choices up front, in one form: what the new site should be (content and structure with a new clean design, a similar look, or an exact 1:1 copy), where the files live (GitHub, your company's git, or only this computer for now), and whether to go online now or later. Then tools (Node, git, your installed Chrome or Edge) and only the accounts you need now |
| 1 · Intake | Address, languages, what else you have (CMS access, important pages), who edits later |
| 2 · Inventory and report | CMS, plugins in use vs. merely installed, content types, languages, what a first visit sends to third parties, search; a plain-language report with recommendations; a page plan with rough token estimates |
| 3 · Project | Astro + Tailwind; React and shadcn/ui only when a feature needs them |
| 4 · Design extraction | New design: only brand basics (logo, colours, fonts) and the site structure (menus, page types, the kinds of sections pages are built from). Similar look: plus colours, fonts and screenshots of each page type. Exact copy: also layout geometry, hover states, mobile menu, effects |
| 5 · Content | WordPress REST API or rendered pages → Markdown; everything shown as unstyled "draft layout" pages right away |
| 6 · Pilot | Home page and one or two key pages, shown old vs. new in a gallery and checked for complete content (every visible text and link of the old page is there). New design: two or three design directions to choose from first. Exact copy: also compared pixel by pixel (difference images, layout differences in pixels) |
| 7 · Everything else | Content type by content type, per the page plan; search (Pagefind) if needed |
| 8 · Agent setup | AGENTS.md, CLAUDE.md and an owner guide, tested with a fresh agent |
| 9–11 · Publishing | Git repository and CI, a preview deployment, and a go-live checklist (redirects, forms, privacy and legal pages, DNS without breaking e-mail) |

Throughout, the preview stays browsable: pages not designed yet show their content in a draft layout or a "not moved yet" placeholder, and `/migration-status/` shows the progress.

## Built for interruptions and limited budgets

- **Page plan:** `PLAN.md` lists every page with its status, derived from the project itself, and rough token estimates for what is left (styling vs. draft layouts only; 1:1 copy vs. new design).
- **Three ways to move:** an exact copy keeps the look and is verified pixel by pixel, the most expensive part of a migration. A similar look is built by eye from the old design's colours, fonts and screenshots. A new design on the same content keeps only the brand. The last two skip the pixel matching and still check that every text and link made it over.
- **Simplest first:** for forms, maps, sliders and other features, the agent recommends the simplest thing that does the job (often an e-mail link instead of a form) and says what keeping a feature would cost.
- **Handovers:** at the end of each stage, or when you have to stop, the agent writes `HANDOVER.md` with a ready-to-paste resume prompt, and makes a local git checkpoint.
- **Token economy:** scripts do the mechanical work and print short summaries. Batches (scraping, conversion, clean-up, downloads) go to subagents on a cheaper model; decisions and design stay in the main session.

## Contents

```
.claude-plugin/            plugin and marketplace manifests
skills/cms-to-astro/
  SKILL.md                 the workflow
  references/              details loaded when a stage needs them
  scripts/                 inventory, snapshot, structure, compare, layout-diff, content-to-md, plan, wp-export, download-assets
  assets/templates/        MIGRATION.md, PLAN/HANDOVER, AGENTS.md, CLAUDE.md, EDITING.md, CI workflow,
                           wrangler.jsonc, pending-pages.mjs, Wireframe.astro, migration-status.astro,
                           migration-pending.astro, Search.astro
```

Installing the plugin also installs Anthropic's `frontend-design` skill (official marketplace), which the agent uses for every design decision. For design reviews it can also use [impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, listed in this marketplace, pinned to a tested version): `/plugin install impeccable@cms-to-astro`. Impeccable installs hooks that run at session start, after file edits and at the end of each turn, so install it at project scope for the migration project if you don't want it everywhere.

The scripts need Node.js 22 or newer (current LTS recommended). Browser-based steps use the `playwright` npm package, installed into the project's `.migration/tools` folder. They drive Playwright's Chromium, or your installed Chrome or Edge, so usually nothing else needs downloading. No Docker.

## Status

0.4. Tested on four real websites: WordPress with a page-builder theme and custom post types, a five-language TYPO3 site with an agency theme, and WordPress with Elementor (each as an exact copy; a two-page pilot reached identical page heights against the original at desktop and phone width), and a two-language TYPO3 corporate site with news (new design on the same content: about 180 pages and 790 media files extracted, a six-page pilot with no content missing). The last run showed that adopting a ready-made Astro theme costs several times more than building the design on the project's own components; the skill now uses themes as visual models only. Joomla, Drupal and hosted builders (Wix, Squarespace, Webflow) are covered by the generic route and documented, but not yet tested end to end. Token estimates for the 1:1 copy are calibrated on these runs and are rough (±50%). The "new design on the same content" route is new in 0.4: its structure capture was checked on the same three sites. Its estimates and those of the "similar look" route are derived from the 1:1 runs and not yet calibrated by a full test migration.

Issues and pull requests welcome.

## License

MIT
