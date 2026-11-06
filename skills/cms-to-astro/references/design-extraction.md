# Design extraction and visual comparison

The owner judges the result by looking at it. Measure what can be measured, look at everything else. This file covers the exact 1:1 copy and the similar look (§7); for a new design on the same content, see new-design.md.

## Contents
1. Capture
2. From values to tokens
3. Interaction states and theme effects
4. Fidelity by kick-off choice
5. The comparison loop
6. What not to copy
7. Similar look: recognisable, not pixel-exact

## 1. Capture

Per page type (home, a normal page, a post, one item of each custom type, the contact page):

```bash
node <skill-dir>/scripts/snapshot.mjs <urls…> --out .migration/snapshots/live --styles --content --interactions --layout --hide-consent
```

What the script already handles, so you don't need to do it by hand:

- **Desktop and phone:** default widths 1440 and 390 (add `--widths 1440,1024,390` for a tablet check).
- **Lazy loading and scroll-reveal:** it scrolls the whole page before capturing; content that fades in on scroll is visible in the screenshots and in `content.html`.
- **Hidden ancestors:** colours and samples come only from visible elements (hover-only overlays don't pollute the palette).
- **Interactions:** hover states (nav links, buttons, repeated image tiles), dropdown submenus, the header after scrolling, the opened mobile menu.
- **Layout:** `layout-<width>.json` lists every visible block (sections, columns, headings, images, text blocks) with position, size, padding, margin, font and colours, skipping wrappers that add no box of their own. This is where page-builder themes keep their real design: section paddings, column widths, title-band heights.

Still check by eye: cookie banners covering content (capture again after dismissing, or note it), sliders (only the first slide is captured), video players, tabs and accordions (closed state only), and anything behind a click.

Open the screenshots and look. Write down in MIGRATION.md what you see that the numbers don't say (a diagonal section edge, a background texture, a hand-drawn illustration, image crops).

### Clean captures

Old sites rarely look the same twice: cookie banners, scroll-in animations, autoplay videos, sliders. Make captures deterministic, and use the same flags for the old and the new site:

| Problem | Flag |
|---|---|
| Cookie/consent banner covers content, pollutes design values and hover captures | `--hide-consent` (common tools built in); others: `--hide "#banner, .overlay"` |
| A consent click is needed to show content (e.g. a map) | `--click "<accept button selector>"` |
| Scroll-in effects not finished, content half-faded | `--no-animations` |
| Header video or slider changes between captures | `--hide "<video selector>"` on both sides, note it in the known-differences file |

Never hide anything in the `--privacy` capture: it measures a real first visit.

Speed: with screenshots a page takes 10–60 s depending on flags (`--privacy` and `--interactions` are the slow ones). For fix-and-check rounds capture only `--layout --no-screenshots` at one width; take full captures for the owner gallery.

**Where page builders keep their exact values.** Screenshots and layout files show the result; the builder's generated CSS shows the intent (paddings, per-breakpoint overrides, custom CSS snippets):

| Builder | Where to look |
|---|---|
| Elementor | `/wp-content/uploads/elementor/css/post-<page id>.css`, the kit `post-<kit id>.css`, inline `elementor-frontend-inline-css`; pair elements by `data-id` |
| Divi | `/wp-content/et-cache/<page id>/…css` |
| WPBakery | inline `vc_custom_<id>` rules in the page |
| Avada, GoodLayers and other theme builders | the theme's generated/dynamic CSS file in `uploads` and inline `<style>` blocks |
| TYPO3 agency themes | the theme's CSS in `typo3conf/ext/<theme>/Resources/Public/` |

`snapshot.mjs --css-rules "<selector regex>"` dumps matching rules with their media queries from all same-origin stylesheets.

## 2. From values to tokens

From `styles.json`:

| styles.json | Becomes | Notes |
|---|---|---|
| `typography` (body, h1–h6, p, a, nav, buttons, footer) | font families, sizes, weights, letter-spacing, text-transform per element | Build a small type scale; the theme often uses odd sizes (15px, 38px), keep them in 1:1 mode |
| `textColors`, `backgroundColors` | `--color-*` tokens named by role | The most frequent text colour is body text; the accent is the colour used for links/hover/headings |
| `fontFaces`, `loadedFonts`, `fontFamilies` | Fontsource packages with the weights actually used | Drop weights that never appear |
| `centeredContainerWidths` | container `max-w-[…]` | Often 1100 to 1200 px |
| `breakpoints` | Tailwind breakpoints | Defaults (640/768/1024/1280) are fine unless the theme switches layout at a clearly different width |
| `borderRadii` | radius tokens | |
| `effects`, `fixedOrSticky`, `backgroundImages` | section 3 | |

## 3. Interaction states and theme effects

From `interactions-<width>.json` and the screenshots:

- **Hover:** each entry lists changed properties (`color`, `opacity`, `transform`, `scale` …) on the element and its children, e.g. a nav link `color: rgb(17,17,17) → rgb(194,65,12)`, an image tile `img transform → scale(1.1)` plus an overlay `opacity 0 → 1`. Rebuild with Tailwind `hover:` / `group-hover:` and matching `transition` durations.
- **Submenus:** screenshots show dropdown look; build as CSS `:hover`/`:focus-within` menus that also work with the keyboard.
- **Sticky header:** `stickyHeader.elements` tells position, height and background after scrolling (themes often switch to a smaller, opaque header).
- **Mobile menu:** `menu-open-390.png` shows the open state; rebuild with `<details>` or a tiny script, no framework needed.
- **Parallax** (`effects` with `data-parallax-speed` or similar): reproduce the theme's formula instead of guessing. Common pattern (GoodLayers and others): a background layer inside a clipped box; layer height = box height + (viewport height − box height) × speed; on scroll, `translateY = speed × (scrollY − box top)`. Speed 0.8 means the image drifts at 20% of the scroll speed. Use `requestAnimationFrame`, a passive scroll listener, and skip it for `prefers-reduced-motion`.
- **Scroll-reveal animations:** keep them subtle or drop them (ask the owner); they hide content from screenshots and some readers.
- **Sliders:** see incompatibilities.md; capture what the slides contain before deciding.

## 4. Fidelity by kick-off choice

| Choice | Aim | Deviations |
|---|---|---|
| Exact 1:1 copy | Same look at a glance on desktop and phone: layout, type, colours, spacing, images, hover | Only where technically unavoidable (e.g. slider → static), plus fixes the owner agreed to; list each one |
| Similar look | Recognisably the same site: colours, fonts, arrangement of each page, menu behaviour | Spacing and sizes by eye; obvious fixes (contrast, font sizes, mobile layout) welcome, each listed (§7) |
| New design, same content | Not covered here: no detailed capture, no pixel comparison | See new-design.md (brand basics, structure summary, design directions, content check) |

Accessibility problems found in the old theme (light grey text failing contrast, missing focus styles, tiny tap targets) are always listed as suggestions, even in 1:1 mode.

## 5. The comparison loop

1. Build and serve the production output: `npm run build && npm run preview -- --host` (in the background). Not the dev server: its toolbar shows up in screenshots. Use the machine's network IP if the browser runs in a container.
2. Capture the new pages with the same widths and flags: `snapshot.mjs http://<ip>:4321/ http://<ip>:4321/about/ --out .migration/snapshots/new --layout` (add `--interactions` for hover/menu checks). Page folders are named after the URL path, so old and new pair up.
3. Compare: `compare.mjs .migration/snapshots/live .migration/snapshots/new --out .migration/comparison`. Per page and width it writes an old | new | difference image, the share of differing pixels, the height difference and the worst 100 px bands.
4. Work from the top down: a 1 px offset high up shifts everything below and turns every photo red, so fix vertical drifts first. Run `layout-diff.mjs <old layout> <new layout>`: it pairs blocks by text and image names, prints the first vertical drift (fix that, rerun) and the largest size, spacing and typography differences. For a single element, `--measure "<selector>;;<selector>"` on both sides; for sub-pixel offsets, `--precise`.
5. Repeat until only agreed deviations remain. Typical end state for a 1:1 copy: page heights within a few pixels, a few percent of differing pixels from font rendering.
6. Show the owner `.migration/comparison/index.html` (desktop and phone; `--lang de` for a German gallery). List accepted differences in `.migration/known-differences.txt` (`home: the cookie banner is gone`, `*: fonts are now served from the site itself`) and pass it with `--notes`, so the owner sees them explained next to the pictures.

**Font details that cost pixels:** a different weight inside a line (a bold heading with a normal-weight link) changes the line box by a pixel; icon fonts in two versions can draw different glyphs for the same class; some fonts replace characters like `>` with arrows. Self-host exactly the old font files (licence permitting) rather than a "similar" font.

Capture both sides with `--content` too: `compare.mjs` then lists visible text and links that exist on only one side. "Only on the old site" means dropped content; "only on the new site" usually means an element the old theme hides (a disabled widget, an off-canvas block, a per-page option) that was rebuilt anyway. Image paths and the old-vs-new domain are normalised, so what remains is worth a look.

**Page-builder surprises that only measuring reveals:** empty spacer paragraphs (`<p>&nbsp;</p>`) and spacer elements that create vertical gaps; per-page options (a page without footer, a transparent header only on some pages, different title-band heights); negative margins on overlapping sections. Reproduce them as layout, not as empty content.

## 6. What not to copy

- The theme's CSS and JS files wholesale: bloated, often licensed (premium themes), and tied to the old markup. Rebuild with Tailwind. Reading them for exact values is fine.
- Tracking, chat widgets, cookie tools: decided in stage 2, not carried over silently.
- Images from stock agencies: confirm the licence covers continued use (it usually does for the same site, but check with the owner if unsure).

## 7. Similar look: recognisable, not pixel-exact

For owners who want "our site, just without the CMS" but don't need every pixel. Most of the 1:1 cost is the measuring loop (§5); this route keeps the design inputs and drops the loop.

**Capture** (stage 4): the home page and one page per content type, plus the menu behaviour on the home page, then the structure summary:

```bash
node <skill-dir>/scripts/snapshot.mjs <home> <one URL per content type> \
  --out .migration/snapshots/live --styles --content --hide-consent
node <skill-dir>/scripts/snapshot.mjs <home> --out .migration/snapshots/live --interactions --no-screenshots --hide-consent
node <skill-dir>/scripts/structure.mjs
```

**Character inventory** (stage 4, before building): list what makes the old site recognisable beyond colours and fonts: a slanted or curved section edge, a dark band with an illustration, a photo treatment, a badge or seal, the shape of the menu, an unusual layout of one section. Record it in MIGRATION.md. These are what visitors recognise; flattening them into generic cards and plain bands is the typical failure of this route, and the side-by-side check treats a missing one like missing text.

**Build** (stage 6): tokens from `styles.json` (colours by role, fonts, type sizes, container width; fonts only if the licence allows self-hosting, else a close free font). Build each page type by looking at its screenshot: the same sections in the same order and arrangement, the same colours and type, similar proportions; the components follow the section kinds in `structure.md`. Header, menu and footer match the original closely, since visitors recognise a site by them. Skip `--layout`, `layout-diff.mjs`, `--measure` and the parallax formulas; a simpler effect, or none, is fine.

**Check:** capture the new pages with `--content` and run `compare.mjs --content-only` (old and new side by side, plus visible text and links present on only one side). Look at the side-by-side images and fix what is *noticeably* different (a missing section, wrong colours, a header that looks different, a broken phone layout, an item from the character inventory that got lost). The design-quality steps in SKILL.md apply to the fixes you make on purpose. One or two rounds, then show the owner. Don't chase spacing by pixels.

List the fixes you made on purpose (contrast, font sizes, mobile layout) in the notes file and in MIGRATION.md (Agreed design deviations).
