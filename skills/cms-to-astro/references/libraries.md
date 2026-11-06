# Default libraries

Every migrated site needs the same handful of interactive pieces: a header menu with dropdowns and a phone drawer, a lightbox for galleries, sometimes a carousel, scroll effects, icons, web fonts. Don't build them by hand per site. Use these libraries and the skill's ready-made components (`assets/ui/`, installed by `scripts/install-ui.mjs`); they handle keyboard use, focus, screen readers, reduced motion, language labels and the no-JavaScript case, which hand-built versions usually miss.

Pick them without asking. Use something else only when the owner (or the developer running the migration) names another library, or for the parts a theme recipe brings itself (below). Record the choice in MIGRATION.md (Decisions → UI libraries).

## Contents
1. The defaults
2. When they don't apply
3. Setup
4. Tokens: shadcn's variables are the design tokens
5. Header navigation: SiteNav (Base UI)
6. Other widgets: shadcn components on Base UI
7. Lightbox: PhotoSwipe
8. Carousel: Embla
9. Scroll effects: motion
10. Icons: Iconify
11. Fonts: Astro Fonts API with Fontsource
12. Tested with

## 1. The defaults

| Need | Library | In `.astro` (no React) | Inside a React island |
|---|---|---|---|
| Components: menus, drawers, dialogs, tabs, accordions, select, tooltips | **Base UI** through **shadcn/ui** (`--base base`) | – (always an island) | `src/components/ui/*` from `npx shadcn add`; `SiteNav.tsx` for the header |
| Styling | **Tailwind CSS 4** + shadcn's CSS variables | utilities + tokens | same |
| Animation | **motion** | `Motion.astro` (`data-reveal`, `data-parallax`) | `motion/react` |
| Fonts | **Fontsource** fonts through the **Astro Fonts API** | `<Font>` in the head | same CSS variables |
| Icons | **Iconify** sets through **astro-icon** | `<Icon name="lucide:mail" />` | `lucide-react` (shadcn's icon library, same Lucide set) |
| Carousel / slider | **Embla** | `Carousel.astro` | shadcn `carousel` |
| Lightbox | **PhotoSwipe 5** | `Lightbox.astro` | – (wrap the island's output in `Lightbox`) |

Not chosen: keen-slider (no release since 2023), Swiper (heavier, brings its own CSS), Fancybox (commercial licence), icon fonts (heavy, inaccessible), Google's font CDN (privacy), Iconify's runtime API components (a request to api.iconify.design on every page view).

The header menu makes React part of every page: about 125 KB of JavaScript (gzip) on every page, measured: React runtime 65 KB, Base UI menu + drawer 59 KB. That is the accepted price for one tested, accessible menu instead of a hand-built one per site. Lightbox, carousel and scroll effects don't need React (gzip: lightbox 6 KB plus PhotoSwipe's 17 KB on the first click and carousel 9 KB, both only on pages that use them; scroll effects 8 KB, in the layout).

## 2. When they don't apply

- **The owner or developer names another library:** use it; note it in MIGRATION.md.
- **Theme recipe** (ScrewFast, AstroWind, Starlight): the recipe is tested with the theme's own header and components (ScrewFast's navbar runs on Preline, Starlight brings its own components). Keep those; use the defaults for everything you add (gallery lightbox, carousel, scroll effects, icons): `install-ui.mjs --only lightbox,carousel,motion,icons`. AstroWind already uses astro-icon (Tabler set).
- **Exact 1:1 copy:** same libraries, no shadcn look. shadcn components and `SiteNav` are the site's own code: restyle them to the measured values (`classes` props, or edit the files). The preset's rounded hover backgrounds must not leak into a copy.

## 3. Setup

In stage 3, after the scaffold and the migration kit:

```bash
node <skill-dir>/scripts/install-ui.mjs            # all; --only icons,nav,lightbox,carousel,motion; --dry-run
```

It installs astro-icon with the Lucide and Simple Icons sets, React, shadcn/ui on Base UI (`shadcn init --base base --preset nova`, then `shadcn add navigation-menu sheet button`), PhotoSwipe, Embla and motion; adds the integrations to `astro.config.mjs` by a small text edit (not `astro add`, which reformats the file and moves the kit's "remove at go-live" comment onto the wrong line); sets JSX and the `@/*` path alias in `tsconfig.json`; removes the Geist web font the shadcn preset brings; copies the components to `src/components/site/`. It never overwrites a component or a shadcn file that exists (`--force` for the components). If `tsconfig.json` has comments it stops and asks for the alias by hand: `"baseUrl": "."`, `"paths": { "@/*": ["./src/*"] }`, `"jsx": "react-jsx"`, `"jsxImportSource": "react"`.

Fonts are configured per site (§11); the script doesn't touch them.

## 4. Tokens: shadcn's variables are the design tokens

shadcn components read CSS variables from `src/styles/global.css` (`:root { --primary: … }`, mapped to Tailwind colours in `@theme inline`). Put the site's design values there, so shadcn components, `SiteNav` and your own templates share one set of tokens:

| Variable | Fill with |
|---|---|
| `--background`, `--foreground` | page background, body text |
| `--primary`, `--primary-foreground` | brand/accent colour, text on it (buttons) |
| `--muted`, `--muted-foreground` | subtle surfaces, secondary text |
| `--accent`, `--accent-foreground` | hover/active surfaces (menu items) |
| `--popover`, `--popover-foreground` | dropdown and drawer panels |
| `--border`, `--input`, `--ring` | lines, form borders, focus ring |
| `--radius` | the site's corner radius (`0` for square sites) |
| `--font-sans`, `--font-heading` (in `@theme inline`) | `var(--font-<body>)`, `var(--font-<display>)` from §11 |

Hex values are fine (the preset uses `oklch`). Roles shadcn lacks (a second brand colour, a footer band) go into `@theme` as `--color-<role>`. Delete the `.dark { … }` block unless the site has a dark mode. Then use the tokens: `bg-primary text-primary-foreground`, `text-muted-foreground`, `font-heading`.

## 5. Header navigation: SiteNav (Base UI)

`src/components/site/SiteNav.tsx`: desktop menu with dropdowns (Base UI navigation menu: hover, click, arrow keys, Escape) and a slide-in drawer below a breakpoint (Base UI dialog: focus trapped and returned, Escape, scroll lock).

```astro
---
import SiteNav from '@/components/site/SiteNav';
import navigation from '../data/navigation.json';   // from structure.md: [{ label, href?, children? }]
---
<header class="…">
  <a href="/">…logo…</a>
  <SiteNav client:load items={navigation.main} current={Astro.url.pathname} breakpoint="lg"
    labels={{ menu: 'Menü', close: 'Menü schließen', nav: 'Hauptnavigation' }}
    classes={{ link: '…', trigger: '…', dropdown: '…', drawer: '…' }} />
</header>
```

- `breakpoint` (`sm` `md` `lg` `xl`, default `md`): the width at which the old site switched to its burger menu (1024 px → `lg`).
- A parent with `href` and `children` opens a dropdown; its own page is the dropdown's first entry. Parents without `href` only open.
- `current` marks the page (`aria-current="page"`) and its parent (`data-current` on the trigger, for styling).
- `labels` per language (English defaults); with several languages pass the page's language strings.
- Every link is in the built HTML (dropdown content uses `keepMounted`): search engines, the kit's placeholder pages for links not built yet and the content comparison all see the whole menu. Keep that when editing the file.
- Without JavaScript the desktop links work; the phone drawer needs JavaScript, so the footer should link the main pages (most do).
- A language switcher sits next to it as plain links (`meta.languages` from the kit).

## 6. Other widgets: shadcn components on Base UI

`npx shadcn@4 add <component>` adds a component to `src/components/ui/`; use it inside a small island of your own (`src/components/site/<Name>.tsx`) with `client:visible` (or `client:load` above the fold). Typical: `accordion` (FAQ), `tabs`, `dialog`, `select`, `tooltip`, `carousel` (inside islands).

```tsx
// src/components/site/Faq.tsx; in a page: <Faq client:visible items={faq} />
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
export default function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion>
      {items.map((it, i) => (
        <AccordionItem key={i} value={String(i)}>
          <AccordionTrigger>{it.q}</AccordionTrigger>
          {/* keepMounted: closed answers stay in the page (content comparison, find in page) */}
          <AccordionContent keepMounted hiddenUntilFound>{it.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
```

- shadcn components contain English screen-reader texts (`Close`, `Previous slide`, `Next slide`): translate them in the generated file for other languages.
- Props of islands must be serialisable (plain data, no functions); pass Markdown as rendered HTML strings only when you trust the source (your own content files).

## 7. Lightbox: PhotoSwipe

`src/components/site/Lightbox.astro` turns every link to an image file that contains an `<img>` into a lightbox slide; everything else inside stays a normal link. Without JavaScript the link opens the image.

```astro
<Lightbox><Content /></Lightbox>                         <!-- Markdown: [![alt](thumb.jpg)](large.jpg) -->
<Lightbox><ul class="grid …">{items.map(…)}</ul></Lightbox>
```

Kit gallery block with a lightbox (integration point 3):

```astro
---
// src/migration/theme/blocks/Gallery.astro; in index.ts: blocks = { ...blocks, gallery: Gallery }
import KitGallery from '../../blocks/Gallery.astro';
import Lightbox from '../../../components/site/Lightbox.astro';
---
<Lightbox><KitGallery {...Astro.props} /></Lightbox>
```

- **Image size.** PhotoSwipe needs the large image's size. Give it at build time where you can: `const s = await imageSize('/media/…/photo.jpg')` (`src/components/site/image-size.ts`, reads files in `public/`), then `data-pswp-width={s?.width} data-pswp-height={s?.height}` on the link. Without it the component measures the clicked image before opening and corrects every other slide once loaded (a short delay on the first click).
- Thumbnails shown with `object-fit: cover` (cropped tiles) are detected and flagged, so the opening animation fits.
- Captions come from the link's `<figure><figcaption>`; alt texts from the thumbnail.
- Labels follow `<html lang>` (English and German built in; `labels` for others).
- Links must point to downloaded images on the site itself. Links to the old domain are not taken over; download first (`download-assets.mjs`).

## 8. Carousel: Embla

The migration advice stays: replace sliders with static content unless the owner wants to keep one (incompatibilities.md). When it stays, `src/components/site/Carousel.astro`:

```astro
<Carousel label="Projects" perView={{ base: 1, md: 2, lg: 3 }} gap="1rem" loop autoplay={6000}>
  {projects.map((p) => <article>…</article>)}   <!-- each direct child is a slide -->
</Carousel>
```

- Without JavaScript: a horizontally scrolling row with scroll snapping.
- Slides get `role="group"`, "2 of 5" labels; slides out of view are `inert`; controls hide when everything fits.
- Autoplay is off by default. With `autoplay`, a pause button appears (WCAG 2.2.2), autoplay stops on hover, focus, dragging and any click on the controls, and never runs for visitors who prefer reduced motion.
- Pitfalls the component already handles: Embla's autoplay plugin emits `autoplay:play`/`autoplay:stop` *before* `isPlaying()` changes (read the state from the event); its `stopOnInteraction` covers dragging only, not button clicks; slide spacing needs padding plus a negative container margin (CSS `gap` breaks loop maths); slides need `min-width: 0`.
- Screenshots capture only the first position: compare slide contents with `--content`, not pixels.

## 9. Scroll effects: motion

Include `src/components/site/Motion.astro` once in the base layout (before `</body>`), then mark elements:

| Attribute | Effect |
|---|---|
| `data-reveal` | fades in and up when scrolled into view (`data-reveal="fade"`: fade only; `data-reveal-delay="0.2"`) |
| `data-reveal-stagger` | the element's children, one after another |
| `data-parallax="0.15"` | moves slower than the page; put it on an oversized image inside an `overflow: hidden` box |

- Content stays visible without JavaScript, for reduced motion, and for elements already on screen at load (no flash, stable screenshots; `snapshot.mjs --no-animations` emulates reduced motion, so captures show the end state).
- Reproduce the old site's effects (AOS, WOW.js, Elementor motion effects) with these attributes; take the parallax speed from the recorded theme parameters (design-extraction.md) and adjust the formula in the component if the theme's differs.
- Hover and focus effects stay CSS (Tailwind `transition`, `group-hover:`); motion is for scroll and entrance effects.
- The component imports `animate` from `motion/mini` (browser animation engine, 8 KB with `inView`/`scroll`) instead of the full `animate` (29 KB). Use the full one only for springs or animating non-CSS values.
- In React islands: `motion/react`, wrapped in `<MotionConfig reducedMotion="user">`.

## 10. Icons: Iconify

```astro
---
import { Icon } from 'astro-icon/components';
---
<Icon name="lucide:phone" class="size-5" aria-hidden="true" />          <!-- next to visible text -->
<a href="…" aria-label="LinkedIn"><Icon name="simple-icons:linkedin" class="size-5" aria-hidden="true" /></a>
<Icon name="old-site-arrow" class="size-4" />                         <!-- src/assets/icons/old-site-arrow.svg -->
```

- astro-icon inlines the SVG at build time (`currentColor`, hover colours work); nothing is fetched by the browser.
- Sets: `lucide` for interface icons (the set shadcn uses), `simple-icons` for brand logos (Lucide has none: LinkedIn, Xing, Instagram, Facebook, YouTube, X, WhatsApp …). Others with `npm i @iconify-json/<set>` (`tabler`, `mdi`, `ph`). Browse names at icon-sets.iconify.design.
- **Exact copies of sites with Font Awesome:** install the matching set and keep the glyphs without the font: `@iconify-json/fa6-solid` / `fa6-brands` (FA 6), `fa-solid` / `fa-brands` (FA 5, Elementor's default), `fa` (FA 4.7). `fas fa-phone` → `fa-solid:phone`.
- Own SVGs (logo, the old site's custom icons, the snapshot's `logo.svg`) are files in `src/assets/icons/`, used by file name. Never paste path data into templates.
- Inside React islands use `lucide-react` (installed with shadcn). Never `@iconify/react`'s online mode or the `iconify-icon` web component: they load icons from api.iconify.design at runtime.

## 11. Fonts: Astro Fonts API with Fontsource

```js
// astro.config.mjs
import { defineConfig, fontProviders } from 'astro/config';
export default defineConfig({
  fonts: [
    { provider: fontProviders.fontsource(), name: 'Inter', cssVariable: '--font-inter',
      weights: ['100 900'], styles: ['normal'], subsets: ['latin', 'latin-ext'] },
    { provider: fontProviders.local(), name: 'Brand Serif', cssVariable: '--font-brand', fallbacks: ['serif'],
      options: { variants: [
        { src: ['./src/assets/fonts/brand-400.woff2'], weight: 400, style: 'normal' },
        { src: ['./src/assets/fonts/brand-700.woff2'], weight: 700, style: 'normal' },
      ] } },
  ],
});
```

```astro
---
import { Font } from 'astro:assets';
---
<head>
  <Font cssVariable="--font-inter" preload={[{ subset: 'latin' }]} />
  <Font cssVariable="--font-brand" />
</head>
```

and in `global.css`: `@theme inline { --font-sans: var(--font-inter); --font-heading: var(--font-brand); }`.

- Open-source fonts (every Google font and more): `fontProviders.fontsource()`. It downloads the files at build time (the build needs internet, CI has it) and serves them from `/_astro/fonts/`: no request to a font service from the visitor's browser.
- The old site's own or licensed fonts: `fontProviders.local()` with its files in `src/assets/fonts/` (licence: privacy-and-legal.md).
- Weights: a range (`'100 900'`) for variable fonts, else only the weights the design uses.
- `preload` only the main text font's `latin` subset; `preload` without a filter preloads every subset file.
- Fallback metrics are generated automatically (less layout shift); end `fallbacks` with a generic family.
- **Wrong family names fail silently:** the build passes with only a warning (`No data found for font family …`) and the site falls back to system fonts. Read the build output after adding a font. Fontsource names match Google's ("Source Sans 3", "Inter").
- **Don't use `fontProviders.npm()`** in Astro 7.4: it resolves installed `@fontsource` packages to `file://` URLs that Astro's font fetcher can't read (`CannotFetchFontFile`). And don't keep `@import "@fontsource…"` in CSS next to the Fonts API (two copies of the font).

## 12. Tested with

Astro 7.4.7, Node 24.18, React 19.3 (`@astrojs/react` 7.1), shadcn 4.23 (preset `base-nova`, `@base-ui/react` 1.9), motion 14.10, embla-carousel 8.6, photoswipe 5.4.4, astro-icon 1.2.0, Chromium (Playwright 1.65). A lab site with all components, plus a fresh project with the migration kit and `install-ui.mjs` (build, rerun without changes, config comments kept, kit placeholders for dropdown links).

Browser checks (64, all passing): every menu link in the built HTML; dropdown by hover, click and keyboard, Escape; drawer as dialog with focus in and back, current page marked; lightbox with and without known sizes (portrait and panorama slides in their real proportions), captions, German labels, Escape; carousel per-view sizes, slide labels, inert slides, controls stopping autoplay, pause/play state; reveal only below the fold, stagger, parallax; reduced motion (no hiding, no autoplay, no parallax); no JavaScript (content visible, image links, scrollable row, menu links); fonts loaded from the site itself; no third-party requests; no console errors. Mutation checks: removing `keepMounted`, ignoring reduced motion and dropping the slide correction each made the matching checks fail.
