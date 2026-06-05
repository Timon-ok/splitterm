import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { DEFAULTS } from '@shared/domain/settings.schema';
import type { TermId } from '@shared/ids';
import { ipc } from '@platform/ipc-client';
import { registerTerminal, unregisterTerminal, writeToPty, resizePty, ackPty } from '@platform/pty-port';
import { readTerminalTheme } from './theme';

export interface TerminalTile {
  id: TermId;
  term: Terminal;
  dispose(): void;
}

/**
 * Create one xterm terminal in `container`, spawn a shell for it, and wire the firehose.
 * M1: a single tile with the DOM renderer + fit + flow-control acks. WebGL pooling and the
 * tiling layout land in M2.
 */
export async function createTerminalTile(container: HTMLElement): Promise<TerminalTile> {
  const term = new Terminal({
    allowProposedApi: true,
    scrollback: DEFAULTS.terminal.scrollback,
    cursorBlink: DEFAULTS.terminal.cursorBlink,
    fontFamily: DEFAULTS.font.family,
    fontSize: DEFAULTS.font.size,
    theme: readTerminalTheme(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(container);
  fit.fit();

  const { id } = await ipc.pty.spawn({ cols: term.cols, rows: term.rows });

  registerTerminal(
    id,
    (data) => term.write(data, () => ackPty(id, data.length)),
    // Local exit banner — the host session is already gone, so it isn't flow-controlled.
    (code) => term.write(`\r\n\x1b[90m[process exited: ${code}]\x1b[0m\r\n`),
  );

  // Keep the shell's cols/rows in sync with the PTY.
  resizePty(id, term.cols, term.rows);
  term.onData((d) => writeToPty(id, d));

  const observer = new ResizeObserver(() => {
    fit.fit();
    resizePty(id, term.cols, term.rows);
  });
  observer.observe(container);

  term.focus();

  return {
    id,
    term,
    dispose() {
      observer.disconnect();
      unregisterTerminal(id);
      ipc.pty.kill({ id });
      term.dispose();
    },
  };
}
