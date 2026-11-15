// Stock traits: what a Blocky wears when its wallet holds Coinbase's tokenized stocks on Base.
// Ideas doc: docs/STOCK-NFTS-IDEAS.md (A. Ticker Traits). This is the look only: nothing is onchain
// yet, and nothing here reads a wallet. `b.stockTrait` (a key of STOCK_TRAITS) dresses the Blocky.
//
// Kept additive on purpose: every trait is an accessory (hat, visor, pack, medallion) drawn over
// whatever the Blocky already wears, so a Blocky's base look never changes.
import * as THREE from 'three';

// ticker -> trait. Colours are the stocks' own, the same ones Blocky Street's towers use
// (src/stocks.js COLORS), so a Blocky in a NVDA helmet matches its tower.
export const STOCK_TRAITS = {
  nvda: { ticker: 'NVDA', label: 'GPU Helmet', color: 0x76b900 },
  tsla: { ticker: 'TSLA', label: 'Wheel Shades', color: 0xe31937 },
  aapl: { ticker: 'AAPL', label: 'Fruit Cap', color: 0xa3aab4 },
  msft: { ticker: 'MSFT', label: 'Window Cap', color: 0x00a4ef },
  amzn: { ticker: 'AMZN', label: 'Smile Box', color: 0xff9900 },
  googl: { ticker: 'GOOGL', label: 'Chrome Visor', color: 0x4285f4 },
  meta: { ticker: 'META', label: 'Infinity Visor', color: 0x0467df },
  mstr: { ticker: 'MSTR', label: 'BTC Book', color: 0xf7931a },
  sndk: { ticker: 'SNDK', label: 'Flash Pack', color: 0xd6282d },
  spcx: { ticker: 'SPCX', label: 'Flight Helmet', color: 0xd9dee6 },
  coin: { ticker: 'COIN', label: 'Coin Medallion', color: 0x0052ff },
};

export const STOCK_TRAIT_IDS = Object.keys(STOCK_TRAITS);
export const stockTraitLabel = (id) => (STOCK_TRAITS[id] ? `${STOCK_TRAITS[id].ticker} · ${STOCK_TRAITS[id].label}` : 'None');

// The trait a wallet earns: its biggest holding (the same rule Street Crew uses, src/_crew.js).
// holdings: [{ ticker, usd }]. Tickers without a trait fall back to nothing.
export function stockTraitFor(holdings = []) {
  const held = holdings.filter((h) => h && STOCK_TRAITS[String(h.ticker).toLowerCase()] && (h.usd ?? 0) > 0);
  if (!held.length) return null;
  held.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  return String(held[0].ticker).toLowerCase();
}

// ---------- drawing ----------
// B(parent, w, h, d, color, x, y, z, emissive): a box whose y is its bottom (src/citizens.js).
// Head: a 0.42 cube from y 0.80 to 1.22, face at z ≈ 0.215. Chest: y 0.38 to 0.80.
const GOLD = 0xffc83d;

export function dressStock(g, arms, id, B, mat) {
  const t = STOCK_TRAITS[id];
  if (!t) return;
  const c = t.color;
  switch (id) {
    // a green compute helmet: a band round the head, a die on top with a fan
    case 'nvda': {
      B(g, 0.46, 0.09, 0.46, c, 0, 1.16); // band
      B(g, 0.48, 0.05, 0.48, 0x4f7f00, 0, 1.25); // dark rim
      B(g, 0.3, 0.12, 0.3, 0x2b2f36, 0, 1.3); // the die
      B(g, 0.24, 0.02, 0.24, c, 0, 1.42, 0, 0x1a3a00); // its glow pad
      for (const [x, z] of [[-0.09, 0.09], [0.09, -0.09]]) B(g, 0.08, 0.03, 0.08, 0x8a94a6, x, 1.415, z);
      B(g, 0.1, 0.06, 0.02, c, 0, 1.17, 0.235, 0x1a3a00); // visor light
      break;
    }
    // red steering-wheel shades: the rim sits on the head like a cap band, two lenses on the eyes
    case 'tsla': {
      for (const x of [-0.1, 0.1]) B(g, 0.15, 0.11, 0.03, c, x, 0.92, 0.225, 0x4a0a10);
      B(g, 0.1, 0.03, 0.02, 0x1b1b1b, 0, 0.97, 0.235); // bridge
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 6, 20), mat(c, 0x5a0a10));
      rim.position.set(0, 1.25, 0); rim.rotation.x = Math.PI / 2; g.add(rim); // round the head, not above it
      for (const a of [Math.PI / 2, -Math.PI / 2]) B(g, 0.03, 0.02, 0.22, 0x2b2f36, Math.sin(a) * 0.12, 1.24, Math.cos(a) * 0.12);
      B(g, 0.08, 0.03, 0.03, 0x1b1b1b, 0, 1.25, 0.26); // its hub
      break;
    }
    // silver cap with a little apple on the chest
    case 'aapl': {
      B(g, 0.5, 0.14, 0.5, c, 0, 1.18); B(g, 0.44, 0.04, 0.26, c, 0, 1.18, 0.33);
      B(g, 0.12, 0.12, 0.02, 0x111111, 0, 1.2, 0.27); // the bite-side mark
      B(g, 0.03, 0.06, 0.02, 0x111111, 0.09, 1.22, 0.27);
      B(g, 0.1, 0.1, 0.02, c, 0, 0.6, 0.145); B(g, 0.03, 0.04, 0.02, 0xf4f4f0, 0.02, 0.66, 0.146); // chest badge
      break;
    }
    // a four-pane window cap, in Microsoft's own four colours
    case 'msft': {
      B(g, 0.5, 0.14, 0.5, 0x1b1b1b, 0, 1.18); B(g, 0.44, 0.04, 0.26, 0x1b1b1b, 0, 1.18, 0.33);
      [[-0.055, 0, 0xf25022], [0.055, 0, 0x7fba00], [-0.055, 1, 0x00a4ef], [0.055, 1, 0xffb900]].forEach(([x, i, col]) => {
        B(g, 0.09, 0.09, 0.03, col, x, 1.2 + i * 0.1, 0.25);
      });
      break;
    }
    // an orange parcel on the shoulder and the smile arrow across the chest
    case 'amzn': {
      B(g, 0.24, 0.22, 0.2, c, -0.32, 0.62, 0.02);
      B(g, 0.26, 0.04, 0.22, 0xd97d00, -0.32, 0.84, 0.02);
      B(g, 0.03, 0.2, 0.24, 0xf4f4f0, -0.32, 0.62, 0.03);
      B(g, 0.24, 0.035, 0.02, c, 0, 0.5, 0.145);
      B(g, 0.05, 0.035, 0.02, c, 0.15, 0.53, 0.145); // the arrow's point
      break;
    }
    // a four-colour band visor
    case 'googl': {
      B(g, 0.46, 0.1, 0.03, 0x2b2f36, 0, 0.93, 0.22);
      [0x4285f4, 0xea4335, 0xfbbc05, 0x34a853].forEach((col, i) => B(g, 0.1, 0.08, 0.035, col, -0.165 + i * 0.11, 0.94, 0.225));
      B(g, 0.46, 0.03, 0.46, 0x9aa3ad, 0, 1.2); // the strap round the head
      break;
    }
    // a blue infinity visor
    case 'meta': {
      B(g, 0.44, 0.12, 0.055, 0x0b1020, 0, 0.92, 0.225);
      const loop = (x) => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 5, 14), mat(c, 0x0030a0)); m.position.set(x, 0.98, 0.25); g.add(m); };
      loop(-0.05); loop(0.05);
      B(g, 0.44, 0.04, 0.44, c, 0, 1.2); // the head band
      break;
    }
    // an orange bitcoin-book on the chest with a gold coin medallion
    case 'mstr': {
      B(g, 0.18, 0.14, 0.06, c, 0, 0.52, 0.13); // the book
      B(g, 0.2, 0.03, 0.07, 0xd97d00, 0, 0.65, 0.125); // its cover edge
      B(g, 0.08, 0.08, 0.03, GOLD, 0, 0.7, 0.15, 0x6a5000); // a gold coin above it
      B(g, 0.2, 0.03, 0.02, GOLD, 0, 0.44, 0.145); // the chain
      break;
    }
    // a red memory card in a chest holster, contacts up
    case 'sndk': {
      B(g, 0.2, 0.26, 0.08, c, 0, 0.46, 0.145); // the card, worn on the chest
      B(g, 0.22, 0.03, 0.09, 0x8a1018, 0, 0.72, 0.14); // its top edge
      for (let i = 0; i < 3; i++) B(g, 0.03, 0.05, 0.02, GOLD, -0.05 + i * 0.05, 0.66, 0.19); // contacts
      B(g, 0.11, 0.04, 0.02, 0xf4f4f0, 0, 0.55, 0.19); // its label
      B(g, 0.03, 0.05, 0.02, 0xf4f4f0, 0.06, 0.55, 0.19);
      B(g, 0.14, 0.03, 0.02, 0x2b2f36, 0, 0.44, 0.15); // the strap
      break;
    }
    // a white flight helmet with a dark visor and an antenna
    case 'spcx': {
      B(g, 0.48, 0.2, 0.48, c, 0, 1.14);
      B(g, 0.5, 0.05, 0.52, 0xb8c0cc, 0, 1.12);
      B(g, 0.4, 0.12, 0.03, 0x1b2430, 0, 1.16, 0.25); // visor
      B(g, 0.03, 0.18, 0.03, 0x9aa3ad, 0.24, 1.3, -0.1); B(g, 0.05, 0.05, 0.05, 0x0052ff, 0.24, 1.48, -0.1, 0x0030ff); // antenna
      break;
    }
    // the Coinbase medallion
    case 'coin': {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 5, 18), mat(c, 0x0030a0));
      m.position.set(0, 0.56, 0.15); g.add(m);
      B(g, 0.09, 0.09, 0.02, 0xf4f4f0, 0, 0.52, 0.15);
      B(g, 0.03, 0.09, 0.03, c, 0, 0.52, 0.152);
      B(g, 0.2, 0.03, 0.02, c, 0, 0.66, 0.144); // the chain
      break;
    }
  }
}

// Read a wallet's stocks from the BaseCity API (`/api/stocks?wallet=`) and say which trait it earns.
// Returns { trait, holdings, label } or null. Never throws: no API, no trait.
export async function stockTraitOfWallet(who, feed = '/api') {
  try {
    const r = await fetch(`${feed}/stocks?wallet=${encodeURIComponent(who)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return { trait: stockTraitFor(j.holdings || []), holdings: j.holdings || [], label: j.name || j.address || null };
  } catch { return null; }
}
