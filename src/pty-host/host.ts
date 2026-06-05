// PTY-host utilityProcess entry — one process hosting ALL node-pty shells, keyed by TermId.
//
// Scaffold: this proves the 4th Vite/Forge build target compiles and the structure exists.
// M1 wires the real pipeline here:
//   1. receive the MessagePortMain handshake from main (gated on the 'spawn' event),
//   2. node-pty manager: Map<TermId, IPty> spawn/write/resize/kill,
//   3. flow control: high/low watermarks + pause()/resume(), ack sampling.
// See plans/architecture.md §3 and plans/project-structure.md.

// `process.parentPort` is the Electron utilityProcess channel (not in @types/node).
const parentPort = (process as unknown as {
  parentPort?: { on(event: 'message', listener: (e: { data: unknown; ports: unknown[] }) => void): void };
}).parentPort;

parentPort?.on('message', () => {
  // TODO(M1): pull the MessagePortMain off e.ports[0], attach the pty-manager.
});

console.log('[pty-host] booted (scaffold stub — node-pty wiring lands in M1)');
