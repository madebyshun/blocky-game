// Base Avenue: the Base projects with a headquarters in BaseCity. The avenue's plots are numbered on
// their signs in the city (1, 2, ...; their places: `avenue` in src/config.js). A plot shows "your
// project here" until a project takes it; then COMING SOON until its goal, then the crew builds the HQ.
//
// Add one line per project, for example:
//   { id: 'aero', name: 'Aero', tagline: "Base's liquidity hub", url: 'https://aerodrome.finance',
//     color: '#0433ff', accent: '#ff1100', logo: 'aero', style: 'spire', plot: 1, at: 250, added: '2026-10-06' },
//
// - id: short, unique, lowercase. name, tagline: shown on the building and the About page.
// - plot: the Base Avenue plot it takes (the number on the plot's sign).
// - at: how many Blockies must be in the city before it breaks ground (a community goal, on the HUD
//   and the About page). 0: right away.
// - added: the day you add it (UTC, or a time like '2026-10-06T15:00Z'). Its HQ is never built before
//   then, so adding a project never changes what the city already built.
// - style: tower, campus, spire, dome, or cats (Cat Town Plaza: a cat statue, src/cats.js). color / accent: the building's colours (#rrggbb).
// - logo: one drawn in code (cbwallet, o1, virtuals, bankr, aero, uniswap, morpho, usdc, basenames,
//   limitless, x402, basepaint), or a square image in public/logos/ ('/logos/name.png'), or nothing:
//   the project's initial on its colour.
// - optional: label (the building's name, default "<name> HQ"), text (the initial's colour).
// Tributes to teams building on Base unless you say otherwise: no logo here implies a partnership.
export const PROJECTS = [
  { id: 'virtuals', name: 'Virtuals', tagline: 'Co-own autonomous AI agents', url: 'https://app.virtuals.io', color: '#3ca1a4', accent: '#e6fbdc', logo: 'virtuals', style: 'tower', plot: 1, at: 100, added: '2026-10-01' },
  { id: 'basenames', name: 'Basenames', label: 'Basenames City Hall', tagline: 'Your identity on Base', url: 'https://www.base.org/names', color: '#0052ff', accent: '#ffffff', logo: 'basenames', style: 'dome', plot: 2, at: 125, added: '2026-10-01' },
  { id: 'uniswap', name: 'Uniswap', tagline: 'Swap anytime, anywhere', url: 'https://app.uniswap.org', color: '#ff007a', accent: '#ffffff', logo: 'uniswap', style: 'campus', plot: 3, at: 175, added: '2026-10-01' },
  { id: 'aero', name: 'Aero', tagline: "Base's central liquidity hub", url: 'https://aerodrome.finance', color: '#0433ff', accent: '#ff1100', logo: 'aero', style: 'spire', plot: 4, at: 250, added: '2026-10-01' }, // Aerodrome, Aero once it merges with Velodrome
  { id: 'cbwallet', name: 'Coinbase Wallet', tagline: 'Self-custody, built for Base', url: 'https://www.coinbase.com/wallet', color: '#0052ff', accent: '#ffffff', logo: 'cbwallet', style: 'tower', plot: 5, at: 350, added: '2026-10-01' },
  { id: 'morpho', name: 'Morpho', tagline: 'Open credit network for the world', url: 'https://morpho.org', color: '#2470ff', accent: '#d0e0f8', logo: 'morpho', style: 'spire', plot: 6, at: 400, added: '2026-10-01' },
  { id: 'usdc', name: 'USDC', label: 'Circle USDC Tower', tagline: 'Digital dollars, onchain', url: 'https://www.circle.com/usdc', color: '#2775ca', accent: '#ffffff', logo: 'usdc', style: 'tower', plot: 7, at: 450, added: '2026-10-01' },
  { id: 'bankr', name: 'Bankr', tagline: 'Your AI banker on Base', url: 'https://bankr.bot', color: '#7b2ff2', accent: '#ffd400', logo: 'bankr', style: 'campus', plot: 8, at: 600, added: '2026-10-01' },
  { id: 'x402', name: 'x402', tagline: 'Internet-native payments for AI agents', url: 'https://www.x402.org', color: '#0052ff', accent: '#9fd0ff', logo: 'x402', style: 'spire', plot: 9, at: 750, added: '2026-10-01' },
  { id: 'limitless', name: 'Limitless', tagline: 'Trade the future', url: 'https://limitless.exchange', color: '#141414', accent: '#c3ff00', logo: 'limitless', style: 'dome', plot: 10, at: 900, added: '2026-10-01' },
  { id: 'o1', name: 'o1.exchange', tagline: 'Trade onchain', url: 'https://o1.exchange', color: '#1d1d1d', accent: '#9fd0ff', logo: 'o1', style: 'tower', plot: 11, at: 1200, added: '2026-10-01' },
  { id: 'veranta', name: 'Veranta', tagline: 'Trade global markets onchain', url: 'https://www.veranta.xyz', color: '#7e18ff', accent: '#4a71ff', style: 'campus', plot: 12, at: 1400, added: '2026-10-01' }, // was Avantis
  { id: 'cattown', name: 'Cat Town', label: 'Cat Town Plaza', tagline: 'The cats of Base', url: 'https://x.com/cattownbase', color: '#6178a8', accent: '#e8e0ff', logo: '/logos/cattown.png', style: 'cats', plot: 14, at: 0, added: '2026-10-07T06:30Z' },
  { id: 'basepaint', name: 'BasePaint', tagline: 'Paint together. Mint daily.', url: 'https://basepaint.xyz', color: '#1b1b1b', accent: '#ffd23f', logo: 'basepaint', style: 'campus', plot: 13, at: 1750, added: '2026-10-01' },
];
