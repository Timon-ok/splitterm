// Runtime verification of the opt-in GPU (WebGL) renderer. Proves: (1) the setting defaults OFF
// (opt-in) and persists when enabled; (2) with it on, a new terminal and a split both render on the
// GPU — detected by a <canvas> in .xterm-screen, which the DOM renderer never produces (it uses
// .xterm-rows and zero canvases); (3) a live font change (texture-atlas rebuild + applySettings)
// doesn't blank or crash the GPU panes; (4) no WebGL/renderer error fires throughout.
//
// The canvas assertions are gated on WebGL2 actually being available in the test environment — on a
// GPU-less box the addon falls back to the DOM renderer, which is the whole safety guarantee, so the
// test then verifies the panes still exist and nothing crashed rather than demanding a canvas.
//
// The error gate only fails on WebGL/renderer-relevant messages. Electron/Chromium emits unrelated
// console/page noise on CI runners (e.g. the CDP "Autofill.enable wasn't found" probe, stray network
// JSON-parse pageerrors) that has nothing to do with the GPU renderer and must not gate this test.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const mainJs = path.resolve('.vite/build/main.js');
const userDataDir = path.join(os.tmpdir(), 'splitterm-e2e-webgl');
rmSync(userDataDir, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = await electron.launch({ executablePath: electronPath, args: [mainJs, `--user-data-dir=${userDataDir}`] });

const result = { errors: [] };
let win = null;

// Messages that actually implicate the GPU renderer. A real WebGL failure surfaces as one of these
// (addon throw, lost context, shader/texture/atlas error); everything else is environment noise.
const WEBGL_ERROR_RE = /webgl|context\s*lost|contextlost|shader|texture|atlas|addon-webgl|xterm/i;

async function finish(code) {
  console.log('RESULT ' + JSON.stringify(result, null, 2));
  await app.close().catch(() => {});
  rmSync(userDataDir, { recursive: true, force: true });
  process.exit(code);
}

// Count panes and how many are GPU-rendered. A <canvas> under .xterm-screen ⇒ the WebGL renderer is
// active (the DOM renderer emits .xterm-rows and no canvas).
const renderState = () =>
  win.evaluate(() => {
    const screens = [...document.querySelectorAll('.xterm-screen')];
    return {
      panes: document.querySelectorAll('[data-leaf-id]').length,
      screens: screens.length,
      gpuPanes: screens.filter((s) => s.querySelector('canvas')).length,
      anyDomRows: !!document.querySelector('.xterm-rows'),
    };
  });

try {
  // Surface any renderer-side error during the WebGL session as a hard failure.
  app.on('window', (w) => {
    w.on('pageerror', (e) => result.errors.push('pageerror: ' + (e?.message ?? e)));
    w.on('console', (m) => {
      if (m.type() === 'error') result.errors.push('console.error: ' + m.text());
    });
  });

  for (let i = 0; i < 30 && !win; i++) {
    for (const w of app.windows()) {
      if (await w.locator('#app').count().catch(() => 0)) { win = w; break; }
    }
    if (!win) await sleep(300);
  }
  if (!win) { result.error = 'no app window'; await finish(1); }

  win.on('pageerror', (e) => result.errors.push('pageerror: ' + (e?.message ?? e)));
  win.on('console', (m) => { if (m.type() === 'error') result.errors.push('console.error: ' + m.text()); });

  result.webgl2Available = await win.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));

  // --- Setting defaults OFF (opt-in), and enabling it persists. ---
  await win.getByRole('button', { name: 'Open settings' }).click();
  await sleep(300);
  await win.locator('.settings-dialog button[data-category="terminal"]').click();
  await sleep(300);
  const sw = win.locator('.settings-dialog button[role="switch"][aria-label="GPU acceleration"]');
  result.defaultOff = (await sw.getAttribute('aria-checked')) === 'false';
  await sw.click(); // turn ON
  await sleep(200);
  result.persistedOn = (await win.evaluate(async () => (await window.splitterm.settings.get()).terminal.webgl)) === true;
  await win.keyboard.press('Escape');
  await sleep(300);

  // --- A new terminal renders on the GPU. ---
  await win.getByRole('button', { name: 'New terminal' }).click();
  await sleep(1500);
  result.afterOpen = await renderState();

  // --- A split is GPU-rendered too (both panes within the context budget). ---
  await win.locator('.xterm-screen').first().click();
  await sleep(150);
  await win.keyboard.press('Alt+Shift+Equal');
  await sleep(1500);
  result.afterSplit = await renderState();

  // --- A live font change (atlas rebuild + applySettings) must not blank or crash the GPU panes. ---
  await win.getByRole('button', { name: 'Open settings' }).click();
  await sleep(300);
  await win.locator('.settings-dialog button[data-category="terminal"]').click();
  await sleep(300);
  const fontSize = win.locator('.settings-dialog input[type="number"]').first();
  await fontSize.fill('18');
  await fontSize.dispatchEvent('change');
  await sleep(700);
  await win.keyboard.press('Escape');
  await sleep(500);
  result.afterFontChange = await renderState();

  // Pane bookkeeping must hold regardless of GPU availability (this is the no-blank-pane guarantee).
  const panesOk =
    result.afterOpen.panes === 1 && result.afterSplit.panes === 2 && result.afterFontChange.panes === 2;

  // GPU assertions only when WebGL2 is actually available; otherwise the DOM fallback is correct and
  // the panes-exist check above is what proves the safety property.
  const gpuOk = result.webgl2Available
    ? result.afterOpen.gpuPanes === 1 &&
      result.afterSplit.gpuPanes === 2 &&
      result.afterFontChange.gpuPanes === 2 &&
      !result.afterSplit.anyDomRows
    : true;

  result.panesOk = panesOk;
  result.gpuOk = gpuOk;
  // Gate only on WebGL/renderer errors; keep all captured messages in result.errors for diagnostics.
  result.webglErrors = result.errors.filter((e) => WEBGL_ERROR_RE.test(e));
  result.noWebglErrors = result.webglErrors.length === 0;

  await finish(result.defaultOff && result.persistedOn && panesOk && gpuOk && result.noWebglErrors ? 0 : 1);
} catch (err) {
  result.error = String(err && err.message ? err.message : err);
  if (win) await win.screenshot({ path: path.resolve('scripts/verify-webgl-fail.png') }).catch(() => {});
  await finish(1);
}
