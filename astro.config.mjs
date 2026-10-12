import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is the registered domain, confirmed rather than assumed. It is what
// canonical URLs, hreflang alternates and the sitemap are built from, so if it
// ever moves it moves here and nowhere else.
export default defineConfig({
  site: 'https://waxwingfpv.com',
  output: 'static',
  trailingSlash: 'ignore',

  i18n: {
    defaultLocale: 'tr',
    locales: ['tr', 'en'],
    routing: {
      // Turkish at `/`, English at `/en/`. The audience is Istanbul business
      // owners arriving from Instagram, so the default locale is the one that
      // does not pay a redirect.
      prefixDefaultLocale: false,
    },
  },

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'tr',
        locales: { tr: 'tr-TR', en: 'en' },
      },
      filter: (page) => !page.includes('/styleguide'),
    }),
  ],

  build: {
    // 'auto' inlines stylesheets under Astro's 4KB threshold, which left the
    // shared bundle (tokens + fonts + base, ~8KB) external and render-blocking
    // on every page — Lighthouse measured ~820ms of wasted time on throttled
    // 4G, directly in front of the LCP. 'always' trades a slightly larger HTML
    // document for zero stylesheet round-trips, which is the right side of
    // that trade on a four-page site that ships no other blocking assets.
    inlineStylesheets: 'always',
  },

  devToolbar: { enabled: false },
});
