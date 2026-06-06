import os from 'node:os';
import fs from 'node:fs';
import { execFile } from 'node:child_process';

export interface ResolvedShell {
  file: string;
  args: string[];
}

export interface ShellProfileFull extends ResolvedShell {
  id: string;
  label: string;
}

/** The default shell for a new terminal when no profile is specified. */
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

/**
 * Enumerate launchable shell profiles. Async + best-effort so it never blocks terminal startup
 * (WSL enumeration shells out). M3 will layer user-defined profiles on top of this.
 */
export async function detectProfiles(): Promise<ShellProfileFull[]> {
  const out: ShellProfileFull[] = [];

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const pwsh = `${programFiles}\\PowerShell\\7\\pwsh.exe`;
    if (fs.existsSync(pwsh)) out.push({ id: 'pwsh', label: 'PowerShell 7', file: pwsh, args: [] });

    const winPowerShell = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    if (fs.existsSync(winPowerShell)) {
      out.push({ id: 'windows-powershell', label: 'Windows PowerShell', file: winPowerShell, args: [] });
    }

    out.push({ id: 'cmd', label: 'Command Prompt', file: process.env.ComSpec ?? 'cmd.exe', args: [] });

    const gitBash = `${programFiles}\\Git\\bin\\bash.exe`;
    if (fs.existsSync(gitBash)) out.push({ id: 'git-bash', label: 'Git Bash', file: gitBash, args: [] });

    for (const distro of await wslDistros()) {
      out.push({ id: `wsl-${distro}`, label: `WSL: ${distro}`, file: 'wsl.exe', args: ['-d', distro] });
    }
  } else {
    const sh = process.env.SHELL ?? '/bin/bash';
    out.push({ id: 'default', label: sh.split('/').pop() ?? 'shell', file: sh, args: [] });
    try {
      const listed = fs
        .readFileSync('/etc/shells', 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      for (const s of listed) {
        if (s !== sh && fs.existsSync(s)) out.push({ id: `shell:${s}`, label: s.split('/').pop() ?? s, file: s, args: [] });
      }
    } catch {
      /* no /etc/shells */
    }
  }

  return out;
}

function wslDistros(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }
      const names = String(stdout)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      resolve(names);
    });
  });
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
