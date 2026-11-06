import type { Locale } from './urls';

/**
 * The kit's own UI texts per language. Languages missing here fall back to English: add an entry
 * (same keys) for every locale of the site. Theme texts (menus, footer) live in the theme.
 */
const en = {
  skipToContent: 'Skip to content',
  languages: 'Languages',
  wireframeNote: 'Draft layout: the content of this page has been moved, the final design follows.',
  wireframeOld: 'Current version:',
  wireframeOldLink: 'on the old website ↗',
  pendingEyebrow: 'Preview of the new website',
  pendingTitle: "This page hasn't been moved yet",
  pendingText: 'It will appear here once it has been moved to the new site.',
  pendingLink: (path: string) => `Open ${path} on the current website ↗`,
  notFoundTitle: 'Page not found',
  notFoundText: "This page doesn't exist (any more). Perhaps the home page helps.",
  notFoundHome: 'Go to the home page',
  statusTitle: 'Migration status',
  statusSummary: (done: number, total: number, date: string) => `${done} of ${total} pages designed · updated ${date || '–'}`,
  statusNoPlan: 'No page plan found (.migration/plan.json). Run plan.mjs update, then build again.',
  statusLabels: {
    todo: 'not started',
    extracted: 'content moved',
    wireframe: 'draft layout',
    styled: 'designed',
    compared: 'designed + compared',
    approved: 'approved',
    issue: 'needs attention',
    skipped: 'left out',
  } as Record<string, string>,
  videoLoad: (provider: string) => `Load video from ${provider}. This sends data to ${provider}.`,
  videoOpen: (provider: string) => `Watch on ${provider} ↗`,
  mapOpen: 'Open map ↗',
  email: 'E-mail',
  phone: 'Phone',
};

export type Strings = typeof en;

const de: Strings = {
  skipToContent: 'Zum Inhalt springen',
  languages: 'Sprachen',
  wireframeNote: 'Entwurfslayout: Der Inhalt dieser Seite ist umgezogen, das endgültige Design folgt.',
  wireframeOld: 'Aktuelle Version:',
  wireframeOldLink: 'auf der alten Website ↗',
  pendingEyebrow: 'Vorschau der neuen Website',
  pendingTitle: 'Diese Seite ist noch nicht umgezogen',
  pendingText: 'Sie erscheint hier, sobald sie auf die neue Website übertragen ist.',
  pendingLink: (path: string) => `${path} auf der aktuellen Website öffnen ↗`,
  notFoundTitle: 'Seite nicht gefunden',
  notFoundText: 'Diese Seite gibt es nicht (mehr). Vielleicht hilft die Startseite weiter.',
  notFoundHome: 'Zur Startseite',
  statusTitle: 'Stand der Migration',
  statusSummary: (done, total, date) => `${done} von ${total} Seiten gestaltet · Stand ${date || '–'}`,
  statusNoPlan: 'Kein Seitenplan gefunden (.migration/plan.json). plan.mjs update ausführen, dann neu bauen.',
  statusLabels: {
    todo: 'nicht begonnen',
    extracted: 'Inhalt übernommen',
    wireframe: 'Entwurfslayout',
    styled: 'gestaltet',
    compared: 'gestaltet + verglichen',
    approved: 'abgenommen',
    issue: 'braucht Klärung',
    skipped: 'weggelassen',
  },
  videoLoad: (provider) => `Video von ${provider} laden. Dabei werden Daten an ${provider} übertragen.`,
  videoOpen: (provider) => `Auf ${provider} ansehen ↗`,
  mapOpen: 'Karte öffnen ↗',
  email: 'E-Mail',
  phone: 'Telefon',
};

const STRINGS: Record<string, Strings> = { en, de };

export function t(locale: Locale): Strings {
  return STRINGS[locale] ?? STRINGS[locale.split('-')[0]] ?? en;
}
