// The ONE place the renderer touches window.splitterm. Features call this typed client,
// never window.splitterm directly — keeping the IPC boundary a single testable seam.
import type { SplittermApi } from '@shared/ipc';

declare global {
  interface Window {
    splitterm: SplittermApi;
  }
}

export const ipc: SplittermApi = window.splitterm;
