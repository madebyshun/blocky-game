// "Verify all my Blockies": link every claimed Blocky to an ERC-8004 agent with ONE signature (no gas),
// then, optionally, write the agent card into each agent's on-chain URI in one batched wallet request
// (EIP-5792 wallet_sendCalls; wallets without it get one transaction per agent).
import { encodeFunctionData, toHex } from 'viem';
import { linkTypedDataV4, MAX_LINKS, pairsFrom, onchainPairs } from './agent-link.js';
import { IDENTITY } from './work-protocol.js';
import { linkedAgentId } from './agent-id.js';
import { sendTx, waitTx } from './wallet.js';
import { setFleet } from './blockyagent.js';
import { esc } from './site.js';

const REGISTER = [{ type: 'function', name: 'register', stateMutability: 'nonpayable', inputs: [{ type: 'string' }], outputs: [{ type: 'uint256' }] }];
const SET_URI = [{ type: 'function', name: 'setAgentURI', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'string' }], outputs: [] }];
export const cardUrl = (blocky, agentId) => `https://www.basecity.space/api/agent-card?blocky=${blocky}&agent=${agentId}`;

const cardOf = (blocky) => `https://www.basecity.space/api/agent-card?blocky=${blocky}`;
// MetaMask caps an EIP-5792 batch at 10 calls: send in chunks of 10 (5 confirmations for 50 Blockies)
async function sendBatch(provider, account, calls, onChunk = () => {}) {
  const out = [];
  for (let i = 0; i < calls.length; i += 10) { onChunk(i / 10 + 1, Math.ceil(calls.length / 10)); out.push(...await sendBatch1(provider, account, calls.slice(i, i + 10))); }
  return out;
}
async function sendBatch1(provider, account, calls) {
  // EIP-5792: one wallet request, then wait for the bundle's receipts; else one transaction per call
  try {
    const r = await provider.request({ method: 'wallet_sendCalls', params: [{ version: '2.0.0', chainId: toHex(8453), from: account, atomicRequired: false, calls }] });
    const id = typeof r === 'string' ? r : r?.id;
    for (let i = 0; i < 90; i++) {
      const st = await provider.request({ method: 'wallet_getCallsStatus', params: [id] }).catch(() => null);
      const done = st && (st.status === 200 || st.status === 'CONFIRMED' || st.status === 'confirmed');
      if (done) return (st.receipts || []).map((x) => x.transactionHash).filter(Boolean);
      if (st && Number(st.status) >= 400) throw new Error('The wallet reported the batch failed');
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    throw new Error('The batch is still pending; press Create again later to finish linking');
  } catch (err) {
    if (err?.code === 4001 || !/sendCalls|not supported|unsupported|4200|method/i.test(String(err?.message || err?.code))) throw err;
    const hashes = [];
    for (const c of calls) { const h = await sendTx(provider, { from: account, to: c.to, data: c.data }); await waitTx(h, provider); hashes.push(h); }
    return hashes;
  }
}

export function mountAgentLink(el, context) {
  let linked = {}, msg = '', tone = '', busy = false, open = false;
  const blockies = () => context().blockies.slice(0, MAX_LINKS);
  async function load() {
    const { account } = context();
    if (!account) return;
    try { const j = await (await fetch(`/api/agent-link?owner=${account}`)).json(); linked = Object.fromEntries((j.links || []).map((l) => [l.blocky, String(l.agentId)])); } catch { /* fine */ }
    draw();
  }
  function draw() {
    const list = blockies(), { account } = context(), shared = linkedAgentId(account) || '';
    const done = list.filter((n) => linked[n]).length;
    el.innerHTML = `<div class="al-head"><b>🪪 Verify my Blockies as agents</b><span>${done}/${list.length} linked</span><button class="btn small" data-al="toggle">${open ? 'Close' : done < list.length ? 'Verify all' : 'Review'}</button></div>
    ${open ? `<p class="al-note">One signature links every Blocky below to an ERC-8004 agent you own: no gas, no transaction. Blue Agent shows the Blocky badge from it. A link ends by itself if either NFT leaves your wallet.</p>
    <label class="al-shared">Agent for all <input data-al-shared inputmode="numeric" placeholder="e.g. 1205445" value="${esc(shared)}"></label>
    <div class="al-rows">${list.map((n) => `<label class="al-row"><span>Blocky #${n}</span><input data-al-n="${n}" inputmode="numeric" placeholder="same as above" value="${esc(linked[n] && linked[n] !== shared ? linked[n] : '')}">${linked[n] ? `<em>✓ #${esc(linked[n])}</em>` : ''}</label>`).join('')}</div>
    <div class="al-setup"><b>One-time setup for ${list.length} Blockies</b><span>1 · give each Blocky its own ERC-8004 agent (one wallet confirmation, a few cents of gas each) · 2 · switch every Blocky's agent on (one signature)</span>
    <div class="agent-acts"><button class="btn primary" data-al="create" ${busy || !account ? 'disabled' : ''}>Create an agent for each Blocky </button><button class="btn" data-al="activate" ${busy || !account ? 'disabled' : ''}>Switch all agents on</button></div></div>
    <p class="al-note">Already have agents? Link them below instead, with one signature.</p>
    <div class="agent-acts"><button class="btn" data-al="sign" ${busy || !account ? 'disabled' : ''}>${busy ? 'Waiting for wallet…' : `Sign once for ${list.length} Block${list.length === 1 ? 'y' : 'ies'}`}</button><button class="btn" data-al="onchain" ${busy || !account ? 'disabled' : ''}>Also write on chain (gas)</button></div>` : ''}
    <p role="status" class="${tone}">${esc(msg)}</p>`;
  }
  function read() {
    const inputs = {};
    for (const i of el.querySelectorAll('[data-al-n]')) if (i.value.trim()) inputs[i.dataset.alN] = i.value;
    return pairsFrom(blockies(), inputs, el.querySelector('[data-al-shared]')?.value);
  }
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-al]')?.dataset.al;
    if (!a || busy) return;
    if (a === 'toggle') { open = !open; msg = ''; return draw(); }
    const { account, provider } = context();
    if (a === 'create' || a === 'activate') {
      busy = true; msg = ''; tone = ''; draw();
      try {
        if (a === 'create') {
          // Blockies without their own agent: an agent shared by several Blockies counts as none
          const counts = {}; for (const n of blockies()) if (linked[n]) counts[linked[n]] = (counts[linked[n]] || 0) + 1;
          const need = blockies().filter((n) => !linked[n] || counts[linked[n]] > 1);
          if (!need.length) throw new Error('Every Blocky already has its own agent.');
          const calls = need.map((n) => ({ to: IDENTITY, data: encodeFunctionData({ abi: REGISTER, functionName: 'register', args: [cardOf(n)] }), value: '0x0' }));
          msg = `Confirm ${calls.length} agent registration${calls.length === 1 ? '' : 's'} in your wallet…`; draw();
          const hashes = await sendBatch(provider, account, calls, (k, n) => { msg = n > 1 ? `Confirm batch ${k} of ${n} (${Math.min(10, calls.length - (k - 1) * 10)} registrations) in your wallet…` : msg; draw(); });
          const r = await fetch('/api/agent-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: account, minted: hashes }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'Linking failed');
          for (const l of j.linked) linked[l.blocky] = String(l.agentId);
          msg = `${j.linked.length} Block${j.linked.length === 1 ? 'y has' : 'ies have'} their own agent now.`; tone = 'good';
        } else {
          const j = await setFleet({ address: account, tokenIds: blockies(), sign: (m) => provider.request({ method: 'personal_sign', params: [toHex(m), account] }) });
          msg = `${j.activated.length} agent${j.activated.length === 1 ? '' : 's'} switched on with one signature.`; tone = 'good';
          document.dispatchEvent(new CustomEvent('basecity-agents-changed'));
        }
      } catch (err) { msg = err?.code === 4001 ? 'Cancelled in the wallet.' : String(err.shortMessage || err.message).slice(0, 240); tone = 'bad'; }
      busy = false; return draw();
    }
    const pairs = read();
    if (!pairs.length) { msg = 'Enter the agent ID to link.'; tone = 'bad'; return draw(); }
    busy = true; msg = ''; tone = ''; draw();
    try {
      if (a === 'sign') {
        const issuedAt = new Date().toISOString();
        const typed = linkTypedDataV4(account, pairs, issuedAt);
        const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify(typed)] });
        const r = await fetch('/api/agent-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: account, links: pairs, issuedAt, signature }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Link failed');
        for (const l of j.linked) linked[l.blocky] = String(l.agentId);
        msg = `Linked ${j.linked.length} Block${j.linked.length === 1 ? 'y' : 'ies'} with one signature.`; tone = 'good';
      } else {
        const one = onchainPairs(pairs);
        if (!one.length) throw new Error('On-chain URIs need one agent per Blocky; the signature above already covers shared agents.');
        const calls = one.map((p) => ({ to: IDENTITY, data: encodeFunctionData({ abi: SET_URI, functionName: 'setAgentURI', args: [BigInt(p.agentId), cardUrl(p.blocky, p.agentId)] }), value: '0x0' }));
        try {
          await provider.request({ method: 'wallet_sendCalls', params: [{ version: '2.0.0', chainId: toHex(8453), from: account, atomicRequired: false, calls }] });
          msg = `Sent ${calls.length} URI update${calls.length === 1 ? '' : 's'} in one wallet request.`;
        } catch (err) {
          if (err?.code === 4001) throw err;
          for (const c of calls) await sendTx(provider, { from: account, to: c.to, data: c.data }); // no EIP-5792: one by one
          msg = `Sent ${calls.length} transaction${calls.length === 1 ? '' : 's'}.`;
        }
        tone = 'good';
      }
    } catch (err) { msg = err?.code === 4001 ? 'Cancelled in the wallet.' : String(err.shortMessage || err.message).slice(0, 240); tone = 'bad'; }
    busy = false; draw();
  });
  return { refresh: () => { draw(); load(); } };
}
