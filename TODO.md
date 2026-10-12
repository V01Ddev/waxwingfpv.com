# What's left

Phases 0–5 are done: foundations, content model, hero, work, kit, services,
process, trust, contact, legal, SEO. The site builds, and everything listed as
verified below was checked in a real browser or by measurement, not assumed.

Delete this file once it is empty.

## Phase 6 — verification

Phase 6 now has a re-runnable harness: **`node scripts/audit.mjs`**. It boots
headless Chromium over CDP with no dependencies, in the same style as
`scripts/shot.mjs`, and checks reduced motion, contrast and axe on both
locales. axe-core is fetched once from a pinned URL and verified against a
pinned SHA-256 before it is allowed to run.

```bash
npm run build
npm run preview            # Astro 7 daemonises — it prints the port it took
node scripts/audit.mjs --base http://localhost:4322
```

**The preview port is not 4321 any more.** Astro 7's `npm run preview`
detaches and takes the next free port, so with `astro dev` already running it
lands on 4322. Point Lighthouse or the audit at the dev server by accident and
every number is meaningless — the dev server serves unbundled code with the
HMR client attached.

### Performance — measured

Lighthouse mobile preset against the preview server, and an independent CDP
measurement under real emulated 4G (1.6Mbps, 150ms RTT) with 4× CPU throttle:

| Target | Result | Status |
|---|---|---|
| LCP under 2.5s on throttled 4G | **2.38s** under real emulated throttling, **4.4s** under Lighthouse's simulated throttling | **borderline** |
| CLS 0 | 0 — in both models, and no layout shifts recorded in any run | met |
| JS under 25KB gzipped | **3.02KB** — 6 inline scripts, 0 external JS files | met |
| Fonts | 88KB for the two preloaded faces; Turkish also pulls 143KB of latin-ext subsets, which is why tr is ~0.6s slower than en | as designed |

Scores: performance 80 (tr) / 88 (en), accessibility 100, best practices 100,
SEO 100.

**On the LCP discrepancy.** The two models disagree by two seconds, so neither
number should be quoted alone. Unthrottled the poster paints at 376ms. Under
real emulated throttling it is 2.38s. Lighthouse's Lantern simulation says
4.4s. What is certain is the *mechanism*: the poster is 78KB and the link is
1.6Mbps, so it should take ~380ms, but it measures 40KB/s — almost exactly
one sixth of the link. It is sharing Chromium's six connections per host with
six font files and several below-the-fold posters. **LCP here is limited by
connection contention, not by the poster's own size or by render work.**

Three levers were tested and **eliminated** by measurement, so do not spend
time on them:

- the hero video's `preload="auto"` — blocking the 1.2MB mp4 changes LCP not
  at all
- render-blocking CSS — inlining every stylesheet removed all render-blocking
  requests and moved LCP by ~0ms (it did help FCP slightly, and is kept for
  that reason)
- CPU — 4× throttle with an unthrottled network gives LCP 312ms

The one lever that did measure is the kit sample players: their `poster`
attribute downloads eagerly even with `preload="none"`, and those frames are
far below the fold. Removing it took LCP from 2416ms to 2224ms. Not done —
see below.

### Accessibility — measured

`node scripts/audit.mjs` reports: **axe clean on both locales**, reduced motion
correct on both, and text contrast passing on both. Lighthouse agrees at 100.

Two real violations were found and fixed during this pass:

- `label-content-name-mismatch` on the header language switcher (WCAG 2.5.3) —
  the accessible name was "Change language" while the visible text was "EN", so
  the visible label was not part of the name
- `scrollable-region-focusable` on the kit comparison table (WCAG 2.1.1) — the
  table scrolls horizontally on narrow screens and had no focusable child, so
  it was unreachable by keyboard

Contrast is checked by a DOM walk, not by axe, and the reason matters: **axe's
`color-contrast` rule is inert on this site.** `body` carries the film-grain
`background-image`, and axe cannot resolve a background-image, so it marks all
160 text elements "incomplete" rather than judging them. Anyone running axe
DevTools alone will get a wall of incomplete results and no contrast verdict.

The walk resolves each element's effective backdrop from computed styles and
treats the grain as computable, which was verified rather than assumed: with
the page frozen and lazy images pre-loaded, disabling the grain is
byte-identical over the hero and shifts channels by a median of 14/255
elsewhere. WCAG measures text against the background colour, whose spatial
mean the grain preserves, so the flat-colour model is the right one — but the
grain is not free, and it is why axe cannot be trusted for contrast here.

Still unverified, and needing a person rather than a tool:

1. **Keyboard only, no mouse** — done manually by the author.
2. **Contrast** — machine-checked, see above. `--mark` 4.69:1 and `--steel`
   5.81:1 against `--plumage`. Three documented ratios were wrong and are now
   corrected in both `tokens.css` and the dev styleguide: `--steel` 5.6 → 5.81,
   `--edge-strong` 3.2 → 3.16, `--edge` 1.6 → 1.43.
3. **Reduced motion** — machine-checked, passing, with a positive control so a
   broken hero script cannot masquerade as correct behaviour.

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

- ~~**Confirm the domain.**~~ Confirmed: `waxwingfpv.com`. The comment in
  `astro.config.mjs` said "placeholder until the domain is registered"; it now
  records that the domain is confirmed. Canonical URLs, hreflang alternates,
  the sitemap, the share-card URLs and every `contentUrl` in the structured
  data are all built from that one line.
- **`z` is deprecated in `astro:content`.** The Astro 7 bump made this the one
  thing `npm run check` still reports: 63 hints, all of them `ts(6385)` on
  `z.object(...)` in `src/content.config.ts`. Not an error yet, but it is the
  obvious thing for Astro 8 to turn into one. The fix is to import `z` from
  `zod` directly. No behaviour changes with it.
- **404 handling on the server.** Resolved — `not_found_handling: "404-page"`
  in `wrangler.jsonc`, verified serving `dist/404.html` byte for byte. See
  Deploying below.
- **Turkish copy.** Written by someone who is not a native speaker. Worth one
  read by someone who is, particularly the hero tagline and the button labels.
- **`sources/video/` is gitignored**, so a fresh clone has no masters. Run
  `./scripts/media.sh` if the encoded files ever need regenerating; the Nish
  and Milat masters are fetched from Drive automatically.

## Deploying

Cloudflare Workers with Static Assets. Two files carry it: `wrangler.jsonc` and
`.github/workflows/deploy.yml`. Every push and PR is type-checked and built;
only `main` deploys.

**Why not the usual $5 VPS.** This site is entirely static — the form hands off
to WhatsApp, analytics is third-party, and there is no server-side code of any
kind — so a VPS was buying a bill and nothing else. Cloudflare serves static
assets free and without a bandwidth cap.

**Why not Netlify or Vercel.** 100GB/month measured against 65MB of video with
single clips near 17MB. Worse, **Vercel's free Hobby tier prohibits commercial
use outright**, and this is a lead-generation site for a business.

**Why Workers rather than Pages.** Pages still works and is not deprecated, but
Cloudflare steers new projects to Workers and develops Pages for maintenance
only. The cost is one small config file.

### One-time setup — partially done

A Worker named **`waxwingfpv-com`** already exists, created through the
dashboard, and is live at `https://waxwingfpv-com.v01d-dev-sh.workers.dev`.
`wrangler.jsonc` is named to match it: deploying under any other name would
stand up a second Worker and orphan the custom domain.

**That first connected build went its own way.** It ran `astro add cloudflare`
inside the build container, which generated `dist/client/wrangler.json` and
redirected wrangler to it, so the `wrangler.jsonc` in this repo was never
read. Two consequences: the live 404 was a **zero-byte response** rather than
`dist/404.html`, and a KV namespace and Images binding were created for a site
that uses neither. Deploying through Actions fixes the 404, because this config
is the one that gets used — but only once the dashboard's build is disconnected.

Still to do:

1. **Disconnect the dashboard build.** Workers & Pages → `waxwingfpv-com` →
   Settings → Builds → disconnect the Git integration. Until then both systems
   deploy on every push and the 404 flickers depending on which finishes last.
2. **Add two repository secrets** (GitHub → Settings → Secrets and variables →
   Actions):
   - `CLOUDFLARE_API_TOKEN` — from the "Edit Cloudflare Workers" template
   - `CLOUDFLARE_ACCOUNT_ID` — shown in the Cloudflare dashboard URL
3. Push to `main`, or run the workflow manually.
4. **Add the custom domain:** Workers → `waxwingfpv-com` → Settings → Domains
   & Routes → Add custom domain. The zone is already on Cloudflare, so this
   writes its own DNS record. Decide about `www` at the same time — nothing
   resolves at `waxwingfpv.com` at all right now.
5. **Optional cleanup.** Deploying with this config drops the two bindings, but
   the KV namespace the dashboard created lingers in the account and has to be
   deleted by hand.

### After the first deploy

- Run the audit against the live URL, which also proves the canonical URLs,
  hreflang alternates and sitemap match what is being served:
  `node scripts/audit.mjs --base https://waxwingfpv.com`
- Open the site once with `#toggle-goatcounter` appended, so your own visits
  stop counting now that production traffic is real.

### Limits worth knowing

- **25 MiB per file.** The largest video is 17.3 MiB — headroom, but not much.
  A longer or higher-bitrate clip would cross it, and the escape hatch is
  Cloudflare R2: 10GB free and no egress fees, so the video could move there
  and stay free.
- **20,000 files.** The site currently ships 49.
- **`compatibility_date` must not be in the future.** Wrangler rejects a date
  newer than the runtime it ships — `2026-10-13` failed against workerd
  1.20261006.1. It is pinned to `2026-10-06`; bump it and wrangler together.

### Rolling back

Cloudflare keeps every deployment, so a rollback needs no rebuild:

```bash
npx wrangler deployments list      # the ten most recent
npx wrangler rollback [version-id]
```

## Not done, and deliberately

Say the word if any of these are wanted after all:

- **Deferring the kit sample posters.** Measured at ~190ms of LCP. The frames
  sit far below the fold, but their `poster` attribute downloads eagerly
  regardless of `preload="none"`, so ~159KB competes with the hero poster for
  the six connections a host gets. The fix is to attach the poster from JS when
  the frame nears the viewport, which adds an IntersectionObserver to the Kit
  script. Small win, small cost — not taken yet.
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
- **The kit sample clips show a fullscreen button in Firefox and on iOS
  Safari.** `controlslist="nofullscreen"` is Chromium-only — it was proposed by
  Chromium and never adopted into the HTML spec, so Firefox, Safari and iOS
  Safari all ignore it. The kit clips now carry both mechanisms: `controlslist`
  for Chromium, and `::-webkit-media-controls-fullscreen-button` for Safari,
  which is the same pattern `Lightbox.astro` already uses. That leaves two
  browsers. **Firefox exposes no `::-moz-media-controls-*` pseudo-element at
  all** — verified by rendering it, not assumed — so there is no CSS route
  there. **iOS Safari's controls are native UIKit**, outside CSS entirely, and
  since most traffic is Instagram-on-a-phone that is the one that matters most.
  Closing it properly means dropping the native controls for a custom bar in
  the site's own monochrome language, which would also be the last place
  browser chrome leaks into the design. Not done: it is a 40-second sample clip
  and the attribute only ever hid the button anyway — F, double-click and the
  context menu reach fullscreen in Chromium regardless.
- **Note on the lightbox's `is-capped` path.** It sets `controlslist`,
  `disablepictureinpicture` and a `dblclick` guard, and the CSS hides the
  WebKit button — but nothing currently sets `data-video-nofullscreen`, so that
  whole branch has never run. Worth exercising it, or deleting it, next time
  the work content changes.
- **The TODO's own numbers had drifted** and were corrected here: styles were
  said to be fully inlined (the 8KB global bundle was external and
  render-blocking on every page), the hero poster was said to be preloaded (it
  was not — it is parser-discovered, though at 38ms it was already early), and
  JS was said to be 2.4KB (it is 3.02KB). Worth re-deriving rather than
  trusting any figure in this file.
