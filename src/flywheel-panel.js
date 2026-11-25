// BaseCity Flywheel ($BASECITY / WETH) metrics panel loader for /metrics.html.
import { createPublicClient, fallback, http, formatUnits, keccak256, toBytes } from 'viem';
import { base } from 'viem/chains';
import { CONFIG } from './config.js';
import { esc, basescan } from './site.js';

const $ = (id) => document.getElementById(id);
const usd = (v) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const compact = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(2);
  return n > 0 ? n.toPrecision(3) : '0';
};

const EPOCH_DIST_TOPIC = keccak256(toBytes('EpochDistributed(uint256,address,uint256,uint256,uint256)'));
const BUYBACK_BURN_TOPIC = keccak256(toBytes('BuybackBurned(uint256,address,uint256)'));

const TOKEN_LABELS = {
  [(CONFIG.tokenAddress || '').toLowerCase()]: '$BLOCKY',
  [(CONFIG.flywheel?.basecityToken || '').toLowerCase()]: '$BASECITY',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
};
const TOKEN_DECIMALS = { '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6 };

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base-rpc.publicnode.com'),
    http('https://mainnet.base.org'),
  ]),
});

function renderFlywheelDiagram({ bcToken, fwContract, split }) {
  const host = $('mx-fw-diagram');
  if (!host) return;
  const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'Not set');
  host.innerHTML = `
    <div class="fw-arch">
      <div class="fw-arch-head">
        <span class="fw-kicker">ONCHAIN VALUE LOOP · BASE MAINNET (CHAIN ID 8453)</span>
        <div class="fw-split-bar" aria-label="Fee split ${split.holders}% holders, ${split.buyback}% buyback, ${split.treasury}% treasury">
          <i class="g" style="width:${split.holders}%"></i>
          <i class="y" style="width:${split.buyback}%"></i>
          <i class="b" style="width:${split.treasury}%"></i>
        </div>
      </div>

      <div class="fw-flow">
        <div class="fw-col">
          <div class="fw-col-lbl">01 · REVENUE INFLOWS</div>
          <div class="fw-node primary">
            <small>PRIMARY · 80% UNISWAP V4 FEE</small>
            <b>$BASECITY / WETH LP</b>
            <span>Token ${esc(shortAddr(bcToken))}</span>
          </div>
          <div class="fw-node">
            <small>SECONDARY ROYALTIES</small>
            <b>BaseCity Blockies NFT</b>
            <span>5% ERC-2981 on secondary trades</span>
          </div>
          <div class="fw-node">
            <small>LAUNCHPAD</small>
            <b>Launchpad Tower Pairs</b>
            <span>$BLOCKY-paired token launches</span>
          </div>
          <div class="fw-node">
            <small>PHASE 2</small>
            <b>City &amp; Agent Revenue</b>
            <span>Onchain billboards &amp; Base Avenue HQs</span>
          </div>
        </div>

        <div class="fw-hub-col">
          <div class="fw-hub">
            <div class="fw-hub-bar">BASECITY FLYWHEEL</div>
            <div class="fw-hub-body">
              <b>Verified Onchain Vault</b>
              ${fwContract
                ? `<a class="fw-addr" href="${basescan(`address/${fwContract}`)}" target="_blank" rel="noopener">${esc(shortAddr(fwContract))}</a>`
                : '<span class="fw-addr">Pre-deploy</span>'}
              <div class="fw-hub-div"></div>
              <p>7-Day Epoch Distribution</p>
              <code>batchDisperse + burnBuyback</code>
              <div class="fw-hub-pills">
                <span class="g">${split.holders}% Holders</span>
                <span class="y">${split.buyback}% Burn</span>
                <span class="b">${split.treasury}% Treasury</span>
              </div>
            </div>
          </div>
        </div>

        <div class="fw-col">
          <div class="fw-col-lbl">02 · AUTOMATED DISTRIBUTION</div>
          <div class="fw-out green">
            <div class="fw-out-top"><b>${split.holders}% AUTO-PUSH HOLDERS</b><span>BCB NFT</span></div>
            <p>Sent directly to BCB NFT wallets</p>
            <small>Scales by NFT count · Team wallets excluded</small>
          </div>
          <div class="fw-out gold">
            <div class="fw-out-top"><b>${split.buyback}% BUYBACK &amp; BURN</b><span>DEFLATION</span></div>
            <p>Market buy $BASECITY + $BLOCKY</p>
            <small>Burned permanently to 0x000…dEaD</small>
          </div>
          <div class="fw-out blue">
            <div class="fw-out-top"><b>${split.treasury}% CITY TREASURY</b><span>GROWTH</span></div>
            <p>Infra, Agents &amp; Phase 2 Growth</p>
            <small>RPC, x402 ops &amp; ecosystem incentives</small>
          </div>
        </div>
      </div>

      <div class="fw-loop-bar">VALUE LOOP: HIGHER NFT YIELD + LOWER SUPPLY &rarr; MORE $BLOCKY &amp; $BASECITY VOLUME</div>
    </div>`;
}

export async function loadFlywheel() {
  const fw = CONFIG.flywheel || {};
  const bcToken = fw.basecityToken;
  const fwContract = fw.contract || '';
  const split = fw.split || { holders: 45, buyback: 35, treasury: 20 };

  renderFlywheelDiagram({ bcToken, fwContract, split });

  const linksEl = $('mx-fw-links');
  if (linksEl) {
    linksEl.className = 'fw-links-bar';
    linksEl.innerHTML = [
      `<a class="fw-link-pill" href="${basescan(`token/${bcToken}`)}" target="_blank" rel="noopener">$BASECITY on Basescan</a>`,
      `<a class="fw-link-pill" href="/?b10=blocky">Trade $BLOCKY in BaseCity</a>`,
      fwContract ? `<a class="fw-link-pill" href="${basescan(`address/${fwContract}`)}" target="_blank" rel="noopener">Flywheel Contract</a>` : '<span class="fw-link-pill">Flywheel contract: ready to deploy</span>',
    ].join('');
  }

  let pair = null;
  try {
    const dex = await fetch(`https://api.dexscreener.com/tokens/v1/base/${bcToken}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    if (Array.isArray(dex) && dex.length) {
      pair = dex.find((p) => p.pairAddress?.toLowerCase() === fw.poolId) || null;
    }
  } catch { /* skip */ }

  let apiData = null;
  try {
    apiData = await fetch('/api/flywheel').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  } catch { /* skip */ }

  const events = Array.isArray(apiData?.events) ? [...apiData.events] : [];
  if (!apiData && fwContract) {
    try {
      const latest = await client.getBlockNumber();
      const fromBlock = latest > 9500n ? latest - 9500n : 0n;
      const logs = await client.getLogs({ address: fwContract, fromBlock, toBlock: latest }).catch(() => []);
      for (const l of [...logs].reverse()) {
        const t0 = (l.topics?.[0] || '').toLowerCase();
        const epoch = l.topics?.[1] ? Number(BigInt(l.topics[1])) : 0;
        const tok = l.topics?.[2] ? `0x${l.topics[2].slice(-40)}`.toLowerCase() : '';
        const dec = TOKEN_DECIMALS[tok] ?? 18;
        const sym = TOKEN_LABELS[tok] || `${tok.slice(0, 6)}…${tok.slice(-4)}`;
        const hex = (l.data || '0x').slice(2);
        if (t0 === EPOCH_DIST_TOPIC.toLowerCase() && hex.length >= 192) {
          const paidCount = Number(BigInt(`0x${hex.slice(0, 64)}`));
          const totalPaid = Number(formatUnits(BigInt(`0x${hex.slice(64, 128)}`), dec));
          events.push({ epoch, kind: 'Auto-Push Payout', sym, amount: totalPaid, detail: `${paidCount} holder${paidCount === 1 ? '' : 's'}`, tx: l.transactionHash });
        } else if (t0 === BUYBACK_BURN_TOPIC.toLowerCase() && hex.length >= 64) {
          const burned = Number(formatUnits(BigInt(`0x${hex.slice(0, 64)}`), dec));
          events.push({ epoch, kind: 'Buyback & Burn', sym, amount: burned, detail: 'Sent to 0x…dEaD', tx: l.transactionHash });
        }
      }
    } catch { /* skip */ }
  }

  const payouts = events.filter((e) => e.kind === 'Auto-Push Payout');
  const burns = events.filter((e) => e.kind === 'Buyback & Burn');
  const latestEpoch = apiData?.summary?.latestEpoch ?? events.reduce((m, e) => Math.max(m, e.epoch || 0), 0);
  const latestBlock = apiData?.latestBlock || 0;
  const vaultItems = (apiData?.vault || []).filter((v) => Number(v.free || 0) > 0);
  const vaultSummary = vaultItems.length
    ? vaultItems.map((v) => `${compact(v.free)} ${v.symbol}`).join(' · ')
    : '0 ready in vault';

  const fmtDate = (ts) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    } catch { return ''; }
  };

  const sumEl = $('mx-fw-sum');
  if (sumEl) {
    sumEl.className = 'fw-kpis';
    const epochSub = `${payouts.length} payouts · ${burns.length} burns${latestBlock ? ` · #${latestBlock.toLocaleString('en-US')}` : ''}`;
    sumEl.innerHTML = [
      ['Fee Split', `${split.holders} / ${split.buyback} / ${split.treasury}%`, 'Holders · Buyback · Treasury', 'blue'],
      ['Market Cap', pair?.fdv ? usd(pair.fdv) : 'Live on Base', '$BASECITY / WETH', 'gold'],
      ['24h Volume', pair?.volume?.h24 != null ? usd(pair.volume.h24) : '—', vaultItems.length ? `Vault: ${vaultSummary}` : '$BASECITY on Base', 'green'],
      ['Epoch Status', latestEpoch ? `Epoch ${latestEpoch}` : (fwContract ? 'Epoch 0' : 'Pre-deploy'), epochSub, 'slate'],
    ].map(([k, v, sub, tone]) => `<div class="fw-kpi ${tone}"><small>${esc(k)}</small><b>${esc(v)}</b><span>${esc(sub)}</span></div>`).join('');
  }

  const rowsEl = $('mx-fw-rows');
  if (rowsEl) {
    rowsEl.innerHTML = events.length
      ? events.slice(0, 20).map((e) => {
        const dt = fmtDate(e.timestamp);
        const epochLbl = e.epoch ? `#${e.epoch}` : 'Claim';
        return `<tr><td>${esc(epochLbl)}${dt ? ` · ${esc(dt)}` : ''}</td><td>${esc(e.kind)}</td><td>${esc(e.sym)}</td><td>${compact(e.amount)}</td><td>${esc(e.detail)}${e.tx ? ` · <a href="${basescan(`tx/${e.tx}`)}" target="_blank" rel="noopener">tx</a>` : ''}</td></tr>`;
      }).join('')
      : `<tr><td colspan="5">${fwContract
        ? `Synced to Base${latestBlock ? ` block #${latestBlock.toLocaleString('en-US')}` : ''} · Vault ready: ${esc(vaultSummary)} · No Epoch distributions recorded on chain yet.`
        : 'Deploy BaseCityFlywheel on /deploy.html and set flywheel.contract in src/config.js to track live Auto-Push payouts & burns here.'}</td></tr>`;
  }
}
