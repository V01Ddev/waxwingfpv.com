# WaxWingFPV

Marketing site for an FPV cinematography business in Istanbul. Turkish at `/`,
English at `/en/`. Static output, no runtime dependencies, no backend.

## Requirements

Node 20+ and `ffmpeg` on the PATH (only for regenerating media).

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
npm run preview  # daemonises; prints the port it took
```

`npm run preview` serves `dist/404.html` for unknown paths with a real 404
status, which is how the 404 is meant to be checked. A plain static file server
will not do this — `python -m http.server`, for instance, answers with its own
error page and makes it look like the 404 is missing.

In Astro 7 `preview` **daemonises and takes the next free port**, so with `dev`
already running it lands on 4322 rather than 4321. It prints which.
`npx astro preview stop|status|logs` manages it. Point anything you intend to
measure at the port it actually took: the dev server serves unbundled code with
the HMR client attached, so Lighthouse against 4321 produces numbers that mean
nothing.

## Where things live

```
src/content/          everything you edit to change the site's words
  site/config.yaml      contact details, licences, services, process, form options
  projects/*.yaml       one file per project
  kit/*.yaml            one file per aircraft or camera
  legal/privacy.yaml    the KVKK notice, both languages in one file
src/i18n/{tr,en}.json   interface strings only (labels, buttons, headings)
src/components/         sections, layout, ui primitives
src/styles/             tokens.css, base.css, fonts.css
src/assets/brand/       the mark, in the variants the site uses
public/video/           encoded clips and posters — committed, see below
sources/                raw inputs you drop in — gitignored
scripts/media.sh        the whole media pipeline
scripts/og.mjs          renders the Open Graph share cards
scripts/shot.mjs        full-page screenshots for review
scripts/audit.mjs       accessibility and motion audit, both locales
```

## Editing content

Nothing user-facing is hardcoded in a component. Adding a project or an
aircraft means adding a YAML file; a malformed one fails the build with a
readable error rather than shipping a blank tile.

**Add a project** — copy `src/content/projects/the-nish.yaml` and edit it.
`cuts` drives the layout: two cuts render as the 16:9 + 9:16 pair, one cut
renders with the text beside it.

**Add an aircraft** — copy a file in `src/content/kit/`. The comparison table
is built from the data: a spec row appears only if every airframe answers it
*and* the answers differ, so shared vocabulary labels (`Sınıf`, `Ağırlık`,
`Kamera`, `Kayıt`, `Batarya`, `Uçuş süresi`, `Kumanda`) are what make a row
comparable. Anything specific to one aircraft goes below those and shows only
in its own panel.

**The legal notice** is one file holding both languages section by section, so
the Turkish and English cannot drift apart. KVKK article 10 requires five
specific things to be stated and they map to its sections; keep that structure
if you rewrite it. If you register a company, the controller becomes that
entity and the notice needs its title, tax details and a service address.

**Every string is locale-keyed** as `{ tr: '…', en: '…' }`. A missing English
value falls back to Turkish rather than breaking the build. Interface strings
live in `src/i18n/`, content lives in YAML.

**A spec value may be a plain string** when it is language-neutral (`'Mario 5'`,
`'4K 60 fps'`) or locale-keyed when it contains a word (`'~6 dk'` / `'~6 min'`).

## Media

Raw masters are **not** in git. They live in `sources/video/` and the encoded
renditions in `public/video/` are committed, because they are what the site
actually serves.

```bash
./scripts/media.sh              # fetch, encode everything, cut hero candidates
./scripts/media.sh kit          # just the kit sample clips
./scripts/media.sh hero         # just the hero loop
```

The Nish and Milat masters are pulled straight from a public Drive folder, so
nothing has to be downloaded or re-uploaded by hand. The two kit sample clips
are too large for Drive to serve without an interactive confirmation, so they
are dropped into `sources/video/` manually; the script looks there first and in
the project root second.

Only one rendition per cut, at the size the layout can actually display. The
portfolio is 720p-class and the kit samples 540p-class, with the lightbox
staging capped at 72rem so nothing is ever upscaled. Together that is 65MB of
video in the repo; past a few hundred MB this wants to move to object storage,
which is a URL change and nothing more.

Each video declares its master resolution in YAML, and the lightbox and kit
panel say so: *"4K source, downscaled for the web"*. Per video, deliberately —
only one of the five masters is actually 4K.

Pixel dimensions are **not** declared anywhere: they are read from the poster
JPEG at build time. Declared dimensions had already drifted once (the files
were 1280x720, the YAML said 1920x1080, and that wrong number was being
published to search engines), so the file is the source of truth.

```bash
node scripts/og.mjs             # regenerate public/og/{tr,en}.jpg
```

The share cards are rendered by Chromium rather than an image library, because
they need the real webfonts and the real logo. Re-run after changing the
tagline, the hero frame or the mark.

## Deployment

Cloudflare Workers with Static Assets. `wrangler.jsonc` holds the config and
`.github/workflows/deploy.yml` runs it: every push and PR is type-checked and
built, and only `main` deploys.

```bash
npm run deploy                      # wrangler deploy
npm run deploy:dry                  # validate the config, upload nothing
npx wrangler deployments list       # the ten most recent
npx wrangler rollback [version-id]
```

Cloudflare keeps every deployment, so a rollback needs no rebuild.

**Why Workers and not the usual $5 VPS.** The site is entirely static — the
form hands off to WhatsApp, analytics is third-party, there is no server-side
code of any kind — so a VPS would be a bill and nothing else. Static assets
are served free and without a bandwidth cap, which is the part that matters
with 65MB of video and single clips near 17MB. Netlify and Vercel both cap at
100GB/month on their free tiers, and **Vercel's Hobby tier prohibits
commercial use outright**. Cloudflare Pages still works but is developed for
maintenance only; new projects go to Workers.

**Three settings in `wrangler.jsonc` are load-bearing, and none is the
default.** `not_found_handling: "404-page"` — the default, `"none"`, silently
throws away `dist/404.html` and serves a bare platform 404. `html_handling` is
pinned to `auto-trailing-slash` because every canonical URL ends in a slash.
And `compatibility_date` must not be newer than the runtime the installed
wrangler ships, or it refuses to build; bump the two together.

**The enquiry form has no backend.** It validates in the browser and hands off
to WhatsApp with the message prefilled, so the site never receives or stores
anyone's details, and there is no endpoint, no spam handling and no mail setup.

Analytics is a single GoatCounter snippet — cookieless, so no consent banner.
It loads on `requestIdleCallback` so it never competes with the hero poster for
bandwidth or a main-thread slot, and it counts WhatsApp handoffs as events on
three surfaces: the contact link, the footer link and the form submit.

`public/robots.txt` names the sitemap and keeps crawlers off `/styleguide`,
which is the dev-only token reference and is marked `noindex` as well.

## Auditing

```bash
npm run build
npm run preview
npm run audit -- --base http://localhost:4322
```

`scripts/audit.mjs` boots headless Chromium over CDP with no dependencies, in
the same style as `scripts/shot.mjs`, and checks reduced motion, contrast and
axe on both locales. axe-core is fetched once from a pinned URL and verified
against a pinned SHA-256 before it is allowed to run.

It exists because axe alone is not enough here, and that is worth knowing
before you trust a clean run from anywhere else. **axe-core has no rule for
WCAG 1.4.11 at all**, so the UI-boundary check is hand-rolled. And its
`color-contrast` rule cannot resolve a `background-image` — `body` carries the
film grain — so it marks every text element on the page "incomplete" rather
than judging it. Running axe DevTools on this site yields no contrast verdict.
The walk here reports what it genuinely cannot resolve as unverifiable instead
of quietly passing it.

## Conventions

Worth knowing before editing, because each of these has bitten this codebase:

- **Astro scoped styles do not reach a child component's root element, or any
  element created by JavaScript.** Both fail silently. Size a child from a prop
  it owns, or use `:global()` on a stable parent.
- **A bare `/* */` inside a JSX expression is a text node, not a comment** — it
  renders on the page. Use `{/* */}` outside the expression.
- **No em dashes in user-facing copy.** They read as a template tell. Sentences
  get rewritten, not re-punctuated.
- **The palette is monochrome.** `--tail` is the one hue left and exists solely
  for the focus ring; grey-on-grey focus is the failure mode WCAG 2.4.11 exists
  to prevent. Don't spend it on decoration.
- **Turkish casing** needs `lang="tr"` on the element for CSS uppercase to map
  `i → İ` correctly. It is set on `<html>` per locale; don't remove it.
