#!/usr/bin/env node
/**
 * Accessibility and motion audit via the Chrome DevTools Protocol.
 *
 * Why this exists: the site's accessibility and motion behaviour were designed
 * for but never machine-checked. axe alone is not enough here — axe-core has no
 * rule for WCAG 1.4.11 (non-text contrast) at all, and its color-contrast rule
 * cannot evaluate text painted over an image or a gradient, which is exactly
 * what the hero headline is. So this walks the real DOM for contrast itself and
 * reports the cases it genuinely cannot resolve as "unverifiable" rather than
 * quietly passing them.
 *
 * No dependencies — Node's built-in WebSocket and fetch only, matching
 * scripts/shot.mjs. axe-core is fetched from a pinned CDN URL and verified
 * against a pinned SHA-256 before it is allowed to execute.
 *
 *   node scripts/audit.mjs [--base http://localhost:4322] [--locales /,/en/]
 *
 * The preview server matters: `npm run preview` in Astro 7 daemonises and will
 * take the next free port if 4321 is busy, so --base defaults to 4322. Point
 * this at the dev server by accident and every number is meaningless.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/* --- axe-core, pinned ---------------------------------------------------- */

const AXE = {
  version: '4.14.0',
  sha256: '20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878',
  url: 'https://cdn.jsdelivr.net/npm/axe-core@4.14.0/axe.min.js',
  cache: 'node_modules/.cache/waxwing-audit/axe-4.14.0.min.js',
};

/** Fetch axe-core, or reuse a cached copy, and refuse anything unverified. */
async function loadAxe(root) {
  // --axe points at a local build, for a hermetic or offline machine. The pin
  // does not apply: the operator supplied the file deliberately. The version
  // actually loaded is reported from the page either way.
  if (AXE_PATH) return readFile(AXE_PATH, 'utf8');

  const path = join(root, AXE.cache);

  const verified = (source) => {
    const got = createHash('sha256').update(source).digest('hex');
    if (got !== AXE.sha256) {
      throw new Error(
        `axe-core hash mismatch — refusing to run it.\n  expected ${AXE.sha256}\n  got      ${got}`
      );
    }
    return source;
  };

  try {
    return verified(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.message.includes('hash mismatch')) throw err;
    // Not cached yet — fetch it.
  }

  const res = await fetch(AXE.url);
  if (!res.ok) throw new Error(`axe-core fetch failed: ${res.status} ${res.statusText}`);
  const source = verified(await res.text());

  await mkdir(join(root, 'node_modules/.cache/waxwing-audit'), { recursive: true });
  await writeFile(path, source);
  return source;
}

/* --- CLI ----------------------------------------------------------------- */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

if (has('help')) {
  console.log(`usage: node scripts/audit.mjs [options]

  --base <url>        default http://localhost:4322
  --locales <list>    default /,/en/
  --checks <list>     motion,contrast,axe   (default: all three)
  --out <file>        default ./audit.json
  --json              also dump the JSON document to stdout
  --no-block          do not block third-party requests
  --axe <path>        use a local axe-core build instead of the pinned copy
  --verbose           print every contrast measurement, not just failures`);
  process.exit(0);
}

const ROOT = process.cwd();
const BASE = (flag('base', 'http://localhost:4322')).replace(/\/$/, '');
const LOCALES = flag('locales', '/,/en/').split(',').map((s) => s.trim());
const CHECKS = new Set(flag('checks', 'motion,contrast,axe').split(',').map((s) => s.trim()));
const OUT = flag('out', 'audit.json');
const BLOCK = !has('no-block');
const VERBOSE = has('verbose');
const AXE_PATH = flag('axe', null);

const BUDGET = { text: 4.5, largeText: 3, nonText: 3 };

/* --- CDP client ----------------------------------------------------------
   Mirrors scripts/shot.mjs, with one change: `once()` there deletes every
   listener for a method after firing, which is correct for a single
   navigation but drops the second and third. `on()` keeps its listeners, and
   `once()` is now a wrapper over it. */

const PORT = 9333 + Math.floor(Math.random() * 400);
const CHROME = process.env.CHROME_PATH || 'chromium';

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const cleanup = () => {
  try {
    chrome.kill('SIGKILL');
  } catch {}
};
process.on('exit', cleanup);

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const info = await res.json();
        return { wsUrl: info.webSocketDebuggerUrl, browser: info.Browser };
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('chromium never opened its debugging port');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method).forEach((fn) => fn(msg.params));
    }
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    /** Persistent listener. Returns a function that removes it. */
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
      return () => {
        const arr = listeners.get(method) || [];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    once(method) {
      return new Promise((resolve) => {
        const off = this.on(method, (params) => {
          off();
          resolve(params);
        });
      });
    },
    close: () => ws.close(),
  };
}

/* --- page helper --------------------------------------------------------- */

/** Open a fresh target, optionally with reduced motion forced on before load. */
async function openPage({ reducedMotion = false, axeSource = null } = {}) {
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
  ).json();

  const page = connect(target.webSocketDebuggerUrl);
  await page.ready;

  const blocked = [];
  const attempted = [];
  const pageErrors = [];

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');

  page.on('Runtime.exceptionThrown', (p) => {
    pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '?');
  });
  page.on('Network.requestWillBeSent', (p) => {
    if (/gc\.zgo\.at|goatcounter/i.test(p.request.url)) attempted.push(p.request.url);
  });
  page.on('Network.loadingFailed', (p) => {
    if (p.blockedReason === 'inspector') blocked.push(p.errorText || 'blocked');
  });

  if (BLOCK) {
    // urlPatterns uses URLPattern syntax and MUST be absolute — the old glob
    // form '*gc.zgo.at*' is not valid here and matches nothing silently.
    // `urls` is deprecated but harmless, and covers older Chromium.
    await page.send('Network.setBlockedURLs', {
      urlPatterns: [{ urlPattern: '*://gc.zgo.at/*', block: true }],
      urls: ['*gc.zgo.at*'],
    });
  }

  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });

  // Exactly one call, and it must carry every feature: this method clears the
  // whole feature map on each invocation.
  if (reducedMotion) {
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  }

  // axe must be registered before the document loads, or a page script could
  // patch a DOM API ahead of it. Never pass worldName: that would create an
  // isolated world and window.axe would be invisible to Runtime.evaluate.
  if (axeSource) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: axeSource });

  return {
    page,
    blocked,
    attempted,
    pageErrors,
    async goto(url) {
      const loaded = page.once('Page.loadEventFired');
      await page.send('Page.navigate', { url });
      await loaded;
      await page.send('Runtime.evaluate', {
        expression: 'document.fonts.ready',
        awaitPromise: true,
      });
      await sleep(350);
    },
    async evaluate(expression, opts = {}) {
      const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        ...opts,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      }
      return result.value;
    },
    async close() {
      page.close();
      await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
    },
  };
}

/* --- check: contrast -----------------------------------------------------
   Walks the rendered DOM. Anything whose painted backdrop is an image,
   gradient or opacity stack is reported as unverifiable — never as a pass. */

const CONTRAST_JS = `(() => {
  const cache = new Map();
  const RE = /^rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+%?))?\\s*\\)$/i;
  const CV = document.createElement('canvas');
  CV.width = CV.height = 1;
  const CX = CV.getContext('2d', { willReadFrequently: true });

  function parse(str) {
    if (cache.has(str)) return cache.get(str);
    let out = null;
    if (!str) out = null;
    else if (str === 'transparent') out = [0, 0, 0, 0];
    else {
      const m = RE.exec(String(str).trim());
      if (m) {
        let a = 1;
        if (m[4] != null) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        out = [+m[1], +m[2], +m[3], a];
      } else {
        CX.clearRect(0, 0, 1, 1);
        CX.fillStyle = '#000';
        CX.fillStyle = str;
        CX.fillRect(0, 0, 1, 1);
        const d = CX.getImageData(0, 0, 1, 1).data;
        out = d[3] === 0 ? [0, 0, 0, 0] : [d[0], d[1], d[2], d[3] / 255];
      }
    }
    if (out) cache.set(str, out);
    return out;
  }

  function over(fg, bg) {
    const a = fg[3] + bg[3] * (1 - fg[3]);
    if (a === 0) return [0, 0, 0, 0];
    const f = fg[3] / a;
    return [fg[0]*f + bg[0]*(1-f), fg[1]*f + bg[1]*(1-f), fg[2]*f + bg[2]*(1-f), a];
  }

  // WCAG's own constant is 0.03928, not the sRGB-exact 0.04045; using the spec
  // value keeps these numbers comparable to the ratios documented in tokens.css.
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const luma = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => {
    const l1 = luma(a), l2 = luma(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const rgb = (c) => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';

  function cssPath(el) {
    const bits = [];
    for (let n = el; n && n.nodeType === 1 && bits.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { bits.unshift(s + '#' + n.id); break; }
      if (n.classList.length) s += '.' + Array.from(n.classList).slice(0, 2).join('.');
      bits.unshift(s);
    }
    return bits.join(' > ');
  }

  function backdrop(el) {
    const flags = [];
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    chain.reverse();

    let acc = null;
    let groupOpacity = 1;
    for (const n of chain) {
      const cs = getComputedStyle(n);
      const o = parseFloat(cs.opacity);
      if (!isNaN(o) && o < 1) { groupOpacity *= o; flags.push('opacity'); }

      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) acc = acc ? over(bg, acc) : bg;

      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const root = n === document.documentElement || n === document.body;
        flags.push(root ? 'textured-root' : 'bg-image');
      }
    }
    if (!acc) acc = [255, 255, 255, 1];
    if (groupOpacity < 1) acc = [acc[0], acc[1], acc[2], acc[3] * groupOpacity];
    return { color: acc, flags };
  }

  const MEDIA = Array.from(document.querySelectorAll('img,video,canvas,iframe,object,embed,picture'));
  for (const n of document.querySelectorAll('*')) {
    if (n === document.body || n === document.documentElement) continue;
    const bi = getComputedStyle(n).backgroundImage;
    if (bi && bi !== 'none') MEDIA.push(n);
  }
  function coveredBy(rect) {
    const hits = [];
    for (const m of MEDIA) {
      const r = m.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= rect.left || r.left >= rect.right) continue;
      if (r.bottom <= rect.top || r.top >= rect.bottom) continue;
      const cls = m.classList.length ? '.' + m.classList[0] : '';
      hits.push(m.tagName.toLowerCase() + cls);
    }
    return hits;
  }

  const isRendered = (el) => {
    if (el.checkVisibility && !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ownText = (el) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim() !== '');

  const out = { failures: [], marginal: [], unverifiable: [], advisory: [], boundaries: [], notes: [], tested: 0, notRendered: 0 };

  // A background-image on html/body is worth flagging beyond this walk: axe's
  // color-contrast rule cannot resolve a background-image and marks *every*
  // text element on the page "incomplete", which silently disables contrast
  // checking for anyone who runs axe alone. Measured on this site: the body
  // film grain never reaches a painted pixel (every section paints its own
  // opaque background over it) but it defeats axe globally anyway.
  out.rootTexture = ['html', 'body'].some((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const bi = getComputedStyle(el).backgroundImage;
    return !!bi && bi !== 'none';
  });

  for (const el of document.querySelectorAll('*')) {
    if (!ownText(el)) continue;
    if (!isRendered(el)) { out.notRendered++; continue; }

    const tag = el.tagName.toLowerCase();
    // Painted by the platform, not by CSS — select option would otherwise be
    // the only "raised" surface on the page and raise a false alarm.
    if (tag === 'option' || tag === 'optgroup') { out.notes.push('native-widget: ' + tag); continue; }
    if (tag === 'script' || tag === 'style' || tag === 'title') continue;

    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg || fg[3] === 0) continue;

    const size = parseFloat(cs.fontSize);
    const weight = cs.fontWeight === 'bold' ? 700 : (parseInt(cs.fontWeight, 10) || 400);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;

    const bd = backdrop(el);
    const r = ratio(over(fg, bd.color), bd.color);
    const covered = coveredBy(el.getBoundingClientRect());

    const rec = {
      selector: cssPath(el),
      text: (el.textContent || '').trim().slice(0, 50),
      fg: rgb(fg),
      bg: rgb(bd.color),
      ratio: +r.toFixed(2),
      required,
      fontSize: size,
      flags: bd.flags,
      coveredBy: covered,
    };

    out.tested++;
    if (covered.length || bd.flags.includes('bg-image')) out.unverifiable.push(rec);
    else if (r < required) out.failures.push(rec);
    else if (r < required + 0.15) out.marginal.push(rec);
  }

  // WCAG 1.4.11: a control's boundary needs 3:1 — but only where that boundary
  // is *required to identify* the control. axe-core has no rule for this at
  // all, which is why it is here. A tab or link carrying a visible label is
  // identified by that label, so its low-contrast hairline is decoration and
  // reporting it as a failure would be a false positive. What matters is
  // whether the control has any other visible identifying content.
  function visibleIdentity(el) {
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = tw.nextNode())) {
      if (!t.textContent.trim()) continue;
      let hidden = false;
      for (let p = t.parentElement; p && p !== el.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (p.hidden || cs.display === 'none' || cs.visibility === 'hidden' ||
            p.classList.contains('visually-hidden') || p.classList.contains('sr-only')) {
          hidden = true;
          break;
        }
      }
      if (!hidden) return 'text';
    }
    // An icon counts even when it is aria-hidden — 1.4.11 is about what is
    // painted, not what is announced.
    for (const ic of el.querySelectorAll('svg, img, canvas, picture, use')) {
      const r = ic.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return 'icon';
    }
    return null;
  }

  const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
  for (const el of document.querySelectorAll(FOCUSABLE)) {
    if (!isRendered(el)) continue;
    const cs = getComputedStyle(el);
    const own = parse(cs.backgroundColor);
    const bd = backdrop(el.parentElement || document.body);
    const under = (!own || own[3] === 0) ? bd.color : over(own, bd.color);
    const identity = visibleIdentity(el);

    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(cs['border' + side + 'Width']) <= 0) continue;
      if (cs['border' + side + 'Style'] === 'none') continue;
      const bc = parse(cs['border' + side + 'Color']);
      if (!bc || bc[3] === 0) continue;
      const r = ratio(over(bc, under), under);
      const rec = {
        selector: cssPath(el),
        side: side.toLowerCase(),
        border: rgb(bc),
        against: rgb(under),
        ratio: +r.toFixed(2),
        required: 3,
        identifiedBy: identity,
      };
      out.boundaries.push(rec);
      if (r >= 3) continue;
      // Identified by a label or an icon: the border is supplementary.
      if (identity) out.advisory.push({ ...rec, kind: 'non-text' });
      else out.failures.push({ ...rec, kind: 'non-text' });
    }
  }

  return out;
})()`;

async function checkContrast(url) {
  const p = await openPage();
  let data;
  try {
    await p.goto(url);
    data = await p.evaluate(CONTRAST_JS);
  } finally {
    await p.close();
  }

  const status = data.failures.length ? 'fail' : 'pass';
  return {
    status,
    tested: data.tested,
    notRendered: data.notRendered,
    failures: data.failures,
    marginal: data.marginal,
    advisory: data.advisory,
    unverifiable: data.unverifiable,
    boundaryCount: data.boundaries.length,
    rootTexture: data.rootTexture,
    minBoundary: data.boundaries.length
      ? data.boundaries.reduce((a, b) => (b.ratio < a.ratio ? b : a))
      : null,
    notes: data.notes,
  };
}

/* --- check: reduced motion ----------------------------------------------
   The reduced-motion assertion alone would pass vacuously: `preload="none"`
   and no src attribute in the markup means the "correct" state is also the
   initial state. So the default-motion pass runs first as a positive control
   and must observe the video actually starting. Without that, a broken hero
   script and working reduced motion are indistinguishable. */

const MOTION_JS = `(() => {
  const v = document.querySelector('.hero__video');
  const root = getComputedStyle(document.documentElement);
  return {
    mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    dur3: root.getPropertyValue('--dur-3').trim(),
    runningAnimations: document.getAnimations().filter((a) => a.playState === 'running').length,
    videoPresent: !!v,
    hasSrc: v ? v.hasAttribute('src') : null,
    isReady: v ? v.classList.contains('is-ready') : null,
    paused: v ? v.paused : null,
    readyState: v ? v.readyState : null,
    preload: v ? v.preload : null,
  };
})()`;

async function checkMotion(url) {
  // Control: ordinary load, video must start.
  const normal = await openPage();
  let control;
  try {
    await normal.goto(url);
    control = await normal.evaluate(MOTION_JS);
  } finally {
    await normal.close();
  }

  // Subject: reduced motion forced before the document loads.
  const reducedPage = await openPage({ reducedMotion: true });
  let reduced;
  try {
    await reducedPage.goto(url);
    reduced = await reducedPage.evaluate(MOTION_JS);
  } finally {
    await reducedPage.close();
  }

  const controlOk = control.hasSrc === true && control.isReady === true && control.paused === false;
  const subjectOk =
    reduced.mediaMatches === true &&
    reduced.dur3 === '1ms' &&
    reduced.hasSrc === false &&
    reduced.isReady === false &&
    reduced.readyState === 0;

  // No control, no claim.
  const status = !controlOk ? 'inconclusive' : subjectOk ? 'pass' : 'fail';

  return {
    status,
    control,
    controlOk,
    reduced,
    note: controlOk
      ? null
      : 'the default-motion control failed, so the reduced-motion result proves nothing',
  };
}

/* --- check: axe ---------------------------------------------------------- */

const AXE_RUN_JS = `(async () => {
  const r = await axe.run(document, {
    // Without resultTypes the payload carries every passing rule's node list
    // and runs to several MB. Violations-only is tens of KB.
    resultTypes: ['violations'],
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    elementRef: false,
  });
  return {
    engine: r.testEngine.version,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodeCount: v.nodes.length,
      nodes: v.nodes.slice(0, 10).map((n) => ({
        target: n.target,
        html: n.html,
        summary: (n.failureSummary || '').split('\\n').slice(0, 3).join(' | '),
      })),
    })),
  };
})()`;

async function checkAxe(url, axeSource) {
  const p = await openPage({ axeSource });
  try {
    await p.goto(url);
    const data = await p.evaluate(AXE_RUN_JS);

    // axe's color-contrast rule cannot evaluate text over images or gradients
    // and reports those as "incomplete" rather than pass or fail. That is a
    // silent hole, and the hero headline is exactly what falls into it.
    const incomplete = await p.evaluate(`(async () => {
      const r = await axe.run(document, {
        runOnly: { type: 'rule', values: ['color-contrast'] },
        resultTypes: ['incomplete'],
        elementRef: false,
      });
      return r.incomplete.flatMap((v) => v.nodes.map((n) => ({ target: n.target })));
    })()`);

    const actionable = data.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    return {
      status: actionable.length ? 'fail' : data.violations.length ? 'warn' : 'pass',
      engine: data.engine,
      violations: data.violations,
      incompleteContrast: incomplete,
      pageErrors: p.pageErrors,
    };
  } finally {
    await p.close();
  }
}

/* --- third-party blocking probe ----------------------------------------- */

async function checkBlocking(url) {
  if (!BLOCK) return { status: 'skipped', blocked: [], attempted: [] };
  const p = await openPage();
  try {
    await p.goto(url);
    await sleep(2500); // the GoatCounter loader waits on requestIdleCallback
    const status = p.blocked.length ? 'pass' : p.attempted.length ? 'fail' : 'n/a';
    return { status, blocked: p.blocked.length, attempted: p.attempted };
  } finally {
    await p.close();
  }
}

/* --- run ----------------------------------------------------------------- */

const { browser } = await endpoint();
console.log(`chromium ${browser.replace(/^HeadlessChrome\//, '')} · base ${BASE} · blocked=${BLOCK}\n`);

const results = [];
let harnessError = null;

try {
  for (const locale of LOCALES) {
    const url = `${BASE}${locale}`;
    const entry = { locale, url, checks: {} };

    if (CHECKS.has('motion')) entry.checks.motion = await checkMotion(url);
    if (CHECKS.has('contrast')) entry.checks.contrast = await checkContrast(url);
    if (CHECKS.has('axe')) entry.checks.axe = await checkAxe(url, await loadAxe(ROOT));
    entry.checks.blocking = await checkBlocking(url);

    results.push(entry);
  }
} catch (err) {
  harnessError = err;
}

/* --- report -------------------------------------------------------------- */

for (const r of results) {
  console.log(`── ${r.locale}  ${r.url}`);
  const c = r.checks;

  if (c.motion) {
    const m = c.motion;
    console.log(
      `   reduced-motion   ${m.status.padEnd(13)} ` +
        `src=${m.reduced.hasSrc} is-ready=${m.reduced.isReady} readyState=${m.reduced.readyState} ` +
        `dur3=${m.reduced.dur3} (control: video started=${m.controlOk})`
    );
    if (m.note) console.log(`                    ↳ ${m.note}`);
  }

  if (c.contrast) {
    const k = c.contrast;
    const min = k.minBoundary;
    console.log(
      `   contrast / text  ${(k.failures.filter((f) => f.kind !== 'non-text').length ? 'fail' : 'pass').padEnd(13)} ` +
        `${k.tested} measured, ${k.failures.filter((f) => f.kind !== 'non-text').length} below threshold, ` +
        `${k.unverifiable.length} unverifiable`
    );
    console.log(
      `   contrast / UI    ${(k.failures.some((f) => f.kind === 'non-text') ? 'fail' : 'pass').padEnd(13)} ` +
        `${k.boundaryCount} boundaries${min ? `, min ${min.ratio}:1 (${min.selector} ${min.side})` : ''}` +
        (k.advisory?.length ? `, ${k.advisory.length} decorative below 3:1` : '')
    );
    if (k.notRendered) console.log(`   not rendered     ${String(k.notRendered).padEnd(13)} elements outside the audit (hidden panels, closed dialog, sr-only)`);

    for (const f of k.failures) {
      const kind = f.kind === 'non-text' ? 'UI boundary' : 'text';
      console.log(
        `     FAIL ${kind.padEnd(12)} ${String(f.ratio).padStart(5)}:1  need ${f.required}  ${f.selector}` +
          (f.text ? `  "${f.text}"` : '')
      );
    }
    for (const f of k.unverifiable) {
      console.log(`     MANUAL ${f.selector} — covered by ${f.coveredBy.join(', ') || f.flags.join(', ')}`);
    }
    // Below 3:1, but the control is identified by its own label or icon, so
    // 1.4.11 does not bite. Visible only under --verbose to keep the default
    // output honest about what is actually wrong.
    if (VERBOSE) {
      for (const a of k.advisory || []) {
        console.log(`     advisory ${a.ratio}:1  ${a.selector} (${a.side}) — identified by ${a.identifiedBy}`);
      }
    }
    if (VERBOSE) {
      for (const m of k.marginal) console.log(`     marginal ${m.ratio}:1  ${m.selector}  "${m.text}"`);
    }
  }

  if (c.axe) {
    const a = c.axe;
    console.log(`   axe              ${a.status.padEnd(13)} v${a.engine}, ${a.violations.length} violation(s)`);
    for (const v of a.violations) {
      console.log(`     ${String(v.impact).padEnd(9)} ${v.id} — ${v.help} (${v.nodeCount} node${v.nodeCount > 1 ? 's' : ''})`);
      for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.target.join(' ')}`);
    }
    if (a.incompleteContrast.length) {
      if (c.contrast?.rootTexture) {
        console.log(
          `     note: ${a.incompleteContrast.length} element(s) axe could not judge for contrast because`
        );
        console.log(
          `           html/body paints a background-image. axe's color-contrast rule is INERT on this`
        );
        console.log(`           site — the DOM walk above is the authoritative contrast check.`);
      } else {
        console.log(
          `     note: ${a.incompleteContrast.length} element(s) axe could not judge for contrast (image/gradient backdrop)`
        );
      }
    }
    if (a.pageErrors.length) {
      console.log(`     page errors: ${a.pageErrors.length}`);
      for (const e of a.pageErrors.slice(0, 3)) console.log(`       ${e.split('\n')[0]}`);
    }
  }

  if (c.blocking.status !== 'skipped') {
    console.log(
      `   third-party      ${c.blocking.status.padEnd(13)} ` +
        `${c.blocking.blocked} blocked, ${c.blocking.attempted.length} attempted (gc.zgo.at)`
    );
  }
  console.log();
}

const failures = results.flatMap((r) =>
  Object.entries(r.checks)
    .filter(([, v]) => v && v.status === 'fail')
    .map(([name]) => `${r.locale} ${name}`)
);

console.log('manual, deliberately not claimed by this script:');
console.log('  · iOS Safari: 100svh hero fit, inline video autoplay, WhatsApp handoff, header vs URL bar');
console.log('  · Lighthouse: throttled-4G LCP and CLS (run separately against the preview port)');
console.log('  · anything behind interaction: lightbox, kit panels, mobile menu, form error states');

await writeFile(
  OUT,
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      base: BASE,
      chromium: browser,
      blockedThirdParty: BLOCK,
      budgets: BUDGET,
      results,
      manual: [
        'iOS Safari real-device behaviour',
        'Lighthouse throttled-4G LCP/CLS',
        'interactive states: lightbox, kit panels, mobile menu, form errors',
      ],
    },
    null,
    2
  )
);
console.log(`\nwrote ${OUT}`);

cleanup();

if (harnessError) {
  console.error(`\nharness error: ${harnessError.message}`);
  process.exit(3);
}
if (failures.length) {
  console.error(`\nfailed: ${failures.join(', ')}`);
  process.exit(2);
}
console.log('\nall checks passed');
process.exit(0);
