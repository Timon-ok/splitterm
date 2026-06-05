// The BSP tiling tree — plain JSON-serializable data. n-ary splits keep the tree shallow.
// Pure transforms (split/close/resize/focus) land in M2 (the tiling engine); the renderer
// imports these and tests them with zero Electron/DOM.
import type { TermId } from '../ids';

export type LayoutNode =
  | { type: 'split'; dir: 'row' | 'col'; children: LayoutNode[]; ratios: number[] }
  | { type: 'leaf'; id: string; termId: TermId };

/** Serialized session (written to userData/session.json by main). */
export interface SessionV1 {
  v: 1;
  root: LayoutNode | null;
  focusedLeafId: string | null;
  maximizedId: string | null;
  /** per-leaf restore hints; live termIds are stripped on save */
  leaves: Record<string, { cwd?: string; profileId?: string }>;
}

// TODO(M2): splitActive(), closePane(), resizeRatios(), focusDirection(), serialize/restore.
