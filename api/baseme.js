// Vercel serverless function: one wallet, for "My Base" in Base Live.
//   GET /api/baseme?who=0x…|name.base.eth -> { address, name, eth, usdc, blocky, txs }
import { readWallet } from './_baselive.js';
import { addressOf, namesFor, cleanName } from './_names.js';
import { TOKEN } from './_store.js';

export default async function handler(req, res) {
  let who = String(req.query?.who ?? new URL(req.url, 'http://x').searchParams.get('who') ?? '').trim().toLowerCase();
  if (who && !who.startsWith('0x') && !who.includes('.')) who = `${who}.base.eth`;
  try {
    let address = /^0x[0-9a-f]{40}$/.test(who) ? who : null, name = null;
    if (!address) {
      name = cleanName(who);
      if (!name) return res.status(400).json({ error: 'Paste a 0x address or a name.base.eth' });
      address = await addressOf(name);
      if (!address) return res.status(404).json({ error: `${name} doesn't point to a wallet on Base` });
    } else {
      try { name = (await namesFor([address]))[address] || null; } catch { /* no name */ }
    }
    const w = await readWallet(address, TOKEN);
    res.setHeader('cache-control', 'public, s-maxage=60');
    res.status(200).json({ address: address.toLowerCase(), name, ...w });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
