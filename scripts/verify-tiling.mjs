// Runtime verification of the new-terminal behavior via Playwright's Electron driver.
// Launches the built app (.vite/build/main.js, no fuses so CDP can attach), drives the + button,
// and reads the real DOM to confirm: launch = empty, 1st + = exactly one VISIBLE terminal, 2nd + = two.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron'); // path to electron.exe
const mainJs = path.resolve('.vite/build/main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({ executablePath: electronPath, args: [mainJs] });

// Find the app window (skip the detached DevTools window).
let win = null;
for (let i = 0; i < 30 && !win; i++) {
  for (const w of app.windows()) {
    if (await w.locator('#app').count().catch(() => 0)) {
      win = w;
      break;
    }
  }
  if (!win) await sleep(300);
}
if (!win) {
  console.log('RESULT ' + JSON.stringify({ error: 'app window not found' }));
  await app.close();
  process.exit(1);
}

const paneCount = () => win.locator('[data-leaf-id]').count();
const firstPaneBox = async () => {
  const loc = win.locator('[data-leaf-id]').first();
  return (await loc.count()) ? loc.boundingBox() : null;
};

const result = { steps: [] };

// 1) Launch state
await win.waitForSelector('text=No terminal open', { timeout: 15000 }).catch(() => {});
result.launchPanes = await paneCount();
result.emptyHintVisible = await win.locator('text=No terminal open').isVisible().catch(() => false);

const plus = win.getByRole('button', { name: 'New terminal', exact: true });

// 2) First +
await plus.click();
await win.locator('[data-leaf-id]').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
await sleep(900);
result.afterFirst = await paneCount();
result.firstPaneBox = await firstPaneBox();
result.xtermAfterFirst = await win.locator('.xterm').count();
result.xtermVisibleAfterFirst = await win.locator('.xterm').first().isVisible().catch(() => false);

// 3) Second +
await plus.click();
await sleep(900);
result.afterSecond = await paneCount();
result.xtermAfterSecond = await win.locator('.xterm').count();

// 4) Responsive drag: a ghost follows the cursor; dropping swaps the panes.
const cellTermIds = () => win.locator('[data-leaf-id]').evaluateAll((els) => els.map((e) => e.dataset.termId));
const ghostBox = () => win.locator('.pane-ghost').boundingBox().catch(() => null);
result.termIdsBefore = await cellTermIds();
const grip = win.locator('[aria-label="Move pane"]').first();
const target = win.locator('[data-leaf-id]').nth(1);
const gb = await grip.boundingBox();
const tb = await target.boundingBox();
if (gb && tb) {
  await win.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await win.mouse.down();

  await win.mouse.move(400, 300, { steps: 6 });
  const g1 = await ghostBox();
  await win.mouse.move(700, 520, { steps: 6 });
  const g2 = await ghostBox();
  result.ghostVisible = !!g1;
  result.ghostAt1 = g1 && { x: Math.round(g1.x), y: Math.round(g1.y) };
  result.ghostAt2 = g2 && { x: Math.round(g2.x), y: Math.round(g2.y) };
  // ghost tracks the cursor (~14px offset) and moves between the two positions
  result.ghostTracksCursor =
    !!g1 && !!g2 && Math.abs(g1.x - 414) < 25 && Math.abs(g2.x - 714) < 25 && g2.x - g1.x > 100;

  await win.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 6 });
  await win.mouse.up();
  await sleep(900);
  result.ghostGoneAfterDrop = (await win.locator('.pane-ghost').count()) === 0;
}
result.termIdsAfter = await cellTermIds();
result.swapped =
  result.termIdsBefore.length === 2 &&
  result.termIdsBefore[0] === result.termIdsAfter[1] &&
  result.termIdsBefore[1] === result.termIdsAfter[0];

console.log('RESULT ' + JSON.stringify(result, null, 2));
await app.close();
