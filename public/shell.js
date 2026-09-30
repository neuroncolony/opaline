/* Opaline shell: shared UI, data, wallet, swap and watchers. Exposes window.O */
(function(){
'use strict';
const O = window.O = {};
const $ = O.$ = (s, r=document) => r.querySelector(s);
const $$ = O.$$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = O.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
O.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------- formatting ---------- */
O.usd = (v, d) => {
  if (v == null || isNaN(v)) return '-';
  const a = Math.abs(v);
  if (d == null) d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return (v < 0 ? '-$' : '$') + a.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
};
O.compact = (v, pre='$') => {
  if (v == null || isNaN(v)) return '-';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  const f = (n, u) => s + pre + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + u;
  if (a >= 1e12) return f(a/1e12, 'T'); if (a >= 1e9) return f(a/1e9, 'B');
  if (a >= 1e6) return f(a/1e6, 'M'); if (a >= 1e3) return f(a/1e3, 'K');
  return s + pre + a.toFixed(a >= 1 ? 2 : 4);
};
O.pct = (v, d=2) => v == null || isNaN(v) ? '-' : (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%';
O.pctCls = v => v == null ? 'faint' : v >= 0 ? 'up' : 'down';
O.num = (v, d=4) => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('en-US', {maximumFractionDigits: d});
O.short = a => a ? a.slice(0, 6) + '...' + a.slice(-4) : '';
O.ago = ts => { const s = Math.max(1, (Date.now() - ts) / 1000); if (s < 60) return Math.floor(s) + 's ago'; if (s < 3600) return Math.floor(s/60) + 'm ago'; if (s < 86400) return Math.floor(s/3600) + 'h ago'; return Math.floor(s/86400) + 'd ago'; };
O.CLASS = {stock:{label:'Stocks',tint:'lav'}, etf:{label:'ETFs',tint:'sky'}, commodity:{label:'Commodities',tint:'butter'}, treasury:{label:'Treasuries',tint:'mint'}, credit:{label:'Private credit',tint:'peach'}, preipo:{label:'Pre-IPO',tint:'rose'}, basket:{label:'Index',tint:'lav'}};
O.classChip = c => { const x = O.CLASS[c] || {label:c, tint:''}; return `<span class="chip ${x.tint}">${esc(x.label)}</span>`; };
O.img = (src, alt='') => `<img loading="lazy" src="${esc(src || '/logo-mark.svg')}" alt="${esc(alt)}" onerror="this.onerror=null;this.src='/logo-mark.svg'">`;

/* ---------- sparkline + charts ---------- */
O.spark = (arr, w=110, h=34, color) => {
  if (!arr || arr.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || 1;
  const pts = arr.map((v, i) => [i / (arr.length - 1) * w, h - 3 - (v - mn) / r * (h - 6)]);
  const up = arr[arr.length-1] >= arr[0];
  const c = color || (up ? 'var(--up)' : 'var(--down)');
  const id = 'sg' + Math.random().toString(36).slice(2, 8);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".25"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w} ${h}L0 ${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
/* interactive area chart: el, points [[t,v]], opts {height, fmt} */
O.areaChart = (el, pts, opts={}) => {
  const H = opts.height || 300; el.innerHTML = ''; el.style.position = 'relative';
  if (!pts || pts.length < 2) { el.innerHTML = '<div class="empty">No chart data yet</div>'; return; }
  const W = el.clientWidth || 700, pad = {l: 8, r: 8, t: 16, b: 26};
  const vs = pts.map(p => p[1]), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1;
  const t0 = pts[0][0], t1 = pts[pts.length-1][0];
  const X = t => pad.l + (t - t0) / (t1 - t0 || 1) * (W - pad.l - pad.r);
  const Y = v => pad.t + (1 - (v - mn) / rg) * (H - pad.t - pad.b);
  const up = vs[vs.length-1] >= vs[0], c = opts.color || (up ? 'var(--up)' : 'var(--down)');
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  const id = 'ac' + Math.random().toString(36).slice(2, 8);
  const fmtT = t => { const dt = new Date(t); return (t1 - t0) < 2.2 * 864e5 ? dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : dt.toLocaleDateString([], {month:'short', day:'numeric'}); };
  let labels = ''; for (let i = 0; i < 5; i++) { const t = t0 + (t1 - t0) * i / 4; labels += `<text x="${X(t)}" y="${H-6}" text-anchor="${i==0?'start':i==4?'end':'middle'}" font-size="11" fill="var(--ink3)">${fmtT(t)}</text>`; }
  el.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;overflow:visible"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path class="ac-fill" d="${d}L${X(t1)} ${H-pad.b}L${X(t0)} ${H-pad.b}Z" fill="url(#${id})"/><path class="ac-line" d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:acdraw 1.4s var(--ease) forwards"/>${labels}<line class="ac-x" y1="${pad.t}" y2="${H-pad.b}" stroke="var(--ink3)" stroke-dasharray="3 4" opacity="0"/><circle class="ac-dot" r="5" fill="${c}" stroke="var(--card-solid)" stroke-width="2" opacity="0"/></svg><div class="ac-tip" style="position:absolute;top:0;padding:6px 10px;border-radius:10px;background:var(--card-solid);border:1px solid var(--line);font-size:12px;pointer-events:none;opacity:0;transition:opacity .2s;box-shadow:var(--shadow);white-space:nowrap"></div>`;
  if (!document.getElementById('ackf')) { const s = document.createElement('style'); s.id = 'ackf'; s.textContent = '@keyframes acdraw{to{stroke-dashoffset:0}}'; document.head.appendChild(s); }
  const svg = el.querySelector('svg'), dot = el.querySelector('.ac-dot'), ln = el.querySelector('.ac-x'), tip = el.querySelector('.ac-tip');
  const fmt = opts.fmt || O.usd;
  svg.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    let best = 0, bd = 1e18; pts.forEach((p, i) => { const dd = Math.abs(X(p[0]) - x); if (dd < bd) { bd = dd; best = i; } });
    const p = pts[best], px = X(p[0]), py = Y(p[1]);
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); ln.setAttribute('x1', px); ln.setAttribute('x2', px);
    dot.setAttribute('opacity', 1); ln.setAttribute('opacity', .6); tip.style.opacity = 1;
    tip.innerHTML = `<b>${fmt(p[1])}</b> <span class="faint">${new Date(p[0]).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>`;
    const left = px / W * r.width; tip.style.left = Math.min(Math.max(0, left - 80), r.width - 180) + 'px';
  });
  svg.addEventListener('mouseleave', () => { dot.setAttribute('opacity', 0); ln.setAttribute('opacity', 0); tip.style.opacity = 0; });
};
/* donut: items [{label, value, color}] */
O.PALETTE = ['#8ea0ff','#f4a9d8','#8ef0d8','#f3d59a','#9fe0ff','#c7b3ff','#6fe8c6','#ffb8a8','#b8c6ff','#e9bd6a'];
O.donut = (items, size=180, stroke=26) => {
  const tot = items.reduce((s, i) => s + (i.value || 0), 0) || 1, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  let off = 0;
  const segs = items.map((it, i) => { const len = (it.value || 0) / tot * C; const s = `<circle r="${r}" cx="${size/2}" cy="${size/2}" fill="none" stroke="${it.color || O.PALETTE[i % 10]}" stroke-width="${stroke}" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('');
  return `<svg width="${size}" height="${size}" class="progress-ring"><circle r="${r}" cx="${size/2}" cy="${size/2}" fill="none" stroke="var(--bg2)" stroke-width="${stroke}"/>${segs}</svg>`;
};

/* ---------- storage ---------- */
O.store = {
  get(k, d) { try { const v = localStorage.getItem('opal:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('opal:' + k, JSON.stringify(v)); } catch (e) {} window.dispatchEvent(new CustomEvent('opal:store', {detail: k})); },
};
O.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
O.watch = {
  list: () => O.store.get('watch', []),
  has: id => O.store.get('watch', []).includes(id),
  toggle(id) { const w = O.store.get('watch', []); const i = w.indexOf(id); if (i >= 0) w.splice(i, 1); else w.unshift(id); O.store.set('watch', w); O.toast(i >= 0 ? 'Removed from watchlist' : 'Added to watchlist', 'ok'); return i < 0; },
};
O.starBtn = id => `<button class="star ${O.watch.has(id) ? 'on' : ''}" data-star="${esc(id)}" title="Watchlist" aria-label="Toggle watchlist">${O.watch.has(id) ? '\u2605' : '\u2606'}</button>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-star]'); if (!b) return; e.preventDefault(); e.stopPropagation(); const on = O.watch.toggle(b.dataset.star); $$(`[data-star="${CSS.escape(b.dataset.star)}"]`).forEach(x => { x.classList.toggle('on', on); x.textContent = on ? '\u2605' : '\u2606'; }); });

/* ---------- data ---------- */
const memo = {};
O.api = async (path, opts={}) => {
  const ttl = opts.ttl == null ? 15000 : opts.ttl;
  const m = memo[path]; if (m && Date.now() - m.t < ttl) return m.p;
  const p = fetch('/api/' + path, {headers: {'Accept': 'application/json'}}).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('Request failed ' + r.status)); return j; });
  memo[path] = {t: Date.now(), p}; p.catch(() => delete memo[path]); return p;
};
O.assets = async () => (await O.api('assets', {ttl: 30000})).assets || [];
O.assetMap = async () => { const a = await O.assets(); const m = {}; a.forEach(x => m[x.id] = x); return m; };

/* ---------- icons + logo ---------- */
const I = O.icon = {
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  down:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2M3 10h18M7 6V5a2 2 0 0 1 2-2h8"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 20h18M6 16l4-5 3 3 5-7"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
  drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3s7 7 7 12a7 7 0 0 1-14 0c0-5 7-12 7-12z"/></svg>',
  leaf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19 13 11"/></svg>',
  bank:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/></svg>',
  spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>',
  repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>',
  scale:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7zM8 21h8"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM8 7h8"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  pie:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
};
O.LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ef0d8"/><stop offset=".45" stop-color="#a9b8ff"/><stop offset=".75" stop-color="#f4a9d8"/><stop offset="1" stop-color="#f3d59a"/></linearGradient><linearGradient id="lg2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path d="M32 4 56 18v28L32 60 8 46V18z" fill="url(#lg1)"/><path d="M32 4 56 18 32 32 8 18z" fill="url(#lg2)" opacity=".7"/><path d="M32 32v28M32 32 56 18M32 32 8 18" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" fill="none"/><circle cx="23" cy="20" r="3.2" fill="#fff" opacity=".9"/></svg>`;

/* ---------- theme ---------- */
O.theme = O.store.get('theme3', 'light');
document.documentElement.dataset.theme = O.theme;
O.toggleTheme = () => { O.theme = O.theme === 'dusk' ? 'light' : 'dusk'; document.documentElement.dataset.theme = O.theme; O.store.set('theme3', O.theme); O.bgSync && O.bgSync(); const b = $('#themeBtn'); if (b) b.innerHTML = O.theme === 'dusk' ? I.sun : I.moon; };

/* ---------- nav ---------- */
O.NAV = [
  {label: 'Markets', items: [
    {href: '/markets', t: 'All markets', d: 'Every tokenized stock, ETF, metal and bond, live', ic: 'chart', c: 'lav'},
    {href: '/compare', t: 'Issuer spreads', d: 'Same stock, different issuers. Find the cheapest wrapper', ic: 'scale', c: 'sky'},
    {href: '/issuers', t: 'Issuers', d: 'Who mints what, on which chains', ic: 'building', c: 'peach'},
    {href: '/pools', t: 'Liquidity pools', d: 'Where RWA liquidity actually lives', ic: 'drop', c: 'mint'},
  ]},
  {label: 'Baskets', items: [
    {href: '/baskets', t: 'Baskets', d: 'Build, share and buy a whole portfolio in one flow', ic: 'layers', c: 'rose'},
    {href: '/strategies', t: 'Strategies', d: 'Curated allocations with backtests', ic: 'target', c: 'butter'},
  ]},
  {label: 'Earn', items: [
    {href: '/earn', t: 'Yield', d: 'Best RWA yields across protocols', ic: 'leaf', c: 'mint'},
    {href: '/lend', t: 'Lend and borrow', d: 'Borrow against tokenized equities and bonds', ic: 'bank', c: 'sky'},
  ]},
  {label: 'Trade', items: [
    {href: '/swap', t: 'Swap', d: 'Any token, any chain, into any RWA', ic: 'swap', c: 'lav'},
    {href: '/orders', t: 'Limit orders', d: 'Name your price, get pinged when it hits', ic: 'target', c: 'peach'},
    {href: '/auto-invest', t: 'Auto-invest', d: 'Recurring buys on your schedule', ic: 'repeat', c: 'mint'},
    {href: '/alerts', t: 'Price alerts', d: 'Browser notifications on any move', ic: 'bell', c: 'rose'},
  ]},
  {href: '/agent', label: 'Agent'},
  {href: '/portfolio', label: 'Portfolio'},
];
function renderHeader() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  const isOn = h => path === h || path.startsWith(h + '/');
  const nav = O.NAV.map(n => n.items
    ? `<div class="dd ${n.items.some(i => isOn(i.href)) ? 'on' : ''}"><button type="button">${n.label} ${I.down}</button><div class="dd-menu">${n.items.map(i => `<a href="${i.href}"><span class="ic chip ${i.c}" style="padding:0">${I[i.ic]}</span><span><b>${i.t}</b><small>${i.d}</small></span></a>`).join('')}</div></div>`
    : `<a href="${n.href}" class="${isOn(n.href) ? 'on' : ''}">${n.label}</a>`).join('');
  const hdr = O.h(`<header class="hdr"><div class="wrap"><div class="bar">
    <a class="brand" href="/">${O.LOGO}<span>Opaline</span></a>
    <nav class="nav" id="nav">${nav}</nav>
    <div class="hdr-r">
      <button class="btn btn-soft btn-sm search-btn" id="cmdBtn" aria-label="Search">${I.search.replace('<svg', '<svg width="15" height="15"')}<span class="lbl-t">Search</span><span class="kbd">/</span></button>
      <button class="icon-btn" id="themeBtn" aria-label="Toggle theme">${O.theme === 'dusk' ? I.sun : I.moon}</button>
      <button class="btn btn-primary btn-sm" id="walletBtn">Connect</button>
      <button class="icon-btn burger" id="burger" aria-label="Menu">${I.menu}</button>
    </div></div></div></header>`);
  document.body.prepend(hdr);
  const aura = O.h('<div class="aura" aria-hidden="true"><i></i><i></i><i></i><div class="veil"></div><div class="grain"></div></div>');
  document.body.prepend(aura);
  O.bgSync = () => {};
  if (!document.querySelector('script[data-bg3d]')) { const sc = document.createElement('script'); sc.src = '/bg3d.js?v=opal1'; sc.defer = true; sc.dataset.bg3d = '1'; document.head.appendChild(sc); }
  $('#themeBtn').onclick = O.toggleTheme;
  $('#cmdBtn').onclick = O.cmdk;
  $('#burger').onclick = () => $('#nav').classList.toggle('open');
  $('#walletBtn').onclick = () => O.wallet.account ? O.walletMenu() : O.wallet.connect();
  let lastY = 0; addEventListener('scroll', () => { const y = scrollY; hdr.classList.toggle('scrolled', y > 20); lastY = y; }, {passive: true});
}
function renderFooter() {
  document.body.appendChild(O.h(`<footer class="ftr"><div class="wrap"><div class="cols">
    <div><a class="brand" href="/">${O.LOGO}<span>Opaline</span></a><p style="margin-top:14px;max-width:340px">One calm place to discover, compare and own tokenized real-world assets across every chain. Self-custodial, routed live.</p><p class="faint" style="margin-top:14px;font-size:12px">Market data from public sources. Nothing here is investment advice.</p></div>
    <div><h4>Markets</h4><a href="/markets">All markets</a><a href="/compare">Issuer spreads</a><a href="/issuers">Issuers</a><a href="/pools">Pools</a></div>
    <div><h4>Invest</h4><a href="/baskets">Baskets</a><a href="/strategies">Strategies</a><a href="/earn">Yield</a><a href="/lend">Lend and borrow</a><a href="/auto-invest">Auto-invest</a></div>
    <div><h4>You</h4><a href="/portfolio">Portfolio</a><a href="/watchlist">Watchlist</a><a href="/orders">Orders</a><a href="/alerts">Alerts</a><a href="/docs">Docs</a></div>
  </div><div class="row between wrapf" style="margin-top:36px;font-size:13px"><span class="faint">\u00a9 ${new Date().getFullYear()} Opaline</span><span class="row faint"><span class="pulse"></span> <span id="dataAge">Live data</span></span></div></div></footer>`));
}

/* ---------- toasts + modal ---------- */
O.toast = (msg, kind='', ms=4200) => {
  let box = $('.toasts'); if (!box) { box = O.h('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(box); }
  const t = O.h(`<div class="toast ${kind}"><span class="dot"></span><div>${msg}</div></div>`);
  box.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  return t;
};
O.modal = (title, bodyHtml, opts={}) => {
  const scrim = O.h('<div class="scrim"></div>');
  const m = O.h(`<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div><div class="modal-b"></div></div>`);
  const b = m.querySelector('.modal-b'); if (typeof bodyHtml === 'string') b.innerHTML = bodyHtml; else b.appendChild(bodyHtml);
  document.body.append(scrim, m); document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { scrim.classList.add('show'); m.classList.add('show'); });
  const close = () => { scrim.classList.remove('show'); m.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => { scrim.remove(); m.remove(); }, 380); document.removeEventListener('keydown', onk); opts.onClose && opts.onClose(); };
  const onk = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onk);
  scrim.onclick = close; m.querySelector('[data-close]').onclick = close;
  return {el: m, body: b, close};
};
O.confirm = (title, text, okLabel='Confirm') => new Promise(res => {
  const md = O.modal(title, `<p class="muted">${text}</p><div class="row" style="margin-top:20px;justify-content:flex-end"><button class="btn btn-soft" data-n>Cancel</button><button class="btn btn-primary" data-y>${okLabel}</button></div>`, {onClose: () => res(false)});
  md.body.querySelector('[data-n]').onclick = () => md.close();
  md.body.querySelector('[data-y]').onclick = () => { res(true); md.close(); };
});

/* ---------- command palette ---------- */
const PAGES = [['Markets','/markets'],['Swap','/swap'],['Baskets','/baskets'],['Strategies','/strategies'],['Yield','/earn'],['Lend and borrow','/lend'],['Pools','/pools'],['Issuers','/issuers'],['Issuer spreads','/compare'],['Limit orders','/orders'],['Auto-invest','/auto-invest'],['Price alerts','/alerts'],['Agent','/agent'],['Portfolio','/portfolio'],['Watchlist','/watchlist'],['Docs','/docs']];
O.cmdk = async () => {
  if ($('.cmdk')) return;
  const scrim = O.h('<div class="scrim" style="z-index:110"></div>');
  const box = O.h(`<div class="cmdk"><input placeholder="Search assets, issuers, pages..." aria-label="Search"><div class="res"></div></div>`);
  document.body.append(scrim, box); requestAnimationFrame(() => { scrim.classList.add('show'); box.classList.add('show'); });
  const inp = box.querySelector('input'), res = box.querySelector('.res'); inp.focus();
  const close = () => { scrim.classList.remove('show'); box.classList.remove('show'); setTimeout(() => { scrim.remove(); box.remove(); }, 300); };
  scrim.onclick = close;
  let assets = []; try { assets = await O.assets(); } catch (e) {}
  let sel = 0;
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    const pg = PAGES.filter(p => !q || p[0].toLowerCase().includes(q)).slice(0, q ? 5 : 8);
    const as = q ? assets.filter(a => a.symbol.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q) || a.underlying.toLowerCase() === q).slice(0, 10) : assets.slice(0, 6);
    let html = '';
    if (as.length) html += '<div class="grp">Assets</div>' + as.map(a => `<a href="/asset/${a.id}">${O.img(a.image)}<span style="flex:1"><b>${esc(a.symbol)}</b> <span class="faint">${esc(a.name)}</span></span><span class="mono">${O.usd(a.price)}</span><span class="${O.pctCls(a.ch24h)} mono" style="width:70px;text-align:right">${O.pct(a.ch24h)}</span></a>`).join('');
    if (pg.length) html += '<div class="grp">Pages</div>' + pg.map(p => `<a href="${p[1]}"><span class="chip lav">Go</span><b>${p[0]}</b></a>`).join('');
    res.innerHTML = html || '<div class="empty">Nothing matches yet</div>';
    sel = 0; mark();
  };
  const mark = () => $$('a', res).forEach((a, i) => a.classList.toggle('sel', i === sel));
  inp.oninput = draw;
  inp.onkeydown = e => {
    const n = $$('a', res).length;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { sel = (sel + 1) % n; mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + n) % n; mark(); e.preventDefault(); }
    else if (e.key === 'Enter') { const a = $$('a', res)[sel]; if (a) location.href = a.href; }
  };
  draw();
};
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if ((e.key === '/' && !['input','textarea','select'].includes(tag)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); O.cmdk(); }
});

/* ---------- motion ---------- */
O.reveal = (root=document) => {
  const els = $$('.rv:not(.in)', root);
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = O._io || (O._io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); O._io.unobserve(en.target); } }), {rootMargin: '0px 0px -6% 0px', threshold: .06}));
  els.forEach(e => io.observe(e));
};
O.countUp = (el, to, fmt=O.compact, dur=1400) => {
  const t0 = performance.now(), from = 0;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
};
document.addEventListener('pointermove', e => { const c = e.target.closest && e.target.closest('.spot'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }, {passive: true});
/* magnetic buttons */
document.addEventListener('pointermove', e => { const b = e.target.closest && e.target.closest('.magnet'); if (!b) return; const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width/2) * .18}px,${(e.clientY - r.top - r.height/2) * .25}px)`; }, {passive: true});
document.addEventListener('pointerout', e => { const b = e.target.closest && e.target.closest('.magnet'); if (b && !b.contains(e.relatedTarget)) b.style.transform = ''; });
/* sortable tables: th[data-k] -> callback */
O.sortable = (thead, state, redraw) => {
  $$('th[data-k]', thead).forEach(th => th.onclick = () => { const k = th.dataset.k; state.dir = state.key === k ? -state.dir : -1; state.key = k; redraw(); mark(); });
  const mark = () => $$('th[data-k]', thead).forEach(th => { th.textContent = th.textContent.replace(/ [\u2191\u2193]$/, ''); if (th.dataset.k === state.key) th.textContent += state.dir > 0 ? ' \u2191' : ' \u2193'; });
  mark();
};
O.sortBy = (arr, state) => arr.slice().sort((a, b) => { let x = a[state.key], y = b[state.key]; if (x == null) x = -Infinity; if (y == null) y = -Infinity; if (typeof x === 'string') return x.localeCompare(y) * state.dir; return (x - y) * state.dir; });

/* ---------- wallet (EIP-6963 + EIP-1193) ---------- */
const CHAIN_META = O.CHAINS = {
  1: {name: 'Ethereum', short: 'ETH', rpc: 'https://eth.llamarpc.com', exp: 'https://etherscan.io'},
  8453: {name: 'Base', short: 'BASE', rpc: 'https://mainnet.base.org', exp: 'https://basescan.org'},
  42161: {name: 'Arbitrum', short: 'ARB', rpc: 'https://arb1.arbitrum.io/rpc', exp: 'https://arbiscan.io'},
  10: {name: 'Optimism', short: 'OP', rpc: 'https://mainnet.optimism.io', exp: 'https://optimistic.etherscan.io'},
  137: {name: 'Polygon', short: 'POL', rpc: 'https://polygon-rpc.com', exp: 'https://polygonscan.com'},
  56: {name: 'BNB Chain', short: 'BNB', rpc: 'https://bsc-dataseed.binance.org', exp: 'https://bscscan.com'},
  43114: {name: 'Avalanche', short: 'AVAX', rpc: 'https://api.avax.network/ext/bc/C/rpc', exp: 'https://snowtrace.io'},
  5000: {name: 'Mantle', short: 'MNT', rpc: 'https://rpc.mantle.xyz', exp: 'https://mantlescan.xyz'},
  57073: {name: 'Ink', short: 'INK', rpc: 'https://rpc-gel.inkonchain.com', exp: 'https://explorer.inkonchain.com'},
  59144: {name: 'Linea', short: 'LINEA', rpc: 'https://rpc.linea.build', exp: 'https://lineascan.build'},
  100: {name: 'Gnosis', short: 'GNO', rpc: 'https://rpc.gnosischain.com', exp: 'https://gnosisscan.io'},
  1151111081099710: {name: 'Solana', short: 'SOL', exp: 'https://solscan.io'},
};
O.chainName = id => (CHAIN_META[id] || {}).name || ('Chain ' + id);
const W = O.wallet = {providers: [], provider: null, info: null, account: null, chainId: null, listeners: []};
addEventListener('eip6963:announceProvider', e => { const d = e.detail; if (!W.providers.find(p => p.info.uuid === d.info.uuid)) W.providers.push(d); });
dispatchEvent(new Event('eip6963:requestProvider'));
W.on = fn => W.listeners.push(fn);
const emit = () => { W.listeners.forEach(f => { try { f(W); } catch (e) { console.error(e); } }); paintWallet(); };
function paintWallet() { const b = $('#walletBtn'); if (!b) return; if (W.account) { b.innerHTML = `<span class="pulse"></span> ${O.short(W.account)}`; b.classList.remove('btn-primary'); b.classList.add('btn-soft'); } else { b.textContent = 'Connect'; b.classList.add('btn-primary'); b.classList.remove('btn-soft'); } }
async function attach(p, info, silent) {
  const accs = await p.request({method: silent ? 'eth_accounts' : 'eth_requestAccounts'});
  if (!accs || !accs.length) return false;
  W.provider = p; W.info = info; W.account = accs[0];
  W.chainId = parseInt(await p.request({method: 'eth_chainId'}), 16);
  O.store.set('wallet', info ? info.rdns || info.name : 'injected');
  if (!p._opal) { p._opal = 1;
    p.on && p.on('accountsChanged', a => { W.account = a[0] || null; if (!W.account) O.store.set('wallet', null); emit(); });
    p.on && p.on('chainChanged', c => { W.chainId = parseInt(c, 16); emit(); }); }
  emit(); return true;
}
W.connect = async () => {
  dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise(r => setTimeout(r, 150));
  const list = W.providers.slice();
  if (!list.length && window.ethereum) list.push({info: {name: 'Browser wallet', uuid: 'injected', icon: '', rdns: 'injected'}, provider: window.ethereum});
  if (!list.length) { O.modal('Connect a wallet', `<p class="muted">No browser wallet found. Install one to trade on Opaline. Browsing, alerts, baskets and the agent all work without one.</p><div class="grid g2" style="margin-top:18px"><a class="btn btn-soft" target="_blank" rel="noopener" href="https://metamask.io/download/">MetaMask</a><a class="btn btn-soft" target="_blank" rel="noopener" href="https://rabby.io">Rabby</a><a class="btn btn-soft" target="_blank" rel="noopener" href="https://www.coinbase.com/wallet">Coinbase Wallet</a><a class="btn btn-soft" target="_blank" rel="noopener" href="https://rainbow.me">Rainbow</a></div>`); return false; }
  if (list.length === 1) { try { return await attach(list[0].provider, list[0].info); } catch (e) { O.toast(esc(e.message || 'Connection rejected'), 'err'); return false; } }
  return new Promise(res => {
    const md = O.modal('Connect a wallet', `<div class="list-pick">${list.map((p, i) => `<button data-i="${i}">${p.info.icon ? `<img src="${esc(p.info.icon)}" alt="">` : `<span class="icon-btn">${I.wallet}</span>`}<b>${esc(p.info.name)}</b></button>`).join('')}</div><p class="faint" style="font-size:12px;margin-top:14px">Opaline never holds your keys. Every trade is signed in your wallet.</p>`, {onClose: () => res(!!W.account)});
    $$('[data-i]', md.body).forEach(b => b.onclick = async () => { const p = list[+b.dataset.i]; try { await attach(p.provider, p.info); md.close(); O.toast('Wallet connected', 'ok'); } catch (e) { O.toast(esc(e.message || 'Connection rejected'), 'err'); } });
  });
};
W.disconnect = () => { W.account = null; W.provider = null; O.store.set('wallet', null); emit(); O.toast('Disconnected'); };
W.ensure = async () => W.account || (await W.connect()) && W.account;
W.switchChain = async id => {
  if (W.chainId === id) return true;
  const hex = '0x' + id.toString(16);
  try { await W.provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: hex}]}); }
  catch (e) {
    if (e.code === 4902 && CHAIN_META[id] && CHAIN_META[id].rpc) {
      await W.provider.request({method: 'wallet_addEthereumChain', params: [{chainId: hex, chainName: CHAIN_META[id].name, rpcUrls: [CHAIN_META[id].rpc], nativeCurrency: {name: 'ETH', symbol: 'ETH', decimals: 18}, blockExplorerUrls: [CHAIN_META[id].exp]}]});
    } else throw e;
  }
  W.chainId = id; return true;
};
W.waitReceipt = async (hash, tries=120) => {
  for (let i = 0; i < tries; i++) {
    const r = await W.provider.request({method: 'eth_getTransactionReceipt', params: [hash]}).catch(() => null);
    if (r) { if (r.status === '0x0') throw new Error('Transaction reverted'); return r; }
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error('Timed out waiting for confirmation');
};
const pad = (h, n=64) => h.replace(/^0x/, '').padStart(n, '0');
W.allowance = async (token, owner, spender) => { const r = await W.provider.request({method: 'eth_call', params: [{to: token, data: '0xdd62ed3e' + pad(owner) + pad(spender)}, 'latest']}); return BigInt(r && r !== '0x' ? r : 0); };
W.approve = async (token, spender, amount) => W.provider.request({method: 'eth_sendTransaction', params: [{from: W.account, to: token, data: '0x095ea7b3' + pad(spender) + pad(BigInt(amount).toString(16))}]});
W.balances = async (addr) => { const r = await O.api(`lifi/wallets/${addr}/balances?extended=true`, {ttl: 20000}); return r.balances || {}; };
O.walletMenu = () => {
  const md = O.modal('Your wallet', `<div class="card tint-lav flat" style="padding:18px"><div class="faint" style="font-size:12px">${esc(W.info ? W.info.name : 'Wallet')} on ${esc(O.chainName(W.chainId))}</div><div class="mono" style="font-size:16px;margin-top:4px;word-break:break-all">${esc(W.account)}</div></div><div class="grid g2" style="margin-top:14px"><a class="btn btn-soft" href="/portfolio">Portfolio</a><button class="btn btn-soft" data-copy>Copy address</button><a class="btn btn-soft" target="_blank" rel="noopener" href="${(CHAIN_META[W.chainId] || CHAIN_META[1]).exp}/address/${esc(W.account)}">Explorer</a><button class="btn btn-danger" data-dc>Disconnect</button></div>`);
  md.body.querySelector('[data-copy]').onclick = () => { navigator.clipboard.writeText(W.account); O.toast('Address copied', 'ok'); };
  md.body.querySelector('[data-dc]').onclick = () => { W.disconnect(); md.close(); };
};
async function restoreWallet() {
  const last = O.store.get('wallet', null); if (!last) return;
  await new Promise(r => setTimeout(r, 300));
  const p = W.providers.find(x => x.info.rdns === last || x.info.name === last) || (window.ethereum && {provider: window.ethereum, info: {name: 'Browser wallet', rdns: 'injected'}});
  if (p) try { await attach(p.provider, p.info, true); } catch (e) {}
}

/* ---------- routing / swap (LI.FI) ---------- */
const NATIVE = O.NATIVE = '0x0000000000000000000000000000000000000000';
const PREVIEW_ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
const SOL_PREVIEW = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const EVM_PREF = [8453, 42161, 1, 56, 10, 137, 43114, 5000, 57073, 59144, 100];
O.isSol = id => +id === 1151111081099710;
O.bestChain = asset => { const cs = (asset && asset.chains) || []; for (const id of EVM_PREF) { const c = cs.find(x => x.chainId === id); if (c) return c; } return cs[0] || null; };
O.tokens = async chainId => { const r = await O.api('lifi/tokens?chains=' + chainId, {ttl: 600000}); return (r.tokens || {})[chainId] || []; };
O.stableOn = async chainId => { const t = await O.tokens(chainId); return t.find(x => x.symbol === 'USDC') || t.find(x => x.symbol === 'USDT') || t[0]; };
O.toUnits = (amt, dec) => { const s = Number(amt).toFixed(Math.min(dec, 12)); const [a, b=''] = s.split('.'); return BigInt(a || 0) * 10n ** BigInt(dec) + BigInt((b + '0'.repeat(dec)).slice(0, dec) || 0); };
O.fromUnits = (v, dec) => Number(BigInt(v)) / 10 ** dec;
O.quote = async ({fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress, slippage=0.005, order='CHEAPEST'}) => {
  const qs = new URLSearchParams({fromChain, toChain, fromToken, toToken, fromAmount: String(fromAmount), fromAddress: fromAddress || (O.isSol(fromChain) ? SOL_PREVIEW : PREVIEW_ADDR), slippage, order, integrator: 'opaline'});
  if (toAddress || O.isSol(toChain) !== O.isSol(fromChain)) qs.set('toAddress', toAddress || (O.isSol(toChain) ? SOL_PREVIEW : PREVIEW_ADDR));
  return O.api('lifi/quote?' + qs.toString(), {ttl: 0});
};
O.history = {
  list: () => O.store.get('history', []),
  add(x) { const h = O.store.get('history', []); h.unshift(x); O.store.set('history', h.slice(0, 200)); },
  update(id, patch) { const h = O.store.get('history', []); const i = h.findIndex(x => x.id === id); if (i >= 0) { Object.assign(h[i], patch); O.store.set('history', h); } },
};
O.execute = async (q, meta={}) => {
  if (!await W.ensure()) throw new Error('Connect a wallet first');
  const a = q.action, tr = q.transactionRequest;
  if (O.isSol(a.fromChainId)) throw new Error('Paying from Solana needs a Solana wallet. Pick an EVM source chain.');
  await W.switchChain(a.fromChainId);
  if (a.fromToken.address !== NATIVE && q.estimate.approvalAddress) {
    const have = await W.allowance(a.fromToken.address, W.account, q.estimate.approvalAddress);
    if (have < BigInt(a.fromAmount)) {
      O.toast(`Approve ${esc(a.fromToken.symbol)} in your wallet`);
      const h = await W.approve(a.fromToken.address, q.estimate.approvalAddress, a.fromAmount);
      await W.waitReceipt(h);
    }
  }
  const tx = {from: W.account, to: tr.to, data: tr.data, value: tr.value || '0x0'};
  if (tr.gasLimit) tx.gas = tr.gasLimit;
  const hash = await W.provider.request({method: 'eth_sendTransaction', params: [tx]});
  const id = O.uid();
  O.history.add({id, hash, ts: Date.now(), status: 'PENDING', fromChain: a.fromChainId, toChain: a.toChainId, bridge: q.tool,
    from: {symbol: a.fromToken.symbol, amount: O.fromUnits(a.fromAmount, a.fromToken.decimals), logo: a.fromToken.logoURI},
    to: {symbol: a.toToken.symbol, amount: O.fromUnits(q.estimate.toAmount, a.toToken.decimals), logo: a.toToken.logoURI},
    usd: +q.estimate.fromAmountUSD || null, kind: meta.kind || 'swap', ref: meta.ref || null});
  O.trackStatus(id, hash, q.tool, a.fromChainId, a.toChainId);
  return hash;
};
O.trackStatus = async (id, hash, bridge, fromChain, toChain) => {
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, i < 10 ? 4000 : 8000));
    try {
      const s = await O.api(`lifi/status?txHash=${hash}&bridge=${bridge}&fromChain=${fromChain}&toChain=${toChain}`, {ttl: 0});
      if (s.status === 'DONE') { O.history.update(id, {status: 'DONE', sub: s.substatus}); O.toast('Order filled. Assets are in your wallet.', 'ok', 7000); return; }
      if (s.status === 'FAILED') { O.history.update(id, {status: 'FAILED', sub: s.substatus}); O.toast('Route failed: ' + esc(s.substatusMessage || s.substatus || 'unknown'), 'err', 8000); return; }
    } catch (e) {}
  }
};
O.resumeTracking = () => O.history.list().filter(h => h.status === 'PENDING' && Date.now() - h.ts < 6 * 3600e3).forEach(h => O.trackStatus(h.id, h.hash, h.bridge, h.fromChain, h.toChain));
O.explorerTx = (chainId, h) => ((CHAIN_META[chainId] || CHAIN_META[1]).exp) + '/tx/' + h;

/* swap sheet. opts: {asset, toChain, toToken, toSymbol, toLogo, fromChain, fromToken, amount, side, title, kind, ref} */
O.openSwap = async (opts={}) => {
  const st = {side: opts.side || 'buy', q: null, busy: false, slip: O.store.get('slip', 0.5)};
  let target = null, fromTok = null, timer = null;
  if (opts.asset) { const c = O.bestChain(opts.asset); if (!c) { O.toast('This asset has no on-chain route yet', 'err'); return; } target = {chainId: c.chainId, address: c.address, symbol: opts.asset.symbol, logo: opts.asset.image}; }
  else if (opts.toToken) target = {chainId: +opts.toChain, address: opts.toToken, symbol: opts.toSymbol || 'Token', logo: opts.toLogo};
  st.fromChain = +opts.fromChain || (W.chainId && CHAIN_META[W.chainId] && !O.isSol(W.chainId) ? W.chainId : (target && !O.isSol(target.chainId) ? target.chainId : 8453));
  const body = O.h(`<div>
    <div class="tabs" style="margin-bottom:14px"><button data-side="buy">Buy</button><button data-side="sell">Sell</button></div>
    <div class="swap-box"><div class="row between faint" style="font-size:12px"><span>You pay</span><span data-bal></span></div>
      <div class="row" style="margin-top:6px"><input data-amt inputmode="decimal" placeholder="0.00" value="${esc(opts.amount || '')}"><button class="token-btn" data-pick="a"></button></div><div class="faint" style="font-size:12px;min-height:18px" data-fromusd></div></div>
    <div class="flip" data-flip>${I.swap.replace('<svg', '<svg width="16" height="16"')}</div>
    <div class="swap-box"><div class="faint" style="font-size:12px">You receive</div><div class="row" style="margin-top:6px"><input data-out readonly placeholder="0.00"><button class="token-btn" data-pick="b"></button></div><div class="faint" style="font-size:12px;min-height:18px" data-tousd></div></div>
    <div data-soladdr style="display:none;margin-top:12px"><label class="lbl">Solana address to receive</label><input class="input mono" data-sol placeholder="Your Solana wallet address" value="${esc(O.store.get('solAddr', ''))}"></div>
    <div data-route style="margin-top:14px"></div>
    <div class="row between" style="margin-top:12px;font-size:13px"><span class="faint">Max slippage</span><span class="tabs">${[0.3,0.5,1,2].map(s => `<button data-slip="${s}" class="${s == st.slip ? 'on' : ''}">${s}%</button>`).join('')}</span></div>
    <button class="btn btn-grad btn-lg btn-block" data-go style="margin-top:16px" disabled>Enter an amount</button>
    <p class="faint" style="font-size:12px;text-align:center;margin-top:10px">Best route across 30+ bridges and DEXs. Opaline adds zero fees.</p></div>`);
  const md = O.modal(opts.title || 'Trade', body);
  const q = s => body.querySelector(s), go = q('[data-go]');
  const tb = (x, ch) => x ? `${O.img(x.logo || x.logoURI)}<span style="text-align:left">${esc(x.symbol)}<small class="faint" style="display:block;font-size:10px;font-weight:600;margin-top:-2px">${esc(O.chainName(ch))}</small></span>${I.down}` : 'Select';
  const paint = () => {
    $$('[data-side]', body).forEach(b => b.classList.toggle('on', b.dataset.side === st.side));
    const buy = st.side === 'buy';
    q('[data-pick=a]').innerHTML = buy ? tb(fromTok, st.fromChain) : tb(target, target && target.chainId);
    q('[data-pick=b]').innerHTML = buy ? tb(target, target && target.chainId) : tb(fromTok, st.fromChain);
    q('[data-soladdr]').style.display = target && O.isSol(target.chainId) ? 'block' : 'none';
  };
  const refreshBal = async () => {
    const el = q('[data-bal]'); el.textContent = ''; if (!W.account) return;
    const buy = st.side === 'buy', ch = buy ? st.fromChain : target && target.chainId, addr = buy ? fromTok && fromTok.address : target && target.address;
    if (!ch || !addr || O.isSol(ch)) return;
    try { const b = await W.balances(W.account); const t = (b[ch] || []).find(x => x.address.toLowerCase() === addr.toLowerCase()); const v = t ? O.fromUnits(t.amount, t.decimals) : 0;
      el.innerHTML = `Balance ${O.num(v)} ${v ? '<a href="#" data-max style="color:var(--lav-d);font-weight:700">Max</a>' : ''}`;
      const mx = el.querySelector('[data-max]'); if (mx) mx.onclick = e => { e.preventDefault(); q('[data-amt]').value = String(+(addr === NATIVE ? v * 0.97 : v).toFixed(8)); requote(); };
    } catch (e) {}
  };
  const requote = () => { clearTimeout(timer); go.disabled = true; timer = setTimeout(getQuote, 450); };
  async function getQuote() {
    const amt = parseFloat(q('[data-amt]').value); st.q = null;
    ['[data-tousd]', '[data-fromusd]'].forEach(s => q(s).textContent = ''); q('[data-out]').value = '';
    if (!amt || amt <= 0 || !fromTok || !target) { go.textContent = 'Enter an amount'; go.disabled = true; q('[data-route]').innerHTML = ''; return; }
    const buy = st.side === 'buy';
    const fch = buy ? st.fromChain : target.chainId, ftk = buy ? fromTok.address : target.address;
    const tch = buy ? target.chainId : st.fromChain, ttk = buy ? target.address : fromTok.address;
    let dec = buy ? fromTok.decimals : null;
    if (dec == null) { try { dec = (await O.api(`lifi/token?chain=${fch}&token=${ftk}`, {ttl: 600000})).decimals; } catch (e) { dec = 18; } }
    go.textContent = 'Finding best route...';
    q('[data-route]').innerHTML = '<div class="skel" style="height:60px"></div>';
    const sol = q('[data-sol]').value.trim(); if (sol) O.store.set('solAddr', sol);
    try {
      const r = await O.quote({fromChain: fch, toChain: tch, fromToken: ftk, toToken: ttk, fromAmount: O.toUnits(amt, dec), fromAddress: O.isSol(fch) ? undefined : W.account, toAddress: O.isSol(tch) ? (sol || undefined) : undefined, slippage: st.slip / 100});
      st.q = r; const e = r.estimate, td = r.action.toToken;
      q('[data-out]').value = O.num(O.fromUnits(e.toAmount, td.decimals), 6);
      if (e.fromAmountUSD) q('[data-fromusd]').textContent = O.usd(+e.fromAmountUSD);
      if (e.toAmountUSD) q('[data-tousd]').textContent = O.usd(+e.toAmountUSD) + (e.fromAmountUSD ? '  (' + O.pct((e.toAmountUSD / e.fromAmountUSD - 1) * 100) + ')' : '');
      const gas = (e.gasCosts || []).reduce((s, g) => s + (+g.amountUSD || 0), 0), fee = (e.feeCosts || []).reduce((s, g) => s + (+g.amountUSD || 0), 0);
      const steps = (r.includedSteps || []).map(s => `<span class="chip">${esc(s.toolDetails ? s.toolDetails.name : s.tool)}</span>`).join('<span class="faint">\u2192</span>');
      q('[data-route]').innerHTML = `<div class="route-step" style="flex-direction:column;align-items:stretch;gap:6px"><div class="row wrapf" style="gap:6px">${steps}</div><div class="row between"><span class="faint">Network cost</span><b>${O.usd(gas, 2)}</b></div>${fee ? `<div class="row between"><span class="faint">Protocol fees</span><b>${O.usd(fee, 2)}</b></div>` : ''}<div class="row between"><span class="faint">Minimum received</span><b>${O.num(O.fromUnits(e.toAmountMin, td.decimals), 6)} ${esc(td.symbol)}</b></div><div class="row between"><span class="faint">Est. time</span><b>${Math.max(1, Math.round((e.executionDuration || 30) / 60))} min</b></div></div>`;
      if (O.isSol(fch)) { go.textContent = 'Selling from Solana needs a Solana wallet'; go.disabled = true; }
      else if (O.isSol(tch) && !sol) { go.textContent = 'Add a Solana receive address'; go.disabled = true; }
      else { go.disabled = false; go.textContent = !W.account ? 'Connect wallet to trade' : (buy ? 'Buy ' : 'Sell ') + target.symbol; }
    } catch (err) { q('[data-route]').innerHTML = `<div class="route-step" style="background:color-mix(in srgb,var(--rose) 35%,transparent)">${esc(err.message || 'No route found')}. Try a larger amount or another source chain.</div>`; go.textContent = 'No route available'; go.disabled = true; }
  }
  $$('[data-side]', body).forEach(b => b.onclick = () => { st.side = b.dataset.side; paint(); refreshBal(); requote(); });
  $$('[data-slip]', body).forEach(b => b.onclick = () => { st.slip = +b.dataset.slip; O.store.set('slip', st.slip); $$('[data-slip]', body).forEach(x => x.classList.toggle('on', x === b)); requote(); });
  q('[data-flip]').onclick = () => { st.side = st.side === 'buy' ? 'sell' : 'buy'; paint(); refreshBal(); requote(); };
  q('[data-amt]').oninput = requote; q('[data-sol]').oninput = requote;
  body.addEventListener('click', e => { const p = e.target.closest('[data-pick]'); if (!p) return; const payTok = (p.dataset.pick === 'a') === (st.side === 'buy'); payTok ? pickToken() : pickTarget(); });
  async function pickToken() {
    const chains = Object.keys(CHAIN_META).map(Number).filter(c => !O.isSol(c));
    const pb = O.h(`<div><div class="row wrapf" style="gap:6px">${chains.map(c => `<button class="chip ${c === st.fromChain ? 'lav' : ''}" data-c="${c}" style="cursor:pointer">${esc(CHAIN_META[c].name)}</button>`).join('')}</div><div class="search" style="margin-top:12px">${I.search}<input class="input" placeholder="Search token or paste address"></div><div class="list-pick"><div class="skel" style="height:200px"></div></div></div>`);
    const pm = O.modal('Choose token', pb);
    const draw = async () => { let toks = []; try { toks = await O.tokens(st.fromChain); } catch (e) {} const s = pb.querySelector('input').value.trim().toLowerCase();
      const list = toks.filter(t => !s || t.symbol.toLowerCase().includes(s) || t.address.toLowerCase() === s || (t.name || '').toLowerCase().includes(s)).slice(0, 80);
      pb.querySelector('.list-pick').innerHTML = list.map(t => `<button data-t="${esc(t.address)}">${O.img(t.logoURI)}<span style="flex:1"><b>${esc(t.symbol)}</b> <span class="faint" style="font-size:12px">${esc(t.name)}</span></span><span class="faint mono" style="font-size:12px">${t.priceUSD ? O.usd(+t.priceUSD) : ''}</span></button>`).join('') || '<div class="empty">No tokens found</div>';
      $$('[data-t]', pb).forEach(b => b.onclick = () => { fromTok = toks.find(t => t.address === b.dataset.t); pm.close(); paint(); refreshBal(); requote(); }); };
    $$('[data-c]', pb).forEach(b => b.onclick = () => { st.fromChain = +b.dataset.c; $$('[data-c]', pb).forEach(x => x.classList.toggle('lav', x === b)); draw(); });
    pb.querySelector('input').oninput = draw; draw();
  }
  async function pickTarget() {
    const assets = (await O.assets()).filter(a => a.chains.length);
    const pb = O.h(`<div><div class="search">${I.search}<input class="input" placeholder="Search tokenized assets"></div><div class="list-pick"></div></div>`);
    const pm = O.modal('Choose asset', pb);
    const draw = () => { const s = pb.querySelector('input').value.toLowerCase();
      const list = assets.filter(a => !s || a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)).slice(0, 80);
      pb.querySelector('.list-pick').innerHTML = list.map(a => `<button data-a="${a.id}">${O.img(a.image)}<span style="flex:1"><b>${esc(a.symbol)}</b> <span class="faint" style="font-size:12px">${esc(a.name)}</span></span><span class="mono" style="font-size:12px">${O.usd(a.price)}</span></button>`).join('');
      $$('[data-a]', pb).forEach(b => b.onclick = () => { const a = assets.find(x => x.id === b.dataset.a), c = O.bestChain(a); target = {chainId: c.chainId, address: c.address, symbol: a.symbol, logo: a.image}; pm.close(); paint(); refreshBal(); requote(); }); };
    pb.querySelector('input').oninput = draw; draw();
  }
  go.onclick = async () => {
    if (!W.account) { await W.connect(); if (W.account) { refreshBal(); requote(); } return; }
    if (!st.q || st.busy) return;
    st.busy = true; go.disabled = true; go.textContent = 'Confirm in your wallet...';
    try { const h = await O.execute(st.q, {kind: opts.kind || 'swap', ref: opts.ref}); O.toast(`Submitted. <a target="_blank" rel="noopener" href="${O.explorerTx(st.q.action.fromChainId, h)}">View transaction</a>`, 'ok', 8000); md.close(); opts.onDone && opts.onDone(h); }
    catch (e) { O.toast(esc(e.message || 'Transaction cancelled'), 'err'); go.disabled = false; go.textContent = 'Try again'; }
    st.busy = false;
  };
  if (!target) { const as = await O.assets(); const a = as.find(x => x.chains.length); if (a) { const c = O.bestChain(a); target = {chainId: c.chainId, address: c.address, symbol: a.symbol, logo: a.image}; } }
  paint();
  try { fromTok = opts.fromToken ? (await O.tokens(st.fromChain)).find(t => t.address.toLowerCase() === String(opts.fromToken).toLowerCase()) : null; if (!fromTok) fromTok = await O.stableOn(st.fromChain); } catch (e) {}
  paint(); refreshBal(); if (opts.amount) requote();
  return md;
};
O.buy = async (assetOrId, extra={}) => { let a = assetOrId; if (typeof a === 'string') a = (await O.assetMap())[a]; if (!a) return O.toast('Asset not found', 'err'); return O.openSwap(Object.assign({asset: a, title: 'Trade ' + a.symbol}, extra)); };
document.addEventListener('click', e => { const b = e.target.closest('[data-buy]'); if (!b) return; e.preventDefault(); e.stopPropagation(); O.buy(b.dataset.buy, {side: b.dataset.side || 'buy'}); });

/* ---------- watchers: alerts, limit orders, auto-invest ---------- */
O.notify = (title, body) => {
  O.toast(`<b>${esc(title)}</b><br>${esc(body)}`, 'ok', 9000);
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(title, {body, icon: '/logo-mark.svg'}); } catch (e) {} }
};
O.askNotify = async () => { if (!('Notification' in window)) return false; if (Notification.permission === 'granted') return true; return (await Notification.requestPermission()) === 'granted'; };
O.checkTriggers = async () => {
  let map; try { O.api && delete memo['assets']; map = await O.assetMap(); } catch (e) { return; }
  const alerts = O.store.get('alerts', []); let ch = false;
  alerts.forEach(al => { if (al.fired) return; const a = map[al.id]; if (!a || a.price == null) return;
    let hit = false; if (al.type === 'above') hit = a.price >= al.value; else if (al.type === 'below') hit = a.price <= al.value; else if (al.type === 'move') hit = Math.abs(a.ch24h || 0) >= al.value;
    if (hit) { al.fired = Date.now(); al.firedAt = a.price; ch = true; O.notify(`${a.symbol} alert`, `${a.symbol} is at ${O.usd(a.price)} (${al.type} ${al.type === 'move' ? al.value + '%' : O.usd(al.value)})`); } });
  if (ch) O.store.set('alerts', alerts);
  const orders = O.store.get('orders', []); ch = false;
  orders.forEach(o => { if (o.status !== 'open') return; const a = map[o.id]; if (!a || a.price == null) return;
    if (o.expires && Date.now() > o.expires) { o.status = 'expired'; ch = true; return; }
    const hit = o.side === 'buy' ? a.price <= o.limit : a.price >= o.limit;
    if (hit) { o.status = 'triggered'; o.triggeredAt = Date.now(); o.triggerPrice = a.price; ch = true; O.notify(`Limit ${o.side} ready: ${a.symbol}`, `${a.symbol} hit ${O.usd(a.price)}. Open Orders to sign the fill.`); } });
  if (ch) O.store.set('orders', orders);
  const plans = O.store.get('dca', []); ch = false;
  plans.forEach(p => { if (p.paused) return; if (Date.now() >= p.next && !p.due) { p.due = true; ch = true; O.notify('Auto-invest due', `${p.name}: ${O.usd(p.amount)} buy is ready to sign.`); } });
  if (ch) O.store.set('dca', plans);
};
O.DCA_MS = {daily: 864e5, weekly: 7 * 864e5, biweekly: 14 * 864e5, monthly: 30 * 864e5};

/* ---------- boot ---------- */
function boot() {
  if (!document.querySelector('link[rel=icon]')) document.head.appendChild(O.h('<link rel="icon" href="/logo-mark.svg" type="image/svg+xml">'));
  renderHeader(); renderFooter(); paintWallet(); restoreWallet(); O.reveal(); O.resumeTracking();
  setTimeout(O.checkTriggers, 4000); setInterval(O.checkTriggers, 45000);
  O.api('health', {ttl: 60000}).then(h => { const el = $('#dataAge'); if (el && h.assets) el.textContent = `Live data, ${h.assets} assets, updated ${Math.max(1, Math.round(h.assetsAge / 60))}m ago`; }).catch(() => {});
  new MutationObserver(() => O.reveal()).observe(document.body, {childList: true, subtree: true});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
