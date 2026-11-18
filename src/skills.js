// Blocky specializations. Each Blocky's work is read from its NFT, so anyone can check it:
//   Role   -> guild (which skills it can learn)
//   Rarity -> tier  (how many of its guild's skills it knows; Legendary knows them all)
//   Trait  -> a perk shown on its card
//   Paid work (calls sold, jobs paid) -> level, which caps how far its owner can raise its price
// Shared by the API (who may sell what, at what price) and the pages (cards, fleet table, x402 HQ).

export const GUILDS = {
  market: { label: 'Market', icon: '📈', color: '#16a34a', roles: ['research'] },
  security: { label: 'Security', icon: '🛡', color: '#dc2626', roles: ['contracts'] },
  builder: { label: 'Builder', icon: '🏗', color: '#2563eb', roles: ['frontend'] },
  agents: { label: 'Agents', icon: '🤖', color: '#7c3aed', roles: ['community'] },
  creative: { label: 'Creative', icon: '🎨', color: '#db2777', roles: ['designer'] },
};
const ROLE_LABELS = { 'Smart Contract Dev': 'contracts', 'Frontend Dev': 'frontend', Designer: 'designer', Community: 'community', Researcher: 'research', Founder: 'founder' };

// every skill a Blocky can sell over x402: base price in USDC units, its input and its guild
export const SKILLS = {
  'nav-premium': { guild: 'market', units: 20000, input: 'ticker', task: 'How far a tokenized stock on Base trades from its Chainlink NAV, pool and oracle read at one block' },
  'after-hours-volume': { guild: 'market', units: 10000, input: 'ticker', task: "A tokenized stock's on-chain volume on Base over 24h and 7d, and how much ran while NYSE was shut" },
  'weekend-gap': { guild: 'market', units: 10000, input: 'ticker', task: "How far a tokenized stock's Base DEX price moved over the weekend vs Friday's NYSE close (weekends only)" },
  'stock-movers': { guild: 'market', units: 10000, input: null, task: 'The most traded Coinbase tokenized stocks on Base in the last 24h, by on-chain volume' },
  'token-safety': { guild: 'security', units: 10000, input: 'token', task: 'Is this Base token safe to swap: honeypot, sell tax, owner powers, pause and blacklist flags' },
  'approval-risk': { guild: 'security', units: 10000, input: 'wallet', task: "A Base wallet's open token approvals and which spenders are flagged as risky" },
  'address-check': { guild: 'security', units: 10000, input: 'address', task: 'Is this Base address flagged: phishing, sanctions, scams, malicious contract' },
  'token-info': { guild: 'builder', units: 5000, input: 'token', task: "A Base token's name, symbol, decimals, total supply, contract code and DEX price" },
  'tx-explain': { guild: 'builder', units: 5000, input: 'tx', task: 'What a Base transaction did: status, gas, every token and ETH transfer in plain words' },
  'agent-lookup': { guild: 'agents', units: 5000, input: 'agentId', task: "An ERC-8004 agent on Base: owner, registration, card, services and whether it's a BaseCity Blocky" },
  'x402-find': { guild: 'agents', units: 5000, input: 'query', task: 'Find x402 services for a task across BaseCity and Blue Agent, with prices and how to call them' },
  'blocky-card': { guild: 'creative', units: 5000, input: 'blocky', task: "A share card (SVG) of any Blocky: its portrait, role, guild, level and what it earned" },
};
export const INPUTS = {
  ticker: { type: 'string', description: 'Ticker without the "c" suffix, e.g. NVDA', example: 'NVDA', test: (v) => /^[A-Z]{1,6}$/.test(v) },
  token: { type: 'string', description: 'Token contract address on Base', example: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', test: (v) => /^0x[0-9a-fA-F]{40}$/.test(v) },
  wallet: { type: 'string', description: 'Wallet address on Base', example: '0x92c0a50966CcDB5e25770CFFD64B4B249ADf42e9', test: (v) => /^0x[0-9a-fA-F]{40}$/.test(v) },
  address: { type: 'string', description: 'Any address on Base', example: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', test: (v) => /^0x[0-9a-fA-F]{40}$/.test(v) },
  tx: { type: 'string', description: 'Transaction hash on Base', example: '0xce24bf6e8a5e90cac13215221ab050cfd89fd75c6aeb96e7b1937c1befe6d733', test: (v) => /^0x[0-9a-fA-F]{64}$/.test(v) },
  agentId: { type: 'string', description: 'ERC-8004 agent id on Base', example: '1205445', test: (v) => /^\d{1,12}$/.test(v) },
  query: { type: 'string', description: 'What you need done, in a few words', example: 'stock price on Base', test: (v) => v.length >= 2 && v.length <= 120 },
  blocky: { type: 'string', description: 'A Blocky number', example: '718', test: (v) => /^\d{1,5}$/.test(v) },
};
export function inputSchema(skill) {
  const k = SKILLS[skill]?.input;
  if (!k) return { type: 'object', properties: {} };
  const { test, example, ...p } = INPUTS[k];
  return { type: 'object', properties: { [k]: p }, required: [k] };
}

export const TIERS = { Common: 1, Uncommon: 2, Rare: 3, Legendary: 99 };
export const PERKS = {
  Shades: 'Cool head: answers in one line first, details after',
  'Base Cap': 'Base native: links every source on Basescan',
  'Gold Hard Hat': 'Foreman: can lead a team of Blockies on bigger jobs',
  'Laser Eyes': 'Sharp eyes: more samples in every reading',
  Astronaut: 'Explorer: compares Base with other chains when it can',
  'Diamond Skin': 'Premium: its owner may price up to the top of its level',
  Crown: 'Royal: knows every skill of every guild',
};
// levels from paid work; each lets the owner raise the price a little more (×1, ×1.25, ×1.5, ×2)
export const LEVELS = [{ at: 0, cap: 1 }, { at: 5, cap: 1.25 }, { at: 20, cap: 1.5 }, { at: 100, cap: 2 }];
export const levelOf = (paid) => LEVELS.reduce((l, x, i) => (paid >= x.at ? i + 1 : l), 1);
export const capOf = (level, trait) => Math.min(2, LEVELS[level - 1].cap + (trait === 'Diamond Skin' ? 0.25 : 0));

const strh = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const mix = (n, s) => { let h = (Number(n) * 2654435761 + strh(s) * 40503) >>> 0; h ^= h >>> 15; return h; };
// A Blocky's profile from its NFT attributes ({Role, Rarity, Trait}) and its paid work.
export function profileOf(n, attrs = {}, paid = 0) {
  const role = ROLE_LABELS[attrs.Role] || 'research';
  const all = role === 'founder' || attrs.Trait === 'Crown';
  const guild = all ? 'all' : Object.keys(GUILDS).find((g) => GUILDS[g].roles.includes(role)) || 'market';
  const pool = Object.keys(SKILLS).filter((s) => all || SKILLS[s].guild === guild);
  const k = Math.min(pool.length, TIERS[attrs.Rarity] || 1);
  // the first skill of a guild is its core; the rest are picked by the Blocky's number, always the same
  const rest = pool.slice(1).sort((a, b) => mix(n, a) - mix(n, b) || a.localeCompare(b));
  const skills = all ? pool : [pool[0], ...rest].slice(0, k);
  const level = levelOf(paid);
  return { blocky: Number(n), role: attrs.Role || 'Researcher', rarity: attrs.Rarity || 'Common', trait: attrs.Trait && attrs.Trait !== 'None' ? attrs.Trait : null, guild, skills, level, paid, priceCap: capOf(level, attrs.Trait), perk: PERKS[attrs.Trait] || null };
}
// the price a Blocky charges for a skill: base × the owner's multiplier, never above its level cap
export const priceUnits = (skill, profile, mult = 1) => Math.round(SKILLS[skill].units * Math.max(1, Math.min(Number(mult) || 1, profile.priceCap)));
