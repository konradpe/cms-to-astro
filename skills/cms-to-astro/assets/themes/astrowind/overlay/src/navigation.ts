/**
 * Menus of the AstroWind header and footer, per language (cms-to-astro recipe; read by
 * src/migration/theme/AstroWindShell.astro). Fill it from .migration/structure.md: the old site's labels
 * and order; hrefs are the old paths as the kit serves them ('/ueber-uns/', '/en/about/'). Links to pages
 * that aren't moved yet get "not moved yet" placeholders in the build. A language without an entry uses
 * the default language's menus.
 *
 * Texts are plain text, except `footNote` (HTML, e.g. the copyright line). Social icons are names from
 * the Tabler set that astro-icon bundles ('tabler:brand-linkedin', 'tabler:brand-instagram', …).
 */
import { DEFAULT_LOCALE, type Locale } from './migration/urls';

export interface NavLink {
  text: string;
  href: string;
}

export interface NavItem {
  text: string;
  href?: string;
  /** Submenu: a dropdown on desktop, an indented list in the phone menu. */
  links?: NavLink[];
}

export interface Navigation {
  header: NavItem[];
  /** Buttons at the right end of the header (before the language links). */
  actions?: { text: string; href: string; variant?: 'primary' | 'secondary' | 'tertiary' }[];
  /** Footer columns. */
  footer: { title: string; links: NavLink[] }[];
  /** Small links under the site name in the footer (imprint, privacy policy). */
  legal: NavLink[];
  social?: { ariaLabel: string; icon: string; href: string }[];
  footNote?: string;
}

export const navigation: Record<Locale, Navigation> = {
  // en: {
  //   header: [
  //     { text: 'About us', href: '/about/' },
  //     { text: 'Services', links: [{ text: 'Consulting', href: '/services/consulting/' }] },
  //   ],
  //   actions: [{ text: 'Contact', href: '/contact/', variant: 'primary' }],
  //   footer: [{ title: 'Company', links: [{ text: 'About us', href: '/about/' }] }],
  //   legal: [{ text: 'Imprint', href: '/imprint/' }, { text: 'Privacy policy', href: '/privacy/' }],
  //   social: [{ ariaLabel: 'LinkedIn', icon: 'tabler:brand-linkedin', href: 'https://www.linkedin.com/company/example' }],
  //   footNote: '© Example Ltd',
  // },
};

const EMPTY: Navigation = { header: [], footer: [], legal: [] };

export const navigationFor = (locale: Locale): Navigation => navigation[locale] ?? navigation[DEFAULT_LOCALE] ?? EMPTY;
