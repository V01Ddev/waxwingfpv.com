#!/usr/bin/env node
/**
 * Renders the Open Graph share cards.
 *
 * Chromium does the rendering rather than ImageMagick or a canvas library,
 * because the card needs the real Fraunces and Plex webfonts and the real logo
 * mark. Chromium already has all of them; anything else means shipping font
 * files in a second format purely to draw two images.
 *
 *   node scripts/og.mjs            # serve dist/ internally
 *   node scripts/og.mjs <base-url> # use a server you already have running
 *
 * Output lands in public/og/ and is committed. Re-run it when the tagline, the
 * hero frame or the logo changes.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const CARD = { width: 1200, height: 630 };
const ownServer = !process.argv[2];
const port = 9700 + Math.floor(Math.random() * 200);
const base = process.argv[2] ?? `http://127.0.0.1:${port}`;

const COPY = {
  tr: 'İstanbul’da kafe ve restoranlar için sinematik FPV video.',
  en: 'Cinematic FPV video for cafés and restaurants in Istanbul.',
};

const logo = (await readFile('src/assets/brand/logo-white.svg', 'utf8'))
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<title[^>]*>.*?<\/title>/g, '')
  .trim();

const html = (locale) => `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Fraunces'; font-weight: 100 900;
    src: url('/fonts/fraunces-latin.woff2') format('woff2-variations'); }
  @font-face { font-family: 'Plex Sans'; font-weight: 400;
    src: url('/fonts/plex-sans-latin-400.woff2') format('woff2'); }
  @font-face { font-family: 'Plex Mono'; font-weight: 400;
    src: url('/fonts/plex-mono-latin-400.woff2') format('woff2'); }

  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${CARD.width}px; height: ${CARD.height}px; overflow: hidden;
    background: #05070a; color: #e8e6e1;
    font-family: 'Plex Sans', sans-serif;
  }
  .card { position: relative; width: 100%; height: 100%; }
  .card img.still {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover;
  }
  /* Same logic as the hero: weighted to the bottom, where the type is, and
     light through the middle so the footage is actually visible. */
  .scrim {
    position: absolute; inset: 0;
    background: linear-gradient(to top,
      rgba(5,7,10,.94) 0%, rgba(5,7,10,.74) 30%,
      rgba(5,7,10,.10) 68%, rgba(5,7,10,.28) 100%);
  }
  .inner {
    position: absolute; inset: 0; padding: 60px 64px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .wm { display: flex; align-items: center; gap: 14px; }
  .wm svg { height: 30px; width: auto; display: block; }
  .wm .name {
    font-family: 'Fraunces', serif; font-optical-sizing: none;
    font-variation-settings: 'opsz' 40; font-weight: 600;
    font-size: 33px; letter-spacing: -0.01em;
  }
  .wm .suffix {
    font-family: 'Plex Mono', monospace; font-size: 19px;
    letter-spacing: .06em; color: #8a9199;
  }
  .pitch {
    font-family: 'Fraunces', serif; font-optical-sizing: none;
    font-variation-settings: 'opsz' 72; font-weight: 700;
    font-size: 58px; line-height: 1.02; letter-spacing: -0.02em;
    max-width: 17ch;
  }
</style></head>
<body><div class="card">
  <img class="still" src="/video/hero-landscape.jpg" alt="">
  <div class="scrim"></div>
  <div class="inner">
    <div class="wm">${logo}<span class="name">Waxwing</span><span class="suffix">FPV</span></div>
    <p class="pitch">${COPY[locale]}</p>
  </div>
</div></body></html>`;

// --- optional server -------------------------------------------------------
let server;
if (ownServer) {
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', 'dist'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${base}/`)).ok) break; } catch {}
    await sleep(150);
  }
}

// --- chromium --------------------------------------------------------------
const debugPort = port + 1;
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--remote-debugging-port=${debugPort}`, 'about:blank',
], { stdio: 'ignore' });

const stop = () => { try { chrome.kill('SIGKILL'); } catch {} try { server?.kill('SIGKILL'); } catch {} };
process.on('exit', stop);

let wsUrl;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    if (r.ok) { wsUrl = (await r.json()).webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(100);
}

const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
const sock = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res) => sock.addEventListener('open', res));

let nextId = 1;
const pending = new Map();
const events = new Map();
sock.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  } else if (m.method && events.has(m.method)) {
    const fn = events.get(m.method).shift();
    if (fn) fn(m.params);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); sock.send(JSON.stringify({ id, method, params })); });
const once = (m) => new Promise((r) => { if (!events.has(m)) events.set(m, []); events.get(m).push(r); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { ...CARD, deviceScaleFactor: 1, mobile: false });

// --- render ----------------------------------------------------------------
for (const locale of Object.keys(COPY)) {
  const name = `__og-${locale}.html`;
  await writeFile(`dist/${name}`, html(locale));

  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: `${base}/${name}` });
  await loaded;
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  await sleep(300);

  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  await writeFile(`public/og/${locale}.jpg`, Buffer.from(data, 'base64'));
  await unlink(`dist/${name}`);
  console.log(`  public/og/${locale}.jpg  ${CARD.width}x${CARD.height}`);
}

stop();
process.exit(0);
