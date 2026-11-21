/* Uravu – family tree: zoom, tools, drawing */
/* ---------- zoom the tree with mouse wheel / trackpad / two-finger pinch ---------- */
function applyZoom(z, cx, cy) {
  const sc = $('.tree-scroll'), tree = $('.tree'), size = $('.tree-size'); if (!sc || !tree || !size) return;
  const c = cur(), z0 = c.zoom || 1; z = Math.max(0.35, Math.min(1.6, z));
  if (Math.abs(z - z0) < 0.002) return;
  const r = sc.getBoundingClientRect(), s0 = size.getBoundingClientRect();
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  const ux = (cx - s0.left) / z0, uy = (cy - s0.top) / z0;     // the tree point under the finger, unscaled
  tree.style.transform = `scale(${z})`;
  size.style.width = Number(tree.dataset.w) * z + 'px'; size.style.height = Number(tree.dataset.h) * z + 'px';
  c.zoom = Math.round(z * 1000) / 1000;
  const s1 = size.getBoundingClientRect();                      // keep that point under the finger
  sc.scrollLeft += (s1.left + ux * z) - cx;
  sc.scrollTop += (s1.top + uy * z) - cy;
  if (tree.classList.contains('far') !== z < FAR) { tree.classList.toggle('far', z < FAR); treeFit(); }
  treeBandX();
  const pct = $('.zpct'); if (pct) pct.textContent = Math.round(z * 100) + '%';
}
document.addEventListener('wheel', e => {
  if (!e.target.closest || !e.target.closest('.tree-scroll')) return;
  if (!e.ctrlKey && Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // sideways scrolling still pans
  e.preventDefault();
  const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;               // lines → pixels
  applyZoom((cur().zoom || 1) * Math.exp(-step * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
}, { passive: false });
let pinch = null;
const tDist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
document.addEventListener('touchstart', e => {
  if (e.touches.length === 2 && e.target.closest && e.target.closest('.tree-scroll')) pinch = { d: tDist(e.touches), z: cur().zoom || 1 };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  applyZoom(pinch.z * tDist(e.touches) / pinch.d, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
}, { passive: false });
document.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });
/* drag the tree with the mouse (fingers already drag it natively) */
let drag = null, justDragged = false;
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !e.target.closest) return;
  const sc = e.target.closest('.tree-scroll'); if (!sc) return;
  drag = { sc, x: e.clientX, y: e.clientY, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;   // small wobble is still a tap
  if (!drag.moved) { drag.moved = true; drag.sc.classList.add('dragging'); }
  drag.sc.scrollLeft -= dx; drag.sc.scrollTop -= dy;
  drag.x = e.clientX; drag.y = e.clientY; e.preventDefault();
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.moved) { justDragged = true; setTimeout(() => { justDragged = false; }, 0); }
  drag.sc.classList.remove('dragging'); drag = null;
});
// a drag that ends on a person shouldn’t open them
document.addEventListener('click', e => { if (justDragged) { e.stopPropagation(); e.preventDefault(); justDragged = false; } }, true);

/* ---------- tree layout helpers ---------- */
// shrink any term or name that is wider than its box (a long Tamil word cannot wrap)
function treeFit() {
  const els = [...document.querySelectorAll('.tnode .t, .tnode .n')];
  els.forEach(el => { el.style.fontSize = ''; });
  els.forEach(el => {
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = Math.max(8, Math.floor(fs * el.clientWidth / el.scrollWidth * 10) / 10) + 'px';
  });
}
// keep each generation label at the left edge of what is on screen
function treeBandX() {
  const sc = $('.tree-scroll'), tree = $('.tree'); if (!sc || !tree) return;
  tree.style.setProperty('--bx', sc.scrollLeft / (cur().zoom || 1) + 'px');
}
document.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('tree-scroll')) treeBandX(); }, true);

/* ---------- tree tools: find, centre, full screen, keyboard, double-click, save as image ---------- */
function treeFocus(id, flash) {
  const sc = $('.tree-scroll'), n = [...document.querySelectorAll('.tnode')].find(x => x.dataset.id === id); if (!sc || !n) return;
  const z = cur().zoom || 1;
  sc.scrollLeft = n.offsetLeft * z - sc.clientWidth / 2 + TW * z / 2;
  sc.scrollTop = n.offsetTop * z - sc.clientHeight / 2 + TH * z / 2;
  if (flash) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); }
}
function treeFindList() {
  const box = $('.tfind'), q = $('#tfindIn').value.trim().toLowerCase();
  const nodes = [...document.querySelectorAll('.tnode')].map(n => n.dataset.id);
  const hits = nodes.map(id => ({ p: S.people[id], id })).filter(({ p, id }) => { if (!q) return true; return [p.name, p.tamilName, p.nickname].some(v => v && v.toLowerCase().includes(q)) || [...n2t(id)].some(v => v && String(v).toLowerCase().includes(q)); })
    .sort((a, b) => a.p.name.localeCompare(b.p.name)).slice(0, 30);
  box.querySelector('.tfind-list').innerHTML = hits.length ? hits.map(({ p, id }) => `<button class="ppick-opt" data-act="tree-goto" data-id="${esc(id)}">${avatar(p, 'sm')}<span class="tx"><b>${esc(p.name)}</b><small>${esc(n2t(id)[0])}</small></span></button>`).join('')
    : `<p class="muted" style="margin:8px 10px;font-size:.88rem">No one in this tree matches. Try “Everyone” above.</p>`;
}
// the term shown on this person's box in the current tree
const n2t = id => { const n = document.querySelector(`.tnode[data-id="${id}"] .t`); return [n ? n.textContent : '', n ? n.closest('.tnode').title : '']; };
// turning the phone or resizing the window across the phone size redraws the boxes at the right size
window.addEventListener('resize', () => { const c = cur(); if (c.p === 'family' && $('.tree') && (window.innerWidth < 600) !== TCOMPACT) { delete c.zoom; rerender(); } });
document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('tkey')) ui.treeKey = e.target.open; }, true);
document.addEventListener('dblclick', e => {
  if (!e.target.closest || !e.target.closest('.tree-scroll') || e.target.closest('.tnode')) return;
  e.preventDefault(); applyZoom((cur().zoom || 1) * 1.5, e.clientX, e.clientY);
});
document.addEventListener('keydown', e => {
  if (document.body.classList.contains('tree-full') && e.key === 'Escape' && !e.target.closest?.('.tfind')) { e.stopImmediatePropagation(); H['tree-full'](); return; }
  const sc = e.target.closest && e.target.closest('.tree-scroll'); if (!sc) return;
  const k = e.key, z = cur().zoom || 1, step = 80;
  if (k === '+' || k === '=') applyZoom(z * 1.25); else if (k === '-' || k === '_') applyZoom(z / 1.25); else if (k === '0') H.zoom('fit');
  else if (k === 'ArrowLeft') sc.scrollLeft -= step; else if (k === 'ArrowRight') sc.scrollLeft += step;
  else if (k === 'ArrowUp') sc.scrollTop -= step; else if (k === 'ArrowDown') sc.scrollTop += step;
  else return;
  e.preventDefault();
}, true);
async function treePng() {
  const tree = $('.tree'); if (!tree) return;
  const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
  const W = Number(tree.dataset.w), H0 = Number(tree.dataset.h), top = 56, H = H0 + top + 20, sc2 = 2;
  const x = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
  // Measure text so long Tamil terms and names wrap onto 2 lines (and shrink if needed) instead of spilling out of the box
  const mctx = document.createElement('canvas').getContext('2d');
  const widthOf = (t, font, size) => { if (mctx && mctx.measureText) { mctx.font = font; return mctx.measureText(t).width; } return t.length * size * 0.62; };
  const fit = (text, fam, weight, sizes, maxW, maxLines) => {
    for (const size of sizes) {
      const font = `${weight} ${size}px ${fam}`, words = String(text).split(/\s+/).filter(Boolean), lines = []; let line = '';
      for (const w of words) { const t2 = line ? line + ' ' + w : w; if (!line || widthOf(t2, font, size) <= maxW) line = t2; else { lines.push(line); line = w; } }
      if (line) lines.push(line);
      const ok = lines.length <= maxLines && lines.every(l => widthOf(l, font, size) <= maxW);
      if (ok || size === sizes[sizes.length - 1]) {
        const dropped = lines.length > maxLines; if (dropped) lines.length = maxLines;
        for (let i = 0; i < lines.length; i++) {           // last resort: trim with …
          let l = lines[i]; const ell = (dropped && i === lines.length - 1) || widthOf(l, font, size) > maxW;
          while (l.length > 1 && widthOf(l + (ell ? '…' : ''), font, size) > maxW) l = l.slice(0, -1);
          lines[i] = l + (ell ? '…' : '');
        }
        return { size, lines };
      }
    }
  };
  const TAMIL_FONT = "'Noto Serif Tamil','Noto Sans Tamil','Latha','Tamil Sangam MN',sans-serif", MAXW = TW - (TCOMPACT ? 12 : 18);
  const textLines = (lines, cx, y0, size, attrs) => lines.map((l, i) => `<text x="${cx}" y="${y0 + i * size * 1.25}" text-anchor="middle" font-size="${size}" ${attrs}>${x(l)}</text>`).join('');
  const sideCol = { 'side-f':'#1E8C7E', 'side-m':'#C2477A', 'side-in':'#C98A12' };
  let body = '';
  tree.querySelectorAll('.tband').forEach(b => {
    const t = parseFloat(b.style.top) + top;
    body += `<rect x="0" y="${t}" width="${W}" height="${parseFloat(b.style.height)}" rx="20" fill="${v('--soft')}" fill-opacity=".7"/>`;
    b.querySelectorAll('span').forEach(sp => { body += `<text x="${parseFloat(sp.style.left)}" y="${t + 18}" font-family="${TAMIL_FONT.replace(/"/g, '')}" font-weight="700" font-size="11.5" fill="${v('--muted')}">${x(sp.textContent)}</text>`; });
  });
  tree.querySelectorAll('svg path').forEach(p => {
    const d = p.getAttribute('d'); if (!d) return;
    const main = p.classList.contains('main'), dash = p.classList.contains('dash'), fc = p.dataset.c;
    body += `<path d="${d}" transform="translate(0 ${top})" fill="none" stroke="${fc || (main ? v('--primary') : v('--muted'))}" stroke-width="${fc ? 2 : main ? 2.4 : 1.6}" stroke-opacity="${fc ? 1 : main ? .95 : .55}" stroke-linecap="round"${dash ? ' stroke-dasharray="4 4"' : ''}/>`;
  });
  tree.querySelectorAll('.tnode').forEach(n => {
    const l = parseFloat(n.style.left), t = parseFloat(n.style.top) + top, p = S.people[n.dataset.id], ego = n.classList.contains('ego');
    const side = [...n.classList].find(c => sideCol[c]);
    body += `<rect x="${l}" y="${t}" width="${TW}" height="${TH}" rx="${TCOMPACT ? 15 : 18}" fill="${ego ? v('--primary-soft') : v('--bg')}" stroke="${ego ? v('--primary') : v('--line')}" stroke-width="1.5"/>`;
    if (side) body += `<path d="M${l + 9} ${t + 1.5}H${l + TW - 9}" stroke="${sideCol[side]}" stroke-width="4" stroke-linecap="round"/>`;
    const R = TCOMPACT ? 16 : 20, cx = l + TW / 2, cy = t + (TCOMPACT ? 22 : 28);
    if (p.photo) body += `<clipPath id="c${n.dataset.id}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><image href="${p.photo}" x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" clip-path="url(#c${n.dataset.id})" preserveAspectRatio="xMidYMid slice"/>`;
    else body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${hue(p.id)}" fill-opacity=".15"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${TCOMPACT ? 14 : 16}" fill="${hue(p.id)}">${x((p.name || '?')[0].toUpperCase())}</text>`;
    const term = fit(n.querySelector('.t').textContent, TAMIL_FONT, 700, TCOMPACT ? [12, 11, 10] : [13, 11.5, 10.5], MAXW, 2);
    const nm = fit(p.name, 'sans-serif', 600, TCOMPACT ? [11, 10, 9.5] : [12, 11, 10], MAXW, 2);
    const termY = t + (TCOMPACT ? 52 : 68), nameY = termY + term.lines.length * term.size * 1.25 + 4;
    body += textLines(term.lines, cx, termY, term.size, `font-family="${TAMIL_FONT.replace(/"/g, '')}" font-weight="700" fill="${ego ? v('--primary') : v('--tamil')}"`);
    body += textLines(nm.lines, cx, nameY, nm.size, `font-family="sans-serif" font-weight="600" fill="${v('--ink')}"`);
  });
  const who = cur().pov && S.people[cur().pov] ? cur().pov : S.me;   // the person whose view is on screen
  const title = S.people[who].name + '’s family  ·  Uravu';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * sc2}" height="${H * sc2}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${v('--bg')}"/><text x="16" y="34" font-family="sans-serif" font-weight="700" font-size="18" fill="${v('--ink')}">${x(title)}</text>${body}</svg>`;
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const cv = document.createElement('canvas'); cv.width = W * sc2; cv.height = H * sc2;
    cv.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    if (!blob) { toast('The tree is too big for one image. Try “Close family”.'); return; }
    saveFile(`uravu-family-tree-${new Date().toISOString().slice(0, 10)}.png`, blob);
    toast('Tree image saved');
  } catch (e) { toast('Couldn’t make the image here.'); }
}

/* ---------- drawn family tree ---------- */
const FAR = 0.6;   // below this zoom the boxes drop the photo and show big words instead
// box sizes; phones get smaller boxes so more of the family fits on screen
let TW = 104, TH = 136, TCG = 16, TUG = 28, TCOMPACT = false;
const TRG = 66, TPAD = 22;
function treeSizes() {
  TCOMPACT = window.innerWidth < 600;
  [TW, TH, TCG, TUG] = TCOMPACT ? [86, 102, 12, 18] : [104, 136, 16, 28];
}
function treeHTML(linked, chips = '') {
  treeSizes();
  const lang = S.settings.lang, ids = new Set(linked.map(x => x.p.id)), K = {};
  linked.forEach(x => { K[x.p.id] = x.k; });
  const parentsOf = id => S.edges.filter(e => e.type === 'parent' && e.child === id && ids.has(e.parent)).map(e => e.parent);
  const childrenOf = id => S.edges.filter(e => e.type === 'parent' && e.parent === id && ids.has(e.child)).map(e => e.child);
  const sibsOf = id => S.edges.filter(e => e.type === 'sibling' && (e.a === id || e.b === id)).map(e => e.a === id ? e.b : e.a).filter(o => ids.has(o));

  // 1. couples become one unit so they always sit side by side. Someone married more than once
  //    sits in the middle with a husband/wife on each side: [wife 1] [husband] [wife 2]
  const unitOf = {}, units = [];
  const spIn = id => spousesOf(id).filter(o => ids.has(o) && K[o].gen === K[id].gen);
  const arrange = (hub, sps) => { const k = Math.floor(sps.length / 2); return [...sps.slice(0, k), hub, ...sps.slice(k)]; };
  const sorted = [...linked].sort((a, b) => a.k.tk.join('.').localeCompare(b.k.tk.join('.')));
  for (const { p } of sorted) {
    if (unitOf[p.id]) continue;
    const grp = [p.id];
    for (let i = 0; i < grp.length; i++) for (const o of spIn(grp[i])) if (!unitOf[o] && !grp.includes(o)) grp.push(o);
    const hub = grp.reduce((a, b) => spIn(b).length > spIn(a).length ? b : a);
    const u = { m: arrange(hub, grp.filter(x => x !== hub)), hub, g: K[p.id].gen, x: 0 };
    units.push(u); u.m.forEach(m => { unitOf[m] = u; });
  }
  const gens = [...new Set(units.map(u => u.g))].sort((a, b) => b - a);
  const rows = {}; gens.forEach(g => { rows[g] = units.filter(u => u.g === g); });
  const nIdx = u => rows[u.g].indexOf(u) / Math.max(1, rows[u.g].length - 1);
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;

  // 2. order each row so children sit under parents and siblings stay together
  const relUnits = (u, fn, dg) => [...new Set(u.m.flatMap(fn).map(o => unitOf[o]).filter(v => v && v.g === u.g + dg))];
  function orderRow(g, dg, fn) {
    const row = rows[g];
    const key = new Map(row.map(u => { const r = relUnits(u, fn, dg); return [u, r.length ? avg(r.map(nIdx)) : nIdx(u)]; }));
    row.sort((a, b) => key.get(a) - key.get(b));
    for (const u of row) if (u.m.length > 1) {
      const pull = m => { const r = [...parentsOf(m), ...sibsOf(m)].map(o => unitOf[o]).filter(v => v && v !== u); return r.length ? avg(r.map(nIdx)) - nIdx(u) : 0; };
      if (u.m.length === 2) { if (pull(u.m[0]) > pull(u.m[1])) u.m.reverse(); }
      else u.m = arrange(u.hub, u.m.filter(m => m !== u.hub).sort((a, b) => pull(a) - pull(b)));
    }
    const placed = new Set(), out = [];
    for (const u of row) {
      if (placed.has(u)) continue;
      const cl = [u]; placed.add(u);
      const grow = (v, dir) => v.m.forEach((m, mi) => {
        const mid = (v.m.length - 1) / 2, d = v.m.length > 1 && mi !== mid ? (mi < mid ? -1 : 1) : dir;
        for (const s of sibsOf(m).map(o => unitOf[o]).filter(w => w && w.g === v.g)) { if (placed.has(s)) continue; placed.add(s); d < 0 ? cl.unshift(s) : cl.push(s); grow(s, d); }
      });
      grow(u, 1); out.push(...cl);
    }
    rows[g] = out;
  }
  for (let pass = 0; pass < 2; pass++) {
    gens.slice(1).forEach(g => orderRow(g, 1, parentsOf));
    gens.slice(0, -1).reverse().forEach(g => orderRow(g, -1, childrenOf));
  }
  gens.slice(1).forEach(g => orderRow(g, 1, parentsOf));

  // 3. x positions: place each row near the people it hangs from
  const uw = u => u.m.length * TW + (u.m.length - 1) * TCG;
  const px = id => { const u = unitOf[id]; return u.x + u.m.indexOf(id) * (TW + TCG) + TW / 2; };
  function placeRow(g, desired) {
    let end = null; const devs = [];
    for (const u of rows[g]) {
      const d = desired(u);
      let x = d == null ? (end == null ? 0 : end + TUG) : d - uw(u) / 2;
      if (end != null) x = Math.max(x, end + TUG);
      u.x = x; end = x + uw(u);
      if (d != null) devs.push(d - (x + uw(u) / 2));
    }
    if (devs.length) { const sh = avg(devs); rows[g].forEach(u => { u.x += sh; }); }
  }
  const fromParents = u => { const ps = u.m.flatMap(parentsOf); return ps.length ? avg(ps.map(px)) : null; };
  const fromChildren = u => { const cs = u.m.flatMap(childrenOf); return cs.length ? avg(cs.map(px)) : null; };
  placeRow(gens[0], () => null);
  gens.slice(1).forEach(g => placeRow(g, fromParents));
  gens.slice(0, -1).reverse().forEach(g => placeRow(g, fromChildren));
  gens.slice(1).forEach(g => placeRow(g, fromParents));
  const minX = Math.min(...units.map(u => u.x)), maxX = Math.max(...units.map(u => u.x + uw(u)));
  units.forEach(u => { u.x += 16 - minX; });
  const W = maxX - minX + 32;
  // every set of parents with their children is one "family"; each family gets its own joining bar
  const groups = new Map();
  for (const id of ids) {
    const ps = parentsOf(id); if (!ps.length) continue;
    const k = ps.sort().join('|'); if (!groups.has(k)) groups.set(k, { ps, kids: [] }); groups.get(k).kids.push(id);
  }
  // bars of different families that would run over each other are put at different heights (lanes)
  const LG = 13, byGen = {}, laneCount = {};
  for (const gr of groups.values()) {
    const pu = unitOf[gr.ps[0]], xs = gr.kids.map(px);
    const i = pu.m.indexOf(gr.ps[0]), j = gr.ps.length === 2 && unitOf[gr.ps[1]] === pu ? pu.m.indexOf(gr.ps[1]) : -1;
    // children of a couple sitting side by side hang from the married line between them;
    // otherwise from the bottom of the parent's card (the wife/husband who isn't next to the shared parent)
    const couple = j >= 0 && Math.abs(i - j) === 1, far = j >= 0 && !couple ? (gr.ps[0] === pu.hub ? gr.ps[1] : gr.ps[0]) : gr.ps[0];
    gr.pu = pu; gr.couple = couple; gr.ox = couple ? pu.x + Math.min(i, j) * (TW + TCG) + TW + TCG / 2 : px(far);
    gr.x1 = Math.min(gr.ox, ...xs); gr.x2 = Math.max(gr.ox, ...xs);
    (byGen[pu.g] = byGen[pu.g] || []).push(gr);
  }
  for (const g in byGen) {
    const ends = [];
    byGen[g].sort((a, b) => a.x1 - b.x1 || a.x2 - b.x2).forEach(gr => {
      let l = ends.findIndex(e => e + 16 < gr.x1); if (l < 0) { l = ends.length; ends.push(0); }
      ends[l] = gr.x2; gr.lane = l;
    });
    laneCount[g] = ends.length;
  }
  // each generation sits on its own shaded band with a label; the joining bars run in the clear space between bands
  const BT = 26, BB = 10, gapOf = g => BB + 16 + ((laneCount[g] || 1) - 1) * LG + 16 + BT;
  const tops = {}; let yEnd = BT + 6;
  gens.forEach(g => { tops[g] = yEnd; yEnd += TH + gapOf(g); });
  const top = g => tops[g], H = yEnd - gapOf(gens[gens.length - 1]) + BB + 8;
  let famIdx = 0;
  gens.forEach(g => (byGen[g] || []).forEach(gr => { gr.ci = famIdx++; }));

  // 4. lines: couples, parent → children, and siblings whose parents aren’t saved
  let paths = '', dashed = '';
  // the selected person’s own line (parents, grandparents, children…) is drawn in blue
  const line = new Set([ego()]);
  { const up = [ego()], down = [ego()]; while (up.length) { for (const p of parentsOf(up.pop())) if (!line.has(p)) { line.add(p); up.push(p); } } while (down.length) { for (const k of childrenOf(down.pop())) if (!line.has(k)) { line.add(k); down.push(k); } } }
  let mainPaths = '', famPaths = '';
  // married couples are joined by a double line
  // (husband and wife not side by side – a second wife beyond the first – get the double line over the top of the cards)
  for (const u of units) if (u.m.length > 1) for (const e of S.edges) {
    if (e.type !== 'spouse') continue;
    const i = u.m.indexOf(e.a), j = u.m.indexOf(e.b); if (i < 0 || j < 0) continue;
    const l = Math.min(i, j), r = Math.max(i, j), y = top(u.g) + (TCOMPACT ? 30 : 36);
    let d;
    if (r - l === 1) { const x1 = u.x + l * (TW + TCG) + TW, x2 = x1 + TCG; d = `M${x1} ${y - 3}H${x2}M${x1} ${y + 3}H${x2}`; }
    else { const t = top(u.g), a = u.x + l * (TW + TCG) + TW / 2, b = u.x + r * (TW + TCG) + TW / 2; d = `M${a - 3} ${t}V${t - 7}H${b + 3}V${t}M${a + 3} ${t}V${t - 3}H${b - 3}V${t}`; }
    if (line.has(e.a) || line.has(e.b)) mainPaths += d; else paths += d;
  }
  // from the joining bar down to one child, with a rounded corner
  const leg = (ox, oy, busY, cx, cy) => {
    const dx = cx - ox, sg = dx > 0 ? 1 : -1, r = Math.min(9, Math.abs(dx) / 2, (cy - busY) / 2, (busY - oy) / 2);
    return Math.abs(dx) < 1 ? `M${ox} ${oy}V${cy}` : `M${ox} ${oy}V${busY - r}Q${ox} ${busY} ${ox + sg * r} ${busY}H${cx - sg * r}Q${cx} ${busY} ${cx} ${busY + r}V${cy}`;
  };
  const FAMC = ['#D9480F', '#2B8A3E', '#9C36B5', '#0B7285', '#C2255C', '#B7791F', '#5F3DC4', '#087F5B'];
  for (const { ps, kids, pu, couple, ox, lane, ci } of groups.values()) {
    const oy = couple ? top(pu.g) + (TCOMPACT ? 33 : 39) : top(pu.g) + TH, busY = top(pu.g) + TH + BB + 16 + lane * LG;
    const legs = list => list.map(c => leg(ox, oy, busY, px(c), top(K[c].gen))).join('');
    const onLine = ps.some(p => line.has(p)) ? kids.filter(k => line.has(k)) : [], rest = kids.filter(k => !onLine.includes(k));
    // the selected person’s own line is blue; every other family gets its own colour
    if (onLine.length) mainPaths += legs(onLine);
    if (rest.length) { const col = FAMC[ci % FAMC.length]; famPaths += `<path d="${legs(rest)}" class="tl fam" style="stroke:${col}" data-c="${col}"/>`; }
  }
  const seenSib = new Set();
  for (const e of S.edges) if (e.type === 'sibling' && ids.has(e.a) && ids.has(e.b) && K[e.a].gen === K[e.b].gen) {
    const shared = parentsOf(e.a).some(p => parentsOf(e.b).includes(p));
    const key = [e.a, e.b].sort().join('|'); if (shared || seenSib.has(key)) continue; seenSib.add(key);
    const y = top(K[e.a].gen), yy = y - 12;
    dashed += `M${px(e.a)} ${y}V${yy}H${px(e.b)}V${y}`;
  }

  const sideOf = k => { const t = k.tk[0]; if (t === 'F') return 'f'; if (t === 'M') return 'm'; if (t && 'HWX'.includes(t) && k.tk.length > 1) return 'in'; return ''; };
  const sidesUsed = new Set();
  const node = id => {
    const p = S.people[id], k = K[id], isEgo = id === ego(), side = sideOf(k);
    if (side) sidesUsed.add(side);
    const longest = Math.max(...p.name.split(/\s+/).map(s => s.length));
    const main = lang === 'en' ? k.en : (k.custom || k.ta);
    return `<button class="tnode${isEgo ? ' ego' : ''}${side ? ' side-' + side : ''}" style="left:${px(id) - TW / 2}px;top:${top(k.gen)}px" data-act="${isEgo ? 'person' : 'pov'}" data-id="${esc(id)}" title="${esc(k.tl + ' (' + k.en + ')')}">
      ${avatar(p)}<span class="t${lang === 'en' ? ' en' : ''}${main.length > 9 ? ' long' : ''}">${esc(main)}</span><span class="n${longest > 15 ? ' xlong' : longest > 11 ? ' long' : ''}">${esc(p.name)}</span></button>`;
  };
  const nodesHTML = [...ids].map(node).join('');
  const SIDES = { f:['Appa side','அப்பா வழி'], m:['Amma side','அம்மா வழி'], in:['In-laws','மாமனார் வீடு'] };
  const legend = `<div class="legend">${['f', 'm', 'in'].filter(s => sidesUsed.has(s)).map(s => `<span><i class="sw ${s}"></i>${SIDES[s][0]} <span class="ta">${SIDES[s][1]}</span></span>`).join('')}
    <span><i class="lg-eq"></i>Married</span><span><i class="sw" style="background:var(--primary)"></i>${ego() === S.me ? 'Your' : esc(S.people[ego()].name) + '’s'} direct line</span>${famPaths ? `<span><i class="lg-multi"></i>Each colour is one set of parents and their children</span>` : ''}</div>`;
  const bands = gens.map(g => {
    const [en, ta] = GEN_LABEL(g), lbl = lang === 'en' || !ta ? en : lang === 'ta' ? ta : en + ' · ' + ta;
    return `<div class="tband" style="top:${top(g) - BT}px;height:${TH + BT + BB}px"><span style="left:14px">${esc(lbl)}</span></div>`;
  }).join('');
  const z = cur().zoom || 1;
  const egoName = ego() === S.me ? 'you' : S.people[ego()].name;
  const key = `<details class="tkey"${ui.treeKey ? ' open' : ''}><summary>What do the colours and lines mean?</summary>${legend}<p>Each shaded row is one generation. Follow a coloured line down from a couple to find their children. Blue is ${ego() === S.me ? 'your' : esc(S.people[ego()].name) + '’s'} own line: parents, grandparents and children.</p><p>Drag to move. Pinch, scroll or use − / + to zoom. Tap a person to see the family through their eyes.</p></details>`;
  return key + `<div class="tree-wrap">
    <div class="tbar" role="toolbar" aria-label="Tree controls">
      ${chips ? `<div class="chips tchips">${chips}</div>` : ''}
      <button data-act="tree-find" aria-label="Find a person in the tree" title="Find a person">${ICON.search}</button>
      <button data-act="tree-center" aria-label="Go to ${esc(egoName)}" title="Go to ${esc(egoName)}">${ICON.target}</button>
      <span class="zgrp"><button data-act="zoom" data-id="out" aria-label="Zoom out">−</button><span class="zpct" aria-live="polite">${Math.round(z * 100)}%</span><button data-act="zoom" data-id="in" aria-label="Zoom in">+</button></span>
      <button data-act="zoom" data-id="fit" title="Fit the whole tree">Fit</button>
      <button data-act="tree-full" aria-label="${cur().full ? 'Exit full screen' : 'Full screen'}" title="${cur().full ? 'Exit full screen' : 'Full screen'}">${cur().full ? ICON.shrink : ICON.expand}</button>
      <button data-act="tree-png" aria-label="Save tree as image" title="Save as image">${ICON.download}</button>
    </div>
    <div class="tfind" hidden><input id="tfindIn" type="search" placeholder="Find someone in this tree" autocomplete="off" aria-label="Find someone in this tree"><div class="tfind-list"></div></div>
    <div class="tree-scroll" tabindex="0" aria-label="Family tree. Use plus, minus and arrow keys to zoom and move."><div class="tree-size" style="width:${W * z}px;height:${H * z}px"><div class="tree${TCOMPACT ? ' compact' : ''}${z < FAR ? ' far' : ''}" data-w="${W}" data-h="${H}" style="width:${W}px;height:${H}px;transform:scale(${z});transform-origin:0 0">
    ${bands}<svg width="${W}" height="${H}" aria-hidden="true"><path d="${paths}" class="tl"/><path d="${dashed}" class="tl dash"/>${famPaths}<path d="${mainPaths}" class="tl main"/></svg>
    ${nodesHTML}</div></div></div></div>
`;
}
function pgFamily() {
  const lang = S.settings.lang, isMine = ego() === S.me, povName = S.people[ego()].name;
  const fam = Object.values(S.people).map(p => ({ p, k: kinOf(p.id) }));
  const allLinked = fam.filter(x => x.k.family), loose = fam.filter(x => !x.k.family && x.p.circle === 'family');
  // How much of the family to show: close (default), extended, or everyone
  const scope = S.settings.treeScope || 'close';
  const inScope = (k, sc) => {
    const tk = k.tk || [], P = t => 'FMP'.includes(t), C = t => 'SDC'.includes(t), Sp = t => 'HWX'.includes(t);
    if (!tk.length || sc === 'all') return true;
    if (sc === 'extended') return tk.length <= 3;
    // a parent’s or grandparent’s other husband/wife (step-mother, step-grandmother) counts as close family too
    return tk.length === 1 || (tk.length === 2 && ((P(tk[0]) && P(tk[1])) || (C(tk[0]) && C(tk[1])) || (Sp(tk[0]) && P(tk[1])) || (P(tk[0]) && Sp(tk[1]))))
      || (tk.length === 3 && P(tk[0]) && P(tk[1]) && Sp(tk[2]));
  };
  const linked = allLinked.filter(x => inScope(x.k, scope));
  const cnt = sc => allLinked.filter(x => inScope(x.k, sc)).length;
  const scopeChips = `${[['close', 'Close family'], ['extended', 'Extended'], ['all', 'Everyone']].map(([v, l]) => `<button class="chip" data-act="tree-scope" data-id="${v}" aria-pressed="${scope === v}">${l} (${cnt(v)})</button>`).join('')}`;
  const viewChips = `<button class="chip" data-act="famview" data-id="tree" aria-pressed="${S.settings.famView !== 'cards'}">Tree</button><button class="chip" data-act="famview" data-id="cards" aria-pressed="${S.settings.famView === 'cards'}">By generation</button><i class="sep" aria-hidden="true"></i>${scopeChips}`;
  const gens = {};
  linked.forEach(x => (gens[x.k.gen] = gens[x.k.gen] || []).push(x));
  const card = ({ p, k }) => {
    const main = lang === 'en' ? k.en : (k.custom || k.ta);
    const sub = lang === 'both' && !k.custom ? `${k.tl} (${k.en})` : lang === 'ta' && !k.custom ? k.tl : lang === 'en' ? '' : k.en;
    return `<button class="fam ${p.id === ego() ? 'ego' : ''}" data-act="${p.id === ego() || !k.family ? 'person' : 'pov'}" data-id="${esc(p.id)}">
      ${avatar(p)}<span class="t${lang === 'en' ? ' en' : ''}">${esc(main)}</span><span class="n">${esc(p.name)}</span><span class="s">${esc(sub)}</span></button>`;
  };
  const order = Object.keys(gens).map(Number).sort((a, b) => b - a);
  return bar(isMine ? 'Family tree' : esc(povName) + '’s family') +
    (isMine ? `<p class="hint-line">Tap anyone to see the family through their eyes.</p>`
      : `<p class="pov-note">Showing what <b>${esc(povName)}</b> calls everyone. Tap ${esc(povName)} for details. <button class="link-btn" data-act="pov" data-id="${esc(S.me)}" style="margin:0">Back to my view</button></p>`) +
    `<div class="chips">${viewChips}</div>` +
    (S.settings.famView === 'cards' ? order.map(g => {
      let [en, ta] = GEN_LABEL(g);
      if (g === 0 && !isMine) { en = povName + '’s generation'; ta = 'தலைமுறை'; }
      const items = gens[g].sort((a, b) => (a.p.id === ego() ? -1 : b.p.id === ego() ? 1 : a.k.tk.join('.').localeCompare(b.k.tk.join('.'))));
      return `<section class="gen"><h2>${en} <span class="ta">${ta}</span></h2><div class="fg">${items.map(card).join('')}</div></section>`;
    }).join('') : treeHTML(linked, viewChips)) +
    (isMine && loose.length ? `<section class="gen"><h2>Not linked yet</h2><div class="fg">${loose.map(card).join('')}</div></section>` : '');
}

