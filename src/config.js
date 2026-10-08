// Edit this file to rebrand the game. Everything else reads from here.
export const CONFIG = {
  name: 'BLOCKY',
  ticker: '$BLOCKY',
  cityName: 'BaseCity', // shown as the game title; e.g. 'BaseLand'
  tagline: 'A city built 24/7 by Blockies, the builders of Base',
  citizen: 'Blocky', // one inhabitant (a builder on Base)
  citizenPlural: 'Blockies',
  // Every `usdPerBlocky` of $BLOCKY a wallet buys (added up over all its buys) earns one Blocky: #1, #2,
  // ... A buy counts at the price of its day, so changing the price later only changes future buys.
  // (USD_PER_BLOCKY on the API overrides it.)
  usdPerBlocky: 10,
  // Trading opens when this much $BLOCKY has been bought in total (the HUD's "Bought"); 0: open now.
  // Until then every Blocky is a newcomer, and leaves if its wallet sells. From then on a Blocky that
  // has been in the city `citizenDays` days is a citizen for good: an NFT its wallet claims, free to
  // trade at once (so on opening day, everyone who held that long). Only `supply` NFTs can ever exist
  // (MAX_SUPPLY in the contract): first come, first claimed. Lower either any time; never raise them
  // after launch. (UNLOCK_USD / CITIZEN_DAYS on the API override them.)
  unlockUsd: 0,
  citizenDays: 0.25, // 6 hours
  supply: 10000, // must match MAX_SUPPLY on the API
  whaleUsd: 1000, // a single buy this big also builds something with the buyer's name (WHALE_USD on the API)
  // What a whale buy builds, by its size: the biggest tier it reaches. It goes up next, named after the
  // buyer (Basename or address) while the wallet keeps at least half of its Blockies; sell more and the
  // building goes dark, FOR SALE, until the next whale of its size or bigger takes it over.
  whaleTiers: [
    { usd: 1000, build: 'fountain', label: 'Whale Fountain' },
    { usd: 2500, build: 'tower', label: 'Whale Tower' },
    { usd: 5000, build: 'skyscraper', label: 'Whale Skyscraper' },
  ],
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
    contract: '0xD1C1655860eDdb6cCeC9AC986539B3b0E195d5a9', // BaseCity Blockies on Base (NFT_CONTRACT on the API wins)
    royaltyBps: 500,
    openseaSlug: 'basecity-blockies', // opensea.io/collection/<slug> (OPENSEA_SLUG on the API wins; OPENSEA_API_KEY reads its floor and listings)
    treasury: '0x8eBA37eF94E6b831Fe8bf6a62e79D0DC6FD8C34D', // the dev wallet (Blocky's MetaMask): royalties, and it deploys and owns the contract (OpenSea collection settings too)
    // The team's reserve: Blockies #1 to #count belong to this wallet from day one (giveaways,
    // partners), citizens `citizenDays` after the city starts like everyone's first Blockies, and they
    // never leave the city. Shown on the About page.
    // count 0 for none. (TEAM_RESERVE_WALLET / TEAM_RESERVE_COUNT on the API override it.)
    reserve: { wallet: '0xb7b3bdf2e53b9c877efabc99a74badfc03299823', count: 100 },
    // Team grants: more Blockies for team wallets after launch, given once each (by id) at the next
    // numbers, rolled from the block of the ledger update that gives them. Not bought, never sent away,
    // citizens `citizenDays` after they arrive; their metadata's Origin is "Team". Never remove one.
    grants: [
      { id: 'team-1', wallet: '0x92c0a50966ccdb5e25770cffd64b4b249adf42e9', count: 50 },
      { id: 'team-2', wallet: '0xe7d67cf1108fa1c4836ff1b178c3f37d56844530', count: 50 },
      { id: 'team-3', wallet: '0xc1d3eb0a2b9bad7eec5566049b5b44fde19c7332', count: 50 },
      { id: 'team-4', wallet: '0x3eb42d002ade67650a712bc068adaeabe920a133', count: 50 },
      { id: 'treasury-1', wallet: '0x8eba37ef94e6b831fe8bf6a62e79d0dc6fd8c34d', count: 200 }, // Blocky's MetaMask
    ],
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
  blocksPerHour: 40,
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
  // A new city goes up fast so it looks alive from its first hour: the first project takes `start` of
  // its time, and each next one a bit more, up to the full time from project `projects` on.
  launchBoost: { start: 0.08, projects: 80 },
  // One construction site per `per` Blockies the city has had at once (at most `max`): the crew splits
  // up, and several smaller crews build faster together than one crowd on one site.
  sites: { per: 40, max: 6 },

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
  xHandle: 'blockyonbase', // without @

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
  siteUrl: 'https://basecity.space', // BaseCity's domain, e.g. 'https://basecity.xyz': share text, the cinematic watermark, NFT links (SITE_URL on the API wins). Empty: the address the site is opened on

  // You: the city's first builder.
  founder: { look: 'founder', name: 'Founder', title: 'Founder', office: 'founder' },

  // Base Builders: real Base builders you add by hand. They build the city alongside the Blockies
  // from the day they join, and sit on the City Council (`office`, from `offices` below). Add as many as
  // you like:
  //   { name, title, office?, look?, joined?, x?, bg? }
  // - title: who they are in real life (shown with their office).
  // - look: a hand-made outfit from LEGEND_LOOKS in src/citizens.js. Without one they wear the Base
  //   Builder uniform with a gold star.
  // - joined: 'YYYY-MM-DD' when they start building (default: from the city's first day).
  // - x: their X handle (an 𝕏 link on the Base Builders page); bg: their PFP background colour.
  legends: [
    { name: 'Jesse', title: 'Founder of Base', office: 'mayor', look: 'punk' },
    { name: 'Nibel', title: 'Base Builder', office: 'speaker', look: 'halo' },
    { name: 'Xen', title: 'Base Builder', office: 'police', look: 'spartan' },
    { name: 'Poet', title: 'Base Builder', office: 'ai', look: 'robo' },
    { name: 'Brian', title: 'CEO of Coinbase', office: 'governor', look: 'hoodie' },
    { name: 'Saumya Saxena', title: 'Base Builder', office: 'architect', look: 'pixelspike' },
    { name: 'Jerry Pan', title: 'Base Builder', office: 'farms', look: 'goat' },
    { name: 'Ahaan Raizada', title: 'Base Builder', office: 'transit', look: 'pixelhat' },
    { name: 'Jeremy Grinberg', title: 'Base Builder', office: 'planner', look: 'crewneck' },
    { name: 'Jon Roethke', title: 'Base Builder', office: 'treasurer', look: 'blazer' },
    { name: 'Kien Nguyen', title: 'Base Builder', office: 'culture', look: 'kimono' },
    { name: 'Toady Hawk', title: 'Base Builder', office: 'parks', look: 'frog' },
    { name: 'mleejr', title: 'Base Builder', office: 'arts', look: 'doodle' },
    { name: 'deployer', title: 'Base Builder', office: 'lifeguard', look: 'floatie' },
    { name: 'David Tso', title: 'Base Builder', office: 'cto', look: 'pixelpunk' },
    { name: 'mrtdlgc', title: 'Base Builder', office: 'night', look: 'dreamer' },
    { name: 'Quigley', title: 'Base Builder', office: 'robotics', look: 'hoodbot' },
    { name: 'DonJohnson', title: 'Chef at Virtuals, co-author of ERC-8126 and ERC-8196', office: 'standards', look: 'apeslime', x: 'DonJohnsonSays' },
    { name: 'everythingempty', title: 'Base Builder', office: 'fire', look: 'dragonrider' },
    { name: 'Cobie', title: 'Base Builder', office: 'ventures', look: 'trapper' },
    { name: 'statuette', title: 'Base Builder', office: 'tourism', look: 'starbuns' },
    { name: 'Oxxbid', title: 'Base Builder', office: 'markets', look: 'bobshades' },
    { name: 'Joey Lau', title: 'DevRel at Virtuals, Jupiter Global Ambassador', office: 'agentrel', look: 'mintcap', x: 'joeylaujy' },
    { name: 'sohey', title: 'Base DevRel', office: 'devrel', look: 'specs', joined: '2026-10-07T06:00:00Z', bg: '#0052ff' },
    { name: 'Tamara', title: 'Artist, builder of 2 Base apps', office: 'creative', look: 'muse', joined: '2026-10-07T06:00:00Z', bg: '#bdbdbd' },
    { name: 'EtherMage', title: 'Architect of Virtuals', office: 'agents', look: 'milady', joined: '2026-10-07T06:00:00Z', x: 'ethermage', bg: '#7d9bb5' },
    { name: 'T.P', title: 'Core at Virtuals', office: 'risk', look: 'patchpunk', joined: '2026-10-07T06:00:00Z', x: '0xTP91', bg: '#638596' },
    { name: 'AzFlin', title: 'Founder of DAOs.world, Pump RPG and Throne Wars', office: 'games', look: 'azflin', joined: '2026-10-08T03:00:00Z', x: 'AzFlin', bg: '#8a8a8a' },
  ],

  // The chip economy (src/chips.js): the Chip Fab on Base Avenue (src/projects.js, 'fab') makes chips
  // from silicon, as fast as the grid's power allows, and tech buildings need them to switch on. Only
  // from `from` on (when it was added: the city before that never changes). In-game, not tokens.
  chips: {
    from: '2026-10-07T19:30:00Z',
    siliconPerBlocky: 12, // a crate of silicon with every Blocky bought
    dredgePerHour: 6, // the Fab's river dredge, once it stands
    fabPerHour: 40, // the Fab's top speed (chips an hour)
    powerBase: 12, powerPerPlant: 7, // what the grid feeds it: a base, plus every windmill and solar farm
    cost: { gpufarm: 120, aistartup: 60, devhub: 40, datalab: 90, agenthub: 100 }, // chips to switch one on
    // the Power Plant's GPU (src/city.js) at every tier of chips made
    tiers: [[0, 'RTX 4090'], [2000, 'RTX 5090'], [10000, 'Blackwell'], [50000, 'Rubin']],
  },

  // The City Council: the jobs Base Builders hold in the city, in order of rank. `home`: the landmarks
  // or kinds of buildings (ids in src/sim.js) where the office holder spends breaks once one stands;
  // `duty`: a line for the news ticker.
  offices: {
    founder: { label: 'Founder of BaseCity', home: ['garage'], duty: 'is still tinkering in the garage where the city began' },
    mayor: { label: 'Mayor', home: ['square'], duty: 'holds office hours on Town Square' },
    governor: { label: 'Governor', home: ['hq', 'airport'], duty: 'drops by to see how the city is coming along' },
    speaker: { label: 'Speaker of the Council', home: ['square', 'hq'], duty: 'calls the City Council to order' },
    treasurer: { label: 'City Treasurer', home: ['exchange'], duty: 'keeps an eye on the city treasury at the Stock Exchange' },
    risk: { label: 'Chief Risk Officer', home: ['exchange', 'brokerage'], duty: 'stress-tests the city treasury, and always chooses violence' },
    architect: { label: 'Chief Architect', home: ['studio', 'hq'], duty: 'signs off on the plans for the next tower' },
    planner: { label: 'City Planner', home: ['hq', 'datalab'], duty: 'draws up the next ring of land' },
    transit: { label: 'Transit Director', home: ['airport'], duty: 'keeps the metro and the airport on time' },
    ai: { label: 'Head of AI', home: ['agenthub', 'aistartup'], duty: 'briefs the AI agent drones at the Agent Hub' },
    agents: { label: 'Minister of Agents', home: ['agenthub', 'aistartup'], duty: 'drafts the charter of the agentic society at the Agent Hub' },
    cto: { label: 'Chief Technology Officer', home: ['datalab', 'devhub'], duty: 'ships an upgrade to the city on a Friday' },
    robotics: { label: 'Head of Robotics', home: ['gpufarm', 'agenthub'], duty: 'tunes the GPU farms on the east bank' },
    police: { label: 'Police Chief', home: ['police'], duty: 'reports another quiet night in BaseCity' },
    fire: { label: 'Fire Chief', home: ['firestation'], duty: 'runs a fire drill at the station' },
    parks: { label: 'Parks Commissioner', home: ['park', 'lakepark', 'flowergarden'], duty: 'plants a new tree in the park' },
    farms: { label: 'Farms Commissioner', home: ['farm'], duty: 'checks on the harvest out in the fields' },
    lifeguard: { label: 'Head Lifeguard', home: ['pool', 'lakepark'], duty: 'is on duty at the public pool' },
    culture: { label: 'Culture Minister', home: ['stage', 'studio'], duty: 'books the next show at the Concert Stage' },
    arts: { label: 'Arts Director', home: ['studio', 'flowergarden'], duty: 'paints a new mural downtown' },
    creative: { label: 'Creative Director', home: ['studio', 'flowergarden'], duty: 'curates the city\'s look, from the shop windows to the skyline' },
    events: { label: 'Events Director', home: ['hackathon', 'stadium'], duty: 'is setting up the next hackathon' },
    devrel: { label: 'Builder Ambassador', home: ['devhub', 'hackathon'], duty: 'shows new builders around the Dev Hub' },
    agentrel: { label: 'Agent Relations Ambassador', home: ['agenthub', 'devhub'], duty: 'shows new agents and their builders around the Agent Hub' },
    standards: { label: 'Chef of Standards', home: ['datalab', 'cafe'], duty: 'is cooking up the city\'s next ERC at the Data Lab' },
    games: { label: 'Minister of Games', home: ['hackathon', 'stadium', 'skatepark'], duty: 'is running game night at Hackathon Hall. Always Be Coding' },
    ventures: { label: 'Head of Ventures', home: ['launchpad', 'exchange'], duty: 'scouts the next project for the Launchpad' },
    markets: { label: 'Market Maker', home: ['brokerage', 'exchange'], duty: 'quotes both sides at the brokerage' },
    tourism: { label: 'Tourism Director', home: ['liberty'], duty: 'gives a tour at the Statue of Blockerty' },
    night: { label: 'Night Mayor', home: ['cafe'], duty: 'keeps the gm Café open for the night shift' },
    mint: { label: 'Master of the Mint', home: ['garage', 'exchange'], duty: 'counts fresh Blockies as they arrive' },
  },

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

  // The citizens' vote (/vote.html): holders of BaseCity Blockies NFTs pick what the city builds next,
  // 1 NFT = 1 vote. One round at a time: its id (new id = new round), the question, when it ends
  // (UTC) and the choices (id, label, tagline, color). Votes are counted per NFT, so selling one after
  // voting doesn't count twice: the vote stays with the NFT, and its new holder can change it. The
  // team's Blockies (reserve, grants) don't vote. When the
  // round ends, the winner goes into src/projects.js (Base Avenue) by hand, with today as `added`.
  // No round yet: set one like
  //   vote: { id: 'r1', title: 'Next on Base Avenue', question: 'Which Base project gets the next HQ on Base Avenue?',
  //           ends: '2026-10-20T14:00Z', choices: [{ id: 'aave', label: 'Aave', tagline: '…', color: '#b6509e' }, …] },
  vote: null,

  // Base Avenue: plots reserved for Base projects' headquarters, numbered 1, 2, ... on their signs.
  // Projects take them in src/projects.js; a plot nobody has taken advertises itself. [x, z] like
  // landmark lots; add more at the end if you need them (renumbering moves the HQs).
  avenue: {
    plots: [
      [0, 2], [-1, 2], [1, 2], [-2, 2], [0, 3], [1, 3], [-2, 3], [-3, 3], // 1-8
      [3, 3], [-1, 4], [0, 4], [3, 4], [-2, 4], [4, 2], [4, 3], [-3, 1], // 9-16
    ],
    // plots cleared from the city's woods, numbered after `plots` (17, ...): the woods stand there until
    // the HQ breaks ground, so adding one never changes what the city already built
    woods: [[4, 1]], // 17
  },

  // An elevated metro loop over the ring road, built as one project once the Blocky count reaches `at`
  // and the land is at least `land` rings out (6: 13x13 lots), so it circles a real city, not a few
  // blocks downtown. It grows with the land and its train stops at a station on every side.
  metro: { at: 1000, land: 6, label: 'BaseCity Metro', cost: 700 },
};

// How long a Blocky is held before it's a citizen, in words: "6 hours", "a day", "3 days".
export const holdText = (days = CONFIG.citizenDays) => {
  if (days >= 1) return days === 1 ? 'a day' : `${days} days`;
  const h = Math.max(1, Math.round(days * 24));
  return h === 1 ? 'an hour' : `${h} hours`;
};
