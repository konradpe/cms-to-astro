/**
 * The kit's three integration points, wired to AstroWind by the cms-to-astro recipe
 * (skill: references/themes/astrowind.md). Contracts: src/migration/KIT.md.
 *
 *   Shell       AstroWind Layout + Header + Footer, menus from src/navigation.ts (AstroWindShell.astro)
 *   templates   `page`: AstroWind's Markdown typography (AstroWindPage.astro)
 *   blocks      AstroWind widgets where one fits, kit defaults in the theme's section frame otherwise
 *               (blocks/*.astro); `news-list` is an extra block of this recipe (latest news as cards).
 */
import Shell from './AstroWindShell.astro';
import Page from './AstroWindPage.astro';
import Hero from './blocks/Hero.astro';
import Text from './blocks/Text.astro';
import ImageText from './blocks/ImageText.astro';
import Cards from './blocks/Cards.astro';
import Gallery from './blocks/Gallery.astro';
import Video from './blocks/Video.astro';
import MapBlock from './blocks/Map.astro';
import Contact from './blocks/Contact.astro';
import NewsList from './blocks/NewsList.astro';

// Astro components are functions of their props; `any` keeps theme components assignable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Component = (props: any) => any;

export { Shell };

export const templates: Record<string, Component> = {
  page: Page,
};

export const blocks: Record<string, Component> = {
  hero: Hero,
  text: Text,
  'image-text': ImageText,
  cards: Cards,
  gallery: Gallery,
  video: Video,
  map: MapBlock,
  contact: Contact,
  'news-list': NewsList,
};
