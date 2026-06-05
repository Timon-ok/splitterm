// The PTY firehose travels over a direct MessageChannel between the pty-host utilityProcess
// and the renderer (brokered once by main). Messages are tagged by TermId so a single channel
// multiplexes every terminal. See plans/architecture.md §3.
//
// node-pty's API is string-based (it decodes bytes to UTF-16 internally), so the firehose
// carries strings; xterm.write(string) consumes them directly. (The binary/transferable
// discussion in the plan applies to byte-sourced PTYs; cross-process payloads are copied
// either way — throughput comes from rAF batching + flow control, not transferables.)
import type { TermId } from '../ids';

export type HostToRenderer =
  | { t: 'data'; id: TermId; data: string }
  | { t: 'exit'; id: TermId; code: number; signal?: number };

export type RendererToHost =
  | { t: 'write'; id: TermId; data: string }
  | { t: 'resize'; id: TermId; cols: number; rows: number }
  /** backpressure ack: chars consumed by xterm, so the host can pause/resume node-pty */
  | { t: 'ack'; id: TermId; bytes: number };

/**
 * Minimal MessagePort surface used by both ends, declared here so shared/ stays free of the
 * DOM lib. The renderer supplies a real `MessagePort`; the host a `MessagePortMain`.
 */
export interface PortLike {
  postMessage(message: unknown, transfer?: unknown[]): void;
  start?(): void;
  on?(event: 'message', listener: (e: { data: unknown }) => void): void;
  onmessage?: ((e: { data: unknown }) => void) | null;
  close?(): void;
}
