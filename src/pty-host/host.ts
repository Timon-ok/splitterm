// PTY-host utilityProcess entry — one process hosting ALL node-pty shells, keyed by TermId.
// Receives a MessagePortMain (the firehose to the renderer) plus control messages from main.
import type { TermId } from '@shared/ids';
import type { PortLike, RendererToHost, SpawnRequest } from '@shared/ipc';
import { spawnPty, writePty, resizePty, ackPty, killPty, killAll } from './pty-manager';

// Control messages main → host (over the utilityProcess parentPort).
type HostControl =
  | { type: 'connect' }
  | { type: 'spawn'; id: TermId; opts: SpawnRequest }
  | { type: 'kill'; id: TermId };

// `process.parentPort` is the Electron utilityProcess channel (not typed by @types/node).
interface ParentPortEvent {
  data: unknown;
  ports: PortLike[];
}
const parentPort = (process as unknown as {
  parentPort?: { on(event: 'message', listener: (e: ParentPortEvent) => void): void };
}).parentPort;

let firehose: PortLike | null = null;
// Spawns can arrive before the renderer's firehose port is connected (the renderer requests a
// terminal during page eval, but main brokers the port on did-finish-load). Queue until ready,
// then drain — otherwise the PTY is silently never created and the terminal hangs.
const pendingSpawns: Array<{ id: TermId; opts: SpawnRequest }> = [];

function onPortMessage(e: { data: unknown }): void {
  const msg = e.data as RendererToHost;
  switch (msg.t) {
    case 'write':
      writePty(msg.id, msg.data);
      break;
    case 'resize':
      resizePty(msg.id, msg.cols, msg.rows);
      break;
    case 'ack':
      ackPty(msg.id, msg.bytes);
      break;
  }
}

parentPort?.on('message', (e) => {
  const msg = e.data as HostControl;
  switch (msg.type) {
    case 'connect': {
      const port = e.ports[0];
      if (!port) break;
      firehose?.close?.(); // release a previous port (e.g. dev reload reconnect)
      firehose = port;
      port.start?.();
      port.on?.('message', onPortMessage);
      // Drain any spawns that arrived before the port was ready.
      for (const s of pendingSpawns) spawnPty(s.id, s.opts, port);
      pendingSpawns.length = 0;
      break;
    }
    case 'spawn':
      if (firehose) spawnPty(msg.id, msg.opts, firehose);
      else pendingSpawns.push({ id: msg.id, opts: msg.opts });
      break;
    case 'kill':
      killPty(msg.id);
      break;
  }
});

process.on('exit', killAll);
