#!/usr/bin/env node
/**
 * Full-page screenshots via the Chrome DevTools Protocol.
 *
 * Why this exists: `chromium --screenshot --window-size=W,H` treats H as the
 * *viewport*, so a hero with `min-height: 100svh` grows to H and the capture
 * is a lie. CDP lets us set a realistic viewport and capture beyond it, which
 * is what an actual visitor sees.
 *
 * No dependencies — Node's built-in WebSocket and fetch only.
 *
 *   node scripts/shot.mjs <url> <out.png> [width] [height] [--viewport-only]
 */

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const [url, out, w = '1440', h = '900', ...flags] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [w] [h] [--viewport-only]');
  process.exit(1);
}

const width = Number(w);
const height = Number(h);
const fullPage = !flags.includes('--viewport-only');
const PORT = 9333 + Math.floor(Math.random() * 400);

const chrome = spawn(
  'chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-lcd-text',
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

/** Wait for the debugging endpoint to accept connections. */
async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('chromium never opened its debugging port');
}

/** Minimal CDP client: send a method, resolve on the matching id. */
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
      listeners.delete(msg.method);
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
    once(method) {
      return new Promise((resolve) => {
        if (!listeners.has(method)) listeners.set(method, []);
        listeners.get(method).push(resolve);
      });
    },
    close: () => ws.close(),
  };
}

const browserWs = await endpoint();
const browser = connect(browserWs);
await browser.ready;

// Newer Chromium requires PUT for /json/new.
const target = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
).json();

const page = connect(target.webSocketDebuggerUrl);
await page.ready;

await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 600,
});

const loaded = page.once('Page.loadEventFired');
await page.send('Page.navigate', { url });
await loaded;

// Fonts decide most of the layout here; screenshotting before they settle
// produces something nobody will ever see.
await page.send('Runtime.evaluate', {
  expression: 'document.fonts.ready',
  awaitPromise: true,
});
await sleep(400);

const { data } = await page.send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: fullPage,
});

await writeFile(out, Buffer.from(data, 'base64'));
console.log(`${out}  ${width}x${height}${fullPage ? ' (full page)' : ''}`);

page.close();
browser.close();
cleanup();
process.exit(0);
