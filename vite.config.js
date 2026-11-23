import { defineConfig, loadEnv } from 'vite';
import { CONFIG, holdText } from './src/config.js';

// `npm run dev` also serves the API (api/*.js, the same code Vercel runs), reading variables from
// .env.local, so the live flow can be tested locally.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  // share cards need absolute image URLs: SITE_URL, siteUrl in src/config.js, or the Vercel production domain
  const env = process.env;
  const prodApi = env.PROD_API === '1' || env.PROD_API === 'true' ? 'https://basecity.space' : (env.PROD_API || '');
  const previewApi = env.PROD_API === '0' ? '' : (prodApi || 'https://basecity.space');
  const site = (env.SITE_URL || CONFIG.siteUrl || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
  const stripOrigin = (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.removeHeader('origin');
      proxyReq.removeHeader('referer');
    });
  };
  const sharedProxy = {
    '/cb-stocks': {
      target: 'https://api.coinbase.com',
      changeOrigin: true,
      secure: true,
      configure: stripOrigin,
      rewrite: () => '/v1/tokenized-stocks?page_size=500',
    },
    '/kyber': {
      target: 'https://aggregator-api.kyberswap.com',
      changeOrigin: true,
      secure: true,
      configure: stripOrigin,
      rewrite: (path) => path.replace(/^\/kyber/, '/base/api/v1'),
    },
    '/odos': {
      target: 'https://api.odos.xyz',
      changeOrigin: true,
      secure: true,
      configure: stripOrigin,
      rewrite: (path) => path.replace(/^\/odos/, '/sor'),
    },
    '/blue-jobs': {
      target: 'https://blueagent.dev',
      changeOrigin: true,
      secure: true,
      configure: stripOrigin,
      rewrite: () => '/api/jobs',
    },
  };
  const apiProxy = (target) => (target ? {
    '/api': {
      target,
      changeOrigin: true,
      secure: true,
      configure: stripOrigin,
      // Keep local ES module imports like ../api/_sig.js served by Vite instead of proxied to prod
      bypass: (req) => (req.url && (/\/api\/_/.test(req.url) || /\.js(\?|$)/.test(req.url)) ? req.url : undefined),
    },
  } : {});
  const cleanRouteMiddleware = (req, _res, next) => {
    const cleanRoutes = {
      '/claim': '/claim.html',
      '/agents': '/agents.html',
      '/docs': '/docs.html',
      '/flywheel': '/flywheel.html',
      '/metrics': '/metrics.html',
      '/vote': '/vote.html',
      '/collection': '/collection.html',
      '/blockies': '/collection.html',
      '/builders': '/builders.html',
      '/recap': '/recap.html',
      '/weekly': '/weekly.html',
      '/dash': '/dash.html',
      '/base': '/base.html',
      '/about': '/about.html',
      '/gallery': '/gallery.html',
      '/viewer': '/blocky.html',
      '/home': '/home.html',
      '/deploy': '/deploy.html',
      '/live': '/index.html',
    };
    const [path, qs = ''] = (req.url || '/').split('?');
    const norm = path.length > 1 ? path.replace(/\/+$/, '') : path;
    if (/^\/b(\/[^/]*)?$/.test(norm)) req.url = `/blocky.html${qs ? `?${qs}` : ''}`;
    else if (cleanRoutes[norm]) req.url = `${cleanRoutes[norm]}${qs ? `?${qs}` : ''}`;
    next();
  };
  return {
    server: { proxy: { ...sharedProxy, ...apiProxy(prodApi) } },
    preview: { proxy: { ...sharedProxy, ...apiProxy(previewApi) } },
    // OpenSea's SDK (claim page, loaded only to list) imports Node's events and buffer: browser builds of both
    resolve: { alias: { 'node:events': 'events', buffer: 'buffer/' } },
    build: {
      chunkSizeWarningLimit: 800,
      // every page (gallery.html: every building design, linked from the launch thread)
      rollupOptions: { input: { main: 'index.html', builders: 'builders.html', collection: 'collection.html', claim: 'claim.html', agents: 'agents.html', docs: 'docs.html', flywheel: 'flywheel.html', metrics: 'metrics.html', about: 'about.html', gallery: 'gallery.html', recap: 'recap.html', weekly: 'weekly.html', blocky: 'blocky.html', vote: 'vote.html', deploy: 'deploy.html', home: 'home.html', base: 'base.html', dash: 'dash.html' } },
    },
    plugins: [
      {
        // Clean URL rewrites matching vercel.json so /claim, /agents, /metrics, /builders, /collection, etc. work locally
        name: 'viewer-route',
        configureServer(server) { server.middlewares.use(cleanRouteMiddleware); },
        configurePreviewServer(server) { server.middlewares.use(cleanRouteMiddleware); },
      },
      {
        // In the pages (src/config.js): %PRICE% = USD of $BLOCKY per Blocky, %UNLOCK% = the total bought
        // that opens trading, %HELD% = how long a Blocky is held before it's a citizen after that ("a
        // day"), %SITE% = the site's URL, %X% = the X handle; share images need absolute URLs
        name: 'page-text',
        transformIndexHtml: (html) => {
          const out = html
            .replace(/%PRICE%/g, String(Number(env.USD_PER_BLOCKY) || CONFIG.usdPerBlocky))
            .replace(/%UNLOCK%/g, (Number(env.UNLOCK_USD) || CONFIG.unlockUsd).toLocaleString('en-US'))
            .replace(/%HELD%/g, holdText(Number(env.CITIZEN_DAYS) || CONFIG.citizenDays))
            .replace(/%SITE%/g, site)
            .replace(/%X%/g, CONFIG.xHandle);
          return site ? out.replace(/content="\/(og(?:-[a-z]+)?\.(?:png|jpg))"/g, `content="${site}/$1"`) : out;
        },
      },
      !prodApi && {
        name: 'local-api',
        configureServer(server) {
          const e = process.env;
          const src = e.COUNT_MODE === 'fees'
            ? `fees from ${e.FEES_USD_OVERRIDE ? `FEES_USD_OVERRIDE=${e.FEES_USD_OVERRIDE}` : e.FEES_URL ? `FEES_URL=${e.FEES_URL}` : e.FEE_WALLET ? `FEE_WALLET=${e.FEE_WALLET}` : 'nowhere (prelaunch: $0)'}`
            : `buys, $${Number(e.USD_PER_BLOCKY) || CONFIG.usdPerBlocky} per Blocky; ledger ${e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL ? 'in KV' : 'in memory (starts empty)'}; NFT claims ${(e.NFT_CONTRACT || CONFIG.nft.contract) && e.CLAIM_SIGNER_KEY ? 'open' : 'not open yet (no NFT_CONTRACT / CLAIM_SIGNER_KEY)'}`;
          console.log(`\n  [local-api] ${src}`);
          // the API routes, as Vercel runs them: /api/colony, /api/claim, /api/live, /api/nft/[id]
          const routes = [[/^\/api\/rpg-state(?:[/?]|$)/, '/api/rpg-state.js'], [/^\/api\/stock-intel(?:[/?]|$)/, '/api/stock-intel.js'], [/^\/api\/city-tasks(?:[/?]|$)/, '/api/city-tasks.js'], [/^\/api\/swap(?:[/?]|$)/, '/api/swap.js'], [/^\/api\/worker-event(?:[/?]|$)/, '/api/worker-event.js'], [/^\/api\/worker-revoke(?:[/?]|$)/, '/api/worker-revoke.js'], [/^\/api\/worker(?:[/?]|$)/, '/api/worker.js'], [/^\/api\/work(?:[/?]|$)/, '/api/work.js'], [/^\/api\/colony(?:[/?]|$)/, '/api/colony.js'], [/^\/api\/claim(?:[/?]|$)/, '/api/claim.js'], [/^\/api\/live(?:[/?]|$)/, '/api/live.js'], [/^\/api\/recap(?:[/?]|$)/, '/api/recap.js'], [/^\/api\/cinema(?:[/?]|$)/, '/api/cinema.js'], [/^\/api\/baselive(?:[/?]|$)/, '/api/baselive.js'], [/^\/api\/dash(?:[/?]|$)/, '/api/dash.js'], [/^\/api\/basestats(?:[/?]|$)/, '/api/basestats.js'], [/^\/api\/stocks(?:[/?]|$)/, '/api/stocks.js'], [/^\/api\/ipoday(?:[/?]|$)/, '/api/ipoday.js'], [/^\/api\/agent(?:[/?]|$)/, '/api/agent.js'], [/^\/api\/basetx(?:[/?]|$)/, '/api/basetx.js'], [/^\/api\/baseme(?:[/?]|$)/, '/api/baseme.js'], [/^\/api\/nft\/([^/?]+)/, '/api/nft/[id].js', 'id']];
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
