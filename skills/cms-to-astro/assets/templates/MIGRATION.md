# Website migration: {{domain}}

Progress file for moving {{domain}} from {{cms}} to a static Astro site. The agent updates it at the end of every stage. Picking up the work: read HANDOVER.md first, then this file, then PLAN.md (page-by-page status, refresh with `plan.mjs report`).

## Source

- Live site: {{url}}
- CMS: {{cms}} ({{theme / page builder}})
- Extra sources: {{admin export? theme repo? none}}
- Ownership / authorization confirmed: {{yes, by whom, date}}

## Decisions

| Topic | Decision | Date |
|---|---|---|
| Design | {{new design on the same content / similar look / exact 1:1 copy}} (plan.mjs --mode {{new / similar / copy}}) | |
| Design source (new design only) | {{clean design from the brand / Astro theme X (licence …) / designer's files}}; chosen direction: {{…}} | |
| Languages | {{de only / de + en (stored translations) / mixed-language pages / drop machine translation …}} | |
| Cookie banner / consent | {{none needed (no tracking, click-to-load embeds) / lightweight banner for X}} | |
| Third parties on the new site | {{host, form service, …}} | |
| Search | {{none / Pagefind, covering …}} | |
| Order of content types | {{e.g. home + pages styled first, projects next, posts as wireframes until …}} | |
| Git host | {{GitHub / GitLab / … / later}} | |
| Hosting | {{Cloudflare Workers / Netlify / existing web space / later}} | |
| Publishing flow | {{preview first / direct}} | |
| Who edits later | {{names / roles, how often}} | |
| Node version | {{from .nvmrc}} | |
| UI libraries | {{defaults (Base UI via shadcn, Tailwind, motion, Fontsource, Iconify, Embla, PhotoSwipe; references/libraries.md) / exceptions: …}} | |

## Accounts

- Git host account: {{username, signed in on this machine? (gh auth status)}}
- Hosting account: {{Cloudflare account e-mail, signed in? (npx wrangler whoami)}}

## Stages

- [ ] 0 · Kick-off (design route, git, hosting), tools, accounts
- [ ] 1 · Intake
- [ ] 2 · Inventory and incompatibility report
- [ ] 3 · Project scaffold
- [ ] 4 · Design extraction (copy, similar look) / brand and structure (new design)
- [ ] 5 · Content extraction
- [ ] 6 · Pilot (home + key pages) approved
- [ ] 7 · All pages built and compared
- [ ] 8 · Agent harness and owner guide
- [ ] 9 · Repository and CI
- [ ] 10 · Preview deployment
- [ ] 11 · Go-live

## Content types

| Type | Old URLs | Count | Source | Collection / route | Status |
|---|---|---|---|---|---|
| {{pages}} | {{/<slug>/}} | {{n}} | {{REST API / rendered}} | {{src/content/pages, [...path].astro}} | {{todo}} |

## Languages

{{Only if more than one language or mixed-language pages: kind of multilingual site, pages per language, untranslated pages, URL scheme.}}

## Privacy findings (old site, first visit without consent)

{{Third parties contacted, cookies set, consent tool; source: .migration/snapshots/live/*/privacy.json}}

## Features needing a decision

| Feature | Where on the old site | Decision | Status |
|---|---|---|---|
| {{contact form}} | {{/contact/}} | {{form service X}} | {{todo}} |

## Pilot comparison

| Page | Width | Diff % (exact copy only) | Height old → new | Remaining differences (explained); new design: text/links missing on the new site |
|---|---|---|---|---|
| {{home}} | {{1440}} | {{…}} | {{…}} | {{e.g. cookie banner removed}} |

## Texts drafted by the agent, waiting for the owner's review

- {{e.g. notice text for the click-to-load video; privacy policy changes}}

## Agreed design deviations

{{Similar look or exact copy: each deliberate change (fixes, simplified effects) with a before/after reference. New design: the brand basics kept (logo file, colours, fonts and their licence), the components built, and content deliberately left out or changed (normally none).}}

## Not migrated yet / links still pointing to the old site

- {{path}}: {{reason}}

## Open questions

- {{question}} ({{asked when, waiting for whom}})

## Log

- {{YYYY-MM-DD}}: {{stage}} done. {{one line on what happened}}
