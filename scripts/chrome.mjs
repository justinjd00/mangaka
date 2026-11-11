// Find Chrome and take screenshots with it (headless, no dependencies).
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CANDIDATES = [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

/** Path of a Chrome or Chromium binary (CHROME_PATH first), or null. */
export function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  return CANDIDATES.find(existsSync) ?? null;
}

/**
 * Screenshot `url` (a URL or a file path) to the PNG `out`, window width x height
 * CSS px, at device scale `scale`. Any file already at `out` is removed first; throws
 * when Chrome is missing, exits non-zero or writes nothing.
 */
export function screenshot({ url, out, width, height, scale = 1 }) {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found (set CHROME_PATH)');
  const target = /^[a-z]+:\/\//i.test(url) ? url : pathToFileURL(resolve(url)).href;
  rmSync(out, { force: true });
  const r = spawnSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${Math.round(width)},${Math.round(height)}`,
    `--force-device-scale-factor=${scale}`,
    '--virtual-time-budget=2000',
    `--screenshot=${resolve(out)}`, target,
  ], { encoding: 'utf8', timeout: 120000 });
  if (r.error) throw r.error;
  const tail = (r.stderr || '').trim().split('\n').slice(-3).join(' ');
  if (r.status !== 0) throw new Error(`Chrome exited with ${r.status ?? r.signal}: ${tail}`);
  if (!existsSync(out)) throw new Error(`Chrome wrote no screenshot: ${tail}`);
}
