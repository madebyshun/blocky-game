// The Base Live panel (🟦 Base Live): the Dashboard view, Find my tx, My Base, and their share cards.
import { esc } from './names.js';
import { browserWallets, smartWallet, connect } from './wallet.js';
import { CONFIG } from './config.js';

const SITE = (CONFIG.siteUrl || 'https://basecity.space').replace(/\/$/, '');
const X = CONFIG.xHandle || 'blockyonbase';

export function createBaseLivePanel({ baseLive, goTo, dashboard }) {
  const el = document.createElement('div');
  el.className = 'bl-panel'; el.hidden = true;
  el.innerHTML = `
    <div class="bl-ph"><b>🟦 Base Live</b><i class="bl-live"><span></span>LIVE</i><button class="bl-x" title="Close">✕</button></div>
    <p class="bl-sub">Base, block by block, running through BaseCity: every block, USDC on the move, new Basenames, deposits from Ethereum.</p>
    <button class="btn bl-dash">📊 Dashboard view</button>
    <a class="btn bl-dash" href="/base.html" style="display:block;text-align:center;text-decoration:none;margin-top:6px">▦ Base in numbers (bento)</a>
    <label>Find my tx</label>
    <form class="bl-form" data-k="tx"><input placeholder="0x… transaction hash" spellcheck="false" autocomplete="off"><button class="btn">Find</button></form>
    <label>My Base</label>
    <form class="bl-form" data-k="me"><input placeholder="0x… or name.base.eth" spellcheck="false" autocomplete="off"><button class="btn">Show</button></form>
    <button class="btn bl-wallet">Connect wallet</button>
    <div class="bl-out" hidden></div>
    <p class="bl-sub bl-cta">Want your Base app's live numbers in the city? <a href="https://x.com/${X}" target="_blank" rel="noopener">DM @${X}</a></p>`;
  document.body.appendChild(el);
  const out = el.querySelector('.bl-out');
  const say = (html) => { out.hidden = false; out.innerHTML = html; };
  const busy = (form, on) => { const b = form.querySelector('button'); b.disabled = on; b.textContent = on ? '…' : form.dataset.k === 'tx' ? 'Find' : 'Show'; };

  let share = null; // { img, text }
  function shareRow(img, text) {
    share = { img, text };
    return `<img class="bl-shot" src="${img}" alt=""><div class="bl-btns"><a class="btn" download="basecity-base-live.png" href="${img}">Save image</a><a class="btn primary" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(text)}">Share on X</a></div>`;
  }

  el.querySelector('.bl-x').onclick = () => (el.hidden = true);
  el.querySelector('.bl-dash').onclick = () => { el.hidden = true; dashboard(); };
  el.querySelectorAll('.bl-form').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = form.querySelector('input').value.trim();
      if (!v) return;
      busy(form, true);
      try { if (form.dataset.k === 'tx') await showTx(v); else await showMe(v); } catch (err) { say(`<p class="bl-err">${esc(err.message || err)}</p>`); }
      busy(form, false);
    };
  });
  el.querySelector('.bl-wallet').onclick = async () => {
    try {
      const w = browserWallets()[0];
      const provider = w ? w.provider : await smartWallet(CONFIG.cityName || 'BaseCity', `${location.origin}/favicon.svg`);
      const address = await connect(provider);
      el.querySelector('[data-k="me"] input').value = address;
      await showMe(address);
    } catch (err) { say(`<p class="bl-err">${esc(err.message || 'No wallet connected')}</p>`); }
  };

  async function showTx(hash) {
    const j = await baseLive.findTx(hash);
    goTo();
    const status = j.ok === null ? 'pending' : j.ok ? 'confirmed ✓' : 'failed ✕';
    const fee = j.feeEth !== null ? `${j.feeEth < 0.0001 ? j.feeEth.toExponential(1) : j.feeEth.toFixed(5)} ETH fee` : '';
    say(`<p><b>Your tx is driving in</b> from the highway to the Base Tower.</p><p class="bl-mono">${esc(j.what)} · ${esc(j.fromName)} → ${esc(j.toName)}<br>Block #${j.block ?? '—'} · ${status}${fee ? ` · ${fee}` : ''}</p><p class="muted">Making your card…</p>`);
    await new Promise((r) => setTimeout(r, 4500)); // let the car get into the picture
    const img = await baseLive.shareImage({ kicker: 'MY TX IN BASECITY', title: `${j.what} drove through BaseCity`, lines: [`From ${j.fromName}`, `To ${j.toName}`, `Block #${j.block ?? '—'} · ${status}`, fee].filter(Boolean) });
    say(`<p class="bl-mono">${esc(j.what)} · ${esc(j.fromName)} → ${esc(j.toName)}<br>Block #${j.block ?? '—'} · ${status}${fee ? ` · ${fee}` : ''} · <a href="https://basescan.org/tx/${esc(j.hash)}" target="_blank" rel="noopener">Basescan ↗</a></p>${shareRow(img, `My Base tx just drove through BaseCity 🚗 ${j.what}, block #${j.block}\n\nBase, block by block, live in a voxel city by @${X}\n${SITE}`)}`);
  }
  async function showMe(who) {
    const w = await baseLive.myBase(who);
    goTo(true);
    const label = w.name || `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
    say(`<p><b>${esc(label)}</b> has a plot in Base Live now (MY BASE, south of the plaza).</p><p class="muted">Making your card…</p>`);
    await new Promise((r) => setTimeout(r, 1800));
    const fmt = (v) => (v >= 1000 ? Math.round(v).toLocaleString('en-US') : v >= 1 ? v.toFixed(2) : v.toFixed(4));
    const lines = [`${fmt(w.eth)} ETH`, `${fmt(w.usdc)} USDC`, `${fmt(w.blocky)} ${CONFIG.ticker || '$BLOCKY'}`, w.smart ? 'a smart wallet' : `${w.txs.toLocaleString('en-US')} transactions`, ...(w.blockies ? [`${w.blockies} Blockies in BaseCity`] : [])];
    const img = await baseLive.shareImage({ kicker: 'MY BASE IN BASECITY', title: `${label} on Base`, lines });
    say(`<p><b>${esc(label)}</b> · ${lines.map(esc).join(' · ')}</p>${shareRow(img, `${label} on Base, as a little plot in BaseCity 🟦${w.smart ? '' : ` ${w.txs.toLocaleString('en-US')} transactions and counting`}\n\nFind yours in Base Live by @${X}\n${SITE}`)}`);
  }

  return {
    toggle() { el.hidden = !el.hidden; },
    close() { el.hidden = true; },
    get share() { return share; },
  };
}
