import { defineConfig, loadEnv } from 'vite';
import { handleJev } from './server/jevHandler.mjs';

/** Serves /api/jev from the same handler as the Vercel function, for `npm run dev` and `npm run preview`. */
function jevApi(env) {
  const mount = (server) => { server.middlewares.use('/api/jev', async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = null; }
    const { status, json } = await handleJev({ method: req.method, body, ip: req.socket.remoteAddress, env });
    res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(json));
  }); };
  return { name: 'ledgerlock-jev-api', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [jevApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env })],
  server: {
    port: 5173,
    // Only used if you opt in to the server-side Fabric proxy (npm run fabric-proxy).
    proxy: { '/api/fabric': 'http://localhost:8787' },
  },
  build: { chunkSizeWarningLimit: 1500 },
}));
