import { defineConfig, loadEnv } from 'vite';
import { CONFIG } from './src/config.js';

// `npm run dev` also serves the API (api/*.js, the same code Vercel runs), reading variables from
// .env.local, so the live flow can be tested locally.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  // share cards need absolute image URLs: SITE_URL, siteUrl in src/config.js, or the Vercel production domain
  const env = process.env;
  const site = (env.SITE_URL || CONFIG.siteUrl || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
  return {
    build: {
      chunkSizeWarningLimit: 800,
      // every page (gallery.html: every building design, linked from the launch thread)
      rollupOptions: { input: { main: 'index.html', builders: 'builders.html', collection: 'collection.html', claim: 'claim.html', about: 'about.html', gallery: 'gallery.html', recap: 'recap.html', deploy: 'deploy.html' } },
    },
    plugins: [
      {
        // In the pages (src/config.js): %PRICE% = USD of $BLOCKY per Blocky, %UNLOCK% = the total bought
        // that opens trading, %HELD% = how long a Blocky is held before it's a citizen after that ("a
        // day"), %SITE% = the site's URL, %X% = the X handle; share images need absolute URLs
        name: 'page-text',
        transformIndexHtml: (html) => {
          const out = html
            .replace(/%PRICE%/g, String(Number(env.USD_PER_BLOCKY) || CONFIG.usdPerBlocky))
            .replace(/%UNLOCK%/g, (Number(env.UNLOCK_USD) || CONFIG.unlockUsd).toLocaleString('en-US'))
            .replace(/%HELD%/g, ((d) => (d === 1 ? 'a day' : `${d} days`))(Number(env.CITIZEN_DAYS) || CONFIG.citizenDays))
            .replace(/%SITE%/g, site)
            .replace(/%X%/g, CONFIG.xHandle);
          return site ? out.replace(/content="\/(og(?:-[a-z]+)?\.png)"/g, `content="${site}/$1"`) : out;
        },
      },
      {
        name: 'local-api',
        configureServer(server) {
          const e = process.env;
          const src = e.COUNT_MODE === 'fees'
            ? `fees from ${e.FEES_USD_OVERRIDE ? `FEES_USD_OVERRIDE=${e.FEES_USD_OVERRIDE}` : e.FEES_URL ? `FEES_URL=${e.FEES_URL}` : e.FEE_WALLET ? `FEE_WALLET=${e.FEE_WALLET}` : 'nowhere (prelaunch: $0)'}`
            : `buys, $${Number(e.USD_PER_BLOCKY) || CONFIG.usdPerBlocky} per Blocky; ledger ${e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL ? 'in KV' : 'in memory (starts empty)'}; NFT claims ${(e.NFT_CONTRACT || CONFIG.nft.contract) && e.CLAIM_SIGNER_KEY ? 'open' : 'not open yet (no NFT_CONTRACT / CLAIM_SIGNER_KEY)'}`;
          console.log(`\n  [local-api] ${src}`);
          // the API routes, as Vercel runs them: /api/colony, /api/claim, /api/live, /api/nft/[id]
          const routes = [[/^\/api\/colony(?:[/?]|$)/, '/api/colony.js'], [/^\/api\/claim(?:[/?]|$)/, '/api/claim.js'], [/^\/api\/live(?:[/?]|$)/, '/api/live.js'], [/^\/api\/nft\/([^/?]+)/, '/api/nft/[id].js', 'id']];
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
