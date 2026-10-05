import { defineConfig, loadEnv } from 'vite';

// `npm run dev` also serves /api/colony from api/colony.js (same code Vercel runs),
// reading variables from .env.local, so the live fee flow can be tested locally.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: { input: { main: 'index.html', builders: 'builders.html' } }, // gallery.html stays a dev tool
    },
    plugins: [
      {
        name: 'local-api',
        configureServer(server) {
          const e = process.env;
          const src = e.FEES_USD_OVERRIDE ? `FEES_USD_OVERRIDE=${e.FEES_USD_OVERRIDE}`
            : e.FEES_URL ? `FEES_URL=${e.FEES_URL}`
            : e.FEE_WALLET ? `FEE_WALLET=${e.FEE_WALLET}`
            : 'none found in .env.local -> prelaunch ($0, 1 founder)';
          console.log(`\n  [local-api] fee source: ${src}`);
          server.middlewares.use('/api/colony', async (req, res) => {
            const { default: handler } = await server.ssrLoadModule('/api/colony.js');
            res.status = (code) => { res.statusCode = code; return res; };
            res.json = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
            await handler(req, res);
          });
        },
      },
    ],
  };
});
