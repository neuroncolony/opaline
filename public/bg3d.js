/* Opaline token field: beveled opal coins drifting and tumbling cleanly behind the UI. */
(function () {
  'use strict';
  const CODES = ['gold','usd','eur','silver','yield','gbp','oil','jpy','bond','estate','chf','index'];
  const SYMBOLS = ['Au','$','\u20ac','Ag','%','\u00a3','Oil','\u00a5','T','RE','\u20a3','Ix'];
  const cv = document.createElement('canvas'), sprite = document.createElement('canvas');
  const ctx = cv.getContext('2d'), ink = sprite.getContext('2d');
  if (!ctx || !ink) return;
  cv.className = 'bg3d'; cv.setAttribute('aria-hidden', 'true');
  sprite.width = sprite.height = 256;
  const TAU = Math.PI * 2, SEGMENTS = 40, UNIT = 92, CAMERA = 5;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const light = [-0.42, 0.62, 0.66], mesh = [];
  let W = 0, H = 0, dpr = 1, tokens = [], hover = null;
  let raf = null, last = null, elapsed = 0, paintAt = -1, resizeTimer;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const circle = (r, z) => Array.from({length: SEGMENTS}, (_, i) => {
    const a = i * TAU / SEGMENTS; return [r * Math.cos(a), r * Math.sin(a), z];
  });
  const rings = [circle(.86, -.20), circle(1, -.105), circle(1, .105), circle(.86, .20)];
  mesh.push({v:rings[0], n:[0,0,-1], kind:'face'}, {v:rings[3], n:[0,0,1], kind:'face'});
  for (let j = 0; j < 3; j++) for (let i = 0; i < SEGMENTS; i++) {
    const next = (i + 1) % SEGMENTS, a = (i + .5) * TAU / SEGMENTS;
    const nz = j === 1 ? 0 : (j === 0 ? -1 : 1) * .828;
    const nr = j === 1 ? 1 : .561;
    mesh.push({v:[rings[j][i], rings[j][next], rings[j+1][next], rings[j+1][i]],
      n:[Math.cos(a)*nr,Math.sin(a)*nr,nz], kind:j === 1 ? 'edge' : 'bevel', ridge:i % 2});
  }
  function rotation(pitch, yaw, roll) {
    const sx = Math.sin(pitch), cx = Math.cos(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
    const sz = Math.sin(roll), cz = Math.cos(roll);
    return v => {
      const x1 = v[0], y1 = v[1]*cx-v[2]*sx, z1 = v[1]*sx+v[2]*cx;
      const x2 = x1*cy+z1*sy, z2 = -x1*sy+z1*cy;
      return [x2*cz-y1*sz,x2*sz+y1*cz,z2];
    };
  }
  function project(v) { const k = CAMERA / (CAMERA - v[2]); return [128+v[0]*UNIT*k,128-v[1]*UNIT*k]; }
  function polygon(c, points) {
    c.beginPath(); c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.closePath();
  }
  function pose(t, time) {
    return rotation(t.pitch + time*t.tumble, t.yaw + time*t.spin,
      t.roll + Math.sin(time*.33+t.phase)*.34 + time*t.rollSpeed);
  }
  const COLOR_HUES = [166,196,228,262,322,38];
  function paletteAt(t,time) {
    const step = ((time/90 + CODES.indexOf(t.code)/CODES.length)%1+1)%1 * COLOR_HUES.length;
    const i = Math.floor(step), a = COLOR_HUES[i], b = COLOR_HUES[(i+1)%COLOR_HUES.length];
    const delta = ((b-a+540)%360)-180;
    const dark = document.documentElement.dataset.theme === 'dusk';
    return {hue:(a+delta*smooth(step-i)+360)%360,saturation:dark?46:62,dark};
  }
  function renderMesh(t, time) {
    ink.setTransform(1,0,0,1,0,0); ink.clearRect(0,0,256,256);
    const turn = pose(t,time), {hue,saturation,dark} = paletteAt(t,time), faces = [];
    let visibleFace = 1;
    for (const f of mesh) {
      const vertices = f.v.map(turn), normal = turn(f.n);
      const center = vertices.reduce((a,v) => a.map((n,i) => n+v[i]/vertices.length), [0,0,0]);
      if (normal[0]*-center[0]+normal[1]*-center[1]+normal[2]*(CAMERA-center[2]) <= 0) continue;
      faces.push({f,vertices,normal,z:center[2]});
      if (f.kind === 'face') visibleFace = f.n[2];
    }
    faces.sort((a,b) => a.z-b.z);
    for (const p of faces) {
      const n = p.normal, diffuse = Math.max(0,n[0]*light[0]+n[1]*light[1]+n[2]*light[2]);
      const spec = Math.pow(Math.max(0,n[0]*-.22+n[1]*.32+n[2]*.92),18);
      let l = dark ? 31 + diffuse*36 + spec*21 : 60 + diffuse*24 + spec*14;
      if (p.f.kind === 'bevel') l += 10;
      if (p.f.kind === 'edge') l -= 9 + p.f.ridge*3;
      polygon(ink,p.vertices.map(project));
      ink.fillStyle = `hsl(${hue} ${saturation}% ${clamp(l,20,95)}%)`; ink.fill();
      ink.strokeStyle = ink.fillStyle; ink.lineWidth = .6; ink.stroke();
    }
    // Face decoration follows the same projected plane, including on the reverse.
    const z = visibleFace*.203, normal = turn([0,0,visibleFace]);
    if (normal[2] > .08) {
      for (const r of [.71,.76]) {
        polygon(ink,circle(r,z).map(turn).map(project));
        ink.strokeStyle = r === .71 ? `hsl(${hue} 24% 24% / .40)` : `hsl(${hue} 24% 94% / .70)`;
        ink.lineWidth = r === .71 ? 1.8 : 1.2; ink.stroke();
      }
      const c = project(turn([0,0,z])), x = project(turn([visibleFace,0,z])), y = project(turn([0,-1,z]));
      ink.save(); ink.setTransform((x[0]-c[0])/UNIT,(x[1]-c[1])/UNIT,(y[0]-c[0])/UNIT,(y[1]-c[1])/UNIT,c[0],c[1]);
      ink.font = `italic 400 ${t.sym.length > 2 ? 58 : t.sym.length > 1 ? 70 : 88}px 'Instrument Serif',Georgia,serif`;
      ink.textAlign = 'center'; ink.textBaseline = 'middle';
      ink.fillStyle = `hsl(${hue} 30% ${dark?20:38}% / ${dark?.78:.45})`; ink.fillText(t.sym,1.5,3.5);
      ink.fillStyle = `hsl(${hue} 24% 96% / .94)`; ink.fillText(t.sym,0,1);
      ink.restore();
    }
    const hull = rings.flat().map(turn).map(project);
    return hull;
  }
  function focusAt(t,time) { return smooth((1+Math.sin(time*TAU/t.focusPeriod+t.phase))*.5); }
  function stateAt(t,time) {
    const progress = ((t.start+time/t.duration)%1+1)%1, range = H+t.r*6;
    const x = t.x+Math.sin(time*.25+t.phase)*t.sway+(progress-.5)*t.drift;
    const y = -t.r*3+progress*range;
    const focus = focusAt(t,time), sharp = focus+(1-focus)*t.hover;
    const fade = smooth((y+t.r*1.6)/(t.r*2.4))*smooth((H+t.r*1.6-y)/(t.r*2.4));
    const lt = document.documentElement.dataset.theme !== 'dusk';
    const quiet = W < 760 || (W-1180)/2 < 100 ? .42 : 1;
    return {x,y,blur:.2+(1-sharp)*5.6+(quiet<1?1.2:0),alpha:fade*quiet*((lt?.62:.42)+.2*sharp+.18*t.hover)};
  }
  function draw(dt = 0) {
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    for (const t of tokens) {
      const desired = hover === t ? 1 : 0;
      t.hover = motion.matches ? desired : t.hover+(desired-t.hover)*(1-Math.exp(-dt/.28));
      const s = stateAt(t,elapsed), k = t.r/UNIT, hull = renderMesh(t,elapsed);
      ctx.save(); ctx.globalAlpha = s.alpha;
      ctx.filter = `blur(${s.blur.toFixed(3)}px)`;
      ctx.drawImage(sprite,s.x-128*k,s.y-128*k,256*k,256*k); ctx.restore();
      const xs = hull.map(v => s.x+(v[0]-128)*k), ys = hull.map(v => s.y+(v[1]-128)*k);
      t.screen = {...s,left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
    }
  }
  function layout() {
    W = innerWidth; H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1,1.25,Math.sqrt(1300000/Math.max(1,W*H)));
    cv.width = Math.max(1,Math.round(W*dpr)); cv.height = Math.max(1,Math.round(H*dpr));
    cv.style.width = W+'px'; cv.style.height = H+'px';
    const gutter = Math.max(0,(W-1180)/2), count = W < 760 ? 5 : (gutter >= 100 ? 12 : 8);
    tokens = Array.from({length:count},(_,i) => {
      const depth = rand(.3,1), r = (30+depth*24)*(W < 760 ? .55 : gutter >= 100 ? 1 : .8);
      const side = i%2 === 0 ? -1 : 1;
      const x = gutter >= 100 ? (side < 0 ? gutter*.48 : W-gutter*.48) : (side < 0 ? rand(4,W*.12) : rand(W*.88,W-4));
      const coin = i%CODES.length;
      return {code:CODES[coin],sym:SYMBOLS[coin],depth,r,x,start:(i+.32)/count,duration:rand(27,39),
        pitch:rand(.42,.66),yaw:rand(-.9,.9),roll:side*rand(.28,.55),tumble:rand(.13,.23),
        spin:rand(.21,.38)*side,rollSpeed:side*rand(.013,.032),phase:rand(0,TAU),
        sway:Math.min(16,gutter*.10 || 12),drift:side*Math.min(36,gutter*.20 || 24),focusPeriod:rand(8,12),hover:0};
    }).sort((a,b) => a.depth-b.depth);
    resetHover(); draw();
  }
  function frame(now) {
    raf = null;
    if (document.hidden || motion.matches) { last = null; return; }
    const dt = last === null ? 0 : Math.min((now-last)/1000,.08);
    last = now; elapsed += dt;
    if (paintAt < 0 || now-paintAt >= 1000/30) {
      draw(paintAt < 0 ? 0 : Math.min((now-paintAt)/1000,.12)); paintAt = now;
    }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (raf === null && !motion.matches && !document.hidden) raf = requestAnimationFrame(frame); }
  function stop() { if (raf !== null) cancelAnimationFrame(raf); raf = null; last = null; paintAt = -1; }
  function resetHover() { hover = null; document.body.classList.remove('bg3d-hit'); }
  function hitTest(x,y) {
    for (let i = tokens.length-1; i >= 0; i--) {
      const t = tokens[i], s = t.screen;
      if (!s || s.alpha < .16) continue;
      const rx = Math.max(6,(s.right-s.left)/2), ry = Math.max(6,(s.bottom-s.top)/2);
      const dx = (x-(s.left+s.right)/2)/rx, dy = (y-(s.top+s.bottom)/2)/ry;
      if (dx*dx+dy*dy <= 1) return t;
    }
    return null;
  }
  const BLOCK = 'a,button,input,select,textarea,table,[role="button"],.card,.panel,.modal,.hdr,header,footer,section .wrap > *';
  const overUI = e => !!(e.target && e.target.closest && e.target.closest(BLOCK));
  function init() {
        (document.querySelector('.aura') || document.body).after ? (document.querySelector('.aura') ? document.querySelector('.aura').after(cv) : document.body.prepend(cv)) : document.body.prepend(cv); layout(); start();
    addEventListener('pointermove',e => {
      const next = overUI(e) ? null : hitTest(e.clientX,e.clientY);
      if (hover === next) return;
      hover = next; document.body.classList.toggle('bg3d-hit',!!next);
      if (motion.matches) draw();
    },{passive:true});
    document.addEventListener('pointerleave',() => { resetHover(); if (motion.matches) draw(); });
    addEventListener('click',e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || overUI(e)) return;
      const t = hitTest(e.clientX,e.clientY); if (!t) return;
      e.preventDefault(); const path = '/markets';
      if (typeof window.nav === 'function') window.nav(path); else location.href = path;
    });
    addEventListener('resize',() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout,160); });
    document.addEventListener('visibilitychange',() => {
      if (document.hidden) { stop(); resetHover(); } else { draw(); start(); }
    });
    const changed = () => { stop(); resetHover(); draw(); start(); };
    if (motion.addEventListener) motion.addEventListener('change',changed);
    else if (motion.addListener) motion.addListener(changed);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!document.hidden) draw(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
