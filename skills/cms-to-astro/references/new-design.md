# New design, same content

The kick-off option for owners who don't need the old look: take over everything visitors read and find (texts, images, pages, menus, addresses), keep the brand (logo, colours), and build a clean design from scratch instead of replicating the old theme. Content is still verified completely; only the pixel matching goes away.

## Contents
1. When to recommend it
2. What carries over, what is new
3. Stage 4: brand basics and structure
4. Where the design comes from
5. Stage 6: design direction, then the pilot
6. Components and content model
7. Checking without pixel comparison
8. Changing the look later
9. Pitfalls

## 1. When to recommend it

| Situation | Why it fits |
|---|---|
| The owner doesn't like the current look, or doesn't care | Copying a look nobody wants costs the most tokens of the whole migration |
| Page-builder or agency theme with many effects | Replicating builder layouts pixel by pixel is the most expensive part of a 1:1 copy |
| Premium theme or agency design with unclear rights | A new design avoids copying licensed CSS and layouts (ground rule 1) |
| Limited budget | No comparison rounds: roughly half the tokens per page type (estimates in PLAN.md) |
| The site will be maintained by an agent for years | Clean tokens and a small component set are easier to change than a copied theme's quirks |

Recommend a 1:1 copy instead when the owner likes the look, when visitors or stakeholders shouldn't notice the move, or when nobody is available to make a few design decisions.

If the owner also wants to rewrite texts or reorganise pages and menus, recommend doing that after the move, on the new site. One kind of change at a time is easier to check, and the content comparison stays meaningful.

## 2. What carries over, what is new

| Carries over unchanged | Built new | Left behind |
|---|---|---|
| All texts, images, files, alt texts | Layout, spacing, type scale | Theme CSS and JS |
| Page addresses (URLs): no redirects needed | Header, footer and menu look | Page-builder markup and layouts |
| Menu structure and labels, footer contents | Components (hero, cards, gallery …) | Sliders and scroll animations (unless wanted) |
| Page titles and descriptions (search engines) | Hover and focus styles | Icon fonts (replaced by SVG icons) |
| Logo, brand colours; fonts if the licence allows self-hosting | | |
| Legal pages, forms (with their replacement from stage 2) | | |

## 3. Stage 4: brand basics and structure

Skip the detailed design capture (`--interactions`, `--layout`, `--css-rules`). Capture the home page and one page of each content type, with screenshots (for the owner's side-by-side gallery later):

```bash
node <skill-dir>/scripts/snapshot.mjs https://example.com/ <one URL per content type> \
  --out .migration/snapshots/live --styles --content --hide-consent
node <skill-dir>/scripts/structure.mjs     # -> .migration/structure.md
```

`structure.md` lists the menus as trees (including submenus and the language switcher), the footer's texts and links, the pages per content type, an outline of each captured page (sections with a guessed kind: hero, text, image-text, cards, gallery, video, map, form), how often each section kind occurs, and the brand basics: logo (file or URL, or `logo.svg` for inline SVG logos), icons, theme colour, text and background colours, fonts. Read it instead of the page.json files. The section kinds are guesses from the markup: check them against one screenshot per content type. After stage 5 you can rerun it to include more pages (cheap).

Brand basics to settle:

- **Logo:** download the largest version (or the SVG). If only a small raster image exists, ask the owner for the original file (SVG or PDF from their designer): a sharp logo matters more in a clean design.
- **Colours:** one primary, at most one accent, and neutrals (text, background, borders). Take them from the logo and the old site; check text contrast (at least 4.5:1).
- **Fonts:** reuse the old fonts only if their licence allows self-hosting (privacy-and-legal.md). Otherwise choose a free font of similar character from Fontsource, loaded through the Astro Fonts API (libraries.md §11). Two families at most.
- **Images:** the old theme may have used small crops; for larger layouts take the originals (`download-assets.mjs --prefer-original`).

✋ Report to the owner: what the site consists of (menus, page types, section kinds), the brand basics to keep, and the design-source question (§4).

## 4. Where the design comes from

Ask, with a recommendation:

- **A · A clean design built from their brand** (recommended). You design it in stage 6: small mockups first, then the real pages, on the project's own components (§6).
- **B · A theme they like, as a model.** Let them pick a look from theme demos (astro.build/themes and similar; shortlist brief in delegation.md), then build that look on the project's own components: its fonts (if licensed), colour use, spacing, header and card style. Don't adopt the theme's code.
- **C · Designs from a designer** (Figma, PDF, images). Ask for the values (colours, fonts, spacing) or an export; build from them and show the result next to the design.

**Why not adopt a theme's code.** An Astro theme is not a skin that plugs into a site, as WordPress themes do. It is a complete starter project: its own routes, content collections and schema, demo pages with hard-coded text, its own language handling, scripts (animation and UI libraries), dark mode, often docs or blog sections. A migration needs the opposite: the old URLs (often several languages with translated slugs), the converted content, wireframes and placeholders. Adopting a theme means reading and dismantling someone else's project, then rebuilding its plumbing around the migration. In a test migration (a two-language TYPO3 site), adapting a well-made MIT theme and building a six-page pilot on it cost about 870k tokens, several times what designing on the project's own components costs. The theme's language support was irrelevant, since the old URL scheme comes from the catch-all route anyway.

If the owner still wants a theme's code (they bought it, or an agency delivered it): check the licence (MIT or a paid licence for one site; GPL needs a look by whoever handles their legal questions), the Astro major version, third-party requests (analytics, fonts, CDN scripts); remove its repository files (CODE_OF_CONDUCT, deploy configs for other hosts, AI guides that describe the theme rather than this site) but keep its licence notice; and budget for it. Copying single components (a card, a header) from an MIT theme, with its licence notice, is cheap and fine.

Record the choice in MIGRATION.md (Decisions → Design source).

## 5. Stage 6: design direction, then the pilot

**Design brief first.** Before any mockup, write a short brief in MIGRATION.md (Design source): who the site is for, the one thing visitors must be able to do, three words the owner uses for their company, sites they like and dislike (ask), the brand basics, and the character worth keeping from the old site (a distinctive photo style, an illustration, a logo treatment). Then load the `frontend-design` skill and make its design plan from this brief, and review the plan against its list of generic defaults before building anything. A theme chosen as a model (option B) goes through the same steps: its demo look is a default too.

**Design direction (option A).** Build two or three directions of the home page's first screen plus one typical section, as real pages in the project under `src/pages/design-options/` (one page per option, `<meta name="robots" content="noindex">`), with the real logo, colours, texts and images. Vary what changes the impression: type pairing, how colour is used (light or dark header, where the accent appears), density (airy or compact), hero style (large image or text first). Keep each option small; don't build three sites. Capture them with `snapshot.mjs` at both widths and show the owner the screenshots; they pick one or combine. Then delete `src/pages/design-options/`; the chosen option's code becomes the real layout and tokens.

**Critique before showing.** After the pilot pages are built, take desktop and phone screenshots and critique them against the design plan and frontend-design's list of generic defaults (identical rounded cards everywhere, one accent on everything, an all-caps label above every heading, numbered markers on things that aren't a sequence, fade-in on every section). If the `impeccable` skill is installed, run `/impeccable critique` and `/impeccable audit` on the pilot pages and `/impeccable polish` afterwards. Fix, then show the owner.

**Pilot.** Turn the chosen direction (or the model theme's look) into tokens (shadcn's variables for colours by role and radius, libraries.md §4; `@theme` for fonts, type scale, spacing, container width), build the base layout (header with `SiteNav` and the menu tree from structure.md, footer), the components for the section kinds of the pilot pages (§6), then the home page and one or two typical pages. The wireframe layout and placeholder pages work exactly as in a 1:1 migration.

## 6. Components and content model

One component per section kind that occurs on the site; rare kinds fold into a more general one (a "quote" can be a text section with a style option):

| Section kind | Component | Notes |
|---|---|---|
| hero | `Hero` | Image or colour background, heading, optional text and button |
| text | prose styles | Markdown body with `@tailwindcss/typography` (`prose`), tuned to the tokens |
| image-text | `ImageText` | Image left or right, alternating |
| cards | `CardGrid` | Image, title, short text, link; 2 to 4 columns, one column on phones |
| gallery | `Gallery` | Grid of originals, wrapped in `Lightbox` (libraries.md §7) |
| video | `VideoEmbed` | Click-to-load (privacy-and-legal.md) |
| map | `MapEmbed` | Static image with a link, or click-to-load |
| form | `ContactForm` | The replacement agreed in stage 2 |

Content model:

- **Text pages** (most pages, posts, legal pages): Markdown body, rendered with the prose styles. The converted content from stage 5 fits as is.
- **Composed pages** (home, landing pages, builder pages with several kinds of sections): the blocks pattern from astro-setup.md §5, a list of blocks in the frontmatter whose `type` matches a component. Build them from the screenshot, `raw.html` and the outline in structure.md, not from the converted Markdown alone: heroes, badges, logo rows and intro texts often sit outside the main content element and are missing there (content-to-md lists such text in a comment at the top of the file). Judgment work: main session, or a mid-size model with the brief in delegation.md.
- **Structured types** (projects, team members, products): real fields in the schema, one template per type.

## 7. Checking without pixel comparison

Pixel differences are meaningless when the design is new. Check what matters instead:

1. **Nothing lost:** capture old and new with `--content` and run `compare.mjs --content-only`. "Only on the old site" is dropped content: fix it (or record why it was dropped on purpose). "Only on the new site" is usually new interface text ("Menu", "Back to top"): explain it in the notes file. The gallery shows old and new side by side.
2. **Looks right:** look at the new pages' screenshots at desktop and phone width (one composite per page from the gallery is enough).
3. **Accessible:** text contrast, one `h1` and a logical heading order, alt texts, visible focus, tap targets of at least 44 px, correct `lang`.
4. **Addresses:** every old page path still exists (`plan.mjs report`; placeholders count until their type is built).

✋ The owner approves the pilot from the side-by-side gallery and the content check.

## 8. Changing the look later

Because content (Markdown and schema), URLs (the catch-all route) and look (design values plus a small set of components) are separate, a new look is a restyle, not a migration: change the token values (shadcn variables and `@theme`), then the header, footer, layouts and block components, and check the pages with `compare.mjs --content-only` against the previous build. A theme the owner likes is a model for that restyle, as in §4. AGENTS.md carries this rule for the owner's agent.

## 9. Pitfalls

- **Content drifting.** Rewording texts "while we're at it" breaks the content check and surprises the owner. Content edits come after go-live, at their request.
- **Menus.** Keep labels and order unless the owner decides otherwise; regular visitors and search engines know them. Submenus may become a dropdown, a mega menu or section pages: an agreed design decision.
- **Old CSS creeping back.** Don't import the theme's stylesheet "just for the values"; the brand basics from structure.md are enough.
- **Image proportions.** New layouts often need other aspect ratios: crop with CSS (`object-fit`, `aspect-ratio`), don't edit the files.
- **Icons.** Replace icon fonts with Iconify icons via astro-icon (Lucide for interface icons, Simple Icons for brands; libraries.md §10); never paste SVG path data into templates.
- **Mixed modes.** Copying some page types 1:1 and redesigning others gives an inconsistent site. When the owner wants one page type "as before" (e.g. a product sheet), keep its structure and order of information but build it from the new design's tokens and components.
