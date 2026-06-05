import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Preload (sandboxed bridge). Only electron + node builtins are external.
// https://vitejs.dev/config
export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    target: 'node20',
    rollupOptions: { external: ['electron', /^node:/] },
  },
});
