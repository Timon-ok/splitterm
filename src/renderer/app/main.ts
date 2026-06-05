// Renderer composition root (framework-agnostic for the scaffold).
// Renders the JetBrains-clean chrome skeleton — titlebar / body / statusbar — styled from
// tokens.css. No terminal yet (that's M1); this validates the toolchain + the look.
import '../styles/tokens.css';
import '../styles/base.css';
import { ipc } from '@platform/ipc-client';

const root = document.getElementById('app');
if (!root) throw new Error('#app root not found');

root.innerHTML = `
  <header class="titlebar">
    <span class="brand">splitterm</span>
  </header>
  <main class="body">
    <div class="placeholder">
      <div class="placeholder__title">splitterm</div>
      <div class="placeholder__sub">scaffold ready — terminal lands in M1</div>
    </div>
  </main>
  <footer class="statusbar">
    <span class="statusbar__item">ready</span>
    <span class="statusbar__item statusbar__version" id="version"></span>
  </footer>
`;

// Tiny smoke test that the contextBridge + IPC round-trip works end to end.
ipc.app
  .version()
  .then((v) => {
    const el = document.getElementById('version');
    if (el) el.textContent = `v${v}`;
  })
  .catch(() => {
    /* ignore in scaffold */
  });
