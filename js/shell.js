/* Uravu – navigation, render, app shell: tabs, ＋ menu, sheets, long-press, back gesture */
/* ---------- navigation & render ---------- */
const PAGES = { home:pgHome, people:pgPeople, dates:pgDates, family:pgFamily, person:pgPerson, edit:pgEdit, event:pgEvent, settings:pgSettings, genders:pgGenders, living:pgLiving, moi:pgMoi, ask:pgAsk, docs:pgDocs, doc:pgDoc, docedit:pgDocEdit, term:pgTerm, funcs:pgFuncs, func:pgFunc, funcedit:pgFuncEdit, funcadd:pgFuncAdd, connect:pgConnect, pickp:pgPickPerson };
// false when the page points at something that has since been deleted
function entryOk(c) {
  if (!PAGES[c.p]) return false;
  if ((c.p === 'person' || (c.p === 'edit' && c.id) || c.p === 'quick') && !S.people[c.id]) return false;
  if (c.p === 'event' && c.eid && !S.events.some(e => e.id === c.eid)) return false;
  if ((c.p === 'doc' || (c.p === 'docedit' && c.id)) && !(S.docs || []).some(d => d.id === c.id)) return false;
  if (c.p === 'term' && !(S.docs || []).some(d => d.id === c.doc)) return false;
  if (['func', 'funcadd'].includes(c.p) && !(S.funcs || []).some(f => f.id === c.id)) return false;
  if (c.p === 'funcedit' && c.id && !(S.funcs || []).some(f => f.id === c.id)) return false;
  if (c.p === 'connect' && ((c.a && !S.people[c.a]) || (c.b && !S.people[c.b]))) return false;
  return true;
}
function render() {
  if (cloudGate()) return;   // online only: sign in / loading / offline screen until the account's data is here
  // each tab remembers its own pages; ui.stack is the open tab's list
  ui.tabs = ui.tabs || {};
  if (TAB_IDS.includes(ui.stack[0].p)) ui.tabs[ui.stack[0].p] = ui.stack;
  { const bad = ui.stack.findIndex((c, i) => i > 0 && !entryOk(c)); if (bad > 0) ui.stack.splice(bad); }
  const top = cur(), sheetTop = ui.stack.length > 1 && isSheet(top), app = $('#app');
  // Small tasks open in a bottom sheet over the page below them. The page below is drawn with the
  // sheet taken off the stack for a moment, so cur() is right for it, then the sheet is drawn on top.
  if (sheetTop) ui.stack.pop();
  const c = cur();
  try {
    if (!sheetTop || c !== shell.base || shell.ver !== dataVer) {
      const sameBase = c === shell.base, y = window.scrollY;
      clearGhosts(app);
      if (!sameBase && (shell.dir === 'fwd' || shell.dir === 'back') && motionOk() && app.firstChild) ghostOf(app.innerHTML, y, shell.dir);
      if (c.p === 'edit') { pendingPhoto = null; pendingLinks = []; pendingRemove = new Set(); pendingClicked = new Set(); }
      if (c.p === 'family') {
        EGO = c.pov && S.people[c.pov] ? c.pov : null; try { app.innerHTML = pgFamily(c); } finally { EGO = null; }
        const eg = app.querySelector('.tnode.ego'), sc = app.querySelector('.tree-scroll');
        if (eg && sc) {
          const tr = app.querySelector('.tree');
          if (c.zoom == null && tr) { c.zoom = Math.round(Math.max(0.7, Math.min(1, (sc.clientWidth - 8) / Number(tr.dataset.w))) * 1000) / 1000; const pz = c.zoom; c.zoom = 1; applyZoom(pz); }
          const z = c.zoom || 1; sc.scrollLeft = eg.offsetLeft * z - sc.clientWidth / 2 + TW * z / 2; sc.scrollTop = eg.offsetTop * z - sc.clientHeight / 2 + TH * z / 2;
        }
        if (sc) { treeFit(); treeBandX(); }
      }
      else app.innerHTML = (PAGES[c.p] || pgHome)(c);
      if (!sameBase && shell.dir && shell.dir !== 'swipe') slide(app, shell.dir);
      else if (sameBase) window.scrollTo(0, y);
      shell.base = c; shell.ver = dataVer;
      document.body.classList.toggle('tree-full', c.p === 'family' && !!c.full);
      document.body.classList.toggle('has-save', isForm(c));
      if (c.p === 'home') $('#q').value = ui.q;
    }
  } finally { if (sheetTop) ui.stack.push(top); }
  shell.dir = null;
  drawSheet(sheetTop ? top : null);
  // the tab bar stays on every page except forms and the full-screen tree; ＋ only on a tab's first page
  const base = sheetTop ? ui.stack[ui.stack.length - 2] : top;
  drawShell(!isForm(base) && !(base.p === 'family' && base.full), ui.stack.length === 1 || (sheetTop && ui.stack.length === 2));
  hydratePhotos();
  syncHistory();
}
function push(p, params = {}) {
  const entry = Object.assign({ p }, params);
  if (!isSheet(entry)) cur().y = window.scrollY;
  ui.stack.push(entry); shell.dir = 'fwd'; render();
  if (!isSheet(entry)) window.scrollTo(0, 0);
}
// Back goes through the browser history, so the in-app back button, the phone's back gesture
// and the Escape key all take the same path (see the popstate handler below).
function back() {
  if (histDepth > 0 && logicalDepth() > 0) { history.back(); return; }
  if (ui.stack.length > 1) { ui.stack.pop(); shell.dir = nextDir || 'back'; nextDir = null; render(); window.scrollTo(0, cur().y || 0); }
}
let nextDir = null;   // 'swipe' after an edge swipe, so the page underneath is not slid in a second time

/* ---------- app shell: tabs, ＋ menu, sheets, long-press, back gesture ---------- */
const shell = { base: null, ver: -1, sheet: null, dir: null };
const TABS = [['home', 'Home', 'home'], ['people', 'People', 'people'], ['family', 'Family tree', 'tree'], ['funcs', 'Functions', 'gift']];
const TAB_IDS = TABS.map(t => t[0]);
const SHEETS = ['event', 'pickp', 'funcedit', 'term', 'menu', 'quick'];
const isSheet = c => SHEETS.includes(c.p) || (c.p === 'docedit' && !c.id && !c.type);
const isForm = c => ['edit', 'event', 'term', 'funcedit', 'funcadd'].includes(c.p) || (c.p === 'docedit' && !!(c.id || c.type));
const motionOk = () => !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function slide(el, dir) {
  if (!motionOk()) return;
  el.classList.remove('go-fwd', 'go-back', 'go-tab'); void el.offsetWidth; el.classList.add('go-' + dir);
}
document.addEventListener('animationend', e => {
  if (e.target.id === 'app') e.target.classList.remove('go-fwd', 'go-back', 'go-tab');
  else if (e.target.classList && e.target.classList.contains('ghost')) e.target.remove();
});
// A still, non-clickable copy of a page, scrolled to where it was, for the slide between pages
function ghostOf(html, y, cls) {
  const g = document.createElement('div'), a = document.createElement('div');
  g.className = 'ghost ' + cls; g.setAttribute('aria-hidden', 'true'); g.inert = true;
  a.className = 'app'; a.innerHTML = html;
  a.querySelectorAll('[id],[name]').forEach(e => { e.removeAttribute('id'); e.removeAttribute('name'); });
  a.querySelectorAll('.go-fwd,.go-back,.go-tab').forEach(e => e.classList.remove('go-fwd', 'go-back', 'go-tab'));
  g.append(a); document.body.append(g); g.scrollTop = y;
  if (cls !== 'under') setTimeout(() => g.remove(), 600);   // in case animationend never comes
  return g;
}
function clearGhosts(app) {
  document.querySelectorAll('.ghost').forEach(g => g.remove());
  app.classList.remove('dragging'); app.style.transform = app.style.transition = '';
}
// Counts for the red badges
function badges() {
  const t = upcoming().filter(x => x.days === 0);
  const bdays = t.filter(x => x.kind === 'birthday').length;
  const dues = (S.docs || []).filter(d => isDueSoon(d, nextDue(d))).length;
  const funcs = (S.funcs || []).filter(f => f.on && daysUntil(f.on) >= 0 && daysUntil(f.on) <= 14).length;
  return { today: t.length, bdays, dues, funcs };
}
function drawShell(show, atRoot) {
  const tb = $('#tabbar'), fab = $('#fab'), b = badges(), root = ui.stack[0].p;
  const count = { home: b.dues, people: b.bdays, funcs: b.funcs };
  const why = { home: 'renewals due', people: 'birthdays today', funcs: 'functions coming up' };
  const showFab = show && atRoot;
  tb.hidden = !show; fab.hidden = !showFab;
  document.body.classList.toggle('has-tabs', show);
  document.body.classList.toggle('has-fab', showFab);
  if (show) tb.innerHTML = `<div class="in">${TABS.map(([id, l, ic]) => { const n = count[id] || 0; return `<button class="tab" data-act="tab-go" data-id="${id}"${root === id ? ' aria-current="page"' : ''} aria-label="${l}${n ? `, ${n} ${why[id]}` : ''}"><span class="pip" style="position:relative">${ICON[ic]}${n ? `<span class="dot" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</span>${l}</button>`; }).join('')}</div>`;
  if (!fab.innerHTML) fab.innerHTML = ICON.plus;
  fab.setAttribute('aria-expanded', String(cur().p === 'menu'));
  // the number on the installed app's icon (Android / desktop, where supported)
  const all = b.bdays + b.dues + b.funcs;
  try { if (navigator.setAppBadge) (all ? navigator.setAppBadge(all) : navigator.clearAppBadge()).catch(() => {}); } catch (e) {}
}
function drawSheet(c) {
  const host = $('#sheet');
  document.body.classList.toggle('sheet-open', !!c);
  if (!c) { host.hidden = true; host.innerHTML = ''; host.classList.remove('closing'); shell.sheet = null; return; }
  let html; inSheet = true;
  try { html = (PAGES[c.p] || pgMenu)(c); } finally { inSheet = false; }
  const body = `<div class="sheet-drag" aria-hidden="true"><span class="grab"></span></div>${html}`;
  if (shell.sheet === c && host.querySelector('.sheet')) { const sh = host.querySelector('.sheet'), st = sh.scrollTop; sh.innerHTML = body; sh.scrollTop = st; return; }
  host.classList.remove('closing'); host.hidden = false; shell.sheet = c;
  host.innerHTML = `<div class="scrim" data-act="back"></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1" aria-label="${esc(sheetLabel(c))}">${body}</div>`;
  host.querySelector('.sheet').focus({ preventScroll: true });
}
const sheetLabel = c => ({ menu: 'Add', quick: 'Quick actions', event: 'Date', pickp: 'Choose a person', funcedit: 'Function', term: 'Policy', docedit: 'Add a document' })[c.p] || '';
// ＋ menu
function pgMenu() {
  const it = (go, ic, l, id = '') => `<button class="mi" data-act="menu-go" data-go="${go}" data-id="${id}"><span class="ic">${ICON[ic]}</span>${l}</button>`;
  return `<div class="mgrid">${it('new', 'addPerson', 'Add person')}${it('event-new', 'addDate', 'Add date')}${it('doc-new', 'doc', 'Add document')}${it('func-new', 'gift', 'Add function')}</div>`;
}
// Long-press a person: quick actions
function pgQuick(c) {
  const p = S.people[c.id], ph = p.phone ? phoneLinks(p) : null, isMe = p.id === S.me;
  const it = (go, ic, l, cls = '') => `<button class="qi ${cls}" data-act="menu-go" data-go="${go}" data-id="${esc(p.id)}"><span class="ic">${ICON[ic]}</span>${l}</button>`;
  const link = (href, ic, l, cls, ext) => ph ? `<a class="qi ${cls}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''} data-close="1"><span class="ic">${ICON[ic]}</span>${l}</a>`
    : `<button class="qi ${cls}" data-act="no-phone" data-id="${esc(p.id)}" aria-disabled="true"><span class="ic">${ICON[ic]}</span>${l}</button>`;
  return `<div class="qhead">${avatar(p)}<span class="tx"><b>${esc(isMe ? p.name + ' (you)' : p.name)}</b><small>${isMe ? 'You' : termLine(kinOf(p.id))}</small></span></div>
    <div class="qgrid">${link(ph ? 'tel:' + ph.tel : '', 'phone', 'Call', 'tel')}${link(ph ? 'https://wa.me/' + ph.wa : '', 'chat', 'WhatsApp', 'wa', true)}${it('edit', 'edit', 'Edit')}${it('event-new', 'addDate', 'Add date')}${it('person', 'open', 'Open')}</div>`;
}
PAGES.menu = pgMenu; PAGES.quick = pgQuick;

let lp = null, lpFired = false;
const LP_SEL = '[data-act="person"],[data-act="pov"]';
function openQuick(id) {
  if (!S.people[id] || cur().p === 'quick') return;
  try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
  if (cur().p === 'menu') ui.stack.pop();
  push('quick', { id });
}
document.addEventListener('pointerdown', e => {
  lpFired = false; clearTimeout(lp && lp.h); lp = null;
  if (e.button > 0 || !e.target.closest) return;
  const t = e.target.closest(LP_SEL); if (!t || !S.people[t.dataset.id] || t.closest('.sheet')) return;
  lp = { x: e.clientX, y: e.clientY, h: setTimeout(() => { lp = null; lpFired = Date.now(); openQuick(t.dataset.id); }, 500) };
});
document.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.h); lp = null; } });
['pointerup', 'pointercancel', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (lp) { clearTimeout(lp.h); lp = null; } }, true));
document.addEventListener('contextmenu', e => {
  const t = e.target.closest && e.target.closest(LP_SEL); if (!t || !S.people[t.dataset.id] || t.closest('.sheet')) return;
  e.preventDefault(); if (lp) { clearTimeout(lp.h); lp = null; }
  if (cur().p !== 'quick') lpFired = Date.now(); openQuick(t.dataset.id);
});
// the tap that ends a long-press must not also open the person
document.addEventListener('click', e => { if (lpFired) { const fresh = Date.now() - lpFired < 1500; lpFired = false; if (fresh) { e.preventDefault(); e.stopImmediatePropagation(); } } }, true);
// Call / WhatsApp in the quick sheet: close the sheet behind them
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[data-close]'); if (a) setTimeout(back, 300); });

// Drag a sheet down by its handle or title to close it
let sdrag = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest && e.target.closest('.sheet-drag, .sheet .sheet-bar, .sheet .qhead'); if (!h || e.target.closest('button, a, input')) return;
  const el = h.closest('.sheet'); sdrag = { y: e.clientY, el, dy: 0 }; el.style.transition = 'none';
});
document.addEventListener('pointermove', e => { if (!sdrag) return; sdrag.dy = Math.max(0, e.clientY - sdrag.y); sdrag.el.style.transform = sdrag.dy ? `translateY(${sdrag.dy}px)` : ''; });
document.addEventListener('pointerup', () => {
  if (!sdrag) return; const { el, dy } = sdrag; sdrag = null;
  el.style.transition = 'transform .18s ease-out';
  if (dy > 90) { el.style.transform = 'translateY(100%)'; back(); } else el.style.transform = '';
});

// Swipe in from the left edge to go back: the page follows the finger, with the page before it underneath.
// Safari in the browser already has its own edge swipe, so this is off there (it is on in the installed app).
const IOS_BROWSER = (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !navigator.standalone;
let sw = null;
function canSwipeBack() {
  const c = cur();
  return ui.stack.length > 1 && !isSheet(c) && !c.view && !(c.p === 'family' && c.full) && !ignorePop
    && !document.querySelector('.ppick-dd:not([hidden]), .ghost') && !document.body.classList.contains('sheet-open');
}
function swipeUnder() {
  const prev = ui.stack[ui.stack.length - 2];
  if (!prev || prev.p === 'family' || !PAGES[prev.p] || isSheet(prev)) return null;   // the tree is drawn with extra steps; it just appears
  const top = ui.stack.pop(); let html = null;
  try { html = PAGES[prev.p](prev); } catch (e) {} finally { ui.stack.push(top); }
  if (!html) return null;
  const g = ghostOf(html, prev.y || 0, 'under'); hydratePhotos(); return g;
}
function swipeMove(dx) {
  const W = window.innerWidth, k = Math.min(1, dx / W);
  sw.app.style.transform = `translateX(${dx}px)`;
  if (sw.under) sw.under.style.transform = `translateX(${-28 * (1 - k)}%)`;
}
function swipeEnd(commit) {
  const s = sw; sw = null; if (!s || !s.on) return;
  const ease = 'transform .2s cubic-bezier(.2,.8,.2,1)';
  s.app.style.transition = ease; if (s.under) s.under.style.transition = ease;
  if (!commit) {
    s.app.style.transform = ''; if (s.under) s.under.style.transform = 'translateX(-28%)';
    setTimeout(() => { if (!sw) clearGhosts(s.app); }, 210);
    return;
  }
  s.app.style.transform = 'translateX(100%)'; if (s.under) s.under.style.transform = 'none';
  setTimeout(() => { nextDir = 'swipe'; back(); setTimeout(() => { nextDir = null; if (s.app.classList.contains('dragging')) clearGhosts(s.app); }, 700); }, 200);
}
document.addEventListener('touchstart', e => {
  if (sw || IOS_BROWSER || e.touches.length !== 1) return;
  const t = e.touches[0];
  if (t.clientX > 24 || !canSwipeBack()) return;
  sw = { x: t.clientX, y: t.clientY, lx: t.clientX, lt: e.timeStamp, v: 0, on: false, app: $('#app'), under: null };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!sw) return;
  const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
  if (!sw.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > dx) { sw = null; return; }   // it is a scroll
    if (dx < 10) return;
    sw.on = true; ppickClose(); if (lp) { clearTimeout(lp.h); lp = null; }
    sw.app.classList.add('dragging'); sw.app.style.transition = 'none'; sw.under = swipeUnder();
  }
  e.preventDefault();
  const dt = e.timeStamp - sw.lt; if (dt > 0) sw.v = (t.clientX - sw.lx) / dt;
  sw.lx = t.clientX; sw.lt = e.timeStamp;
  swipeMove(Math.max(0, dx));
}, { passive: false });
document.addEventListener('touchend', () => { if (sw) { const dx = sw.lx - sw.x; swipeEnd(dx > window.innerWidth * 0.35 || (sw.v > 0.45 && dx > 40)); } });
document.addEventListener('touchcancel', () => swipeEnd(false));

/* history: every page and sheet is one step, so the phone's back gesture walks back through them */
let histDepth = 0, ignorePop = 0;
// Home is the bottom of the stack; another tab counts as one step above it, so Back from it goes Home
const logicalDepth = () => ui.stack.length - 1 + (ui.stack[0].p !== 'home' ? 1 : 0);
// The address shows the open pages, e.g. #/people/person?id=appa, so a refresh or a reopened app
// comes back to the same place. Sheets and what is only on screen for a moment (scroll, open viewer) are left out.
const ROUTE_KEYS = ['id', 'eid', 'doc', 'term', 'owner', 'type', 'pov', 'f', 'tab', 'a', 'b', 'relTo', 'circle', 'preset'];
function urlAt(k) {
  const home = ui.stack[0].p === 'home', list = k === 0 && !home ? [] : ui.stack.slice(0, home ? k + 1 : k);
  const segs = list.filter(c => !isSheet(c)).map(c => {
    const q = new URLSearchParams();
    ROUTE_KEYS.forEach(key => { const v = c[key]; if (v !== undefined && v !== null && v !== '') q.set(key, String(v)); });
    return encodeURIComponent(c.p) + (String(q) ? '?' + q : '');
  });
  const base = location.pathname + location.search;
  return segs.length === 0 || (segs.length === 1 && segs[0] === 'home') ? base : base + '#/' + segs.join('/');
}
// Read the address back into a list of pages; anything unknown or deleted is cut off there
function parseRoute(hash) {
  const h = hash.replace(/^#/, '');
  if (TAB_IDS.includes(h)) return [{ p: h }];   // app-icon shortcuts, e.g. ./#people
  if (!h.startsWith('/')) return null;
  const stack = [];
  for (const seg of h.slice(1).split('/').filter(Boolean)) {
    const [p, qs = ''] = seg.split('?'), c = { p: decodeURIComponent(p) };
    for (const [k, v] of new URLSearchParams(qs)) if (ROUTE_KEYS.includes(k)) c[k] = v;
    if (stack.length === 0 ? !TAB_IDS.includes(c.p) : (isSheet(c) || !entryOk(c))) break;
    stack.push(c);
  }
  return stack.length ? stack : null;
}
function syncHistory() {
  if (ignorePop) return;   // a jump back is on its way; the popstate handler syncs again when it lands
  const want = logicalDepth();
  if (want > histDepth) {
    history.replaceState({ d: histDepth }, '', urlAt(histDepth));
    while (histDepth < want) { histDepth++; history.pushState({ d: histDepth }, '', urlAt(histDepth)); }
  }
  else if (want < histDepth) { ignorePop++; history.go(want - histDepth); histDepth = want; }
  else history.replaceState({ d: histDepth }, '', urlAt(histDepth));
}
// Switch tab, keeping each tab's own pages and scroll place
function openTab(id) {
  ppickClose();
  while (ui.stack.length > 1 && isSheet(cur())) ui.stack.pop();
  cur().y = window.scrollY;
  ui.tabs = ui.tabs || {};
  ui.stack = ui.tabs[id] || [{ p: id }];
  shell.dir = 'tab'; render(); window.scrollTo(0, cur().y || 0);
}
// Close a viewer or full-screen tree first, before leaving the page
function closeOverlay() {
  const c = cur();
  if (c.view) { delete c.view; rerender(); return true; }
  if (c.p === 'family' && c.full) { c.full = false; rerender(); return true; }
  if (document.querySelector('.ppick-dd:not([hidden])')) { ppickClose(); return true; }
  return false;
}
window.addEventListener('popstate', e => {
  // an address typed or linked by hand: open it as a new place
  if (!e.state || typeof e.state.d !== 'number') {
    const st = parseRoute(location.hash);
    ppickClose(); ui.stack = st || [{ p: 'home' }]; histDepth = logicalDepth();
    history.replaceState({ d: histDepth }, '', urlAt(histDepth)); shell.dir = 'tab'; render(); window.scrollTo(0, 0);
    return;
  }
  const d = e.state.d;
  if (ignorePop) { ignorePop--; histDepth = d; if (!ignorePop) syncHistory(); return; }
  const want = logicalDepth();
  histDepth = d;
  if (d >= want) { if (d > want) { ignorePop++; history.go(want - d); histDepth = want; } return; }  // "forward": stay put
  if (closeOverlay()) { syncHistory(); return; }
  const apply = () => {
    ppickClose();
    while (logicalDepth() > d && ui.stack.length > 1) ui.stack.pop();
    if (logicalDepth() > d) { ui.stack = (ui.tabs && ui.tabs.home) || [{ p: 'home' }]; ui.stack.splice(d + 1); }
    shell.dir = nextDir || 'back'; nextDir = null; render(); window.scrollTo(0, cur().y || 0);
  };
  if (isSheet(cur()) && $('#sheet .sheet')) { $('#sheet').classList.add('closing'); setTimeout(apply, 170); }
  else apply();
});
function arm(btn, label, fn) {
  if (btn.dataset.armed) { fn(); return; }
  const old = btn.innerHTML; btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = label;
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = old; } }, 3500);
}
function pressOnly(btn, sel) { btn.closest('.relgrid, .chips, .seg')?.parentElement.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', 'false')); }

const H = {
  back: () => back(),
  // Tapping the open tab again: first back to its first page, then up to the top
  'tab-go': id => {
    if (ui.stack[0].p !== id) { openTab(id); return; }
    ppickClose();
    if (ui.stack.length === 1) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.stack.splice(1); shell.dir = 'back'; render(); window.scrollTo(0, cur().y || 0);
  },
  fab: () => { if (cur().p === 'menu') back(); else push('menu'); },
  'menu-go': (id, a) => { ui.stack.pop(); const fn = H[a.dataset.go]; if (fn) fn(id, a); else render(); },
  'no-phone': () => toast('No phone number saved. Tap Edit to add one.'),
  install: () => installApp(),
  'tree-find': () => { const b = $('.tfind'); b.hidden = !b.hidden; if (!b.hidden) { $('#tfindIn').value = ''; treeFindList(); $('#tfindIn').focus(); } },
  'tree-goto': id => { $('.tfind').hidden = true; treeFocus(id, true); },
  'tree-center': () => treeFocus(ego(), true),
  'tree-full': () => { const c = cur(); c.full = !c.full; rerender(); if (!c.full) $('.tree-wrap')?.scrollIntoView({ block: 'start' }); },
  'tree-png': () => treePng(),
  'tree-scope': id => { S.settings.treeScope = id; delete cur().zoom; save(); rerender(); },
  zoom: id => {
    const c = cur(), sc = $('.tree-scroll'), W = Number($('.tree')?.dataset.w || 1), z0 = c.zoom || 1;
    if (id === 'fit') { const Ht = Number($('.tree')?.dataset.h || 1); c.zoom = Math.max(0.35, Math.min(1, (sc.clientWidth - 8) / W, (sc.clientHeight - 12) / Ht)); rerender(); return; }
    applyZoom(id === 'in' ? z0 * 1.25 : z0 / 1.25);
  },
  'file-save': id => saveDocFile(id),
  func: id => push('func', { id }),
  'func-new': () => push('funcedit', { id: '' }),
  'func-edit': id => push('funcedit', { id }),
  'func-tpl': (id, a) => { $('#f-kind').value = id; document.querySelectorAll('[data-act="func-tpl"]').forEach(b => b.setAttribute('aria-pressed', String(b === a))); const t = $('#ff [name="title"]'); if (!t.value.trim() || FUNC_TPL.some(x => x[0] === t.value.trim())) t.value = id === 'Other function' ? '' : id; t.focus(); },
  'func-save': () => saveFunc(),
  'func-del': (id, a) => arm(a, 'Tap again to delete', () => { S.funcs = S.funcs.filter(f => f.id !== id); save(); render(); toast('Function deleted'); }),
  'func-add': id => push('funcadd', { id }),
  'func-txt': id => {
    const f = S.funcs.find(x => x.id === id);
    try { saveFile(`${f.title.replace(/[^\w\- ]+/g, '').trim() || 'guest-list'}-guests.txt`, funcText(f), 'text/plain;charset=utf-8'); toast('Guest list saved'); } catch (e) { toast('Couldn’t save the list here.'); }
  },
  'fa-open': id => { cur().sel = [...document.querySelectorAll('#faList input:checked')].map(i => i.value); push('person', { id }); },
  'fa-bulk': id => {
    const rows = [...document.querySelectorAll('#faList .pk')].filter(l => !l.hidden && l.dataset.tags.split('|').includes(id));
    const allOn = rows.length && rows.every(l => l.querySelector('input').checked);
    rows.forEach(l => { l.querySelector('input').checked = !allOn; }); faCount();
    toast(rows.length ? (allOn ? 'Unselected' : `${rows.length} selected`) : 'No one in that group');
  },
  'fa-name': () => { const i = $('#faName'), n = i.value.trim(); if (!n) { i.focus(); return; } const f = S.funcs.find(x => x.id === cur().id); f.guests.push({ id: uid(), pid: '', name: n, invited: false, count: 1 }); save(); i.value = ''; i.focus(); toast(`${n} added to the list`); },
  'fa-save': () => {
    const f = S.funcs.find(x => x.id === cur().id), ids = [...document.querySelectorAll('#faList input:checked')].map(i => i.value);
    ids.forEach(pid => { if (!f.guests.some(g => g.pid === pid)) f.guests.push({ id: uid(), pid, invited: false, count: 1 }); });
    save(); ui.stack.pop(); render(); window.scrollTo(0, 0); if (ids.length) toast(`${ids.length} guest${ids.length === 1 ? '' : 's'} added`);
  },
  'g-inv': id => { const [, g] = funcGuest(id); g.invited = !g.invited; if (!g.invited) { g.via = ''; } save(); rerender(); },
  'g-open': id => { const c = cur(); c.open = c.open === id ? null : id; rerender(); },
  'g-rsvp': (id, a) => { const [, g] = funcGuest(id); g.rsvp = g.rsvp === a.dataset.v ? '' : a.dataset.v; if (g.rsvp) g.invited = true; save(); rerender(); },
  'g-via': (id, a) => { const [, g] = funcGuest(id); g.via = g.via === a.dataset.v ? '' : a.dataset.v; if (g.via) g.invited = true; save(); rerender(); },
  'g-count': (id, a) => { const [, g] = funcGuest(id); g.count = Math.max(1, Math.min(99, (Number(g.count) || 1) + Number(a.dataset.v))); save(); rerender(); },
  'miss-add': id => { const f = S.funcs.find(x => x.id === cur().id); if (!f.guests.some(g => g.pid === id)) f.guests.push({ id: uid(), pid: id, invited: false, count: 1 }); save(); rerender(); toast(`${S.people[id].name} added to the list`); },
  'miss-skip': id => { const f = S.funcs.find(x => x.id === cur().id); f.skip = [...(f.skip || []), id]; save(); rerender(); },
  'miss-all': () => { const f = S.funcs.find(x => x.id === cur().id), ms = funcMissed(f); ms.forEach(m => f.guests.push({ id: uid(), pid: m.p.id, invited: false, count: 1 })); save(); rerender(); toast(`${ms.length} added to the list`); },
  'miss-more': () => { cur().missAll = true; rerender(); },
  'g-rm': (id, a) => arm(a, 'Tap again', () => { const [f] = funcGuest(id); f.guests = f.guests.filter(g => g.id !== id); cur().open = null; save(); rerender(); toast('Removed from the list'); }),
  doc: id => push('doc', { id }),
  'doc-new': id => push('docedit', { id: '', owner: id || S.me }),
  'doc-type': id => { const c = cur(); ui.stack.pop(); push('docedit', { id: '', owner: c.owner, type: id }); },
  'doc-edit': id => push('docedit', { id }),
  'doc-save': () => saveDoc(),
  'doc-reveal': () => { cur().reveal = !cur().reveal; rerender(); },
  'doc-del': (id, a) => arm(a, 'Tap again to delete', () => { const d = S.docs.find(x => x.id === id); (d.photos || []).forEach(p => IDB.del(p).catch(() => {})); S.docs = S.docs.filter(x => x.id !== id); save(); render(); toast('Document deleted'); }),
  'term-new': id => push('term', { doc: id, term: '' }),
  'term-edit': id => push('term', { doc: cur().id, term: id }),
  'term-save': () => saveTerm(),
  'term-del': (id, a) => arm(a, 'Tap again to delete', () => { const d = S.docs.find(x => x.id === cur().doc); d.terms = d.terms.filter(x => x.id !== id); save(); ui.stack.pop(); render(); toast('Deleted'); }),
  'photo-view': id => { cur().view = id; rerender(); },
  'photo-close': () => { delete cur().view; rerender(); },
  'photo-del': (id, a) => arm(a, 'Tap again to delete', () => { const d = S.docs.find(x => x.id === cur().id); d.photos = d.photos.filter(p => p !== id); IDB.del(id).catch(() => {}); delete cur().view; save(); rerender(); toast('Photo deleted'); }),
  'ppick-open': (hid, a) => {
    const dd = a.parentElement.querySelector('.ppick-dd'), open = dd.hidden; ppickClose();
    if (!open) return;
    dd.hidden = false; a.setAttribute('aria-expanded', 'true'); dd.querySelector('.ppick-q').value = ''; ppickList(dd); dd.querySelector('.ppick-q').focus();
  },
  'ppick-choose': (pid, a) => {
    const dd = a.closest('.ppick-dd'), hid = $('#' + dd.dataset.for), btn = dd.parentElement.querySelector('.ppick-btn'), p = S.people[pid];
    hid.value = pid; btn.querySelector('.av')?.remove(); btn.insertAdjacentHTML('afterbegin', avatar(p, 'sm'));
    btn.querySelector('.ppick-name').textContent = pid === S.me ? 'Me' : p.name; ppickClose(); btn.focus();
    hid.dispatchEvent(new Event('change', { bubbles: true }));
  },
  'qt-open': id => { cur().qt = id; rerender(); const t = $('#qtIn'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } },
  'qt-cancel': () => { delete cur().qt; rerender(); },
  'qt-save': id => { S.people[cur().id][id] = $('#qtIn').value.trim(); delete cur().qt; save(); rerender(); toast('Saved'); },
  'moi-add': () => { cur().add = 'got'; rerender(); $('#mnPerson')?.focus(); },
  'moi-cancel': () => { delete cur().add; rerender(); },
  'moi-mode': (id, a) => { cur().add = id; a.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === a))); $('#mnGot').hidden = id !== 'got'; $('#mnGave').hidden = id !== 'gave'; },
  'moi-save': () => {
    const mode = cur().add, pid = $('#mnPerson').value, amt = $('#mnAmt').value.replace(/[^\d.]/g, '');
    if (!pid) { toast('Choose the person.'); $('#mnPerson').focus(); return; }
    if (!(Number(amt) > 0)) { toast('Enter the amount.'); $('#mnAmt').focus(); return; }
    if (mode === 'got') {
      const f = (S.funcs || []).find(x => x.id === $('#mnFunc')?.value); if (!f) { toast('Plan a function first, then save moi received at it.'); return; }
      f.guests = f.guests || []; let g = f.guests.find(x => x.pid === pid);
      if (!g) { g = { id: uid(), pid, invited: false, count: 1 }; f.guests.push(g); }
      g.moi = amt; g.invited = true; if (!g.rsvp) g.rsvp = 'yes';
    } else { S.given = S.given || []; S.given.push({ id: uid(), pid, title: $('#mnTitle').value.trim() || 'Their function', on: $('#mnDate').value, amount: amt }); }
    delete cur().add; save(); rerender(); toast('Moi saved');
  },
  'mg-clear': (fid, a) => arm(a, '✕', () => { const f = (S.funcs || []).find(x => x.id === fid), g = f && (f.guests || []).find(x => x.pid === cur().id); if (g) { delete g.moi; save(); } rerender(); toast('Moi deleted. They stay on the guest list.'); }),
  'mg-open': id => { cur().mg = id || 'gave'; rerender(); ($('#mgTitle') || $('#mgFunc'))?.focus(); },
  'mg-got-save': () => {
    const pid = cur().id, f = S.funcs.find(x => x.id === $('#mgFunc').value), amt = $('#mgAmt').value.replace(/[^\d.]/g, ''); if (!f) return;
    f.guests = f.guests || []; let g = f.guests.find(x => x.pid === pid); const added = !g;
    if (!g) { g = { id: uid(), pid, invited: false, count: 1 }; f.guests.push(g); }
    if (Number(amt) > 0) { g.moi = amt; g.invited = true; if (!g.rsvp) g.rsvp = 'yes'; }
    else if (!added) { toast(`${S.people[pid].name} is already on that guest list. Enter an amount to save moi.`); $('#mgAmt').focus(); return; }
    delete cur().mg; save(); rerender(); toast(Number(amt) > 0 ? (added ? `Added to ${f.title} with moi` : 'Moi saved') : `Added to ${f.title}`);
  },
  'mg-cancel': () => { delete cur().mg; rerender(); },
  'mg-save': () => {
    const amt = $('#mgAmt').value.replace(/[^\d.]/g, ''); if (!(Number(amt) > 0)) { toast('Enter the amount you gave.'); $('#mgAmt').focus(); return; }
    S.given = S.given || []; S.given.push({ id: uid(), pid: cur().id, title: $('#mgTitle').value.trim() || 'Their function', on: $('#mgDate').value, amount: amt });
    delete cur().mg; save(); rerender(); toast('Moi saved');
  },
  'mg-del': (id, a) => arm(a, '✕', () => { S.given = (S.given || []).filter(x => x.id !== id); save(); rerender(); toast('Entry deleted'); }),
  'qd-open': id => { cur().qd = id; rerender(); ($('#qdTitle') && !$('#qdTitle').value ? $('#qdTitle') : $('#qdDate'))?.focus(); },
  'qd-cancel': () => { delete cur().qd; rerender(); },
  'qd-save': () => qdSave(),
  'ask-go': () => askAI($('#askIn').value),
  'ask-sugg': id => askAI(id),
  'ask-stop': () => aiCtl?.abort(),
  'ask-q': () => { const q = ui.q.trim(); push('ask', {}); askAI(q); },
  backup: () => doBackup(),
  'restore-no': () => { delete cur().restore; rerender(); },
  'restore-yes': () => {
    const ph = cur().restore.photos || {};
    if (cloudConfigured() && Object.keys(ph).length && !cloud.key) { toast('This backup has document files. Enter your vault PIN first (Account › Document vault).'); return; }
    if (readOnly()) { toast('You’re offline. Restore when you’re back online.'); return; }
    Object.entries(ph).forEach(([k, v]) => IDB.put(k, v).catch(() => {}));
    S = cur().restore.data; normalize(); save();
    ui = { stack: [{ p: 'home' }], q: '' }; render(); window.scrollTo(0, 0); toast(`Restored ${Object.keys(S.people).length} people`);
  },
  'qrel-open': () => { const id = cur().id; cur().qrel = { to: id === S.me ? Object.keys(S.people).find(x => x !== S.me) : S.me }; rerender(); $('#qrelTo')?.focus(); },
  'qrel-close': () => { delete cur().qrel; rerender(); },
  'qrel-pick': id => qrelPick(id),
  'rel-rm': (eid, a) => {
    const grp = linkGroup(eid), n = grp.length;
    arm(a, n > 1 ? `Remove ${n} links` : 'Remove', () => { removeLinks(grp); save(); rerender(); toast(n > 1 ? `Removed, plus ${n - 1} link${n > 2 ? 's' : ''} added with it` : 'Link removed'); });
  },
  'qlike-open': id => qlikeOpen(id, '', -1),
  'qlike-edit': id => { const l = S.people[cur().id].likes[Number(id)]; if (l) qlikeOpen(l.cat, l.val, Number(id)); },
  'qlike-cancel': () => { $('#qlike').innerHTML = ''; $('#qlikeChips').hidden = false; },
  'qlike-save': () => qlikeSave(),
  'qlike-del': id => { S.people[cur().id].likes.splice(Number(id), 1); save(); qlikeRefresh('Removed'); },
  'set-dead': (id, a) => {
    const p = S.people[id]; p.dead = a.dataset.v === '1'; if (!p.dead) p.dod = '';
    const n = p.dead ? dropFromGuests(id) : 0; save();
    a.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === a)));
    if (n) toast(`${p.name} removed from ${n} upcoming guest list${n === 1 ? '' : 's'}.`);
  },
  'set-gender': (id, a) => {
    const gp = genderProblem(id, a.dataset.g); if (gp) { toast(gp); return; }
    S.people[id].gender = a.dataset.g; save();
    a.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === a)));
  },
  'bulk-male': (id, a) => arm(a, 'Tap again to confirm', () => {
    // husband/wife pairs: the partner becomes the opposite gender
    for (const p of noGender()) if (!p.gender) { p.gender = 'm'; inferGenders(); }
    save(); render(); toast('Done. Change anyone who should be Female.');
  }),
  famview: id => { S.settings.famView = id; if (id === 'cards') cur().full = false; save(); render(); },
  'connect-to': id => push('connect', { a: S.me, b: id }),
  'pick-person': key => push('pickp', { key }),
  'pick-done': id => { const prev = ui.stack[ui.stack.length - 2]; prev[cur().key] = id; back(); },
  swap: () => { const c = cur(), a = c.a || S.me; c.a = c.b || S.me; c.b = a; render(); },
  go: (id, a) => push(id, a.dataset.f ? { f: a.dataset.f } : {}),
  person: id => push('person', { id }),
  edit: id => push('edit', { id }),
  new: (id, a) => push('edit', { id: '', relTo: id || '', circle: a.dataset.circle || '' }),
  'event-new': id => push('event', { eid: '', preset: id || '' }),
  'event-edit': id => push('event', { eid: id }),
  'see-family': id => push('family', { pov: id === S.me ? null : id }),
  pov: id => { cur().pov = id === S.me ? null : id; render(); window.scrollTo(0, 0); },
  filter: id => { cur().f = id; render(); },
  tab: id => { cur().tab = id; render(); },
  'pick-rel': id => {
    const to = $('#relTo').value, i = pendingLinks.findIndex(l => l.rel === id && l.to === to);
    if (i >= 0) { pendingLinks.splice(i, 1); renderPending(); return; }   // tap again = undo
    pendingLinks.push({ rel: id, to });
    const g = { father:'m', mother:'f', husband:'m', wife:'f', ebrother:'m', ybrother:'m', esister:'f', ysister:'f', son:'m', daughter:'f' }[id];
    const gb = document.querySelector(`[data-act="pick-gender"][data-id="${g}"]`); if (gb) H['pick-gender'](g, gb);
    renderPending();
  },
  'rel-already': () => toast('Already linked. Remove it under “Linked now” if it’s wrong.'),
  'pending-rm': id => { pendingLinks.splice(Number(id), 1); renderPending(); },
  'pick-dead': (id, a) => { $('#pf [name="dead"]').setAttribute('value', id || ''); a.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === a))); },
  'pick-gender': (id, a) => { $('#pf [name="gender"]').value = id; a.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === a))); },
  'pick-circle': (id, a) => {
    const to = $('#relTo').value;
    if (to !== S.me && SOCIAL[id]) { const i = pendingLinks.findIndex(l => l.social === id && l.to === to); if (i >= 0) pendingLinks.splice(i, 1); else pendingLinks.push({ social: id, to }); renderPending(); return; }
    // How you know them: pick as many as apply (e.g. Colleague and Friend)
    const set = new Set(($('#f-circle').value || '').split(',').filter(Boolean));
    if (set.has(id)) set.delete(id); else set.add(id);
    $('#f-circle').value = [...set].join(','); a.setAttribute('aria-pressed', String(set.has(id)));
  },
  pick: (id, a) => { $('#f-' + a.dataset.group).value = id; a.parentElement.querySelectorAll('[data-act="pick"]').forEach(b => b.setAttribute('aria-pressed', String(b === a))); },
  'like-add': id => { const box = $('#likesEdit'); box.insertAdjacentHTML('beforeend', likeRow({ cat: id, val: '' })); box.lastElementChild.querySelector(id ? '.lv' : '.lc').focus(); },
  'like-rm': (id, a) => a.closest('.like-row').remove(),
  'photo-rm': (id, a) => { pendingPhoto = ''; $('#photoPrev').innerHTML = avatar(blankPerson('new', { name: $('[name="name"]').value }), 'xl'); a.remove(); },
  'rm-link': eid => {
    pendingClicked.add(eid); const grp = linkGroup(eid); grp.forEach(x => pendingRemove.add(x.id)); markRemoving();
    toast(grp.length > 1 ? `${grp.length} links will be removed when you save` : 'Will be removed when you save');
  },
  'rm-undo': eid => {
    for (const c of [...pendingClicked]) if (linkGroup(c).some(x => x.id === eid)) pendingClicked.delete(c);
    pendingRemove = new Set([...pendingClicked].flatMap(c => linkGroup(c).map(x => x.id))); markRemoving();
  },
  'save-person': () => savePerson(),
  'del-person': (id, a) => arm(a, (() => { const n = unlinkedIfDeleted(id).length; return n ? `Tap again. ${n} ${n === 1 ? 'person' : 'people'} will lose their link` : 'Tap again to delete'; })(), () => {
    const before = reachMe(null), dname = S.people[id].name;
    const viaOnly = S.edges.filter(e => e.type === 'social' && e.a === id).map(e => e.b);
    S.edges = S.edges.filter(e => ![e.child, e.parent, e.a, e.b].includes(id));
    S.blocked = (S.blocked || []).filter(k => !k.split('|').includes(id));
    for (const o of viaOnly) { const q = S.people[o]; if (q && !allLinks(o).length) { q.circle = 'acquaintance'; if (!q.metHow) q.metHow = `Met through ${dname}`; } }
    const nowReach = reachMe(null), lost = [...before].filter(x => x !== id && S.people[x] && !nowReach.has(x));
    if (lost.length) setTimeout(() => toast(`${lost.length} ${lost.length === 1 ? 'person is' : 'people are'} no longer linked. Find them under People.`), 2300);
    S.events.forEach(e => { e.people = e.people.filter(x => x !== id); });
    S.events = S.events.filter(e => e.people.length);
    (S.funcs || []).forEach(f => f.guests.forEach(g => { if (g.pid === id) { g.name = S.people[id].name; g.pid = ''; } }));
    const gone = (S.docs || []).filter(d => d.owner === id); gone.forEach(d => (d.photos || []).forEach(p => IDB.del(p).catch(() => {}))); S.docs = (S.docs || []).filter(d => d.owner !== id);
    const n = S.people[id].name; delete S.people[id]; save(); render(); window.scrollTo(0, cur().y || 0); toast(`Deleted ${n}`);
  }),
  'save-event': () => saveEvent(),
  'del-event': (id, a) => arm(a, 'Tap again to delete', () => { S.events = S.events.filter(e => e.id !== id); save(); render(); toast('Date deleted'); }),
  lang: id => { S.settings.lang = id; save(); render(); },
  'my-gender': id => { S.people[S.me].gender = id; save(); render(); toast('Saved'); },
  'reset-demo': (id, a) => arm(a, 'Tap again to replace everything', () => { S = demo(); save(); ui = { stack: [{ p: 'home' }], q: '' }; render(); toast('Sample family loaded'); }),
  'clear-all': (id, a) => arm(a, 'Tap again to clear everything', () => {
    if (readOnly()) { toast('You’re offline. Try again when you’re back online.'); return; }
    (S.docs || []).forEach(d => (d.photos || []).forEach(p => IDB.del(p).catch(() => {})));   // the document files go too
    const me = S.people[S.me];
    S = { me:'me', people:{ me: blankPerson('me', { name: me.name, tamilName: me.tamilName, gender: me.gender, photo: me.photo }) }, edges:[], events:[], settings:S.settings };
    save(); ui = { stack: [{ p: 'home' }], q: '' }; render(); toast('Cleared. Start adding people.');
  }),
};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const fn = H[a.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(a.dataset.id, a, e);
});
document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('ppick-q')) ppickList(e.target.closest('.ppick-dd'));
  if (e.target.id === 'tfindIn') treeFindList();
  if (e.target.id === 'gq') { const v = e.target.value.trim().toLowerCase(); cur().q = e.target.value; let n = 0; document.querySelectorAll('.glist .grow').forEach(l => { l.hidden = !!v && !l.dataset.name.includes(v); if (!l.hidden) n++; }); const none = document.querySelector('#gqNone'); if (none) none.hidden = n > 0 || !document.querySelector('.glist .grow'); }
  if (e.target.id === 'faq') { const v = e.target.value.trim().toLowerCase(); document.querySelectorAll('#faList .pk').forEach(l => { l.hidden = v && !l.dataset.name.includes(v); }); document.querySelectorAll('#faList .fa-sec').forEach(s2 => { s2.hidden = !!v; }); }
  if (e.target.classList && e.target.classList.contains('lc')) swapValueField(e.target);
  if (e.target.dataset && e.target.dataset.pick) showPick(e.target);
  if (e.target.id === 'q') { ui.q = e.target.value; $('#homeBody').innerHTML = homeBody(); }
  else if (e.target.id === 'ppf') { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('[data-act="pick-done"]').forEach(l => { l.hidden = q && !l.dataset.name.includes(q); }); }
  else if (e.target.id === 'pfilter') { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('.pk').forEach(l => { l.hidden = q && !l.dataset.name.includes(q); }); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'qrelTo') { cur().qrel.to = e.target.value; $('#qrelgrid').innerHTML = qrelChips(e.target.value); }
  if (e.target.id === 'photoIn') readPhoto(e.target.files[0]);
  if (e.target.id === 'restoreIn') readRestore(e.target.files[0]);
  if (e.target.id === 'docPhotoIn') [...e.target.files].forEach(readDocPhoto);
  if (e.target.closest && e.target.closest('#faList')) faCount();
  if (e.target.dataset && e.target.dataset.gfield) { const [, g] = funcGuest(e.target.dataset.gid); if (g) { g[e.target.dataset.gfield] = e.target.dataset.gfield === 'moi' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.trim(); save(); if (e.target.dataset.gfield === 'moi') rerender(); } }
  if (e.target.id === 'relTo') { $('#relgrid').innerHTML = relChips(e.target.value); $('#othergrid').innerHTML = otherChips(e.target.value, $('#f-circle').value); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.closest) return;
  if (e.target.closest('#qlike')) { e.preventDefault(); qlikeSave(); }
  else if (e.target.id === 'askIn' && !e.shiftKey) { e.preventDefault(); askAI(e.target.value); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.stack.length > 1 && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) back(); });

