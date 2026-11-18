// "Verify all my Blockies": link every claimed Blocky to an ERC-8004 agent with ONE signature (no gas),
// then, optionally, write the agent card into each agent's on-chain URI in one batched wallet request
// (EIP-5792 wallet_sendCalls; wallets without it get one transaction per agent).
import { encodeFunctionData, toHex } from 'viem';
import { linkTypedDataV4, MAX_LINKS, pairsFrom, onchainPairs } from './agent-link.js';
import { IDENTITY } from './work-protocol.js';
import { linkedAgentId } from './agent-id.js';
import { sendTx } from './wallet.js';
import { esc } from './site.js';

const SET_URI = [{ type: 'function', name: 'setAgentURI', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'string' }], outputs: [] }];
export const cardUrl = (blocky, agentId) => `https://www.basecity.space/api/agent-card?blocky=${blocky}&agent=${agentId}`;

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
    <div class="agent-acts"><button class="btn primary" data-al="sign" ${busy || !account ? 'disabled' : ''}>${busy ? 'Waiting for wallet…' : `Sign once for ${list.length} Block${list.length === 1 ? 'y' : 'ies'}`}</button><button class="btn" data-al="onchain" ${busy || !account ? 'disabled' : ''}>Also write on chain (gas)</button></div>` : ''}
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
