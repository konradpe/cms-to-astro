# Cookies, consent, legal pages and accessibility

A migration is the best moment to clean up what a website sends to third parties: most WordPress sites load fonts, maps, videos and trackers that the owner never consciously chose, and then need a cookie banner to cover for it. A static site can often do without any of that.

**This is orientation, not legal advice.** Say so to the owner, and have them (or their adviser) confirm the final privacy policy, imprint and consent setup. Never invent legal text; reuse the owner's existing texts and mark what needs updating.

## Contents
1. Measure what the old site does
2. Decide what the new site needs
3. Consent banner: when, which, how
4. Legal pages
5. Forms and e-mail addresses
6. Accessibility
7. Checklist for the report and for go-live

## 1. Measure what the old site does

Run the snapshot with `--privacy` on the home page and one or two content pages (contact page, a page with video or map):

```bash
node <skill-dir>/scripts/snapshot.mjs https://example.com/ https://example.com/contact/ --out .migration/snapshots/live --privacy --no-screenshots
```

The capture itself is a real visit: it loads whatever the page loads, third parties included (that is the point). It records, for a first visit **without any interaction** (no consent given): cookies set (first- and third-party), `localStorage` keys, and every third-party host the page contacted (fonts, maps, video, analytics, CDNs). Together with the inventory's consent-tool detection this tells you:

- which third parties the old site contacts before consent (often Google Fonts, Google Maps, YouTube, Gravatar, jQuery CDNs);
- whether tracking cookies are set before consent (a common problem worth telling the owner about, factually);
- which consent tool is installed (Borlabs, Complianz, Cookiebot, Real Cookie Banner, CookieYes …) and therefore which services the old privacy policy probably lists.

## 2. Decide what the new site needs

List every third party the **new** site would contact, with the reason and when it loads:

| Service | Typical replacement | Loads | Consent needed? (EU, typical view) |
|---|---|---|---|
| Fonts | Self-hosted (Astro Fonts API, files in the build) | never third-party | no |
| Icons | Inlined at build time (astro-icon) | never the Iconify API at runtime | no |
| Hosting/CDN (Cloudflare, Netlify …) | – | always (processes IP addresses as host) | no consent; name it in the privacy policy |
| Contact form service | Formspree, Web3Forms, Netlify Forms … | only on submit (or on page load if their script is embedded) | no banner; privacy notice near the form |
| Video | Click-to-load facade | on click | the click with a short notice serves as consent ("Loads YouTube; YouTube's privacy policy applies") |
| Maps | Static image + link | never (link opens Google/OSM) | no |
| Analytics, cookieless (Cloudflare Web Analytics, Plausible, Matomo without cookies) | – | always | often no banner; owner confirms |
| Analytics with cookies (Google Analytics, Meta Pixel, Hotjar) | – | after consent only | yes: banner |
| Social feeds, chat widgets | Links instead | – | if kept: consent |

Background the owner should hear in one or two sentences: in the EU, storing or reading non-essential information on a visitor's device (cookies, local storage) needs prior consent, and every third-party request sends the visitor's IP address to that third party (the reason a German court fined a site for loading Google Fonts, LG München I, 3 O 17493/20, 2022).

**Recommendation for most small sites:** self-hosted fonts, click-to-load video, static maps, no tracking or cookieless analytics → no cookie banner. Present it as the recommended option and let the owner decide.

## 3. Consent banner: when, which, how

Only if something consent-requiring stays (usually Google Analytics or ads):

- **Tool:** a lightweight, self-hosted consent library (e.g. `vanilla-cookieconsent` by orestbida, or Klaro) rather than a heavy SaaS banner. A commercial consent platform is only necessary for advertising setups that need the IAB framework.
- **Behaviour:** nothing consent-requiring loads before a choice; "Reject" is as easy as "Accept" (same level, same prominence); choices per category; a "Cookie settings" link in the footer reopens the dialog; the choice is remembered in a first-party cookie.
- **Implementation:** scripts that need consent are added with `type="text/plain" data-category="analytics"` (or the library's equivalent) so they only run after consent. Put the banner in `Base.astro` as a small script; no framework needed.
- **Languages:** banner texts per language (multilingual.md, UI strings).
- **Agent rule:** AGENTS.md says that any new third-party service must be added to the consent configuration and the privacy policy, and only with the owner's OK.

If the old site had a banner and the new one doesn't need it, say explicitly in the report that removing it is a deliberate decision based on the list in section 2, and record the decision in MIGRATION.md.

## 4. Legal pages

Copy the existing legal pages (imprint, privacy policy, terms) as content files, then mark what must change:

- **Privacy policy:** remove sections for services no longer used (WordPress plugins, Google Fonts, Gravatar, comment functions, Jetpack …); add the new host, the form service, analytics and video facades; update the date. Sources for updated text: the owner's lawyer or data-protection officer, or a policy generator they already use (German-speaking market: e.g. eRecht24, Dr. Schwenke's Datenschutz-Generator). You may draft a list of changes; the owner decides the wording.
- **Imprint (Impressum):** content usually stays the same; check that the contact data matches `src/data/site.json`. Legal basis differs per country (Germany: § 5 DDG, formerly TMG; Austria: § 5 ECG, § 25 MedienG disclosure, § 14 UGB for companies); keep whatever the owner had and only change it on their instruction.
- Keep legal pages reachable from every page (footer), in every language the site offers.
- Keep their old URLs (they are often linked from e-mail signatures and other sites).

### Licences that travel with the copy

- **Web fonts:** free fonts (Google Fonts, Fontsource) may be self-hosted. Commercial fonts (e.g. a corporate DIN, Futura, Helvetica cut) need a web licence that covers self-hosting on the new site; the old site's licence may be tied to its domain or a font service. Ask the owner; until confirmed, note it as an open question.
- **Agency-made design:** the agency contract decides whether the owner may reuse the design; a footer credit ("designed by …") is a hint to ask.
- **Stock photos:** usually licensed for the same site; check if unsure.

## 5. Forms and e-mail addresses

- Next to each form: one sentence on what happens with the data and a link to the privacy policy. Don't add a mandatory "I consent" checkbox unless the owner's adviser wants it.
- E-mail addresses on pages: plain `mailto:` links are fine for most sites; if the owner complains about spam, use a contact form or a simple obfuscation (e.g. assembling the address in a small script), not an image.

## 6. Accessibility

- In 1:1 mode, record issues found in the old theme (contrast, missing alt texts, unlabeled buttons, keyboard traps, missing focus styles) as suggestions; fix the ones the owner approves.
- Baseline for new code: semantic HTML, alt texts, visible focus, sufficient contrast (WCAG 2.1 AA: 4.5:1 for body text), `lang` attributes (also on foreign-language passages), menus usable by keyboard, `prefers-reduced-motion` respected.
- The **European Accessibility Act** (in force since June 2025) requires accessible websites for certain consumer services, notably e-commerce and online booking with payment; micro-enterprises providing services are exempt. If the site sells to consumers, tell the owner to check whether it applies.

## 7. Checklist

For the stage-2 report (section "Privacy and legal"):
- [ ] Third parties contacted before consent on the old site (from `--privacy`)
- [ ] Cookies/local storage set before consent
- [ ] Consent tool in use, and whether the new site will need one (recommendation)
- [ ] Legal pages found (imprint, privacy policy) and their URLs

Before go-live:
- [ ] New site contacts only the third parties on the agreed list (rerun `--privacy` against the preview)
- [ ] No cookies before consent, or none at all
- [ ] Banner (if any) tested: reject works, settings reopen, nothing loads before consent
- [ ] Privacy policy updated and confirmed by the owner
- [ ] Imprint and privacy links in the footer of every page and language
