// Present paid research as readable information; preserve the full response for inspection.
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => typeof v === 'number' && Number.isFinite(v);
const money = v => num(v) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v) : 'Unavailable';
const pct = v => num(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : 'Unavailable';
const link = (url, label) => {
  try { const u = new URL(url); if (u.protocol !== 'https:') return ''; return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`; } catch { return ''; }
};
const metric = (label,value,hint='') => `<div class="research-metric"><dt>${esc(label)}</dt><dd>${esc(value)}</dd>${hint ? `<small>${esc(hint)}</small>`:''}</div>`;
function readable(value, depth=0) {
  if (value == null) return '<span class="research-muted">Unavailable</span>';
  if (typeof value !== 'object') return `<span>${esc(value)}</span>`;
  if (depth > 4) return `<pre>${esc(JSON.stringify(value,null,2))}</pre>`;
  if (Array.isArray(value)) return value.length ? `<div class="research-items">${value.map((v,i)=>`<article><b>${esc(v?.ticker || v?.symbol || `Item ${i+1}`)}</b>${readable(v,depth+1)}</article>`).join('')}</div>` : '<span>No entries returned</span>';
  return `<dl class="research-fields">${Object.entries(value).map(([k,v])=>`<div><dt>${esc(k.replaceAll('_',' '))}</dt><dd>${readable(v,depth+1)}</dd></div>`).join('')}</dl>`;
}
export function renderAgentResult(value, title='Research result') {
  let data=value;
  if(typeof data === 'string') { try {data=JSON.parse(data);} catch {} }
  const raw = typeof data === 'string' ? data : JSON.stringify(data,null,2);
  const quote=data && typeof data === 'object' && data.dex && data.oracle;
  let content;
  if(quote) {
    const d=data.dex,o=data.oracle;
    content=`<div class="research-heading"><div><span class="research-eyebrow">BASE · STOCK RESEARCH</span><h4>${esc(data.name || data.ticker)} <span>${esc(data.symbol || '')}</span></h4></div><div class="research-price">${money(d.price_usd)}<small class="${num(d.change_24h_pct)&&d.change_24h_pct<0?'negative':'positive'}">${pct(d.change_24h_pct)} · 24h</small></div></div>
    <dl class="research-grid">${metric('Oracle share price',money(o.share_price_usd),'Chainlink reference')}${metric('Pool / oracle drift',pct(o.drift_pct),'Reported by Blue Agent')}${metric('24h volume',money(d.volume_24h_usd))}${metric('Pool liquidity',money(d.liquidity_usd))}</dl>
    <div class="research-notice"><b>Buy impact · ${esc(data.buy_impact?.status || 'Unavailable')}</b><p>${esc(data.buy_impact?.reason || 'No impact estimate returned.')}</p></div>
    <div class="research-provenance"><span>Oracle: ${o.feed_is_stale === true ? 'stale' : o.feed_is_stale === false ? 'not stale' : 'status unknown'}${num(o.feed_age_seconds)?` · ${Math.round(o.feed_age_seconds/60)} min old`:''}</span><span>${esc(d.source || '')}</span><span>${esc(o.source || '')}</span></div>
    <details><summary>Issuance & corporate actions</summary>${readable({issuance:data.issuance,corporate_actions:data.corporate_actions})}</details>
    <div class="research-links">${link(data.token_url,'Token on BaseScan')}${link(data.issuance?.prospectus,'Prospectus')}</div><p class="research-muted">${esc(data.note || '')}</p>`;
  } else content=typeof data === 'object' ? readable(data) : `<p class="research-text">${esc(data)}</p>`;
  const tx=data?.settle || data?._settle?.tx;
  return `<section class="research" aria-label="${esc(title)}"><div class="research-caption"><b>${esc(title)}</b>${data?.timestamp?`<time>${esc(new Date(data.timestamp).toLocaleString())}</time>`:''}</div>${content}<div class="research-receipt">${tx && /^0x[0-9a-f]{64}$/i.test(tx) ? link(`https://basescan.org/tx/${tx}`,'Payment receipt') : ''}<span>Source: Blue Agent · snapshot at job completion</span></div><details class="research-raw"><summary>Full response · JSON</summary><pre>${esc(raw)}</pre></details></section>`;
}
