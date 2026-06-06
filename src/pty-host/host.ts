// PTY-host utilityProcess entry — one process hosting ALL node-pty shells, keyed by TermId.
// Receives a MessagePortMain (the firehose to the renderer) plus control messages from main.
import type { TermId } from '@shared/ids';
import type { PortLike, RendererToHost, SpawnRequest } from '@shared/ipc';
import { spawnPty, writePty, resizePty, ackPty, killPty, killAll } from './pty-manager';
import { resolveShell, detectProfiles, type ResolvedShell, type ShellProfileFull } from './shell-detect';

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
  parentPort?: {
    on(event: 'message', listener: (e: ParentPortEvent) => void): void;
    postMessage(message: unknown): void;
  };
}).parentPort;

let firehose: PortLike | null = null;
let fullProfiles: ShellProfileFull[] = [];
// Spawns can arrive before the renderer's firehose port is connected; queue and drain on connect.
const pendingSpawns: Array<{ id: TermId; opts: SpawnRequest; shell: ResolvedShell }> = [];

function resolveProfile(profileId?: string): ResolvedShell {
  if (profileId) {
    const p = fullProfiles.find((x) => x.id === profileId);
    if (p) return { file: p.file, args: p.args };
    console.warn(`[pty-host] unknown profile "${profileId}", using default shell`);
  }
  return resolveShell();
}

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
      firehose?.close?.();
      firehose = port;
      port.start?.();
      port.on?.('message', onPortMessage);
      for (const s of pendingSpawns) spawnPty(s.id, s.opts, port, s.shell);
      pendingSpawns.length = 0;
      break;
    }
    case 'spawn': {
      const shell = resolveProfile(msg.opts.profileId);
      if (firehose) spawnPty(msg.id, msg.opts, firehose, shell);
      else pendingSpawns.push({ id: msg.id, opts: msg.opts, shell });
      break;
    }
    case 'kill':
      killPty(msg.id);
      break;
  }
});

// Detect available shell profiles off the hot path; report id+label to main for the UI.
void detectProfiles()
  .then((list) => {
    fullProfiles = list;
    parentPort?.postMessage({ type: 'profiles', list: list.map((p) => ({ id: p.id, label: p.label })) });
  })
  .catch((err) => console.error('[pty-host] profile detection failed:', err));

process.on('exit', killAll);
