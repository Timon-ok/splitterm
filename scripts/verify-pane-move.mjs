// Runtime verification of drag-to-tile (the Windows-Snap-style pane drop zones). Opens two panes
// side by side, then drags the right pane's grip handle onto the LEFT pane's bottom edge zone. That
// must RE-TILE (not swap): the two panes end up stacked, the pane count stays 2, and the same two
// terminals survive (their term-ids are unchanged — the move keeps live terminals, no respawn).
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const mainJs = path.resolve('.vite/build/main.js');
const userDataDir = path.join(os.tmpdir(), 'splitterm-e2e-pane-move');
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

// Snapshot the panes: count, sorted term-ids, and each cell's center.
const layout = () =>
  win.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-leaf-id]')];
    return {
      count: cells.length,
      termIds: cells.map((c) => c.dataset.termId).sort(),
      centers: cells.map((c) => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.leafId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: { x: r.left, y: r.top, w: r.width, h: r.height } };
      }),
    };
  });

// Two cells are "side-by-side" when their centers differ more in x than y, "stacked" when the reverse.
const arrangement = (centers) => {
  if (centers.length !== 2) return 'n/a';
  const dx = Math.abs(centers[0].cx - centers[1].cx);
  const dy = Math.abs(centers[0].cy - centers[1].cy);
  return dx > dy ? 'side-by-side' : 'stacked';
};

try {
  for (let i = 0; i < 30 && !win; i++) {
    for (const w of app.windows()) {
      if (await w.locator('#app').count().catch(() => 0)) { win = w; break; }
    }
    if (!win) await sleep(300);
  }
  if (!win) { result.error = 'no app window'; await finish(1); }

  // Open one terminal, then split it into two side by side (Alt+Shift+= → row split).
  await win.getByRole('button', { name: 'New terminal' }).click();
  await sleep(1000);
  await win.locator('.xterm-screen').first().click();
  await sleep(150);
  await win.keyboard.press('Alt+Shift+Equal');
  await sleep(1200);

  const before = await layout();
  result.before = { count: before.count, arrangement: arrangement(before.centers), termIds: before.termIds };
  if (before.count !== 2) { result.error = 'expected 2 panes before drag'; await finish(1); }

  // Source = right pane (larger center-x); target = left pane.
  const sorted = [...before.centers].sort((a, b) => a.cx - b.cx);
  const left = sorted[0];
  const right = sorted[1];

  // Drag the right pane's grip handle into the LEFT pane's bottom edge zone.
  const handle = win.locator(`[data-leaf-id="${right.id}"] button[aria-label="Move pane"]`);
  const hb = await handle.boundingBox();
  if (!hb) { result.error = 'no drag handle'; await finish(1); }

  const tx = left.r.x + left.r.w / 2;
  const tyCenter = left.r.y + left.r.h / 2;
  const tyBottom = left.r.y + left.r.h * 0.85; // inside the bottom zone

  await win.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await win.mouse.down();
  await win.mouse.move(tx, tyCenter, { steps: 10 }); // into the target so the hit-test latches on
  await win.mouse.move(tx, tyBottom, { steps: 10 }); // then down into the bottom zone
  await sleep(150);
  result.zoneShown = await win.evaluate(() => !!document.querySelector('.pane-drop-zone'));
  await win.mouse.up();
  await sleep(1200); // let the re-tile View Transition settle

  const after = await layout();
  result.after = { count: after.count, arrangement: arrangement(after.centers), termIds: after.termIds };

  const ok =
    result.before.arrangement === 'side-by-side' &&
    result.after.arrangement === 'stacked' &&
    after.count === 2 &&
    JSON.stringify(after.termIds) === JSON.stringify(before.termIds); // same terminals, re-tiled not respawned

  result.ok = ok;
  await finish(ok ? 0 : 1);
} catch (err) {
  result.error = String(err && err.message ? err.message : err);
  if (win) await win.screenshot({ path: path.resolve('scripts/verify-pane-move-fail.png') }).catch(() => {});
  await finish(1);
}
