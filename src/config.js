// Edit this file to rebrand the game. Everything else reads from here.
export const CONFIG = {
  name: 'BLOCKY',
  ticker: '$BLOCKY',
  cityName: 'BaseCity', // shown as the game title; e.g. 'BaseLand'
  tagline: 'A city built 24/7 by Blockies, the builders of Base',
  citizen: 'Blocky', // one inhabitant (a builder on Base)
  citizenPlural: 'Blockies',
  usdPerBlocky: 5, // every $5 of $BLOCKY bought brings one new Blocky (must match USD_PER_BLOCKY on the API)

  // When the city starts from empty land. Normally the API decides this (LAUNCH_TIME_MS, or the
  // first time the live API ran, stored in KV). Leave null to start "now" when no API value exists.
  cityStart: null,
  blocksPerHour: 24, // work rate of one Blocky; more Blockies = faster city
  dayLengthMin: 20, // one day/night cycle in real minutes (same for every visitor)

  // Square land of (2*startLand+1)^2 lots. When every lot is built, the Blockies expand the land
  // by one ring, but only once enough Blockies live in the city.
  startLand: 2,
  expandNeeds: [0, 0, 0, 3, 6, 10, 16, 25, 40, 60, 90], // Blockies needed to reach land level L
  expandCost: 120, // blocks per land level for an expansion

  // Live state (see api/colony.js). If it fails, the game falls back to demo mode.
  apiUrl: '/api/colony',
  pollMs: 15000,

  // Token on Base
  tokenAddress: '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',

  // Links for the CTA buttons. Leave empty to hide.
  buyUrl: 'https://app.uniswap.org/swap?chain=base&outputCurrency=0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',
  chartUrl: 'https://dexscreener.com/base/0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',
  xHandle: '', // e.g. blockyfun (without @)

  // Billboards around the city (Town Square + rooftops). Empty = "your project here" ads that sell the slot.
  // Add a sponsor and redeploy: { name, tagline, color, url }. Clicking a billboard opens its url.
  sponsors: [
    // { name: 'YourProject', tagline: 'Built on Base', color: '#0052ff', url: 'https://yourproject.xyz' },
  ],
  adContact: '', // shown on empty billboards, e.g. 'DM @blockyfun'; defaults to xHandle
  siteUrl: '', // canonical URL used in share text

  // Legendary Blockies with a hand-made look, by Blocky number. `title` replaces the random role name. #1 is the founder (you); #2-#6 go
  // to the first buyers. Looks: founder, halo, punk, spartan, robo, hoodie (LEGEND_LOOKS in src/citizens.js).
  legends: {
    1: { look: 'founder', name: 'Founder', label: 'The Founder', title: 'Founder' },
    2: { look: 'halo', name: 'Nibel', label: 'Nibel', title: 'Base Builder' },
    3: { look: 'punk', name: 'Jesse', label: 'Jesse', title: 'Builder 001' },
    4: { look: 'spartan', name: 'Xen', label: 'Xen', title: 'Base Builder' },
    5: { look: 'robo', name: 'Poet', label: 'Poet', title: 'Base Builder' },
    6: { look: 'hoodie', name: 'Brian', label: 'Brian', title: 'CEO' },
  },

  // Landmarks: once the Blocky count reaches `at`, the crew builds it next on its reserved lot [x, z].
  landmarks: [
    { at: 1, id: 'garage', label: "Founder's Garage", lot: [0, 1] },
    { at: 1, id: 'square', label: 'Town Square', lot: [0, 0] },
    { at: 2, id: 'liberty', label: 'Statue of Blockerty', lot: [2, 1] }, // the city icon, on a riverside point
    { at: 3, id: 'cafe', label: 'gm Café', lot: [-1, 0] },
    { at: 5, id: 'hq', label: 'Builder HQ', lot: [0, -1] },
    { at: 8, id: 'hackathon', label: 'Hackathon Hall', lot: [-1, -2] },
    { at: 10, id: 'airport', label: 'Base Airport', lot: [-3, -3] }, // community goal: planes take off and land
    { at: 12, id: 'studio', label: 'Design Studio', lot: [-2, 1] },
    { at: 20, id: 'datalab', label: 'Data Lab', lot: [-3, -1] },
    { at: 35, id: 'launchpad', label: 'Launchpad Tower', lot: [-1, 3] },
    { at: 50, id: 'stadium', label: 'Demo Day Stadium', lot: [-3, 2] },
    { at: 100, id: 'beacon', label: 'Onchain Beacon', lot: [-2, -4] },
  ],
};
