// Edit this file to rebrand the game. Everything else reads from here.
export const CONFIG = {
  name: 'BLOCKY',
  ticker: '$BLOCKY',
  cityName: 'BaseCity', // shown as the game title; e.g. 'BaseLand'
  tagline: 'A city built 24/7 by Blockies, the builders of Base',
  citizen: 'Blocky', // one inhabitant (a builder on Base)
  citizenPlural: 'Blockies',
  // Every `usdPerBlocky` of $BLOCKY a wallet buys (added up over all its buys) earns one Blocky: #1, #2,
  // ... Each one is an NFT the wallet claims. A buy counts at the price of its day, so changing the
  // price later only changes future buys. (USD_PER_BLOCKY on the API overrides it.)
  usdPerBlocky: 10,
  supply: 10000, // must match MAX_SUPPLY on the API
  whaleUsd: 1000, // a single buy this big also builds a Whale Fountain signed with the wallet (WHALE_USD on the API)
  blockySkill: 1, // work speed of a Blocky
  builderSkill: 1.5, // work speed of a Base Builder (the legends below)
  founderSkill: 2,

  // The NFT (contracts/BaseCityBlockies.sol): the wallet that brought a Blocky claims it and pays the
  // gas. Transfers open once `supply` Blockies are claimed. contract: the deployed address (the API's
  // NFT_CONTRACT wins); royalties go to the treasury.
  nft: {
    name: 'BaseCity Blockies',
    symbol: 'BCB',
    chainId: 8453,
    contract: '',
    royaltyBps: 500,
    treasury: '0x8eBA37eF94E6b831Fe8bf6a62e79D0DC6FD8C34D', // the dev wallet: royalties, and it deploys and owns the contract
    // The team's reserve: Blockies #1 to #count belong to this wallet from day one (giveaways,
    // partners), claimable like any other, and they never leave the city. Shown on the About page.
    // count 0 for none. (TEAM_RESERVE_WALLET / TEAM_RESERVE_COUNT on the API override it.)
    reserve: { wallet: '0xb7b3bdf2e53b9c877efabc99a74badfc03299823', count: 100 },
  },

  // Every Blocky rolls a rarity from its number, so anyone can verify it.
  // Rare looks walk around the city, show on the Blocky card and in its PFP.
  rarity: [
    { id: 'common', label: 'Common', chance: 0.70, traits: [] },
    { id: 'uncommon', label: 'Uncommon', chance: 0.22, traits: ['shades', 'basecap'] },
    { id: 'rare', label: 'Rare', chance: 0.07, traits: ['goldhat', 'lasereyes', 'astronaut'] },
    { id: 'legendary', label: 'Legendary', chance: 0.01, traits: ['diamond', 'crown'] },
  ],

  // When the city starts from empty land. Normally the API decides this (LAUNCH_TIME_MS, or the
  // first time the live API ran, stored in KV). Leave null to start "now" when no API value exists.
  cityStart: null,
  // A 1x Blocky alone places this many blocks per hour. A crew shares one site, so speed grows with
  // the square root of the crew's total skill: 4x the skill = 2x faster. Big buildings take hours.
  blocksPerHour: 14,
  dayLengthMin: 20, // one day/night cycle in real minutes (same for every visitor)

  // Square land of (2*startLand+1)^2 lots. When every lot is built, the crew expands the land by one
  // ring, but only once enough Blockies have arrived (Base Builders don't count).
  startLand: 2,
  expandNeeds: [0, 0, 0, 10, 30, 75, 150, 300, 600, 1000, 1600, 2500, 4000, 6000, 8000, 10000], // Blockies needed for land level L
  expandCost: 120, // blocks per land level for an expansion
  // How long things take: each project's blocks are multiplied by its tier, so a cottage goes up in
  // under an hour while a skyscraper takes a day or more. Buildings by their catalog cost (upTo: the
  // highest cost in the tier, null = the rest); then landmarks, whale fountains, land and the metro.
  buildTime: {
    tiers: [{ upTo: 40, x: 3 }, { upTo: 100, x: 4 }, { upTo: 250, x: 5 }, { upTo: null, x: 6 }],
    landmark: 4, wonder: 2, expand: 3, metro: 3,
  },

  // When Blockies leave (their wallets sold): the construction site loses the blocks they placed on it,
  // and a big exit (ruinAt+ Blockies at the same moment) leaves the newest home, shop or office abandoned
  // (one per ruinAt, at most maxRuins) until the crew rebuilds it, first thing.
  departures: { ruinAt: 20, maxRuins: 3 },

  // Basenames on Base (api/_names.js): where primary names live. ENS's L2 reverse registrar is the
  // source of truth since 2025; the older Basenames resolver still holds names set before that.
  basenames: {
    reverseRegistrar: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    legacyResolver: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
    registry: '0xb94704422c2a1e396835a571837aa5ae53285a95',
  },

  // Live state (see api/colony.js). If it fails, the game falls back to demo mode.
  apiUrl: '/api/colony',
  pollMs: 15000,

  // Token on Base
  tokenAddress: '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',
  poolId: '0x61ccc84e302c1a95fb66435a285e95581134bfc2a11d4fbb88ed07e68ca2e4c0', // BLOCKY/NVDAc: trades and the market (POOL_ID on the API)

  // Links for the CTA buttons. Leave empty to hide.
  buyUrl: 'https://app.uniswap.org/swap?chain=base&outputCurrency=0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',
  chartUrl: 'https://dexscreener.com/base/0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',
  xHandle: '', // e.g. blockyfun (without @)

  // Billboards around the city (Town Square + rooftops) rotate through this list plus one "YOUR PROJECT
  // HERE" slot that sells the space. Clicking a billboard opens its url.
  //   { name, tagline, color, textColor?, logo?, url, sponsored? }
  // logo: a logo drawn in code (LOGOS in src/city.js). sponsored: true for paid placements; the news
  // ticker then says SPONSORED instead of BUILT ON BASE.
  sponsors: [
    { name: 'Coinbase Wallet', tagline: 'Self-custody, built for Base', color: '#121a2b', logo: 'cbwallet', url: 'https://www.coinbase.com/wallet' },
    { name: 'o1.exchange', tagline: 'Trade onchain', color: '#1b1b1b', logo: 'o1', url: 'https://o1.exchange' },
    { name: 'Virtuals', tagline: 'AI agents on Base', color: '#d6f5e6', textColor: '#1f6f6c', logo: 'virtuals', url: 'https://app.virtuals.io' },
    { name: 'bankrbot', tagline: 'Your AI banker on Base', color: '#7b2ff2', logo: 'bankr', url: 'https://bankr.bot' },
    { name: 'Aero', tagline: 'Liquidity hub of Base', color: '#efefef', textColor: '#1f2a44', logo: 'aero', url: 'https://aerodrome.finance' },
  ],
  adContact: '', // shown on empty billboards, e.g. 'DM @blockyfun'; defaults to xHandle
  siteUrl: '', // canonical URL used in share text

  // You: the city's first builder.
  founder: { look: 'founder', name: 'Founder', title: 'Founder' },

  // Base Builders: real Base builders you add by hand. They build the city alongside the Blockies
  // from the day they join. Add as many as you like:
  //   { name, title, look?, joined?, x?, bg? }
  // - look: a hand-made outfit from LEGEND_LOOKS in src/citizens.js. Without one they wear the Base
  //   Builder uniform with a gold star.
  // - joined: 'YYYY-MM-DD' when they start building (default: from the city's first day).
  // - x: their X handle (an 𝕏 link on the Base Builders page); bg: their PFP background colour.
  legends: [
    { name: 'Jesse', title: 'Builder 001', look: 'punk' },
    { name: 'Nibel', title: 'Base Builder', look: 'halo' },
    { name: 'Xen', title: 'Base Builder', look: 'spartan' },
    { name: 'Poet', title: 'Base Builder', look: 'robo' },
    { name: 'Brian', title: 'CEO', look: 'hoodie' },
    { name: 'Saumya Saxena', title: 'Base Builder', look: 'pixelspike' },
    { name: 'Jerry Pan', title: 'Base Builder', look: 'goat' },
    { name: 'Ahaan Raizada', title: 'Base Builder', look: 'pixelhat' },
    { name: 'Jeremy Grinberg', title: 'Base Builder', look: 'crewneck' },
    { name: 'Jon Roethke', title: 'Base Builder', look: 'blazer' },
    { name: 'Kien Nguyen', title: 'Base Builder', look: 'kimono' },
    { name: 'Toady Hawk', title: 'Base Builder', look: 'frog' },
    { name: 'mleejr', title: 'Base Builder', look: 'doodle' },
    { name: 'deployer', title: 'Base Builder', look: 'floatie' },
    { name: 'David Tso', title: 'Base Builder', look: 'pixelpunk' },
    { name: 'mrtdlgc', title: 'Base Builder', look: 'dreamer' },
    { name: 'Quigley', title: 'Base Builder', look: 'hoodbot' },
    { name: 'DonJohnson', title: 'Base Builder', look: 'apeslime' },
    { name: 'everythingempty', title: 'Base Builder', look: 'dragonrider' },
    { name: 'Cobie', title: 'Base Builder', look: 'trapper' },
    { name: 'statuette', title: 'Base Builder', look: 'starbuns' },
    { name: 'Oxxbid', title: 'Base Builder', look: 'bobshades' },
    { name: 'Joey', title: 'Base Builder', look: 'mintcap' },
  ],

  // Landmarks: once `at` Blockies have arrived, the crew builds it next on its reserved lot [x, z]:
  // at most one landmark (or Base project HQ) every `landmarkEvery` projects, so homes keep going up
  // between them even when many unlock at once (the team reserve unlocks the first ones at launch).
  landmarkEvery: 3,
  landmarks: [
    { at: 0, id: 'garage', label: "Founder's Garage", lot: [0, 1] },
    { at: 0, id: 'square', label: 'Town Square', lot: [0, 0] },
    { at: 1, id: 'liberty', label: 'Statue of Blockerty', lot: [2, 1] }, // the city icon, on a riverside point
    { at: 5, id: 'cafe', label: 'gm Café', lot: [-1, 0] },
    { at: 15, id: 'hq', label: 'Builder HQ', lot: [0, -1] },
    { at: 25, id: 'exchange', label: 'Base Stock Exchange', lot: [1, -1] }, // live $BLOCKY + stock ticker, bull or bear out front
    { at: 40, id: 'agenthub', label: 'AI Agent Hub', lot: [-1, 1] }, // launches the city's AI agent drones
    { at: 60, id: 'hackathon', label: 'Hackathon Hall', lot: [-1, -2] },
    { at: 100, id: 'airport', label: 'Base Airport', lot: [-3, -3] }, // community goal: planes take off and land
    { at: 150, id: 'studio', label: 'Design Studio', lot: [-2, 1] },
    { at: 300, id: 'datalab', label: 'Data Lab', lot: [-3, -1] },
    { at: 500, id: 'launchpad', label: 'Launchpad Tower', lot: [-1, 3], pro: true }, // pro: needs a Base Builder in the crew
    { at: 1000, id: 'stadium', label: 'Demo Day Stadium', lot: [-3, 2], pro: true },
    { at: 2500, id: 'beacon', label: 'Onchain Beacon', lot: [-2, -4], pro: true },
  ],

  // Base projects: each gets a headquarters on its own lot once `at` Blockies are in the city (a
  // community goal like any landmark). Until then its plot shows a COMING SOON sign; the HQ's signs
  // link to the project. Tributes to teams building on Base, not paid placements or endorsements.
  //   { id, name, label?, tagline, url, color, accent?, text?, logo?, style, at, lot }
  // style: tower, campus, spire or dome. logo: one of LOGOS in src/city.js (else the initial on
  // `color`). label: the building's name (default "<name> HQ"). Lots: free lots near Town Square.
  baseProjects: [
    { id: 'virtuals', name: 'Virtuals', tagline: 'Co-own autonomous AI agents', url: 'https://app.virtuals.io', color: '#3ca1a4', accent: '#e6fbdc', logo: 'virtuals', style: 'tower', at: 100, lot: [0, 2] },
    { id: 'basenames', name: 'Basenames', label: 'Basenames City Hall', tagline: 'Your identity on Base', url: 'https://www.base.org/names', color: '#0052ff', accent: '#ffffff', logo: 'basenames', style: 'dome', at: 125, lot: [-1, 2] },
    { id: 'uniswap', name: 'Uniswap', tagline: 'Swap anytime, anywhere', url: 'https://app.uniswap.org', color: '#ff007a', accent: '#ffffff', logo: 'uniswap', style: 'campus', at: 175, lot: [1, 2] },
    { id: 'aero', name: 'Aero', tagline: "Base's central liquidity hub", url: 'https://aerodrome.finance', color: '#0433ff', accent: '#ff1100', logo: 'aero', style: 'spire', at: 250, lot: [-2, 2] }, // Aerodrome, Aero once it merges with Velodrome
    { id: 'cbwallet', name: 'Coinbase Wallet', tagline: 'Self-custody, built for Base', url: 'https://www.coinbase.com/wallet', color: '#0052ff', accent: '#ffffff', logo: 'cbwallet', style: 'tower', at: 350, lot: [0, 3] },
    { id: 'morpho', name: 'Morpho', tagline: 'Open credit network for the world', url: 'https://morpho.org', color: '#2470ff', accent: '#d0e0f8', logo: 'morpho', style: 'spire', at: 400, lot: [1, 3] },
    { id: 'usdc', name: 'USDC', label: 'Circle USDC Tower', tagline: 'Digital dollars, onchain', url: 'https://www.circle.com/usdc', color: '#2775ca', accent: '#ffffff', logo: 'usdc', style: 'tower', at: 450, lot: [-2, 3] },
    { id: 'bankr', name: 'Bankr', tagline: 'Your AI banker on Base', url: 'https://bankr.bot', color: '#7b2ff2', accent: '#ffd400', logo: 'bankr', style: 'campus', at: 600, lot: [-3, 3] },
    { id: 'x402', name: 'x402', tagline: 'Internet-native payments for AI agents', url: 'https://www.x402.org', color: '#0052ff', accent: '#9fd0ff', logo: 'x402', style: 'spire', at: 750, lot: [3, 3] },
    { id: 'limitless', name: 'Limitless', tagline: 'Trade the future', url: 'https://limitless.exchange', color: '#141414', accent: '#c3ff00', logo: 'limitless', style: 'dome', at: 900, lot: [-1, 4] },
    { id: 'o1', name: 'o1.exchange', tagline: 'Trade onchain', url: 'https://o1.exchange', color: '#1d1d1d', accent: '#9fd0ff', logo: 'o1', style: 'tower', at: 1200, lot: [0, 4] },
    { id: 'veranta', name: 'Veranta', tagline: 'Trade global markets onchain', url: 'https://www.veranta.xyz', color: '#7e18ff', accent: '#4a71ff', style: 'campus', at: 1400, lot: [3, 4] }, // was Avantis
    { id: 'basepaint', name: 'BasePaint', tagline: 'Paint together. Mint daily.', url: 'https://basepaint.xyz', color: '#1b1b1b', accent: '#ffd23f', logo: 'basepaint', style: 'campus', at: 1750, lot: [-2, 4] },
  ],

  // An elevated metro loop over the ring road, built as one project once the Blocky count reaches `at`.
  // It grows with the land and its train stops at a station on every side.
  metro: { at: 200, label: 'BaseCity Metro', cost: 700 },
};
