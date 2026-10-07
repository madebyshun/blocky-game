// The About page: the rules, filled in from the config and the live city.
import { CONFIG } from './config.js';
import { TRAIT_LABEL, LANDMARKS } from './sim.js';
import { fetchColony } from './data.js';
import { mountSite, fmt, basescan, opensea, nftInfo } from './site.js';

mountSite('about');
const $ = (id) => document.getElementById(id);
const fill = (cls, text) => { for (const el of document.querySelectorAll(cls)) el.textContent = text; };
fill('.tk', CONFIG.ticker);

fill('.supply', fmt(CONFIG.supply));
fill('.whale', fmt(CONFIG.whaleUsd));
fill('.royalty', String(CONFIG.nft.royaltyBps / 100));

$('odds').innerHTML = `<tr><th>Rarity</th><th>Traits</th><th class="n">Odds</th></tr>${[...CONFIG.rarity].reverse().map((r) => `<tr><td><span class="rarity ${r.id}">${r.label}</span></td><td>${r.traits.length ? r.traits.map((t) => TRAIT_LABEL[t]).join(', ') : '<small>the classic Blocky</small>'}</td><td class="n">${+(r.chance * 100).toFixed(1)}%</td></tr>`).join('')}`;

const goals = [...LANDMARKS, ...(CONFIG.metro ? [CONFIG.metro] : [])].filter((l) => l.at > 0).sort((a, b) => a.at - b.at);
$('goals').innerHTML = `<tr><th>${CONFIG.citizenPlural} in the city</th><th>Unlocks</th></tr>${goals.map((g) => `<tr><td class="n">${fmt(g.at)}</td><td>${g.brand ? `<a href="${g.brand.url}" target="_blank" rel="noopener">${g.label}</a> <small>· ${g.brand.tagline}</small>` : g.label}${g.pro ? ' <small>· needs a Base Builder on the crew</small>' : ''}</td></tr>`).join('')}`;

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const reserve = CONFIG.nft.reserve;
if (reserve?.count > 0 && reserve.wallet) {
  const line = $('reserve-line');
  line.hidden = false;
  line.innerHTML = `<b>Team reserve: ${CONFIG.citizenPlural} #1 to #${fmt(reserve.count)}</b> belong to the team wallet ${link(basescan(`address/${reserve.wallet}`), `${reserve.wallet.slice(0, 6)}…${reserve.wallet.slice(-4)}`)} from day one, for giveaways and partners. They were not bought, they count toward the ${fmt(CONFIG.supply)}, they never leave the city, they can be claimed as NFTs, and their metadata says "Team reserve".`;
}
function contracts(nft) {
  const rows = [[`${CONFIG.ticker} token`, link(basescan(`token/${CONFIG.tokenAddress}`), CONFIG.tokenAddress)]];
  rows.push([`${CONFIG.nft.name} (${CONFIG.nft.symbol})`, nft ? `${link(basescan(`address/${nft}`), nft)} · ${link(opensea(nft), 'OpenSea')}` : '<small>deploying soon</small>']);
  rows.push(['Treasury (royalties)', link(basescan(`address/${CONFIG.nft.treasury}`), CONFIG.nft.treasury)]);
  $('contracts').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  $('contract-line').innerHTML = nft ? `Contract: ${link(basescan(`address/${nft}`), nft)} on Base.` : 'The contract goes live soon; Blockies brought before that are saved and claimable then.';
}
contracts(CONFIG.nft.contract || null);

(async () => {
  const [state, nft] = await Promise.all([fetchColony().catch(() => null), nftInfo()]);
  contracts(nft.contract);
  if (!state) return;
  const demo = state.source === 'demo';
  $('live').innerHTML = [
    [`${CONFIG.citizenPlural} in the city`, `${fmt(state.minted)} <small>/ ${fmt(state.supply || CONFIG.supply)}</small>`],
    ['Bought so far', `$${fmt(state.boughtUsd || 0)}`],
    ['Whale Fountains', fmt(state.whales?.length || 0)],
  ].map(([k, v]) => `<div class="stat"><span class="k">${k}${demo ? ' (demo)' : ''}</span><span class="v">${v}</span></div>`).join('');
})();
