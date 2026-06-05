// Renderer composition root. M1: the JetBrains chrome shell hosting a single live terminal.
// Tiling, tabs, and the framework-driven chrome land in later milestones.
import '../styles/tokens.css';
import '../styles/base.css';
import { ipc } from '@platform/ipc-client';
import { initPortBridge } from '@platform/pty-port';
import { createTerminalTile } from '@features/terminal';

// Start listening for the PTY firehose port before anything spawns.
initPortBridge();

const root = document.getElementById('app');
if (!root) throw new Error('#app root not found');

root.innerHTML = `
  <header class="titlebar"><span class="brand">splitterm</span></header>
  <main class="body"><div class="terminal-host" id="terminal-host"></div></main>
  <footer class="statusbar">
    <span class="statusbar__item" id="shell-status">starting…</span>
    <span class="statusbar__item statusbar__version" id="version"></span>
  </footer>
`;

const host = document.getElementById('terminal-host');
if (host) {
  createTerminalTile(host)
    .then(() => {
      const status = document.getElementById('shell-status');
      if (status) status.textContent = 'ready';
    })
    .catch((err) => {
      const status = document.getElementById('shell-status');
      if (status) status.textContent = `terminal failed: ${String(err)}`;
    });
}

ipc.app
  .version()
  .then((v) => {
    const el = document.getElementById('version');
    if (el) el.textContent = `v${v}`;
  })
  .catch(() => {
    /* non-fatal */
  });
