# What's left

Everything else is done and verified. Delete this file once it is empty.

## Open

**Real device pass — the highest-risk item left, and headless Chromium cannot
test any of it.** An iPhone running Safari:

- the hero fills the screen exactly, with no gap and no scroll, and the
  headline and both buttons are visible above the fold (`100svh` and the
  `--header-h` subtraction)
- the hero video autoplays inline and does **not** go fullscreen on tap
  (`playsinline`)
- the kit sample clips play inline when tapped, not fullscreen
- the WhatsApp handoff opens the app with the message prefilled rather than
  doing nothing or navigating away from the page
- the sticky header does not jump when the URL bar collapses

Two things worth a look while you are there, because each was only settled on a
desktop browser or by arithmetic:

- **the favicon on light browser chrome.** The white mark is swapped for a
  plumage one under `prefers-color-scheme`, and the PNG fallback pair exists
  because Safari reads neither the SVG nor the query. It was verified by
  compositing the rendered icons on both backgrounds, not on a real Safari.
- **whether the kit clips still show a fullscreen button.** See the accepted
  risks below.

Android Chrome, ten minutes, mainly for the video behaviour.

**Turkish copy.** Written by someone who is not a native speaker, and the
footer credit was added by another non-native speaker. Worth one read by
someone who is: the hero tagline, the button labels, and `legal.credit`.

**`z` is deprecated in `astro:content`.** The Astro 7 bump left this as the one
thing `npm run check` still reports — 63 hints, all `ts(6385)` on
`z.object(...)` in `src/content.config.ts`. Not an error yet, and the obvious
thing for Astro 8 to turn into one. Import `z` from `zod` directly; no
behaviour change comes with it.

**The kit `photo` field is half-wired.** Both kit YAML files carry a `photo:`
line marked TODO, pointing at `/kit/*.jpg` — but `public/kit/` does not exist,
and while `content.ts` passes the field through, **no component renders it**.
So it is currently inert rather than broken: nothing reads it, so nothing 404s.
Either produce the photos and wire them into the kit panel, or delete the field
and its schema entry.

**LCP is borderline, and the mechanism is understood.** It measures 2.38s under
real emulated 4G (1.6Mbps, 150ms RTT, 4× CPU) but 4.4s under Lighthouse's
simulated throttling. The two models disagree by two seconds, so neither should
be quoted alone. What is certain is that the poster is not the problem: it is
78KB and should take ~380ms, but measures 40KB/s — almost exactly one sixth of
the link, because it shares Chromium's six connections with six font files and
several below-the-fold posters. **It is connection contention, not size and not
render work.**

Three levers were tested and eliminated, so do not spend time on them: the hero
video's `preload="auto"` (blocking the 1.2MB mp4 changes LCP not at all),
render-blocking CSS (inlining every stylesheet moved it by ~0ms), and CPU (4×
throttle with an unthrottled network gives 312ms). The one lever that did
measure is the kit posters, at ~190ms — below.

## Not done, and deliberately

Say the word if any of these are wanted after all:

- **Deferring the kit sample posters.** Worth ~190ms of LCP. The frames sit far
  below the fold, but their `poster` attribute downloads eagerly regardless of
  `preload="none"`, so ~159KB competes with the hero poster for the six
  connections a host gets. The fix is to attach the poster from JS when the
  frame nears the viewport, which adds an IntersectionObserver to the Kit
  script. Small win, small cost, not taken.
- **Sticky mobile action bar** (WhatsApp + Get a quote), planned and then
  dropped. It would cost about 56px of viewport and is probably the cheapest
  remaining conversion win, since most traffic arrives from Instagram on a
  phone.
- **The kit selector's "signal cut" transition** between panels. Cosmetic.
- **Per-project pages** at `/work/[slug]`. Worth adding at five or more
  projects, when a single page starts to get long.

## Known, accepted risks

- **The kit sample clips show a fullscreen button in Firefox and on iOS
  Safari.** `controlslist="nofullscreen"` is Chromium-only — proposed by
  Chromium, never adopted into the HTML spec — so Firefox, Safari and iOS
  Safari all ignore it. The clips now carry both mechanisms, `controlslist` for
  Chromium and `::-webkit-media-controls-fullscreen-button` for Safari, which
  is the pattern `Lightbox.astro` already uses. That leaves two browsers.
  **Firefox exposes no `::-moz-media-controls-*` pseudo-element at all**,
  verified by rendering it, so there is no CSS route there. **iOS Safari's
  controls are native UIKit**, outside CSS entirely, and since most traffic is
  Instagram-on-a-phone that is the one that matters most. Closing it properly
  means dropping the native controls for a custom bar in the site's own
  monochrome language, which would also be the last place browser chrome leaks
  into the design. Not done: it is a 40-second sample clip, and the attribute
  only ever hid the button anyway — F, double-click and the context menu all
  reach fullscreen in Chromium regardless.
- **The portfolio videos are scored with commercial music** (Phantogram and
  others), kept deliberately after the licensing options were laid out. A
  YouTube upload would be Content ID claimed, which is one reason the video is
  self-hosted. If it ever gets a takedown, re-score and re-run
  `scripts/media.sh`.
- **Repo video is 65MB, against a 25 MiB per-file cap on Cloudflare.** The
  largest clip is 17.3 MiB, so there is headroom but not a lot — a longer or
  higher-bitrate clip would cross it and fail at deploy time. The escape hatch
  is R2: 10GB free and no egress fees, so the video could move there and stay
  free. Past a few hundred MB it wants to anyway, and that is a URL change.
- **`sources/private/` holds the CV and the two licence certificates.** They
  contain a TC kimlik number, they are gitignored, and they must stay that way.
- **The lightbox's `is-capped` path has never run.** It sets `controlslist`,
  `disablepictureinpicture` and a `dblclick` guard, and the CSS hides the
  WebKit button, but nothing sets `data-video-nofullscreen`. Exercise it or
  delete it next time the work content changes.

## A note on this file

Its numbers had drifted badly at one point — styles were said to be fully
inlined (an 8KB bundle was external and render-blocking on every page), the
hero poster was said to be preloaded (it was not), and JS was said to be 2.4KB
(it is 3.02KB). Every figure here is a measurement, but measurements go stale.
Re-derive rather than trust.
