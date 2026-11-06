/**
 * The kit's three integration points, wired to the ScrewFast theme (recipe: references/themes/screwfast.md
 * in the cms-to-astro skill).
 *
 *   Shell       the theme's layout, src/layouts/MainLayout.astro: <head> with the kit's <Meta>,
 *               Navbar and FooterSection fed from src/data_files/navigation.ts.
 *   templates   page: ProseTemplate.astro (the theme's article column and prose).
 *   blocks      hero, text, image-text, cards, contact: theme-styled adapters in ./blocks/;
 *               gallery, video, map: the kit's defaults (aligned to the theme by ./kit.css).
 *
 * Contracts in detail: src/migration/KIT.md.
 */
import Shell from '../../layouts/MainLayout.astro';
import ProseTemplate from './ProseTemplate.astro';
import Hero from './blocks/Hero.astro';
import Text from './blocks/Text.astro';
import ImageText from './blocks/ImageText.astro';
import Cards from './blocks/Cards.astro';
import Contact from './blocks/Contact.astro';
import Gallery from '../blocks/Gallery.astro';
import Video from '../blocks/Video.astro';
import Map from '../blocks/Map.astro';

// Astro components are functions of their props; `any` keeps theme components assignable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Component = (props: any) => any;

export { Shell };

export const templates: Record<string, Component> = {
  page: ProseTemplate,
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
