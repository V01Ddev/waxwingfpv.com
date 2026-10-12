# What's left

Phases 0–5 are done: foundations, content model, hero, work, kit, services,
process, trust, contact, legal, SEO. The site builds, and everything listed as
verified below was checked in a real browser or by measurement, not assumed.

Delete this file once it is empty.

## Phase 6 — verification

Nothing here has been measured yet. The performance and accessibility targets
have been designed for, but not tested against a real browser on a real device.

### Performance

```bash
npm run build && npm run preview
# then Lighthouse, mobile preset, on http://localhost:4321
```

Targets, and what is already known:

| Target | Status |
|---|---|
| LCP under 2.5s on throttled 4G | **unverified.** The LCP element is the hero poster, 91KB, preloaded and above the fold. Should pass, needs measuring. |
| CLS 0 | **unverified.** Every image carries width/height and the hero video fades in over a poster with no layout change, so it should be 0. |
| JS under 25KB gzipped | **verified at 2.4KB.** Styles and scripts are inlined; there are no separate JS files. |
| Fonts | 88KB for the two preloaded faces, and latin-ext only loads when Turkish characters appear. |

If LCP misses, the lever is the hero poster: re-encode at quality 70 and it
drops to roughly 60KB. The poster is deliberately the LCP rather than the video.

### Accessibility

Unverified. Worth doing in this order, because the first two are where a
failure would actually block someone:

1. **axe DevTools** on the built page, both locales.
2. **Keyboard only, no mouse.** Tab through the whole page. Specifically:
   - the lightbox: open with Enter, page with `←`/`→`, close with `Esc`, and
     focus must return to the poster that opened it
   - the kit selector: `←`/`→`/`Home`/`End` move between tabs, and only the
     selected panel is reachable
   - the form: submitting empty moves focus to the first bad field
   - the skip link appears on first Tab
3. **Reduced motion.** Set `prefers-reduced-motion: reduce` in the OS and
   reload: the hero must show its poster and never start the video.
4. **Contrast.** The palette ratios were computed but not machine-checked.
   `--steel` on `--plumage` should be 5.6:1 and `--mark` 4.7:1. `--tail` is
   focus-only for exactly this reason; do not spend it on decoration.

### Real device

**This is the highest-risk item, and headless Chromium cannot test any of it.**
An iPhone running Safari:

- the hero fills the screen exactly, with no gap and no scroll, and the
  headline and both buttons are visible above the fold (`100svh` and the
  `--header-h` subtraction)
- the hero video autoplays inline and does **not** go fullscreen on tap
  (`playsinline`)
- the kit sample clips play inline when tapped, not fullscreen
- the WhatsApp handoff opens the app with the message prefilled rather than
  doing nothing or navigating away from the page
- the sticky header does not jump when the URL bar collapses

Android Chrome is worth ten minutes too, mainly for the video behaviour.

## Before launch

- **Confirm the domain.** `site` in `astro.config.mjs` is
  `https://waxwingfpv.com`. Canonical URLs, hreflang alternates, the sitemap,
  the share-card URLs and every `contentUrl` in the structured data are built
  from that one line. If the registered domain differs, change it and rebuild;
  a mismatch silently tells search engines the real version of every page lives
  on a domain you do not own.
- **404 handling on the server.** Cloudflare Pages serves `dist/404.html`
  automatically. A plain nginx or Caddy needs telling: nginx wants
  `error_page 404 /404.html;`, Caddy a `handle_errors` block. Without it,
  visitors get the server's own error page.
- **Turkish copy.** Written by someone who is not a native speaker. Worth one
  read by someone who is, particularly the hero tagline and the button labels.
- **`sources/video/` is gitignored**, so a fresh clone has no masters. Run
  `./scripts/media.sh` if the encoded files ever need regenerating; the
  Nish and Milat masters are fetched from Drive automatically.

## Not done, and deliberately

Say the word if any of these are wanted after all:

- **Sticky mobile action bar** (WhatsApp + Get a quote), which was planned and
  then dropped. It would cost about 56px of viewport and is probably the
  cheapest remaining conversion win, since most traffic arrives from Instagram
  on a phone.
- **The kit selector's "signal cut" transition** between panels. Cosmetic.
- **Per-project pages** at `/work/[slug]`. Worth adding at five or more
  projects, when a single page starts to get long.

## Known, accepted risks

- **The portfolio videos are scored with commercial music** (Phantogram and
  others), kept deliberately after the licensing options were laid out. A
  YouTube upload would be Content ID claimed, which is one reason the video is
  self-hosted. If it ever gets a takedown, the fix is re-scoring and re-running
  `scripts/media.sh`.
- **Repo video is 65MB today.** Fine now, but each project adds to it. Past a
  few hundred MB this wants to move to object storage, which is a URL change
  and nothing more.
- **`sources/private/` holds the CV and the two licence certificates.** They
  contain a TC kimlik number, they are gitignored, and they must stay that way.
