// What each USDC shop item costs (Game Mode's Supply Shop pays USDC to the BaseCityFlywheel vault). The server
// checks a saved receipt against this table, so a client can't claim a cheaper price. test/security.mjs keeps it
// identical to SHOP_CATALOG in src/game-world.js.
export const USDC_PRICES = { 'pickaxe-3': 2, 'battery-2': 1, 'chip-rig': 2, 'stock-tower': 3, 'x402-booth': 2, billboard: 1, 'neon-lamp': 0.5, 'gold-statue': 5, 'overclock-core': 0.5, 'warp-beacon': 0.5 };
