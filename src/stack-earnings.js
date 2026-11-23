// Non-custodial in-app "Stack my earnings" drawer for Blocky Agent owners (/agents).
// Quotes and executes USDC -> Coinbase tokenized stock swaps directly inside BaseCity via KyberSwap Base.
import { formatUnits, parseUnits } from 'viem';
import { CONFIG } from './config.js';
import { esc } from './site.js';
import { restoreWallet, browserWallets, connect, rejected } from './wallet.js';
import { BASE_USDC, fetchBaseStocks, quoteBaseSwap, executeUsdcSwap } from './swap-base.js';

let cachedStocks = null;

async function fetchLiveStocks() {
  if (cachedStocks) return cachedStocks;
  const live = await fetchBaseStocks();
  if (live.length) {
    cachedStocks = live;
    return cachedStocks;
  }
  return (CONFIG.stocks?.blocky10 || ['NVDA', 'TSLA', 'META', 'MSFT', 'AMZN', 'MSTR', 'SNDK', 'SPCX'])
    .map((ticker) => ({ ticker, name: '', address: '', nav: null, decimals: 8 }));
}

export async function toggleStackPanel(slot) {
  if (!slot) return;
  if (slot.dataset.open === '1') {
    slot.dataset.open = '0';
    slot.innerHTML = '';
    return;
  }
  slot.dataset.open = '1';
  slot.innerHTML = '<p class="wk-note">Loading Base tokenized stocks...</p>';
  const list = await fetchLiveStocks();
  let picked = list.find((s) => s.ticker === 'NVDA') || list[0];
  let amount = '10';
  let statusText = '';
  let statusTone = '';
  let quoteText = '';

  async function refreshQuote() {
    if (!picked?.address) { quoteText = 'Live contract loading...'; updateQuote(); return; }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { quoteText = 'Enter a USDC amount.'; updateQuote(); return; }
    quoteText = `Quoting $${n} USDC -> ${picked.ticker} on Base...`;
    updateQuote();
    try {
      const q = await quoteBaseSwap({ tokenIn: BASE_USDC, tokenOut: picked.address, amountInUnits: parseUnits(String(n), 6) });
      const out = Number(formatUnits(BigInt(q.amountOut || '0'), picked.decimals || 18));
      quoteText = `Est. receive: ${out.toFixed(4)} ${picked.ticker}${q.gasUsd ? ` · est. gas $${q.gasUsd.toFixed(3)}` : ''}`;
    } catch {
      quoteText = `Route unavailable right now for ${picked.ticker}.`;
    }
    updateQuote();
  }

  function updateQuote() {
    const el = slot.querySelector('.wk-stack-quote');
    if (el) el.textContent = quoteText;
  }

  function updateStatus(msg, tone = '') {
    statusText = msg;
    statusTone = tone;
    const el = slot.querySelector('.wk-stack-msg');
    if (el) {
      el.hidden = !msg;
      el.className = `wk-stack-msg ${tone}`;
      el.innerHTML = msg;
    }
  }

  const render = () => {
    slot.innerHTML = `
      <div class="wk-stack" style="margin-top:10px;padding:12px;border:1px solid var(--line,#262a33);border-radius:6px;background:rgba(0,82,255,0.06)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
          <strong style="font-size:12px;letter-spacing:.04em;text-transform:uppercase">Stack earnings into Base stocks</strong>
          <button type="button" class="btn" data-stack-close="1" style="padding:4px 8px;font-size:11px">Close</button>
        </div>
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px;margin-bottom:8px">
          <label style="display:block;font-size:12px">Stock on Base
            <select class="wk-stack-sel" style="width:100%;margin-top:4px;padding:7px 9px;border-radius:4px;border:1px solid var(--line,#262a33);background:var(--bg,#0d0e11);color:inherit">
              ${list.map((s) => `<option value="${esc(s.ticker)}"${s.ticker === picked?.ticker ? ' selected' : ''}>${esc(s.ticker)}${s.nav != null ? ` ($${Number(s.nav).toFixed(2)})` : ''}</option>`).join('')}
            </select>
          </label>
          <label style="display:block;font-size:12px">Amount (USDC)
            <input class="wk-stack-amt" type="number" min="1" step="any" value="${esc(amount)}" style="width:100%;margin-top:4px;padding:7px 9px;border-radius:4px;border:1px solid var(--line,#262a33);background:var(--bg,#0d0e11);color:inherit" />
          </label>
        </div>
        <p class="wk-stack-quote wk-note" style="margin:0 0 8px">${esc(quoteText)}</p>
        <div class="agent-acts">
          <button type="button" class="btn primary" data-stack-exec="1">Swap $${esc(amount)} USDC to ${esc(picked?.ticker || 'Stock')}</button>
          <a class="btn" href="/?b10" target="_blank" rel="noopener">Open Blocky 10</a>
        </div>
        <p class="wk-stack-msg wk-note ${statusTone}" ${statusText ? '' : 'hidden'} style="margin-top:8px">${statusText}</p>
      </div>`;

    slot.querySelector('.wk-stack-sel')?.addEventListener('change', (ev) => {
      picked = list.find((s) => s.ticker === ev.target.value) || list[0];
      render();
      refreshQuote();
    });
    slot.querySelector('.wk-stack-amt')?.addEventListener('input', (ev) => {
      amount = ev.target.value;
      const btn = slot.querySelector('[data-stack-exec]');
      if (btn) btn.textContent = `Swap $${amount || '0'} USDC to ${picked?.ticker || 'Stock'}`;
      refreshQuote();
    });
    slot.querySelector('[data-stack-close]')?.addEventListener('click', () => {
      slot.dataset.open = '0';
      slot.innerHTML = '';
    });
    slot.querySelector('[data-stack-exec]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (!picked?.address) return updateStatus('Stock contract not available yet.', 'bad');
      btn.disabled = true;
      try {
        let session = await restoreWallet();
        if (!session) {
          const w = browserWallets()[0];
          if (!w) throw new Error('Connect a Base wallet first.');
          const address = await connect(w.provider, w);
          session = { provider: w.provider, address };
        }
        const res = await executeUsdcSwap({
          provider: session.provider,
          account: session.address,
          tokenOut: picked.address,
          usdcAmount: amount,
          onStatus: (m) => updateStatus(esc(m)),
        });
        fetch(`/api/stocks?go=stack&ticker=${encodeURIComponent(picked.ticker)}`).catch(() => {});
        updateStatus(
          res.batched
            ? `Swapped $${esc(amount)} USDC to ${esc(picked.ticker)} on Base.`
            : `Swapped $${esc(amount)} USDC to ${esc(picked.ticker)}. <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(res.txHash)}">Basescan</a>`,
          'ok',
        );
      } catch (err) {
        if (!rejected(err)) updateStatus(esc(err.shortMessage || err.message || 'Swap failed'), 'bad');
        else updateStatus('Swap cancelled.');
      } finally {
        btn.disabled = false;
      }
    });
  };
  render();
  refreshQuote();
}
