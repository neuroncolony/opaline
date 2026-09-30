/* Shared basket helpers: simulation, sequential buy, picker. */
(function(){
const B = window.OB = {};
B.sim = items => {
  const xs = items.filter(i => i.asset && i.asset.spark && i.asset.spark.length >= 10 && i.w > 0);
  if (!xs.length) return null;
  const n = Math.min(...xs.map(i => i.asset.spark.length)), tw = xs.reduce((s, i) => s + i.w, 0) || 1;
  const ser = [];
  for (let k = 0; k < n; k++) { let v = 0; xs.forEach(i => { const sp = i.asset.spark, idx = Math.floor(k * (sp.length - 1) / (n - 1 || 1)); v += (i.w / tw) * sp[idx] / sp[0]; }); ser.push(v); }
  const now = Date.now(), step = 7 * 864e5 / (n - 1 || 1);
  const pts = ser.map((v, k) => [now - 7 * 864e5 + k * step, v * 100]);
  const rets = []; for (let k = 1; k < n; k++) rets.push(ser[k] / ser[k-1] - 1);
  const m = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const vol = Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length || 1)) * 100;
  return {pts, ret: (ser[n-1] / ser[0] - 1) * 100, vol};
};
B.w24 = items => { const t = items.reduce((s, i) => s + i.w, 0) || 1; return items.reduce((s, i) => s + (i.w / t) * ((i.asset && i.asset.ch24h) || 0), 0); };
B.w7 = items => { const t = items.reduce((s, i) => s + i.w, 0) || 1; return items.reduce((s, i) => s + (i.w / t) * ((i.asset && i.asset.ch7d) || 0), 0); };
B.legend = items => `<div class="pie-legend">${items.map((i, k) => `<span class="row" style="gap:8px;font-size:13px"><span class="sw" style="background:${O.PALETTE[k % 10]}"></span><b>${O.esc(i.asset ? i.asset.symbol : i.id)}</b><span class="faint">${(+i.w).toFixed(1)}%</span></span>`).join('')}</div>`;
B.donut = (items, size=150, stroke=22) => O.donut(items.map((i, k) => ({value: i.w, color: O.PALETTE[k % 10]})), size, stroke);
/* sequential buy. items [{asset,w}] */
B.buyAll = async (items, budget, label='Basket') => {
  const list = items.filter(i => i.asset && O.bestChain(i.asset) && i.w > 0);
  if (!list.length) return O.toast('None of these assets can be routed on-chain yet', 'err');
  if (!(budget > 0)) return O.toast('Enter a budget first', 'err');
  if (!await O.wallet.ensure()) return;
  const tw = list.reduce((s, i) => s + i.w, 0);
  const card = O.h(`<div class="card tint-mint" style="position:fixed;left:18px;bottom:18px;z-index:95;width:300px;padding:16px"><div class="row between"><b>${O.esc(label)} buy</b><span class="chip" data-p>0/${list.length}</span></div><div data-l style="margin-top:10px;display:flex;flex-direction:column;gap:6px;font-size:13px">${list.map((i, k) => `<div class="row between" data-k="${k}"><span>${O.esc(i.asset.symbol)} <span class="faint">${O.usd(budget * i.w / tw, 2)}</span></span><span data-s class="faint">waiting</span></div>`).join('')}</div></div>`);
  document.body.appendChild(card);
  let done = 0;
  for (let k = 0; k < list.length; k++) {
    const i = list[k], row = card.querySelector(`[data-k="${k}"] [data-s]`); row.textContent = 'in progress'; row.className = '';
    let ok = false;
    await new Promise(res => {
      O.openSwap({asset: i.asset, amount: (budget * i.w / tw).toFixed(2), title: `${label}: ${k + 1} of ${list.length}`, kind: 'basket', onDone: () => { ok = true; res(); }}).then(md => {
        if (!md) return res();
        const t = setInterval(() => { if (!document.body.contains(md.el)) { clearInterval(t); setTimeout(res, 50); } }, 400);
      });
    });
    row.textContent = ok ? 'submitted \u2713' : 'skipped'; row.className = ok ? 'up' : 'faint'; if (ok) done++;
    card.querySelector('[data-p]').textContent = `${k + 1}/${list.length}`;
  }
  O.toast(`${label}: ${done} of ${list.length} buys submitted`, done ? 'ok' : '');
  setTimeout(() => card.remove(), 9000);
};
B.resolve = async items => { const m = await O.assetMap(); return items.map(i => ({id: i.id, w: +i.w, asset: m[i.id]})).filter(i => i.asset); };
B.chart = (el, items, h=220) => { const s = B.sim(items); if (!s) { el.innerHTML = '<div class="empty">Not enough price history to simulate</div>'; return null; } O.areaChart(el, s.pts, {height: h, fmt: v => (v - 100 >= 0 ? '+' : '') + (v - 100).toFixed(2) + '%'}); return s; };
})();
