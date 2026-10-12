import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is a placeholder until the domain is registered — it is what canonical
// URLs, hreflang alternates and the sitemap are built from, so it must be
// changed in one place if the domain differs.
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
    // Small stylesheets get inlined, which removes a render-blocking request
    // on exactly the pages where LCP matters most.
    inlineStylesheets: 'auto',
  },

  devToolbar: { enabled: false },
});
