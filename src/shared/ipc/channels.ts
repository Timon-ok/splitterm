// Single source of truth for ipcMain channel names (low-rate control plane).
// The high-rate PTY byte firehose does NOT use these — it rides a direct MessagePort
// (see ./port.protocol.ts).

export const CONTROL_CHANNELS = {
  ptySpawn: 'pty:spawn',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  /** main → renderer: hands over the MessagePort for a terminal's byte firehose */
  ptyPort: 'pty:port',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  /** main → renderer broadcast after a settings change (UI or external edit) */
  settingsChanged: 'settings:changed',

  appVersion: 'app:version',
} as const;

export type ControlChannel = (typeof CONTROL_CHANNELS)[keyof typeof CONTROL_CHANNELS];
