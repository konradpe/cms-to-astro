/**
 * The kit's three integration points, Starlight recipe (cms-to-astro: references/themes/starlight.md).
 *
 *   Shell       StarlightShell.astro: the kit's own pages (placeholders, 404 per language, status
 *               page) in Starlight's frame. Docs pages don't go through it: Starlight renders
 *               src/content/docs itself, with src/migration/starlight/route-data.ts and the
 *               overrides in astro.config.mjs `components`.
 *   templates   not used: a docs page's layout is Starlight's `template` (doc | splash) plus the
 *               component overrides.
 *   blocks      the kit's default blocks, kept for the kit's Blocks.astro (not rendered from
 *               frontmatter in this recipe; Starlight pages compose sections with MDX components).
 *
 * Contracts in detail: KIT.md.
 */
import Shell from './StarlightShell.astro';
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

export const templates: Record<string, Component> = {};

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
