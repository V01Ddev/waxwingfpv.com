/**
 * GoatCounter's count.js attaches `window.goatcounter` at runtime. Declared
 * here so the event calls in Contact.astro are typed rather than cast at each
 * call site. Only the surface this site actually uses is described.
 *
 * https://www.goatcounter.com/help/js
 *
 * This file has no imports or exports on purpose: that keeps it a global
 * script, so the `Window` interface below merges with the built-in one
 * instead of replacing it.
 */

interface GoatCounterVars {
  /** Mark this hit as an event rather than a page view. */
  event?: boolean;
  /** What the dashboard lists it under. */
  path?: string;
  title?: string;
  referrer?: string;
}

interface GoatCounter {
  /**
   * Undefined until count.js has run. It loads on idle, so anything that can
   * fire earlier has to optional-chain rather than assume it is there.
   */
  count?: (vars?: GoatCounterVars) => void;
  bind_events?: () => void;
}

interface Window {
  goatcounter?: GoatCounter;
}
