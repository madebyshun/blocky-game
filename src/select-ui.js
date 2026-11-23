// BaseCity custom Obsidian dropdown enhancer.
// Automatically upgrades all native <select> controls (static or dynamically rendered in modals)
// while keeping the underlying <select> synced for FormData, .value, .hidden, .disabled, and change events.

const CSS_ID = 'bc-select-ui-css';
const CSS = `
.bc-sel-native {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
  pointer-events: none !important;
}
.bc-sel {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
}
.bc-sel[hidden] { display: none !important; }
.bc-sel-btn {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #262a33;
  background: #0d0e11;
  color: #f5f7fb;
  font: 600 13px/1.35 Inter, system-ui, sans-serif;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.14s, background 0.14s, box-shadow 0.14s;
}
.bc-sel-btn:hover:not(:disabled) {
  border-color: #3a4152;
  background: #12151d;
}
.bc-sel-btn:focus-visible,
.bc-sel-btn.open {
  outline: none;
  border-color: #0052ff;
  background: #0d0e11;
  box-shadow: 0 0 0 2px rgba(0, 82, 255, 0.28);
}
.bc-sel-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}
.bc-sel-val {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}
.bc-sel-main {
  color: #f5f7fb;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bc-sel-sub {
  color: #9aa6b8;
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bc-sel-pill {
  margin-left: auto;
  flex: none;
  padding: 2px 6px;
  border-radius: 3px;
  font: 700 9.5px/1.2 'JetBrains Mono', ui-monospace, monospace;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid #262a33;
  background: #14161b;
  color: #9aa6b8;
}
.bc-sel-pill.active {
  background: rgba(46, 232, 122, 0.12);
  border-color: rgba(46, 232, 122, 0.36);
  color: #2ee87a;
}
.bc-sel-pill.pending {
  background: rgba(255, 200, 61, 0.12);
  border-color: rgba(255, 200, 61, 0.36);
  color: #ffc83d;
}
.bc-sel-chev {
  flex: none;
  width: 7px;
  height: 7px;
  border-right: 1.8px solid #9aa6b8;
  border-bottom: 1.8px solid #9aa6b8;
  transform: translateY(-2px) rotate(45deg);
  transition: transform 0.14s, border-color 0.14s;
}
.bc-sel-btn.open .bc-sel-chev {
  border-color: #7db1ff;
  transform: translateY(2px) rotate(-135deg);
}
.bc-sel-menu {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid #2b3242;
  background: #101218;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.72), 0 0 0 1px rgba(0, 82, 255, 0.14);
  max-height: 264px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #2c3446 transparent;
}
.bc-sel-menu::-webkit-scrollbar { width: 6px; }
.bc-sel-menu::-webkit-scrollbar-track { background: transparent; }
.bc-sel-menu::-webkit-scrollbar-thumb { background: #2c3446; border-radius: 4px; }
.bc-sel-opt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: #e2e8f0;
  font: 600 12.5px/1.35 Inter, system-ui, sans-serif;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}
.bc-sel-opt:hover:not(:disabled),
.bc-sel-opt.hi:not(:disabled) {
  background: #181d29;
  border-color: #2c3548;
  color: #ffffff;
}
.bc-sel-opt.sel {
  background: rgba(0, 82, 255, 0.2);
  border-color: rgba(0, 82, 255, 0.58);
  color: #ffffff;
}
.bc-sel-opt.sel::before {
  content: '';
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: #0052ff;
  flex: none;
}
.bc-sel-opt:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.bc-sel-empty {
  padding: 10px 12px;
  font: 600 12px Inter, system-ui, sans-serif;
  color: #9aa6b8;
  text-align: center;
}
.b10-swap-row .bc-sel { width: 108px; flex: none; }
.b10-swap-row .bc-sel-btn { min-height: 36px; padding: 7px 10px; background: #14161b; }
.whq-wk-pick .bc-sel-btn,
.whq-wk-console .bc-sel-btn { min-height: 34px; padding: 6px 10px; background: #14161b; font-size: 12.5px; }
`;

let activeMenu = null;
let initialized = false;
const selectProtoValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const selectProtoIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function parseOptionLabel(raw) {
  let text = String(raw || '').trim();
  let tag = '';
  let tagCls = '';
  const tagMatch = text.match(/\s*\((Active|Pending|Checking)\)\s*$/i);
  if (tagMatch) {
    tag = tagMatch[1];
    tagCls = tag.toLowerCase();
    text = text.slice(0, tagMatch.index).trim();
  }
  const splitIdx = text.indexOf(' — ');
  if (splitIdx > 0) {
    return {
      main: text.slice(0, splitIdx).trim(),
      sub: text.slice(splitIdx + 3).trim(),
      tag,
      tagCls,
    };
  }
  return { main: text || 'Select...', sub: '', tag, tagCls };
}

function renderLabelParts(container, raw) {
  const { main, sub, tag, tagCls } = parseOptionLabel(raw);
  container.textContent = '';
  const m = document.createElement('span');
  m.className = 'bc-sel-main';
  m.textContent = main;
  container.appendChild(m);
  if (sub) {
    const s = document.createElement('span');
    s.className = 'bc-sel-sub';
    s.textContent = sub;
    container.appendChild(s);
  }
  if (tag) {
    const p = document.createElement('span');
    p.className = `bc-sel-pill ${tagCls}`;
    p.textContent = tag;
    container.appendChild(p);
  }
}

function closeActiveMenu(restoreFocus = false) {
  if (!activeMenu) return;
  const { menu, btn } = activeMenu;
  menu.remove();
  btn.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
  activeMenu = null;
  if (restoreFocus && btn.isConnected) btn.focus();
}

function positionMenu(menu, btn) {
  const rect = btn.getBoundingClientRect();
  const margin = 8;
  const width = Math.max(rect.width, 160);
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  menu.style.width = `${width}px`;
  menu.style.left = `${left}px`;

  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const menuH = Math.min(264, menu.scrollHeight || 220);

  if (spaceBelow >= Math.min(menuH, 140) || spaceBelow >= spaceAbove) {
    menu.style.top = `${Math.round(rect.bottom + 4)}px`;
    menu.style.bottom = 'auto';
    menu.style.maxHeight = `${Math.max(110, Math.min(264, spaceBelow - 6))}px`;
  } else {
    menu.style.top = 'auto';
    menu.style.bottom = `${Math.round(window.innerHeight - rect.top + 4)}px`;
    menu.style.maxHeight = `${Math.max(110, Math.min(264, spaceAbove - 6))}px`;
  }
}

export function enhanceSelect(sel) {
  if (!(sel instanceof HTMLSelectElement)) return;
  if (sel.dataset.bcSelect === '1' || sel.dataset.nativeSelect === '1' || sel.multiple) return;
  ensureStyles();

  sel.dataset.bcSelect = '1';
  sel.classList.add('bc-sel-native');
  sel.tabIndex = -1;

  const box = document.createElement('div');
  box.className = 'bc-sel';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bc-sel-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');

  const valWrap = document.createElement('span');
  valWrap.className = 'bc-sel-val';
  const chev = document.createElement('span');
  chev.className = 'bc-sel-chev';
  chev.setAttribute('aria-hidden', 'true');
  btn.append(valWrap, chev);
  box.appendChild(btn);

  sel.after(box);

  let hiIndex = -1;

  const sync = () => {
    if (!sel.isConnected) {
      if (activeMenu?.sel === sel) closeActiveMenu(false);
      box.remove();
      return;
    }
    box.hidden = sel.hidden;
    btn.disabled = sel.disabled;
    const opt = sel.options[sel.selectedIndex] || sel.options[0];
    renderLabelParts(valWrap, opt ? opt.textContent : 'Select...');
    if (activeMenu?.sel === sel) {
      if (sel.hidden || sel.disabled) closeActiveMenu(false);
      else renderMenuItems();
    }
  };

  const selectIndex = (idx) => {
    const opt = sel.options[idx];
    if (!opt || opt.disabled) return;
    const changed = sel.selectedIndex !== idx;
    if (selectProtoIndex?.set) selectProtoIndex.set.call(sel, idx);
    else sel.selectedIndex = idx;
    sync();
    closeActiveMenu(true);
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const renderMenuItems = () => {
    if (!activeMenu || activeMenu.sel !== sel) return;
    const { menu } = activeMenu;
    menu.textContent = '';
    const opts = [...sel.options];
    if (!opts.length) {
      const empty = document.createElement('div');
      empty.className = 'bc-sel-empty';
      empty.textContent = 'No options available';
      menu.appendChild(empty);
      return;
    }
    opts.forEach((o, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'bc-sel-opt';
      if (idx === sel.selectedIndex) item.classList.add('sel');
      if (idx === hiIndex) item.classList.add('hi');
      item.disabled = o.disabled;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', idx === sel.selectedIndex ? 'true' : 'false');
      renderLabelParts(item, o.textContent);
      item.addEventListener('pointerenter', () => { hiIndex = idx; });
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectIndex(idx);
      });
      menu.appendChild(item);
    });
    positionMenu(menu, btn);
    const activeEl = menu.querySelector('.bc-sel-opt.sel');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  };

  const openMenu = () => {
    if (btn.disabled || sel.hidden) return;
    if (activeMenu?.sel === sel) {
      closeActiveMenu(false);
      return;
    }
    closeActiveMenu(false);
    const menu = document.createElement('div');
    menu.className = 'bc-sel-menu';
    menu.setAttribute('role', 'listbox');
    document.body.appendChild(menu);
    hiIndex = Math.max(0, sel.selectedIndex);
    activeMenu = { sel, btn, menu, renderMenuItems, selectIndex, getHi: () => hiIndex, setHi: (n) => { hiIndex = n; } };
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    renderMenuItems();
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu();
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (activeMenu?.sel !== sel) {
        openMenu();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (hiIndex >= 0) selectIndex(hiIndex);
        return;
      }
      const total = sel.options.length;
      if (!total) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      for (let step = 0; step < total; step++) {
        hiIndex = (hiIndex + dir + total) % total;
        if (!sel.options[hiIndex]?.disabled) break;
      }
      renderMenuItems();
    } else if (e.key === 'Escape' && activeMenu?.sel === sel) {
      e.preventDefault();
      e.stopPropagation();
      closeActiveMenu(true);
    }
  });

  // Intercept programmatic sel.value = ... and sel.selectedIndex = ... updates
  if (selectProtoValue?.get && selectProtoValue?.set) {
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get() { return selectProtoValue.get.call(this); },
      set(v) {
        selectProtoValue.set.call(this, v);
        sync();
      },
    });
  }
  if (selectProtoIndex?.get && selectProtoIndex?.set) {
    Object.defineProperty(sel, 'selectedIndex', {
      configurable: true,
      get() { return selectProtoIndex.get.call(this); },
      set(v) {
        selectProtoIndex.set.call(this, v);
        sync();
      },
    });
  }

  sel.addEventListener('change', sync);

  const obs = new MutationObserver(sync);
  obs.observe(sel, {
    attributes: true,
    attributeFilter: ['hidden', 'disabled'],
    childList: true,
    subtree: true,
    characterData: true,
  });

  sync();
}

export function initBaseCitySelects() {
  if (typeof document === 'undefined' || initialized) return;
  initialized = true;
  ensureStyles();

  const scan = (root) => {
    if (!root) return;
    if (root instanceof HTMLSelectElement) enhanceSelect(root);
    else if (root.querySelectorAll) root.querySelectorAll('select').forEach(enhanceSelect);
  };

  scan(document.body);

  const domObs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) scan(node);
      }
    }
  });
  domObs.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('pointerdown', (e) => {
    if (!activeMenu) return;
    if (activeMenu.menu.contains(e.target) || activeMenu.btn.contains(e.target)) return;
    closeActiveMenu(false);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!activeMenu) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeActiveMenu(true);
    }
  }, true);

  window.addEventListener('resize', () => closeActiveMenu(false));
  window.addEventListener('scroll', (e) => {
    if (!activeMenu) return;
    if (e.target === activeMenu.menu || activeMenu.menu.contains(e.target)) return;
    closeActiveMenu(false);
  }, true);
}
