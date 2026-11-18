// The work behind each Blocky skill (src/skills.js), all on free data: BaseCity's own APIs, Base RPC,
// GoPlus security checks, GeckoTerminal prices, the ERC-8004 registry and the x402 catalogs.
// Each returns { preview, result, evidence }; anything it can't answer throws, and the caller is never charged.
import { parseAbi, formatUnits, getAddress } from 'viem';
import { researchStock } from './_worker-stock.js';
import { SKILLS, profileOf, GUILDS } from '../src/skills.js';
import { IDENTITY } from '../src/work-protocol.js';

const SITE = process.env.SITE_URL || 'https://www.basecity.space';
const NOTE = 'Research only, not financial advice.';
const json = async (url, init) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`Data source returned ${r.status}`); return r.json(); };
const usd = (n) => (n == null || !Number.isFinite(+n) ? 'n/a' : `$${(+n).toLocaleString('en-US', { maximumFractionDigits: 4 })}`);
const yes = (v) => v === '1' || v === 1 || v === true;
const ERC20 = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)']);
const OUT = (head, lines, sources, preview) => ({ preview, result: [...head, '', ...lines, '', `Sources: ${sources.join('; ')}`, NOTE].join('\n'), evidence: { timestamp: new Date().toISOString(), chainId: 8453 } });

const STOCK = { 'nav-premium': 'stock-nav-premium', 'after-hours-volume': 'stock-after-hours-volume', 'weekend-gap': 'stock-weekend-gap' };

export async function runSkill(skill, input, { client, blocky } = {}) {
  if (STOCK[skill]) return researchStock({ brief: `Ticker: ${input.ticker}`, contract: { skill: STOCK[skill], inputs: { ticker: input.ticker } } }, { client });

  if (skill === 'stock-movers') {
    const d = await json(`${SITE}/api/stocks`);
    const t = d.week?.tickers || {};
    const top = Object.entries(t).filter(([, v]) => v.usd24 > 0).sort((a, b) => b[1].usd24 - a[1].usd24).slice(0, 10);
    if (!top.length) throw new Error('No on-chain stock volume read yet');
    return OUT(['Most traded tokenized stocks on Base, last 24h (on-chain transfers valued at NAV)'], top.map(([k, v], i) => `${i + 1}. ${k}: ${usd(v.usd24)} in ${v.n24} transfers · 7d ${usd(v.usd7)}`), [`${SITE}/api/stocks`], `Top on Base today: ${top.slice(0, 3).map(([k, v]) => `${k} ${usd(v.usd24)}`).join(', ')}.`);
  }

  if (skill === 'token-safety') {
    const a = input.token.toLowerCase();
    const r = (await json(`https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${a}`)).result?.[a];
    if (!r) throw new Error('GoPlus has no data for this token yet');
    const flags = [['Honeypot', yes(r.is_honeypot)], ['Cannot sell all', yes(r.cannot_sell_all)], ['Transfer pausable', yes(r.transfer_pausable)], ['Blacklist', yes(r.is_blacklisted)], ['Owner can mint', yes(r.is_mintable)], ['Hidden owner', yes(r.hidden_owner)], ['Owner can change balance', yes(r.owner_change_balance)], ['Proxy (upgradeable)', yes(r.is_proxy)], ['Not open source', r.is_open_source === '0']];
    const bad = flags.filter((f) => f[1]).map((f) => f[0]);
    return OUT([`${r.token_name || 'Token'} (${r.token_symbol || '?'}) on Base`, `Contract: ${input.token}`], [`Buy tax: ${r.buy_tax || 'n/a'} · Sell tax: ${r.sell_tax || 'n/a'}`, `Holders: ${r.holder_count || 'n/a'}`, ...flags.map(([k, v]) => `${v ? '⚠️' : '✓'} ${k}`)], [`https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${a}`, `https://basescan.org/token/${input.token}`], bad.length ? `⚠️ ${bad.length} flag${bad.length === 1 ? '' : 's'}: ${bad.join(', ')}. Sell tax ${r.sell_tax || 'n/a'}.` : `No red flags from GoPlus. Buy tax ${r.buy_tax || 'n/a'}, sell tax ${r.sell_tax || 'n/a'}.`);
  }

  if (skill === 'approval-risk') {
    const a = input.wallet.toLowerCase();
    const r = (await json(`https://api.gopluslabs.io/api/v2/token_approval_security/8453?addresses=${a}`)).result || [];
    const rows = r.flatMap((t) => (t.approved_list || []).map((ap) => ({ token: t.token_symbol || t.token_address, spender: ap.approved_contract, amount: ap.approved_amount, risky: yes(ap.address_info?.malicious_behavior?.length) || yes(ap.address_info?.doubt_list) })));
    const risky = rows.filter((x) => x.risky);
    return OUT([`Open token approvals of ${input.wallet} on Base`], rows.length ? rows.slice(0, 40).map((x) => `${x.risky ? '⚠️' : '·'} ${x.token} → ${x.spender} · ${x.amount}`) : ['No open approvals found.'], [`https://api.gopluslabs.io/api/v2/token_approval_security/8453?addresses=${a}`, `https://revoke.cash/address/${input.wallet}?chainId=8453`], `${rows.length} open approval${rows.length === 1 ? '' : 's'}; ${risky.length} to flagged spenders.${risky.length ? ' Revoke those first.' : ''}`);
  }

  if (skill === 'address-check') {
    const a = input.address.toLowerCase();
    const r = (await json(`https://api.gopluslabs.io/api/v1/address_security/${a}?chain_id=8453`)).result || {};
    const flags = Object.entries(r).filter(([k, v]) => v === '1' && !['contract_address', 'data_source'].includes(k)).map(([k]) => k.replace(/_/g, ' '));
    return OUT([`Address check: ${input.address} (Base)`], flags.length ? flags.map((f) => `⚠️ ${f}`) : ['✓ No flags from GoPlus'], [`https://api.gopluslabs.io/api/v1/address_security/${a}?chain_id=8453`, `https://basescan.org/address/${input.address}`], flags.length ? `⚠️ Flagged: ${flags.join(', ')}.` : 'No flags on this address from GoPlus.');
  }

  if (skill === 'token-info') {
    const address = getAddress(input.token);
    const [name, symbol, decimals, supply, code] = await Promise.all([...['name', 'symbol', 'decimals', 'totalSupply'].map((f) => client.readContract({ address, abi: ERC20, functionName: f }).catch(() => null)), client.getCode({ address })]);
    if (!code || code === '0x') throw new Error('No contract at that address on Base');
    const g = await json(`https://api.geckoterminal.com/api/v2/networks/base/tokens/${address}`).catch(() => null);
    const a = g?.data?.attributes || {};
    return OUT([`${name || '?'} (${symbol || '?'}) on Base`, `Contract: ${address}`], [`Decimals: ${decimals ?? 'n/a'}`, `Total supply: ${supply != null && decimals != null ? Number(formatUnits(supply, decimals)).toLocaleString('en-US') : 'n/a'}`, `Contract code: ${(code.length - 2) / 2} bytes${code.startsWith('0xef0100') ? ' (EIP-7702 delegation)' : ''}`, `DEX price: ${usd(a.price_usd)} · 24h volume ${usd(a.volume_usd?.h24)} · liquidity ${usd(a.total_reserve_in_usd)}`], [`https://basescan.org/token/${address}`, `https://www.geckoterminal.com/base/tokens/${address}`], `${symbol || 'Token'}: ${usd(a.price_usd)}, supply ${supply != null && decimals != null ? Number(formatUnits(supply, decimals)).toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'n/a'}, ${decimals ?? '?'} decimals.`);
  }

  if (skill === 'tx-explain') {
    const hash = input.tx;
    const [tx, r] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
    const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const syms = new Map();
    const moves = [];
    for (const l of r.logs.filter((x) => x.topics[0] === T && x.topics.length === 3).slice(0, 25)) {
      if (!syms.has(l.address)) syms.set(l.address, await Promise.all(['symbol', 'decimals'].map((f) => client.readContract({ address: l.address, abi: ERC20, functionName: f }).catch(() => null))));
      const [sym, dec] = syms.get(l.address);
      moves.push(`${sym || l.address.slice(0, 10)}: ${dec != null ? formatUnits(BigInt(l.data), dec) : BigInt(l.data)} from ${`0x${l.topics[1].slice(26)}`} to ${`0x${l.topics[2].slice(26)}`}`);
    }
    return OUT([`Transaction ${hash} on Base`, `Status: ${r.status} · block ${r.blockNumber}`], [`From ${tx.from} to ${tx.to || '(contract creation)'}`, `ETH sent: ${formatUnits(tx.value, 18)}`, `Gas used: ${r.gasUsed} at ${formatUnits(r.effectiveGasPrice, 9)} gwei`, ...(moves.length ? ['Token transfers:', ...moves] : ['No token transfers.'])], [`https://basescan.org/tx/${hash}`], `${r.status === 'success' ? '✓' : '✗'} ${moves.length} token transfer${moves.length === 1 ? '' : 's'}${tx.value ? `, ${formatUnits(tx.value, 18)} ETH` : ''}.`);
  }

  if (skill === 'agent-lookup') {
    const id = BigInt(input.agentId);
    const ABI = parseAbi(['function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)']);
    const [owner, uri] = await Promise.all([client.readContract({ address: IDENTITY, abi: ABI, functionName: 'ownerOf', args: [id] }), client.readContract({ address: IDENTITY, abi: ABI, functionName: 'tokenURI', args: [id] }).catch(() => '')]);
    let card = null;
    try { card = uri.startsWith('data:') ? JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString()) : /^https:\/\//.test(uri) ? await json(uri) : null; } catch { /* unreadable */ }
    const blocky = /basecity\.space\/api\/agent-card/.test(uri) ? new URL(uri).searchParams.get('blocky') : null;
    return OUT([`ERC-8004 agent #${input.agentId} on Base`, `Owner: ${owner}`], [`Registration: ${uri ? uri.slice(0, 160) : 'none'}`, `Name: ${card?.name || 'n/a'}`, `Services: ${(card?.services || []).map((s) => `${s.name} ${s.endpoint || ''}`).join(' · ') || 'none listed'}`, blocky ? `BaseCity Blocky #${blocky} · ${(card?.skills || []).filter((s) => s.mode === 'x402-instant').map((s) => `${s.id} $${s.priceUsd}`).join(', ')}` : 'Not a BaseCity Blocky', `Blue Agent profile: https://app.blueagent.dev/exchange/agent/${input.agentId}`], [`https://basescan.org/token/${IDENTITY}?a=${input.agentId}`], `Agent #${input.agentId}: ${card?.name || 'unnamed'}, owned by ${owner.slice(0, 6)}…${owner.slice(-4)}${blocky ? `, Blocky #${blocky}` : ''}.`);
  }

  if (skill === 'x402-find') {
    const q = input.query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const score = (t) => q.reduce((n, w) => n + (t.toLowerCase().includes(w) ? 1 : 0), 0);
    const ours = Object.entries(SKILLS).map(([id, s]) => ({ where: 'BaseCity', id, task: s.task, price: s.units / 1e6, call: `POST ${SITE}/api/x402?tool=${id}&blocky=any` }));
    const blue = await json('https://blueagent.dev/api/catalog').then((c) => (c.tools || []).map((t) => ({ where: 'Blue Agent', id: t.id, task: t.description || t.name || '', price: t.priceUsd ?? null, call: t.endpoint || '' }))).catch(() => []);
    const hits = [...ours, ...blue].map((x) => ({ ...x, s: score(`${x.id} ${x.task}`) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8);
    if (!hits.length) throw new Error('No x402 service matches that task');
    return OUT([`x402 services for "${input.query}"`], hits.map((h) => `${h.where} · ${h.id} · ${h.price != null ? `$${h.price}` : 'price on call'} · ${h.task.slice(0, 120)}${h.call ? `\n  ${h.call}` : ''}`), [`${SITE}/api/x402`, 'https://blueagent.dev/api/catalog'], `${hits.length} match${hits.length === 1 ? '' : 'es'}: ${hits.slice(0, 3).map((h) => `${h.id} ($${h.price ?? '?'})`).join(', ')}.`);
  }

  if (skill === 'blocky-card') {
    const n = input.blocky;
    const meta = await json(`${SITE}/api/nft/${n}`);
    const attrs = Object.fromEntries((meta.attributes || []).map((a) => [a.trait_type, a.value]));
    const p = profileOf(n, attrs, 0);
    const g = GUILDS[p.guild] || { label: 'All guilds', icon: '👑', color: '#0052ff' };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="315" viewBox="0 0 600 315"><rect width="600" height="315" rx="24" fill="#0b1020"/><rect x="0" y="0" width="600" height="8" fill="${g.color}"/><image href="${SITE}/api/nft/${n}.svg" x="24" y="40" width="230" height="230"/><text x="280" y="90" fill="#fff" font-family="Inter,sans-serif" font-size="36" font-weight="800">Blocky #${n}</text><text x="280" y="130" fill="#9aa3b2" font-family="Inter,sans-serif" font-size="20">${p.role} · ${p.rarity}${p.trait ? ` · ${p.trait}` : ''}</text><text x="280" y="175" fill="${g.color}" font-family="Inter,sans-serif" font-size="22" font-weight="700">${g.icon} ${g.label} guild</text><text x="280" y="215" fill="#fff" font-family="Inter,sans-serif" font-size="16">${p.skills.slice(0, 3).join(' · ')}</text><text x="280" y="270" fill="#9aa3b2" font-family="Inter,sans-serif" font-size="14">BaseCity · works for USDC on Base</text></svg>`;
    return { preview: `Share card for Blocky #${n} (${g.label} guild).`, result: svg, evidence: { timestamp: new Date().toISOString() }, contentType: 'image/svg+xml' };
  }
  throw new Error('Unknown skill');
}
