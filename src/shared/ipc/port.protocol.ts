// The high-throughput PTY byte firehose travels over a direct MessageChannel between the
// pty-host utilityProcess and the renderer (brokered once by main). These are the message
// shapes for that channel — kept tiny and binary (Uint8Array), off the control plane.
//
// NOTE: cross-process bytes are structured-clone COPIED (transfer lists only move
// MessagePorts across Electron's boundary), so throughput comes from batching + flow
// control, not from transferables. See plans/architecture.md §3.
import type { TermId } from '../ids';

export type HostToRenderer =
  | { t: 'data'; id: TermId; bytes: Uint8Array }
  | { t: 'exit'; id: TermId; code: number; signal?: number }
  /** reserved out-of-band metadata lane (cwd / marks / exit-code) for shell integration */
  | { t: 'meta'; id: TermId; cwd?: string };

export type RendererToHost =
  | { t: 'write'; id: TermId; bytes: Uint8Array }
  /** backpressure ack — renderer reports bytes consumed so the host can pause/resume */
  | { t: 'ack'; id: TermId; bytes: number }
  | { t: 'resize'; id: TermId; cols: number; rows: number };

/**
 * Minimal MessagePort surface used by both ends, declared here so shared/ stays free of
 * the DOM lib. The renderer supplies a real `MessagePort`, the host a `MessagePortMain`.
 */
export interface PortLike {
  postMessage(message: unknown, transfer?: unknown[]): void;
  start?(): void;
  on?(event: 'message', listener: (e: { data: unknown }) => void): void;
  onmessage?: ((e: { data: unknown }) => void) | null;
  close?(): void;
}
