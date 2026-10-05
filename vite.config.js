import { defineConfig, loadEnv } from 'vite';

// `npm run dev` also serves the API (api/*.js, the same code Vercel runs), reading variables from
// .env.local, so the live flow can be tested locally.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  // share cards need absolute image URLs: SITE_URL, or the Vercel production domain
  const env = process.env;
  const site = (env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
  return {
    build: {
      chunkSizeWarningLimit: 800,
      // every page; gallery.html stays a dev tool
      rollupOptions: { input: { main: 'index.html', builders: 'builders.html', collection: 'collection.html', claim: 'claim.html', about: 'about.html', deploy: 'deploy.html' } },
    },
    plugins: [
      {
        name: 'absolute-og-image',
        transformIndexHtml: (html) => (site ? html.replace(/content="\/og\.png"/g, `content="${site}/og.png"`) : html),
      },
      {
        name: 'local-api',
        configureServer(server) {
          const e = process.env;
          const src = e.FEES_USD_OVERRIDE ? `FEES_USD_OVERRIDE=${e.FEES_USD_OVERRIDE}`
            : e.FEES_URL ? `FEES_URL=${e.FEES_URL}`
            : e.FEE_WALLET ? `FEE_WALLET=${e.FEE_WALLET}`
            : 'none found in .env.local -> prelaunch ($0, 1 founder)';
          console.log(`\n  [local-api] fee source: ${src}`);
          // the API routes, as Vercel runs them: /api/colony, /api/claim, /api/nft/[id]
          const routes = [[/^\/api\/colony(?:[/?]|$)/, '/api/colony.js'], [/^\/api\/claim(?:[/?]|$)/, '/api/claim.js'], [/^\/api\/nft\/([^/?]+)/, '/api/nft/[id].js', 'id']];
          server.middlewares.use(async (req, res, next) => {
            const route = routes.find(([re]) => re.test(req.url));
            if (!route) return next();
            const [re, file, param] = route;
            req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
            if (param) req.query[param] = decodeURIComponent(req.url.match(re)[1]);
            if (req.method === 'POST') {
              const chunks = [];
              for await (const c of req) chunks.push(c);
              try { req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { req.body = {}; }
            }
            res.status = (code) => { res.statusCode = code; return res; };
            res.json = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
            res.send = (body) => res.end(body);
            try {
              const { default: handler } = await server.ssrLoadModule(file);
              await handler(req, res);
            } catch (e) {
              res.statusCode = 500;
              res.end(String(e.stack || e));
            }
          });
        },
      },
    ],
  };
});
