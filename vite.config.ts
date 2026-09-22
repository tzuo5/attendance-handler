import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: { outDir: resolve('dist'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
