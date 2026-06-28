// GPU renderer attach with a hard context budget and an always-safe fallback.
//
// xterm's WebGL addon paints glyphs from a GPU texture atlas — far cheaper than the DOM renderer
// under heavy output. The catch is that WebGL contexts are a scarce, process-wide resource (Chrome
// caps live contexts at ~16, then silently kills the OLDEST one). A tiling terminal can open more
// panes than that, so we must NOT hand every pane its own context blindly.
//
// This module is the single chokepoint. It (1) caps how many panes get a live context (best-effort —
// see the partial-init note on MAX_WEBGL_CONTEXTS), and (2) guarantees that any failure — WebGL
// unavailable, blocklisted GPU, init throw, or a context lost at runtime — degrades the pane to the
// DOM renderer. A pane never ends up permanently blank. The one caveat: on a *runtime* context loss
// xterm waits up to ~3s for the GPU to restore the context before firing onContextLoss (our fallback
// hook), so that pane shows a stale frame for that window rather than reverting to DOM instantly.
import { WebglAddon } from '@xterm/addon-webgl';
import type { Terminal } from '@xterm/xterm';

// Conservative headroom under Chrome's ~16-context limit, leaving room for other GPU surfaces in the
// app and for a respawn before the browser starts evicting. Panes beyond this stay on the DOM
// renderer (correct, just not GPU-accelerated). The count is best-effort: a GPU that fails shader
// init *after* acquiring its context (see the loadAddon catch) orphans that context outside our
// accounting until GC, so we keep the cap well under the hard limit to absorb the occasional orphan
// without the browser evicting a live pane.
const MAX_WEBGL_CONTEXTS = 8;

let active = 0;

export interface WebglHandle {
  /** detach the GPU renderer and free its context; idempotent */
  dispose(): void;
}

/** How many panes currently hold a live WebGL context. Exposed for diagnostics / tests. */
export function activeWebglContexts(): number {
  return active;
}

/**
 * Try to attach the GPU renderer to a terminal that has already been `open()`ed.
 *
 * Returns a handle on success, or `null` when the pane should stay on the DOM renderer — because the
 * context budget is full, WebGL2 is unavailable, or initialization threw. On a later context loss the
 * handle disposes itself and the pane falls back to DOM automatically, so callers never have to
 * handle the loss themselves; they only `dispose()` the handle when the pane closes.
 */
export function tryAttachWebgl(term: Terminal): WebglHandle | null {
  if (active >= MAX_WEBGL_CONTEXTS) return null;

  let addon: WebglAddon | null = null;
  try {
    addon = new WebglAddon();
  } catch {
    // The addon constructor only throws on legacy Safari (<16). On Electron/Chromium a missing or
    // blocklisted WebGL2 instead surfaces from loadAddon() below — both paths return null here.
    return null;
  }

  let disposed = false;
  const release = (): void => {
    if (disposed) return;
    disposed = true;
    active--;
    try {
      addon?.dispose();
    } catch {
      /* already torn down by xterm or the lost context */
    }
    addon = null;
  };

  // Count the context before activating so a budget check elsewhere can't double-grant; `release`
  // undoes it symmetrically if activation throws below. onContextLoss can only fire asynchronously
  // (it's a GPU event), so it can't race this increment.
  active++;
  addon.onContextLoss(release);

  try {
    // activate() acquires the GL context and compiles shaders; this is where a missing/blocklisted
    // WebGL2 or a shader-init failure surfaces on Electron/Chromium. A failure *after* the context is
    // acquired can orphan it until GC — see the best-effort note on MAX_WEBGL_CONTEXTS.
    term.loadAddon(addon);
  } catch {
    release();
    return null;
  }

  return { dispose: release };
}
