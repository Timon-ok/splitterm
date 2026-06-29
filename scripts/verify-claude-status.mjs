// Runtime verification of the Claude-working sidebar status (v2). Two things:
//  (A) ECHO GATE: typing into a pane must NOT show a working indicator (the old bug).
//  (B) DETECTION: when Claude Code's "esc to interrupt" footer is on the bottom status line, the pane
//      reads claudeWorking (coral). We simulate it with a plain shell by filling the screen so an
//      "esc to interrupt" line lands at the bottom (where Claude draws its footer), holding it for the
//      2-scan latch, then clearing it and asserting the status reverts.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const mainJs = path.resolve('.vite/build/main.js');
const userDataDir = path.join(os.tmpdir(), 'splitterm-e2e-claude-status');
rmSync(userDataDir, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = await electron.launch({ executablePath: electronPath, args: [mainJs, `--user-data-dir=${userDataDir}`] });
const result = {};
let win = null;

async function finish(code) {
  console.log('RESULT ' + JSON.stringify(result, null, 2));
  await app.close().catch(() => {});
  rmSync(userDataDir, { recursive: true, force: true });
  process.exit(code);
}
const statusOf = () => win.evaluate(() => document.querySelector('.pane-status-dot')?.getAttribute('data-status') ?? '');
const rowHighlighted = () => win.evaluate(() => document.querySelectorAll('.row-claude-working').length);
const waitStatus = async (want, tries) => {
  for (let i = 0; i < tries; i++) {
    if ((await statusOf()) === want) return true;
    await sleep(200);
  }
  return false;
};

try {
  for (let i = 0; i < 30 && !win; i++) {
    for (const w of app.windows()) if (await w.locator('#app').count().catch(() => 0)) { win = w; break; }
    if (!win) await sleep(300);
  }
  if (!win) { result.error = 'no window'; await finish(1); }

  await win.getByRole('button', { name: 'Toggle sidebar' }).click();
  await sleep(300);
  await win.getByRole('button', { name: 'New terminal' }).click();
  await sleep(2400); // shell prints its prompt then settles → idle
  result.statusInitial = await statusOf();

  // (A) ECHO GATE: typing must never flip to 'working'/'claudeWorking'.
  await win.locator('.xterm-screen').first().click();
  await sleep(150);
  let typingShowedProgress = false;
  for (const ch of 'echo typing-no-progress'.split('')) {
    await win.keyboard.type(ch);
    await sleep(70);
    const s = await statusOf();
    if (s === 'working' || s === 'claudeWorking') typingShowedProgress = true;
  }
  result.typingStayedCalm = !typingShowedProgress;
  await win.keyboard.press('Enter'); // run it (harmless) to clear the line
  await sleep(1500);

  // (B) DETECTION: fill the screen so an "esc to interrupt" line lands at the BOTTOM, then hold it.
  await win.keyboard.type('1..60 | % { "filler $_" }; Write-Host "Forging... (5s, esc to interrupt)"');
  await win.keyboard.press('Enter');
  result.claudeDetected = await waitStatus('claudeWorking', 30); // ~6s: render + fill + 2-scan latch
  result.rowHighlighted = await rowHighlighted();

  // Clear the screen → footer gone → reverts within GRACE.
  await win.keyboard.type('Clear-Host');
  await win.keyboard.press('Enter');
  await sleep(2500);
  result.clearedStatus = await statusOf();

  const ok =
    result.statusInitial !== 'claudeWorking' &&
    result.typingStayedCalm &&
    result.claudeDetected &&
    result.rowHighlighted >= 1 &&
    result.clearedStatus !== 'claudeWorking';
  result.ok = ok;
  await finish(ok ? 0 : 1);
} catch (err) {
  result.error = String(err && err.message ? err.message : err);
  await finish(1);
}
