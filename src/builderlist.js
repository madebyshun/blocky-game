// The Base Builders list: the founder and every Base Builder on the City Council, with a search. Picking
// one finds them in the city and the camera follows them (main.js). Same drawer as the city directory.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// crew(): every builder (founder, Base Builders, Blockies); here(id): are they out in the city now;
// onPick(b): find and follow them
export function createBuilderList({ crew, here, onPick }) {
  const el = document.createElement('aside');
  el.className = 'directory panel';
  el.hidden = true;
  el.innerHTML = `<div class="dir-head"><h3>👷 Base Builders <small id="bl-count"></small></h3><button type="button" class="dir-close" aria-label="Close">✕</button></div>
    <input id="bl-q" type="search" placeholder="Search a name, an office…" autocomplete="off" />
    <div class="dir-list" id="bl-list"></div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(`#${id}`);
  let items = [], timer = null;

  function render() {
    items = crew().filter((b) => b.kind === 'legend' || b.kind === 'founder');
    const q = $('bl-q').value.trim().toLowerCase();
    const office = (b) => b.office?.label || '';
    const title = (b) => b.legend?.title || '';
    const hit = (b) => !q || [b.name, office(b), title(b), b.legend?.x].some((s) => String(s || '').toLowerCase().includes(q));
    const list = items.filter(hit);
    $('bl-list').innerHTML = list.length
      ? `<ul>${list.map((b) => `<li><button type="button" data-id="${b.id}"${here(b.id) ? '' : ' class="away"'}><b>${esc(b.name)}</b><span>${esc([office(b), title(b)].filter((x, i, l) => x && !(i && l[0].toLowerCase().includes(x.toLowerCase()))).join(' · '))}${here(b.id) ? '' : ' · not on screen right now'}</span></button></li>`).join('')}</ul>`
      : '<p class="dir-empty">Nobody by that name.</p>';
    $('bl-count').textContent = `${items.length}`;
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('.dir-close')) return api.close();
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const b = items.find((x) => String(x.id) === btn.dataset.id);
    if (!b) return;
    for (const x of el.querySelectorAll('.on')) x.classList.remove('on');
    btn.classList.add('on');
    onPick(b);
    if (innerWidth <= 900) api.close(); // phones: get out of the way of the view
  });
  $('bl-q').addEventListener('input', render);
  el.addEventListener('keydown', (e) => e.stopPropagation()); // typing a search isn't a shortcut

  const api = {
    get open() { return !el.hidden; },
    show() { el.hidden = false; render(); clearInterval(timer); timer = setInterval(render, 5000); },
    close() { el.hidden = true; clearInterval(timer); },
    toggle() { if (el.hidden) api.show(); else api.close(); },
  };
  return api;
}
