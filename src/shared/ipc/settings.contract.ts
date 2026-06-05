// The settings IPC surface. Values + file I/O live in main; the renderer reads a snapshot
// and subscribes to changes. The schema TYPE + DEFAULTS live in ../domain/settings.schema.
import type { Settings } from '../domain/settings.schema';

export interface SettingsApi {
  get(): Promise<Settings>;
  set(patch: Partial<Settings>): Promise<void>;
  /** subscribe to hot-apply broadcasts; returns an unsubscribe fn */
  onChange(cb: (settings: Settings) => void): () => void;
}
