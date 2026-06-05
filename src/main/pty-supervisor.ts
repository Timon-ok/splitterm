import { utilityProcess, MessageChannelMain, ipcMain, type UtilityProcess, type BrowserWindow } from 'electron';
import path from 'node:path';
import { CONTROL_CHANNELS, type SpawnRequest, type SpawnResponse } from '@shared/ipc';
import { asTermId, type TermId } from '@shared/ids';

let host: UtilityProcess | null = null;
let hostReady = false;
let nextId = 1;

/** Fork the pty-host utilityProcess and register the lifecycle (spawn/kill) IPC handlers. */
export function startPtyHost(): void {
  host = utilityProcess.fork(path.join(__dirname, 'host.js'), [], { serviceName: 'pty-host' });
  host.on('spawn', () => {
    hostReady = true;
  });
  host.on('exit', () => {
    hostReady = false;
    host = null;
  });

  ipcMain.handle(CONTROL_CHANNELS.ptySpawn, (_e, req: SpawnRequest): SpawnResponse => {
    const id = asTermId(nextId++);
    host?.postMessage({ type: 'spawn', id, opts: req });
    return { id };
  });

  ipcMain.handle(CONTROL_CHANNELS.ptyKill, (_e, req: { id: TermId }) => {
    host?.postMessage({ type: 'kill', id: req.id });
  });
}

/**
 * Establish the direct renderer ↔ host MessagePort firehose. Main only brokers the handshake;
 * terminal bytes never flow through main. Re-runs on every load (handles dev reloads).
 */
export function connectRendererPort(win: BrowserWindow): void {
  const wire = (): void => {
    if (!host) return;
    const { port1, port2 } = new MessageChannelMain();
    host.postMessage({ type: 'connect' }, [port1]);
    win.webContents.postMessage(CONTROL_CHANNELS.ptyPort, null, [port2]);
  };
  if (hostReady) wire();
  else host?.once('spawn', wire);
}

export function stopPtyHost(): void {
  host?.kill();
  host = null;
  hostReady = false;
}
