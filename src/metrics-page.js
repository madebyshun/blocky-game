// /metrics: what the Blockies earned, from /api/work-feed?metrics (settled payments only).
import { mountSite, esc, fmt } from './site.js';

mountSite('metrics');
const $ = (id) => document.getElementById(id);
const usd = (v) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

async function load() {
  const m = await fetch('/api/work-feed?metrics=1', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  if (!m?.totals) { $('mx-sum').innerHTML = '<div><b>—</b><span>numbers unavailable right now</span></div>'; return; }
  const t = m.totals, b = m.blockies;
  $('mx-sum').innerHTML = [
    [usd(t.earnedUsd), 'USDC earned (all time)'], [fmt(t.paidCalls), 'paid calls & jobs'], [usd(t.outsideUsd), `from ${fmt(t.outsidePayers)} outside payer${t.outsidePayers === 1 ? '' : 's'}`],
    [fmt(b.withOwnAgent), 'Blockies with their own agent'], [fmt(b.onDuty), 'on duty now'],
  ].map(([v, l]) => `<div><b>${v}</b><span>${esc(l)}</span></div>`).join('');

  const days = m.daily || [], max = Math.max(0.0001, ...days.map((d) => d.earnedUsd));
  $('mx-days').innerHTML = days.length ? days.map((d) => `<div class="mx-bar" title="${d.day}: ${usd(d.earnedUsd)} · ${d.calls} paid"><i style="height:${Math.max(4, (d.earnedUsd / max) * 100)}%"></i><span>${d.day.slice(5)}</span></div>`).join('') : '<p class="ag-note">No paid work yet.</p>';
  $('mx-days-note').textContent = days.length ? `${days.length} day${days.length === 1 ? '' : 's'} with paid work` : '';

  $('mx-guilds').innerHTML = (m.guilds || []).map((g) => `<div style="border-color:${g.color}"><b>${g.icon} ${esc(g.label)}</b><span>${usd(g.earnedUsd)}</span><em>${fmt(g.calls)} paid</em></div>`).join('');
  $('mx-skills').innerHTML = (m.skills || []).sort((a, b) => b.earnedUsd - a.earnedUsd || b.calls - a.calls).map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.guild)}</td><td>${fmt(s.calls)}</td><td>${usd(s.earnedUsd)}</td></tr>`).join('');
  $('mx-top').innerHTML = (m.topBlockies || []).map((x) => `<li><a href="/b/${x.blocky}">Blocky #${x.blocky}</a> <span>${usd(x.usd)}</span></li>`).join('') || '<li>No Blocky has been paid yet.</li>';
  $('mx-note').textContent = `${m.note} Team tests so far: ${t.teamTestCalls} calls, ${usd(t.teamTestUsd)}. Jobs delivered: ${t.jobsDelivered}, reports drafted: ${t.reportsDrafted}. Updated ${new Date(m.at).toLocaleString()}.`;
}
load();
setInterval(load, 60000);
