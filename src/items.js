// Unified Minecraft-style 16×16 pixel/voxel SVG sprite registry for BaseCity Game Mode.
// Zero emojis or external icon fonts — crisp pixel geometry styled for Obsidian dark UI.

export const ITEM_ART = {
  // ---- Core Resources & Pickaxes ----
  silicon: '<rect x="5" y="2" width="4" height="2" fill="#93c5fd"/><rect x="4" y="4" width="6" height="3" fill="#60a5fa"/><rect x="3" y="7" width="8" height="4" fill="#3b82f6"/><rect x="5" y="11" width="6" height="3" fill="#1d4ed8"/><rect x="10" y="5" width="3" height="5" fill="#7dd3fc"/><rect x="6" y="5" width="2" height="2" fill="#e0f2fe"/>',
  chips: '<rect x="2" y="5" width="12" height="1" fill="#ffc83d"/><rect x="2" y="8" width="12" height="1" fill="#ffc83d"/><rect x="2" y="11" width="12" height="1" fill="#ffc83d"/><rect x="5" y="2" width="1" height="12" fill="#ffc83d"/><rect x="8" y="2" width="1" height="12" fill="#ffc83d"/><rect x="11" y="2" width="1" height="12" fill="#ffc83d"/><rect x="4" y="4" width="8" height="8" fill="#0f172a"/><rect x="5" y="5" width="6" height="6" fill="#0052ff"/><rect x="6" y="6" width="4" height="4" fill="#38bdf8"/><rect x="7" y="7" width="2" height="2" fill="#e0f2fe"/>',
  energy: '<rect x="8" y="1" width="4" height="2" fill="#fef08a"/><rect x="7" y="3" width="4" height="2" fill="#facc15"/><rect x="5" y="5" width="6" height="2" fill="#facc15"/><rect x="4" y="7" width="8" height="2" fill="#eab308"/><rect x="6" y="9" width="5" height="2" fill="#facc15"/><rect x="5" y="11" width="4" height="2" fill="#ca8a04"/><rect x="4" y="13" width="3" height="2" fill="#a16207"/>',
  'pickaxe-1': '<rect x="3" y="3" width="7" height="2" fill="#94a3b8"/><rect x="9" y="4" width="3" height="3" fill="#cbd5e1"/><rect x="11" y="6" width="2" height="4" fill="#64748b"/><rect x="8" y="6" width="2" height="2" fill="#92400e"/><rect x="6" y="8" width="2" height="2" fill="#b45309"/><rect x="4" y="10" width="2" height="2" fill="#92400e"/><rect x="2" y="12" width="2" height="2" fill="#78350f"/>',
  'pickaxe-2': '<rect x="3" y="2" width="8" height="2" fill="#60a5fa"/><rect x="9" y="3" width="4" height="3" fill="#3b82f6"/><rect x="11" y="6" width="2" height="4" fill="#1d4ed8"/><rect x="4" y="3" width="3" height="1" fill="#bfdbfe"/><rect x="8" y="6" width="2" height="2" fill="#92400e"/><rect x="6" y="8" width="2" height="2" fill="#b45309"/><rect x="4" y="10" width="2" height="2" fill="#92400e"/><rect x="2" y="12" width="2" height="2" fill="#78350f"/>',
  'pickaxe-3': '<rect x="3" y="2" width="8" height="2" fill="#38bdf8"/><rect x="9" y="3" width="4" height="3" fill="#0ea5e9"/><rect x="11" y="6" width="2" height="4" fill="#0284c7"/><rect x="5" y="3" width="4" height="1" fill="#e0f2fe"/><rect x="10" y="4" width="2" height="1" fill="#7dd3fc"/><rect x="8" y="6" width="2" height="2" fill="#d97706"/><rect x="6" y="8" width="2" height="2" fill="#f59e0b"/><rect x="4" y="10" width="2" height="2" fill="#d97706"/><rect x="2" y="12" width="2" height="2" fill="#92400e"/>',
  'battery-2': '<rect x="6" y="2" width="4" height="2" fill="#94a3b8"/><rect x="4" y="4" width="8" height="10" fill="#1e293b"/><rect x="5" y="5" width="6" height="8" fill="#0f172a"/><rect x="5" y="6" width="6" height="2" fill="#2ee87a"/><rect x="5" y="9" width="6" height="2" fill="#22c55e"/><rect x="5" y="12" width="6" height="1" fill="#16a34a"/>',

  // ---- Placeable Plot Buildings & Decor ----
  'chip-rig': '<rect x="2" y="11" width="12" height="3" fill="#334155"/><rect x="3" y="4" width="10" height="7" fill="#1e293b"/><rect x="4" y="5" width="8" height="5" fill="#0f172a"/><rect x="5" y="6" width="6" height="3" fill="#0052ff"/><rect x="6" y="7" width="4" height="1" fill="#38bdf8"/><rect x="4" y="2" width="2" height="2" fill="#ffc83d"/><rect x="10" y="2" width="2" height="2" fill="#2ee87a"/>',
  'stock-tower': '<rect x="5" y="2" width="6" height="12" fill="#1e293b"/><rect x="6" y="1" width="4" height="1" fill="#38bdf8"/><rect x="7" y="0" width="2" height="1" fill="#2ee87a"/><rect x="6" y="4" width="1" height="2" fill="#2ee87a"/><rect x="9" y="4" width="1" height="2" fill="#2ee87a"/><rect x="6" y="7" width="1" height="2" fill="#38bdf8"/><rect x="9" y="7" width="1" height="2" fill="#38bdf8"/><rect x="6" y="10" width="1" height="2" fill="#2ee87a"/><rect x="9" y="10" width="1" height="2" fill="#2ee87a"/><rect x="3" y="13" width="10" height="2" fill="#334155"/>',
  'x402-booth': '<rect x="3" y="4" width="10" height="9" fill="#0f172a"/><rect x="4" y="5" width="8" height="5" fill="#1e1b4b"/><rect x="5" y="6" width="6" height="3" fill="#a855f7"/><rect x="6" y="7" width="4" height="1" fill="#e9d5ff"/><rect x="7" y="1" width="2" height="3" fill="#94a3b8"/><rect x="6" y="1" width="4" height="1" fill="#2ee87a"/><rect x="2" y="13" width="12" height="2" fill="#334155"/>',
  billboard: '<rect x="2" y="2" width="12" height="8" fill="#1e293b"/><rect x="3" y="3" width="10" height="6" fill="#0052ff"/><rect x="4" y="4" width="8" height="2" fill="#ffc83d"/><rect x="4" y="7" width="5" height="1" fill="#e0f2fe"/><rect x="5" y="10" width="2" height="5" fill="#64748b"/><rect x="9" y="10" width="2" height="5" fill="#64748b"/>',
  'neon-lamp': '<rect x="6" y="1" width="4" height="5" fill="#38bdf8"/><rect x="7" y="2" width="2" height="3" fill="#e0f2fe"/><rect x="5" y="6" width="6" height="1" fill="#0284c7"/><rect x="7" y="7" width="2" height="7" fill="#64748b"/><rect x="5" y="14" width="6" height="1" fill="#334155"/>',
  'voxel-tree': '<rect x="5" y="2" width="6" height="3" fill="#4ade80"/><rect x="3" y="5" width="10" height="4" fill="#22c55e"/><rect x="4" y="9" width="8" height="2" fill="#16a34a"/><rect x="7" y="11" width="2" height="4" fill="#92400e"/><rect x="6" y="14" width="4" height="1" fill="#78350f"/>',
  'gold-statue': '<rect x="6" y="2" width="4" height="4" fill="#fde047"/><rect x="7" y="3" width="2" height="2" fill="#fef9c3"/><rect x="5" y="6" width="6" height="4" fill="#facc15"/><rect x="4" y="7" width="1" height="3" fill="#eab308"/><rect x="11" y="7" width="1" height="3" fill="#eab308"/><rect x="6" y="10" width="4" height="2" fill="#ca8a04"/><rect x="3" y="12" width="10" height="3" fill="#475569"/>',

  // ---- Wave 2: Consumables ----
  'gm-espresso': '<rect x="5" y="1" width="1" height="2" fill="#e0f2fe"/><rect x="8" y="1" width="1" height="2" fill="#fde047"/><rect x="10" y="2" width="1" height="2" fill="#e0f2fe"/><rect x="3" y="5" width="8" height="8" fill="#f8fafc"/><rect x="4" y="6" width="6" height="2" fill="#78350f"/><rect x="4" y="8" width="6" height="4" fill="#0052ff"/><rect x="6" y="9" width="2" height="2" fill="#ffc83d"/><rect x="11" y="6" width="2" height="1" fill="#cbd5e1"/><rect x="12" y="7" width="1" height="3" fill="#cbd5e1"/><rect x="11" y="10" width="2" height="1" fill="#cbd5e1"/><rect x="2" y="13" width="10" height="2" fill="#64748b"/>',
  'overclock-core': '<rect x="5" y="2" width="6" height="12" fill="#7f1d1d"/><rect x="2" y="5" width="12" height="6" fill="#7f1d1d"/><rect x="4" y="4" width="8" height="8" fill="#ef4444"/><rect x="5" y="5" width="6" height="6" fill="#f97316"/><rect x="6" y="6" width="4" height="4" fill="#fde047"/><rect x="7" y="7" width="2" height="2" fill="#ffffff"/><rect x="7" y="1" width="2" height="2" fill="#fb923c"/><rect x="7" y="13" width="2" height="2" fill="#fb923c"/><rect x="1" y="7" width="2" height="2" fill="#fb923c"/><rect x="13" y="7" width="2" height="2" fill="#fb923c"/>',
  'warp-beacon': '<rect x="7" y="1" width="2" height="3" fill="#e0f2fe"/><rect x="6" y="4" width="4" height="3" fill="#38bdf8"/><rect x="5" y="7" width="6" height="3" fill="#0052ff"/><rect x="7" y="5" width="2" height="3" fill="#ffffff"/><rect x="4" y="10" width="8" height="2" fill="#1e293b"/><rect x="2" y="12" width="12" height="3" fill="#334155"/><rect x="4" y="13" width="8" height="1" fill="#38bdf8"/>',

  // ---- Wave 1: Tasks, Rewards & Worker Badges ----
  'task-research': '<rect x="4" y="2" width="9" height="12" fill="#fef3c7"/><rect x="3" y="2" width="10" height="2" fill="#d97706"/><rect x="3" y="12" width="10" height="2" fill="#d97706"/><rect x="6" y="5" width="5" height="1" fill="#92400e"/><rect x="6" y="7" width="4" height="1" fill="#92400e"/><rect x="6" y="9" width="5" height="1" fill="#0052ff"/>',
  'task-dev': '<rect x="2" y="3" width="12" height="9" fill="#1e293b"/><rect x="3" y="4" width="10" height="7" fill="#0f172a"/><rect x="4" y="6" width="2" height="1" fill="#2ee87a"/><rect x="5" y="7" width="2" height="1" fill="#2ee87a"/><rect x="4" y="8" width="2" height="1" fill="#2ee87a"/><rect x="8" y="8" width="4" height="1" fill="#38bdf8"/><rect x="6" y="12" width="4" height="1" fill="#64748b"/><rect x="4" y="13" width="8" height="1" fill="#475569"/>',
  'task-design': '<rect x="10" y="2" width="3" height="3" fill="#f43f5e"/><rect x="8" y="4" width="3" height="3" fill="#fb7185"/><rect x="6" y="7" width="3" height="2" fill="#cbd5e1"/><rect x="4" y="9" width="2" height="2" fill="#b45309"/><rect x="2" y="11" width="2" height="3" fill="#78350f"/>',
  'task-social': '<rect x="9" y="3" width="4" height="7" fill="#ffc83d"/><rect x="6" y="5" width="3" height="4" fill="#f59e0b"/><rect x="3" y="6" width="3" height="2" fill="#94a3b8"/><rect x="5" y="9" width="2" height="4" fill="#475569"/><rect x="13" y="5" width="1" height="3" fill="#fde047"/>',
  'task-onchain': '<rect x="2" y="5" width="6" height="6" fill="#0052ff"/><rect x="3" y="6" width="4" height="4" fill="#0f172a"/><rect x="8" y="5" width="6" height="6" fill="#38bdf8"/><rect x="9" y="6" width="4" height="4" fill="#0f172a"/><rect x="6" y="7" width="4" height="2" fill="#ffffff"/>',
  'coin-usdc': '<rect x="5" y="2" width="6" height="12" fill="#2563eb"/><rect x="3" y="4" width="10" height="8" fill="#2563eb"/><rect x="4" y="3" width="8" height="10" fill="#3b82f6"/><rect x="7" y="4" width="2" height="8" fill="#ffffff"/><rect x="6" y="5" width="4" height="2" fill="#ffffff"/><rect x="6" y="9" width="4" height="2" fill="#ffffff"/>',
  'stock-cert': '<rect x="2" y="3" width="12" height="10" fill="#ecfdf5"/><rect x="3" y="4" width="10" height="8" fill="#0f172a"/><rect x="4" y="9" width="2" height="2" fill="#2ee87a"/><rect x="7" y="7" width="2" height="4" fill="#2ee87a"/><rect x="10" y="5" width="2" height="6" fill="#4ade80"/><rect x="11" y="11" width="3" height="3" fill="#ffc83d"/>',
  'escrow-chest': '<rect x="2" y="4" width="12" height="10" fill="#92400e"/><rect x="3" y="5" width="10" height="3" fill="#b45309"/><rect x="2" y="8" width="12" height="1" fill="#0f172a"/><rect x="7" y="7" width="2" height="3" fill="#ffc83d"/><rect x="3" y="9" width="10" height="4" fill="#78350f"/>',
  'badge-citizen': '<rect x="5" y="2" width="6" height="5" fill="#60a5fa"/><rect x="6" y="3" width="4" height="3" fill="#bfdbfe"/><rect x="3" y="8" width="10" height="6" fill="#0052ff"/><rect x="6" y="9" width="4" height="2" fill="#ffffff"/>',
  'badge-agent': '<rect x="4" y="3" width="8" height="8" fill="#1e293b"/><rect x="5" y="4" width="6" height="6" fill="#0f172a"/><rect x="6" y="6" width="2" height="2" fill="#2ee87a"/><rect x="9" y="6" width="2" height="2" fill="#2ee87a"/><rect x="7" y="1" width="2" height="2" fill="#2ee87a"/><rect x="3" y="11" width="10" height="3" fill="#334155"/>',

  // ---- Wave 1: City Atlas / Map & Building Emblems ----
  'compass-gold': '<rect x="5" y="2" width="6" height="12" fill="#d97706"/><rect x="2" y="5" width="12" height="6" fill="#d97706"/><rect x="4" y="4" width="8" height="8" fill="#0f172a"/><rect x="7" y="4" width="2" height="4" fill="#ef4444"/><rect x="7" y="8" width="2" height="4" fill="#e2e8f0"/><rect x="7" y="7" width="2" height="2" fill="#ffc83d"/>',
  'poi-stocks': '<rect x="2" y="8" width="3" height="6" fill="#16a34a"/><rect x="6" y="5" width="3" height="9" fill="#22c55e"/><rect x="10" y="2" width="4" height="12" fill="#2ee87a"/><rect x="11" y="4" width="2" height="2" fill="#ecfdf5"/>',
  'poi-exchange': '<rect x="2" y="4" width="12" height="8" fill="#1e293b"/><rect x="4" y="5" width="6" height="2" fill="#38bdf8"/><rect x="9" y="4" width="2" height="4" fill="#38bdf8"/><rect x="6" y="9" width="6" height="2" fill="#2ee87a"/><rect x="5" y="8" width="2" height="4" fill="#2ee87a"/>',
  'poi-x402': '<rect x="3" y="3" width="10" height="10" fill="#581c87"/><rect x="4" y="4" width="8" height="8" fill="#0f172a"/><rect x="5" y="6" width="2" height="2" fill="#a855f7"/><rect x="9" y="6" width="2" height="2" fill="#a855f7"/><rect x="6" y="9" width="4" height="1" fill="#2ee87a"/><rect x="7" y="1" width="2" height="2" fill="#c084fc"/>',
  'poi-tasks': '<rect x="3" y="2" width="10" height="12" fill="#92400e"/><rect x="4" y="3" width="8" height="10" fill="#fef3c7"/><rect x="5" y="5" width="6" height="1" fill="#0052ff"/><rect x="5" y="7" width="5" height="1" fill="#0f172a"/><rect x="5" y="9" width="6" height="1" fill="#16a34a"/><rect x="6" y="1" width="4" height="2" fill="#ffc83d"/>',
  'poi-usdc': '<rect x="2" y="4" width="12" height="2" fill="#60a5fa"/><rect x="4" y="2" width="8" height="2" fill="#93c5fd"/><rect x="3" y="6" width="2" height="6" fill="#cbd5e1"/><rect x="7" y="6" width="2" height="6" fill="#cbd5e1"/><rect x="11" y="6" width="2" height="6" fill="#cbd5e1"/><rect x="2" y="12" width="12" height="2" fill="#2563eb"/>',
  'poi-morpho': '<rect x="3" y="3" width="10" height="10" fill="#1e293b"/><rect x="4" y="4" width="8" height="8" fill="#0f172a"/><rect x="6" y="6" width="4" height="4" fill="#38bdf8"/><rect x="7" y="7" width="2" height="2" fill="#0f172a"/><rect x="10" y="7" width="2" height="2" fill="#ffc83d"/><rect x="4" y="13" width="2" height="1" fill="#64748b"/><rect x="10" y="13" width="2" height="1" fill="#64748b"/>',
  'poi-launch': '<rect x="7" y="1" width="2" height="2" fill="#e2e8f0"/><rect x="6" y="3" width="4" height="7" fill="#f8fafc"/><rect x="7" y="5" width="2" height="2" fill="#38bdf8"/><rect x="4" y="8" width="2" height="3" fill="#ef4444"/><rect x="10" y="8" width="2" height="3" fill="#ef4444"/><rect x="6" y="10" width="4" height="2" fill="#f97316"/><rect x="7" y="12" width="2" height="3" fill="#fde047"/>',
  'poi-ranks': '<rect x="4" y="2" width="8" height="6" fill="#ffc83d"/><rect x="2" y="3" width="2" height="3" fill="#eab308"/><rect x="12" y="3" width="2" height="3" fill="#eab308"/><rect x="6" y="8" width="4" height="3" fill="#d97706"/><rect x="4" y="11" width="8" height="3" fill="#92400e"/><rect x="6" y="3" width="2" height="2" fill="#fef9c3"/>',
  'poi-live': '<rect x="4" y="4" width="8" height="8" fill="#0f172a"/><rect x="6" y="6" width="4" height="4" fill="#2ee87a"/><rect x="7" y="7" width="2" height="2" fill="#ffffff"/><rect x="2" y="6" width="1" height="4" fill="#38bdf8"/><rect x="13" y="6" width="1" height="4" fill="#38bdf8"/><rect x="6" y="2" width="4" height="1" fill="#38bdf8"/><rect x="6" y="13" width="4" height="1" fill="#38bdf8"/>',
  'poi-cinema': '<rect x="2" y="6" width="12" height="8" fill="#1e293b"/><rect x="2" y="3" width="12" height="3" fill="#ef4444"/><rect x="4" y="3" width="2" height="3" fill="#ffffff"/><rect x="8" y="3" width="2" height="3" fill="#ffffff"/><rect x="12" y="3" width="2" height="3" fill="#ffffff"/><rect x="6" y="8" width="4" height="4" fill="#ffc83d"/>',
  'poi-quarry': '<rect x="3" y="10" width="10" height="4" fill="#475569"/><rect x="5" y="4" width="4" height="6" fill="#60a5fa"/><rect x="9" y="6" width="3" height="4" fill="#38bdf8"/><rect x="6" y="5" width="2" height="2" fill="#e0f2fe"/>',
  'poi-solar': '<rect x="2" y="4" width="12" height="7" fill="#1d4ed8"/><rect x="3" y="5" width="4" height="2" fill="#38bdf8"/><rect x="9" y="5" width="4" height="2" fill="#38bdf8"/><rect x="3" y="8" width="4" height="2" fill="#60a5fa"/><rect x="9" y="8" width="4" height="2" fill="#60a5fa"/><rect x="7" y="11" width="2" height="3" fill="#94a3b8"/><rect x="5" y="13" width="6" height="1" fill="#64748b"/>',
  'poi-fab': '<rect x="3" y="3" width="10" height="10" fill="#334155"/><rect x="5" y="5" width="6" height="6" fill="#0052ff"/><rect x="7" y="7" width="2" height="2" fill="#ffc83d"/><rect x="1" y="6" width="2" height="1" fill="#ffc83d"/><rect x="1" y="9" width="2" height="1" fill="#ffc83d"/><rect x="13" y="6" width="2" height="1" fill="#ffc83d"/><rect x="13" y="9" width="2" height="1" fill="#ffc83d"/>',
  'poi-plot': '<rect x="3" y="9" width="10" height="5" fill="#78350f"/><rect x="2" y="6" width="12" height="4" fill="#22c55e"/><rect x="4" y="4" width="8" height="3" fill="#4ade80"/><rect x="6" y="5" width="4" height="2" fill="#ffc83d"/>',
  'poi-shop': '<rect x="2" y="3" width="12" height="3" fill="#ef4444"/><rect x="4" y="3" width="2" height="3" fill="#ffffff"/><rect x="8" y="3" width="2" height="3" fill="#ffffff"/><rect x="12" y="3" width="2" height="3" fill="#ffffff"/><rect x="3" y="6" width="10" height="8" fill="#1e293b"/><rect x="5" y="8" width="6" height="4" fill="#ffc83d"/>',
  'poi-news': '<rect x="3" y="2" width="10" height="12" fill="#e2e8f0"/><rect x="4" y="3" width="8" height="2" fill="#0052ff"/><rect x="4" y="6" width="4" height="4" fill="#38bdf8"/><rect x="9" y="6" width="3" height="1" fill="#475569"/><rect x="9" y="8" width="3" height="1" fill="#475569"/><rect x="4" y="11" width="8" height="1" fill="#64748b"/>',

  // ---- Wave 1: User Profile Coins, Buffs, Passport Stamps, Quests ----
  'coin-eth': '<rect x="7" y="1" width="2" height="2" fill="#cbd5e1"/><rect x="6" y="3" width="4" height="2" fill="#94a3b8"/><rect x="4" y="5" width="8" height="3" fill="#e2e8f0"/><rect x="5" y="8" width="6" height="2" fill="#64748b"/><rect x="6" y="10" width="4" height="2" fill="#94a3b8"/><rect x="7" y="12" width="2" height="3" fill="#cbd5e1"/>',
  'coin-blocky': '<rect x="4" y="2" width="8" height="12" fill="#eab308"/><rect x="2" y="4" width="12" height="8" fill="#eab308"/><rect x="4" y="4" width="8" height="8" fill="#facc15"/><rect x="6" y="5" width="4" height="6" fill="#0f172a"/><rect x="7" y="6" width="2" height="1" fill="#fef08a"/><rect x="7" y="9" width="2" height="1" fill="#fef08a"/>',
  'coin-basecity': '<rect x="4" y="2" width="8" height="12" fill="#0052ff"/><rect x="2" y="4" width="12" height="8" fill="#0052ff"/><rect x="4" y="4" width="8" height="8" fill="#3b82f6"/><rect x="5" y="7" width="6" height="2" fill="#ffffff"/><rect x="6" y="5" width="4" height="2" fill="#ffc83d"/>',
  'buff-ai': '<rect x="4" y="4" width="8" height="8" fill="#a855f7"/><rect x="6" y="6" width="4" height="4" fill="#f3e8ff"/><rect x="7" y="2" width="2" height="2" fill="#c084fc"/><rect x="7" y="12" width="2" height="2" fill="#c084fc"/>',
  'buff-speed': '<rect x="4" y="3" width="4" height="6" fill="#38bdf8"/><rect x="4" y="9" width="9" height="4" fill="#0052ff"/><rect x="9" y="7" width="4" height="2" fill="#ffc83d"/><rect x="3" y="12" width="10" height="2" fill="#e2e8f0"/>',
  'buff-cap': '<rect x="4" y="2" width="8" height="8" fill="#22c55e"/><rect x="5" y="10" width="6" height="2" fill="#16a34a"/><rect x="7" y="12" width="2" height="2" fill="#15803d"/><rect x="6" y="4" width="4" height="4" fill="#bbf7d0"/>',
  'stamp-lit': '<rect x="4" y="2" width="8" height="12" fill="#16a34a"/><rect x="2" y="4" width="12" height="8" fill="#16a34a"/><rect x="4" y="4" width="8" height="8" fill="#2ee87a"/><rect x="5" y="8" width="2" height="2" fill="#0b1220"/><rect x="7" y="9" width="2" height="2" fill="#0b1220"/><rect x="9" y="6" width="2" height="3" fill="#0b1220"/>',
  'stamp-dim': '<rect x="4" y="2" width="8" height="12" fill="#262a33"/><rect x="2" y="4" width="12" height="8" fill="#262a33"/><rect x="4" y="4" width="8" height="8" fill="#14161b"/><rect x="6" y="6" width="4" height="4" fill="#334155"/>',
  'quest-medal': '<rect x="5" y="1" width="2" height="5" fill="#ef4444"/><rect x="9" y="1" width="2" height="5" fill="#0052ff"/><rect x="4" y="6" width="8" height="8" fill="#facc15"/><rect x="5" y="7" width="6" height="6" fill="#fde047"/><rect x="7" y="8" width="2" height="4" fill="#b45309"/>',
  'reward-chest': '<rect x="2" y="4" width="12" height="10" fill="#ca8a04"/><rect x="3" y="5" width="10" height="3" fill="#facc15"/><rect x="2" y="8" width="12" height="1" fill="#0f172a"/><rect x="7" y="7" width="2" height="3" fill="#e0f2fe"/><rect x="3" y="9" width="10" height="4" fill="#a16207"/>',

  // ---- Wave 1: Base Daily Newsstand ----
  'news-stocks': '<rect x="3" y="10" width="2" height="4" fill="#ef4444"/><rect x="7" y="6" width="2" height="8" fill="#2ee87a"/><rect x="11" y="3" width="2" height="11" fill="#2ee87a"/><rect x="4" y="8" width="1" height="2" fill="#fca5a5"/><rect x="12" y="1" width="1" height="2" fill="#bbf7d0"/>',
  'news-task': '<rect x="3" y="2" width="10" height="12" fill="#fef3c7"/><rect x="5" y="4" width="6" height="2" fill="#f59e0b"/><rect x="5" y="7" width="6" height="1" fill="#0f172a"/><rect x="5" y="9" width="4" height="1" fill="#0f172a"/><rect x="9" y="9" width="3" height="3" fill="#2ee87a"/>',
  'news-flywheel': '<rect x="6" y="1" width="4" height="2" fill="#38bdf8"/><rect x="6" y="13" width="4" height="2" fill="#38bdf8"/><rect x="1" y="6" width="2" height="4" fill="#38bdf8"/><rect x="13" y="6" width="2" height="4" fill="#38bdf8"/><rect x="4" y="4" width="8" height="8" fill="#0052ff"/><rect x="6" y="6" width="4" height="4" fill="#0f172a"/>',
  'news-defi': '<rect x="3" y="3" width="10" height="10" fill="#1e293b"/><rect x="5" y="5" width="6" height="6" fill="#2ee87a"/><rect x="6" y="6" width="4" height="4" fill="#0f172a"/><rect x="7" y="7" width="2" height="2" fill="#ffc83d"/>',
  newspaper: '<rect x="2" y="2" width="12" height="12" fill="#f1f5f9"/><rect x="3" y="3" width="10" height="2" fill="#0052ff"/><rect x="3" y="6" width="5" height="4" fill="#60a5fa"/><rect x="9" y="6" width="4" height="1" fill="#334155"/><rect x="9" y="8" width="4" height="1" fill="#334155"/><rect x="3" y="11" width="10" height="1" fill="#64748b"/>',

  // ---- Wave 1 & 2: Ranks, Locker Gems & Onchain Headers ----
  'crown-gold': '<rect x="2" y="5" width="2" height="7" fill="#facc15"/><rect x="7" y="3" width="2" height="9" fill="#fde047"/><rect x="12" y="5" width="2" height="7" fill="#facc15"/><rect x="2" y="8" width="12" height="4" fill="#eab308"/><rect x="2" y="12" width="12" height="2" fill="#ca8a04"/><rect x="7" y="9" width="2" height="2" fill="#ef4444"/><rect x="4" y="9" width="1" height="2" fill="#38bdf8"/><rect x="11" y="9" width="1" height="2" fill="#38bdf8"/>',
  'medal-silver': '<rect x="5" y="1" width="6" height="4" fill="#3b82f6"/><rect x="4" y="5" width="8" height="8" fill="#cbd5e1"/><rect x="5" y="6" width="6" height="6" fill="#f1f5f9"/><rect x="7" y="7" width="2" height="4" fill="#64748b"/>',
  'medal-bronze': '<rect x="5" y="1" width="6" height="4" fill="#b45309"/><rect x="4" y="5" width="8" height="8" fill="#d97706"/><rect x="5" y="6" width="6" height="6" fill="#f59e0b"/><rect x="7" y="7" width="2" height="4" fill="#78350f"/>',
  'tab-earners': '<rect x="3" y="9" width="10" height="4" fill="#16a34a"/><rect x="4" y="6" width="8" height="3" fill="#22c55e"/><rect x="5" y="3" width="6" height="3" fill="#4ade80"/>',
  'tab-employers': '<rect x="5" y="3" width="6" height="2" fill="#94a3b8"/><rect x="2" y="5" width="12" height="8" fill="#b45309"/><rect x="7" y="8" width="2" height="2" fill="#ffc83d"/>',
  'tab-whales': '<rect x="5" y="3" width="6" height="2" fill="#e0f2fe"/><rect x="3" y="5" width="10" height="4" fill="#38bdf8"/><rect x="5" y="9" width="6" height="2" fill="#0284c7"/><rect x="7" y="11" width="2" height="2" fill="#0369a1"/>',
  'tab-builders': '<rect x="3" y="3" width="7" height="3" fill="#94a3b8"/><rect x="5" y="6" width="3" height="8" fill="#d97706"/><rect x="10" y="4" width="3" height="2" fill="#cbd5e1"/>',
  'gem-common': '<rect x="6" y="3" width="4" height="2" fill="#cbd5e1"/><rect x="4" y="5" width="8" height="5" fill="#94a3b8"/><rect x="6" y="10" width="4" height="3" fill="#64748b"/>',
  'gem-uncommon': '<rect x="6" y="3" width="4" height="2" fill="#bbf7d0"/><rect x="4" y="5" width="8" height="5" fill="#2ee87a"/><rect x="6" y="10" width="4" height="3" fill="#16a34a"/>',
  'gem-rare': '<rect x="6" y="3" width="4" height="2" fill="#bae6fd"/><rect x="4" y="5" width="8" height="5" fill="#38bdf8"/><rect x="6" y="10" width="4" height="3" fill="#0052ff"/>',
  'gem-legendary': '<rect x="6" y="2" width="4" height="2" fill="#fef9c3"/><rect x="3" y="4" width="10" height="6" fill="#ffc83d"/><rect x="5" y="10" width="6" height="3" fill="#d97706"/><rect x="6" y="5" width="2" height="2" fill="#ffffff"/>',
  'basket-chest': '<rect x="2" y="5" width="12" height="9" fill="#0052ff"/><rect x="3" y="6" width="10" height="3" fill="#3b82f6"/><rect x="4" y="3" width="3" height="2" fill="#2ee87a"/><rect x="9" y="3" width="3" height="2" fill="#ffc83d"/><rect x="7" y="8" width="2" height="3" fill="#fde047"/>',
  'user-avatar': '<rect x="4" y="2" width="8" height="6" fill="#0052ff"/><rect x="5" y="4" width="6" height="3" fill="#93c5fd"/><rect x="6" y="5" width="1" height="1" fill="#0f172a"/><rect x="9" y="5" width="1" height="1" fill="#0f172a"/><rect x="3" y="9" width="10" height="5" fill="#1e293b"/><rect x="6" y="10" width="4" height="3" fill="#ffc83d"/>',
};

/** Beveled Minecraft inventory slot wrapping a 16x16 pixel SVG sprite. */
export function itemSprite(id, size = 32, extraClass = '') {
  const art = ITEM_ART[id] || ITEM_ART.silicon;
  const cls = extraClass ? `mc-slot ${extraClass}` : 'mc-slot';
  return `<span class="${cls}" style="width:${size}px;height:${size}px" aria-hidden="true"><svg viewBox="0 0 16 16" shape-rendering="crispEdges">${art}</svg></span>`;
}

/** Bare inline pixel SVG sprite (for compact dock buttons, tabs, badges, and pills). */
export function itemIcon(id, size = 18, extraClass = '') {
  const art = ITEM_ART[id] || ITEM_ART.silicon;
  const cls = extraClass ? `mc-ico ${extraClass}` : 'mc-ico';
  return `<span class="${cls}" style="width:${size}px;height:${size}px" aria-hidden="true"><svg viewBox="0 0 16 16" shape-rendering="crispEdges">${art}</svg></span>`;
}

export function taskCategorySpriteId(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('blue') || c.includes('agent')) return 'badge-agent';
  if (c.includes('build') || c.includes('dev')) return 'task-dev';
  if (c.includes('design')) return 'task-design';
  if (c.includes('content') || c.includes('social')) return 'task-social';
  if (c.includes('onchain')) return 'task-onchain';
  return 'task-research';
}

export function poiSpriteId(id) {
  const map = {
    stocks: 'poi-stocks',
    exchange: 'poi-exchange',
    x402: 'poi-x402',
    tasks: 'poi-tasks',
    usdc: 'poi-usdc',
    morpho: 'poi-morpho',
    launch: 'poi-launch',
    ranks: 'poi-ranks',
    live: 'poi-live',
    cinema: 'poi-cinema',
    quarry: 'poi-quarry',
    solar: 'poi-solar',
    fab: 'poi-fab',
    plot: 'poi-plot',
    shop: 'poi-shop',
    news: 'poi-news',
  };
  return map[id] || 'compass-gold';
}

export function rarityGemId(rarityId) {
  const r = String(rarityId || '').toLowerCase();
  if (r.includes('legend') || r.includes('mythic')) return 'gem-legendary';
  if (r.includes('rare') || r.includes('epic')) return 'gem-rare';
  if (r.includes('uncommon')) return 'gem-uncommon';
  return 'gem-common';
}
