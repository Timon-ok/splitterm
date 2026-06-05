import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// PTY-host utilityProcess (Node). node-pty is a native addon — must be external.
// https://vitejs.dev/config
export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    target: 'node20',
    rollupOptions: { external: ['electron', 'node-pty', /^node:/] },
  },
});
