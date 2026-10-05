// The studio's dev server. `npm run dev` starts this and the API together
// (scripts/dev.mjs); the API is reached through the /api proxy, so the page
// only ever talks to its own origin.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.STUDIO_API_URL || 'http://127.0.0.1:4318';

// Hosts the dev server answers to. Everything else is refused, the same way
// the explainroo preview server refuses a foreign Host header.
const extraHosts = (process.env.STUDIO_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
const allowedHosts = process.env.STUDIO_ALLOW_ALL_HOSTS === '1'
  ? true
  : ['localhost', '127.0.0.1', '[::1]', 'e2b.app', '.e2b.app', 'e2b.dev', '.e2b.dev', '.arena.ai', ...extraHosts];

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 5173),
    strictPort: false,
    allowedHosts,
    // Behind an https proxy (a sandbox preview, a tunnel) the HMR socket needs
    // the public port and wss. Set STUDIO_HMR_PORT=443 there; local dev is
    // untouched.
    hmr: process.env.STUDIO_HMR_PORT
      ? { clientPort: Number(process.env.STUDIO_HMR_PORT), protocol: 'wss' }
      : undefined,
    proxy: {
      '/api': { target: api, changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', port: Number(process.env.PORT || 4173), allowedHosts },
  build: { outDir: '../frontend-dist', emptyOutDir: true },
});
