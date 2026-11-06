# Working economically: scripts, cheaper models, small context

A migration easily spends more tokens on mechanical work (fetching, converting, downloading, re-reading files) than on the parts that need judgment. Most owners pay for usage or have limits, so treat tokens like the owner's money.

## Contents
1. Where the tokens go
2. Rules for the main session
3. Delegating to a cheaper model
4. Ready-made briefs
5. Estimates for the owner

## 1. Where the tokens go

From test migrations, roughly: reading large outputs (raw HTML, full JSON, many full-page screenshots) and repeated measuring rounds cost the most; writing templates and talking to the owner cost comparatively little. So: let scripts do the work and print summaries; look at one composite image instead of several screenshots; read files once.

## 2. Rules for the main session

- **Scripts over hand work.** Inventory, snapshots, content conversion (`content-to-md.mjs`), downloads, comparison and the page plan are scripts that print short summaries. Read the summary, not the output files. Query JSON selectively (`node -e` or `jq` for one field) instead of reading it whole.
- **Images:** look at the comparison composite (`*-compare.png`) of a page rather than old and new full-page screenshots separately; crop to the worst band when one area matters (`--pages` to limit pages).
- **Read references once per session,** and only the section you need. MIGRATION.md, PLAN.md and HANDOVER.md are the memory; don't reconstruct state by re-reading the project.
- **One template per content type,** never page-by-page styling.
- **Wireframes first:** converted content in the wireframe layout costs almost nothing and shows the owner the whole site early; style a type only when it is next in the plan.
- **Stop measuring when it's good enough:** for a 1:1 copy, "heights within a few pixels and only font-smoothing differences" is done. Don't chase the last half percent. For a new design there is nothing to measure against: check content completeness (`compare.mjs --content-only`) and look at the result.
- **Keep owner messages short.** Details go into MIGRATION.md.

## 3. Delegating to a cheaper model

Hand well-defined, mechanical work to a subagent on a cheaper model and keep the main session for decisions, design, comparison judgment and owner communication.

In Claude Code: the Agent tool with a `model` choice (for example `haiku` for running scripts and checking outputs, `sonnet` for content clean-up that needs some judgment). In other harnesses, use their equivalent, or do the work in the main session following the same brief. Run delegated work in the background when the main session can continue meanwhile.

Good to delegate:
- Running a script over many URLs (snapshots, conversion, downloads) and reporting counts and failures.
- Cleaning up converted Markdown of many pages of one type (headings, leftovers, alt texts) by a clear rule set.
- Checking all pages of a type for one thing (images present, links relative, build passes).

Keep in the main session:
- Owner questions and reports, decisions from the stage-2 report.
- Design extraction and the first template of each type; judging comparison results.
- Anything that changes structure (collections, routes, layouts).

Name each delegated task in plain words in the owner's language (the task's description is what they see while it runs: "Copying the texts of 140 pages", not "run content-to-md batch"), run it in the background, and tell the owner in one line what is happening meanwhile. A brief is self-contained: the subagent knows nothing else. Give it the project path, the exact commands, the rules, what to write where, what not to touch, and what to report back (short).

## 4. Ready-made briefs

**Extract a content type (cheap model):**
> Project: `<path>`. Run from the project folder, with Node from `<node bin>`:
> 1. `node <skill-dir>/scripts/snapshot.mjs --urls-file .migration/urls-<type>.txt --out .migration/snapshots/live --content --no-screenshots`
> 2. `node <skill-dir>/scripts/content-to-md.mjs --snapshots .migration/snapshots/live --urls-file .migration/urls-<type>.txt --out src/content/<type>`
> 3. `node <skill-dir>/scripts/plan.mjs update`
> Don't edit any other files. Report in at most 8 lines: pages converted, failures (URL + error), pages with very little text.

**Clean up converted pages of one type (mid-size model):**
> Project: `<path>`. Files: `src/content/<type>/*.md` with `needsReview: true`. For each file: remove navigation and footer leftovers at the top or bottom of the body, theme labels that are layout (e.g. category tags repeated above the title), empty links and duplicate images; keep all real text, headings (start at `##`), images with their captions as alt text, and links. Keep frontmatter except: set `needsReview: false` when done. Don't rename or move files, don't touch templates. Run `npm run build` at the end. Report in at most 8 lines: files cleaned, anything you were unsure about (file + question).

**Download and rewrite media for one type (cheap model):**
> Project: `<path>`. Collect image and file URLs from `src/content/<type>/**/*.md` (every URL on the old domain, whatever folder: `/wp-content/uploads/`, `/fileadmin/`, `/uploads/`, `/typo3temp/`, …) into `.migration/media-<type>.txt`, then run `node <skill-dir>/scripts/download-assets.mjs --list .migration/media-<type>.txt --out public/media --rewrite src/content/<type>` (add `--prefer-original` only for lightbox/full-size images). Report: downloaded, failed (URL + error), files over 25 MiB.

**Shortlist themes as design models (mid-size model):**
> Find 5 to 7 Astro themes whose *look* suits <kind of organisation, e.g. "a logistics company's corporate site in German and English">. Sources: astro.build/themes and the themes' GitHub repositories. For each: name, demo URL (check it loads), repository, licence, last commit, one sentence on the look (layout, typography, colour use, density), and anything that would matter if we copied single components (third-party requests, heavy scripts). Judge by look and fitness for the content (corporate pages, news, galleries); ignore language support and content model, since only the look is reused. Write `.migration/theme-shortlist.md` with a table and a recommendation of three; report the three in at most 6 lines.

**Build a composed page (mid-size model, or the main session):**
> Project: `<path>`. Page: `<old URL>`, content file `<file>`. Build it as blocks (astro-setup.md §5) with the components in `src/components/blocks/`. Sources, in this order: the screenshot `.migration/snapshots/live/<page>/desktop-1440.png` (what is shown and in which order), `raw.html` (exact texts, links, image URLs; heroes and badges often sit outside the main content), the outline in `.migration/structure.md`; the Markdown body only as a text source. Keep every visible text and link. Then build, capture the page with `snapshot.mjs --content` and run `compare.mjs --content-only --pages <page>`; fix anything listed as only on the old site. Report in at most 8 lines.

## 5. Estimates for the owner

`plan.mjs report` writes rough token estimates per content type into PLAN.md: the cost of styling the rest (one template per type plus per-page clean-up) versus showing it as wireframes only. Use them when agreeing scope ("style the 38 project pages: roughly 100–300k tokens; wireframes only: 20–60k"). Say clearly that they are estimates (±50%).

Reference points from three test migrations: stages 0–6 with a two-page near-1:1 pilot took 370–540k tokens each, about 150k of it for setup and extraction and 60–140k per page template (4–7 comparison rounds). Most rework came from missing tools that the skill now ships (consent hiding, layout diff, content conversion), so real runs should land lower. For a new design on the same content (`plan.mjs --mode new`), the comparison rounds fall away and a design direction is agreed once; its estimates are derived from these runs (template cost about halved, plus ~40k for the design direction) and not yet calibrated. One data point against adopting a theme's code: in a two-language test site, adapting a full Astro theme plus a six-page pilot (four templates) took about 870k tokens on the largest model. The constants are at the top of `plan.mjs`; adjust them when real runs show different numbers.

Snapshots are the slow part (10–60 s per page depending on flags): delegate big batches and run them in the background.
