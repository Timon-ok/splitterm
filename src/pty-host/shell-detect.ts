import os from 'node:os';
import fs from 'node:fs';

export interface ResolvedShell {
  file: string;
  args: string[];
}

/** Minimal default-shell detection for M1. Profiles + WSL enumeration land in M3. */
export function resolveShell(): ResolvedShell {
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const pwsh = `${programFiles}\\PowerShell\\7\\pwsh.exe`;
    if (fs.existsSync(pwsh)) return { file: pwsh, args: [] };

    const winPowerShell = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    if (fs.existsSync(winPowerShell)) return { file: winPowerShell, args: [] };

    return { file: process.env.ComSpec ?? 'cmd.exe', args: [] };
  }
  return { file: process.env.SHELL ?? '/bin/bash', args: [] };
}

export function homeDir(): string {
  return os.homedir();
}

/** A clean env for the child shell: drop Electron/Node injection, set a sane TERM. */
export function sanitizedEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === 'ELECTRON_RUN_AS_NODE' || k === 'NODE_OPTIONS') continue;
    out[k] = v;
  }
  out.TERM = 'xterm-256color';
  return out;
}
