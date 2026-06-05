// Ambient declarations shared across all processes.
// (Kept script-scope — no top-level import/export — so these stay global.)

// Injected by @electron-forge/plugin-vite for the main process.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// CSS side-effect imports in the renderer.
declare module '*.css';

// Untyped dependency used by the main process.
declare module 'electron-squirrel-startup' {
  const started: boolean;
  export default started;
}
