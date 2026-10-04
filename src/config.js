// Edit this file to rebrand the game. Everything else reads from here.
export const CONFIG = {
  name: 'BLOCKY',
  ticker: '$BLOCKY',
  citizen: 'Blocky', // what one inhabitant is called
  feePerCitizen: 5, // USD of creator fees that lands one new citizen

  // Live colony state (see api/colony.js). If it fails, the game falls back to demo mode.
  apiUrl: '/api/colony',
  pollMs: 15000,

  // Links for the CTA buttons. Leave empty to hide.
  buyUrl: '', // e.g. https://app.uniswap.org/swap?chain=base&outputCurrency=0x...
  xHandle: '', // e.g. blockyfun (without @)
  siteUrl: '', // canonical URL used in share text

  // Buildings unlock as the population grows: the retention loop.
  unlocks: [
    { at: 1, id: 'hut', label: 'First Hut' },
    { at: 2, id: 'farm', label: 'Farm' },
    { at: 3, id: 'mine', label: 'Mine' },
    { at: 5, id: 'market', label: 'Market' },
    { at: 8, id: 'sawmill', label: 'Sawmill' },
    { at: 12, id: 'houses', label: 'Village' },
    { at: 20, id: 'crane', label: 'Construction Yard' },
    { at: 35, id: 'tower', label: 'Trading Tower' },
    { at: 50, id: 'lighthouse', label: 'Beacon' },
    { at: 100, id: 'castle', label: 'Blocky Castle' },
  ],
};
