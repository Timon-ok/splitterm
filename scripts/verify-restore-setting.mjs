// Runtime verification that the "Restore previous session" setting gates restore. Launch 1: build a
// two-pane layout, turn the setting OFF in Settings → General, close. Launch 2: reuse the SAME
// userData and assert NOTHING was restored (the app starts empty). Complements verify-session.mjs
// (which proves restore works with the default-on setting).
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const mainJs = path.resolve('.vite/build/main.js');
const userDataDir = path.join(os.tmpdir(), 'splitterm-e2e-restore-setting');
rmSync(userDataDir, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = {};

const launch = () =>
  electron.launch({ executablePath: electronPath, args: [mainJs, `--user-data-dir=${userDataDir}`] });
async function findWindow(app) {
  for (let i = 0; i < 30; i++) {
    for (const w of app.windows()) {
      if (await w.locator('#app').count().catch(() => 0)) return w;
    }
    await sleep(300);
  }
  return null;
}
function finish(code) {
  console.log('RESULT ' + JSON.stringify(result, null, 2));
  rmSync(userDataDir, { recursive: true, force: true });
  process.exit(code);
}

try {
  // ---- Launch 1: two panes, then turn restore OFF ----
  let app = await launch();
  let win = await findWindow(app);
  if (!win) {
    result.error = 'no window (launch 1)';
    await app.close().catch(() => {});
    finish(1);
  }
  await win.getByRole('button', { name: 'New terminal' }).click();
  await sleep(900);
  await win.locator('.xterm-screen').first().click();
  await sleep(150);
  await win.keyboard.press('Alt+Shift+Equal'); // split → 2 panes
  await sleep(1000);
  result.panesBeforeClose = await win.locator('[data-leaf-id]').count();

  // Settings → General → turn OFF "Restore previous session".
  await win.getByRole('button', { name: 'Open settings' }).click();
  await sleep(300);
  await win.locator('.settings-dialog button[data-category="general"]').click();
  await sleep(300);
  const sw = win.locator('.settings-dialog button[role="switch"]').first();
  result.defaultChecked = (await sw.getAttribute('aria-checked')) === 'true';
  if (result.defaultChecked) await sw.click(); // turn it off
  await sleep(300);
  result.persistedOff = (await win.evaluate(async () => (await window.splitterm.settings.get()).restoreSession)) === false;
  await win.keyboard.press('Escape');
  await sleep(800); // let the session save land
  await app.close();
  await sleep(500);

  // ---- Launch 2: same userData, restore OFF → nothing should reopen ----
  app = await launch();
  win = await findWindow(app);
  if (!win) {
    result.error = 'no window (launch 2)';
    await app.close().catch(() => {});
    finish(1);
  }
  await sleep(1500); // give any (erroneous) restore time to spawn before asserting absence
  result.panesAfterRestore = await win.locator('[data-leaf-id]').count();
  result.stillOff = (await win.evaluate(async () => (await window.splitterm.settings.get()).restoreSession)) === false;
  await app.close().catch(() => {});

  const ok =
    result.panesBeforeClose === 2 &&
    result.defaultChecked &&
    result.persistedOff &&
    result.panesAfterRestore === 0 &&
    result.stillOff;
  finish(ok ? 0 : 1);
} catch (err) {
  result.error = String(err && err.message ? err.message : err);
  finish(1);
}
