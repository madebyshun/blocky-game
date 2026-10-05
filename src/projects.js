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
// - style: tower, campus, spire or dome. color / accent: the building's colours (#rrggbb).
// - logo: one drawn in code (cbwallet, o1, virtuals, bankr, aero, uniswap, morpho, usdc, basenames,
//   limitless, x402, basepaint), or a square image in public/logos/ ('/logos/name.png'), or nothing:
//   the project's initial on its colour.
// - optional: label (the building's name, default "<name> HQ"), text (the initial's colour).
// Tributes to teams building on Base unless you say otherwise: no logo here implies a partnership.
export const PROJECTS = [];
