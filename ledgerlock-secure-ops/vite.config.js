import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    // Only used if you opt in to the server-side Fabric proxy (npm run fabric-proxy).
    proxy: { '/api/fabric': 'http://localhost:8787' },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
