/**
 * The kit's three integration points. A theme recipe changes this file (and only this file in
 * src/migration/) to plug in the theme; the defaults are plain, semantic and theme-free.
 *
 *   Shell       the frame of every kit page: <html lang>, <head> with <Meta>, header, footer.
 *               Props { meta: PageMeta }, default slot = page content.
 *   templates   styled page templates by name; frontmatter `template` picks one, `page` is the default.
 *               Props { entry: MigrationEntry; meta: PageMeta; heading: string | false }, default slot =
 *               the rendered Markdown body. Rendered inside the Shell.
 *   blocks      block components by `type` (frontmatter `blocks`).
 *               Props = the block's fields + { locale: string; index: number }. Rendered inside the Shell.
 *
 * Contracts in detail and examples: KIT.md.
 */
import Shell from './Shell.astro';
import PageTemplate from './PageTemplate.astro';
import Hero from '../blocks/Hero.astro';
import Text from '../blocks/Text.astro';
import ImageText from '../blocks/ImageText.astro';
import Cards from '../blocks/Cards.astro';
import Gallery from '../blocks/Gallery.astro';
import Video from '../blocks/Video.astro';
import Map from '../blocks/Map.astro';
import Contact from '../blocks/Contact.astro';

// Astro components are functions of their props; `any` keeps theme components assignable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Component = (props: any) => any;

export { Shell };

export const templates: Record<string, Component> = {
  page: PageTemplate,
};

export const blocks: Record<string, Component> = {
  hero: Hero,
  text: Text,
  'image-text': ImageText,
  cards: Cards,
  gallery: Gallery,
  video: Video,
  map: Map,
  contact: Contact,
};
