// Runtime verification that a profile's STARTUP sequence runs on a fresh terminal, and its RESTORE
// sequence runs instead when the session reopens. Pre-seeds settings.json with an "Echo" profile (set
// as the default the "+" opens) whose startup is `echo STARTUP_MARK_42` and restore is
// `echo RESTORE_MARK_42`. Launch 1: open the default terminal → the STARTUP marker appears, the RESTORE
// marker does not. Launch 2 (same user-data dir): the pane is restored → the RESTORE marker appears and
// the STARTUP marker does NOT — proving restore ran the restore sequence, not the startup sequence.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const mainJs = path.resolve('.vite/build/main.js');
const userDataDir = path.join(os.tmpdir(), 'splitterm-e2e-profile-restore');
rmSync(userDataDir, { recursive: true, force: true });
mkdirSync(userDataDir, { recursive: true });

// Seed the profile as the default. baseShellId need not be a detected shell — resolveLaunch falls back
// to the OS shell while keeping the command sequence, and `echo` works in cmd and PowerShell alike.
writeFileSync(
  path.join(userDataDir, 'settings.json'),
  JSON.stringify({
    schemaVersion: 1,
    profiles: [
      {
        id: 'echo-prof',
        name: 'Echo',
        baseShellId: 'pwsh',
        startupCommands: ['echo STARTUP_MARK_42'],
        restoreCommands: ['echo RESTORE_MARK_42'],
      },
    ],
    defaultProfileId: 'echo-prof',
  }),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = {};

async function launch() {
  const app = await electron.launch({ executablePath: electronPath, args: [mainJs, `--user-data-dir=${userDataDir}`] });
  let win = null;
  for (let i = 0; i < 30 && !win; i++) {
    for (const w of app.windows()) {
      if (await w.locator('#app').count().catch(() => 0)) { win = w; break; }
    }
    if (!win) await sleep(300);
  }
  return { app, win };
}

const rowsText = (win) => win.evaluate(() => [...document.querySelectorAll('.xterm-rows')].map((r) => r.innerText).join('\n'));

const waitFor = async (win, re, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    if (re.test(await rowsText(win))) return true;
    await sleep(300);
  }
  return false;
};

async function finish(code) {
  console.log('RESULT ' + JSON.stringify(result, null, 2));
  rmSync(userDataDir, { recursive: true, force: true });
  process.exit(code);
}

try {
  // ---- Launch 1: open the default (Echo) terminal — the startup sequence runs ----
  let { app, win } = await launch();
  if (!win) { result.error = 'no window (launch 1)'; await finish(1); }
  await win.getByRole('button', { name: 'New terminal' }).click();
  await waitFor(win, /STARTUP_MARK_42/);
  await sleep(500);
  const t1 = await rowsText(win);
  result.launch1_startupRan = /STARTUP_MARK_42/.test(t1);
  result.launch1_noRestore = !/RESTORE_MARK_42/.test(t1);
  result.launch1_panes = await win.locator('[data-leaf-id]').count();
  await sleep(900); // let the debounced session save land before quitting (quit also flushes)
  await app.close().catch(() => {});

  // ---- Launch 2: the pane is restored — the restore sequence runs instead ----
  ({ app, win } = await launch());
  if (!win) { result.error = 'no window (launch 2)'; await finish(1); }
  await waitFor(win, /RESTORE_MARK_42/);
  await sleep(800);
  const t2 = await rowsText(win);
  result.launch2_panes = await win.locator('[data-leaf-id]').count();
  result.launch2_restoreRan = /RESTORE_MARK_42/.test(t2);
  result.launch2_noStartup = !/STARTUP_MARK_42/.test(t2); // restore used restoreCommands, not startup
  await app.close().catch(() => {});

  const ok =
    result.launch1_startupRan &&
    result.launch1_noRestore &&
    result.launch1_panes === 1 &&
    result.launch2_panes === 1 &&
    result.launch2_restoreRan &&
    result.launch2_noStartup;
  result.ok = ok;
  await finish(ok ? 0 : 1);
} catch (err) {
  result.error = String(err && err.message ? err.message : err);
  await finish(1);
}
