import { defineConfig, loadEnv } from 'vite';

// `npm run dev` also serves /api/colony from api/colony.js (same code Vercel runs),
// reading variables from .env.local, so the live fee flow can be tested locally.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    build: { chunkSizeWarningLimit: 800 },
    plugins: [
      {
        name: 'local-api',
        configureServer(server) {
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
