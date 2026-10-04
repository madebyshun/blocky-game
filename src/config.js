// Edit this file to rebrand the game. Everything else reads from here.
export const CONFIG = {
  name: 'BLOCKY',
  ticker: '$BLOCKY',
  cityName: 'BaseCity', // shown as the game title; e.g. 'BaseLand'
  tagline: 'A city built 24/7 by builders on Base',
  citizen: 'Builder', // what one inhabitant is called
  feePerCitizen: 5, // USD of creator fees that brings one new builder

  // The city has been building since this moment. Builder #1 (the founder) starts here.
  cityStart: '2026-10-01T00:00:00Z',
  blocksPerHour: 20, // base work rate of one builder; more builders = faster city
  dayLengthMin: 20, // one day/night cycle in real minutes (same for every visitor)

  // Live state (see api/colony.js). If it fails, the game falls back to demo mode.
  apiUrl: '/api/colony',
  pollMs: 15000,

  // Token on Base
  tokenAddress: '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',

  // Links for the CTA buttons. Leave empty to hide.
  buyUrl: 'https://app.uniswap.org/swap?chain=base&outputCurrency=0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',
  chartUrl: 'https://dexscreener.com/base/0xE72A0C42b584a3E7A4503a82D1337dEB52adE885',
  xHandle: '', // e.g. blockyfun (without @)
  siteUrl: '', // canonical URL used in share text

  // Landmarks unlock as the builder count grows (fees), on reserved lots [x, z] of the city grid.
  landmarks: [
    { at: 1, id: 'garage', label: "Founder's Garage", lot: [0, 1] },
    { at: 3, id: 'cafe', label: 'gm Café', lot: [1, 0] },
    { at: 5, id: 'hq', label: 'Builder HQ', lot: [-1, 0] },
    { at: 8, id: 'hackathon', label: 'Hackathon Hall', lot: [0, -2] },
    { at: 12, id: 'studio', label: 'Design Studio', lot: [2, 1] },
    { at: 20, id: 'datalab', label: 'Data Lab', lot: [-2, -1] },
    { at: 35, id: 'launchpad', label: 'Launchpad Tower', lot: [2, -2] },
    { at: 50, id: 'stadium', label: 'Demo Day Stadium', lot: [-2, 2] },
    { at: 100, id: 'beacon', label: 'Onchain Beacon', lot: [0, 3] },
  ],
};
