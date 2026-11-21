/* Uravu – install as an app (PWA), then start the app */
/* ---------- install as an app (PWA) ---------- */
let installEvt = null;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installRow() {
  if (isStandalone()) return '';
  if (installEvt) return `<button class="install" data-act="install"><span class="ic">${ICON.install}</span><span><b>Install Uravu</b><small>Opens like an app. Works offline.</small></span></button>`;
  if (isIOS()) return `<div class="install"><span class="ic">${ICON.install}</span><span><b>Install Uravu</b><small>Tap Share, then “Add to Home Screen”</small></span></div>`;
  return '';
}
async function installApp() {
  if (!installEvt) return;
  const ev = installEvt; installEvt = null; ev.prompt();
  try { await ev.userChoice; } catch (e) {}
  rerender();
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (['home', 'settings'].includes(cur().p)) rerender(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Uravu installed'); });
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
load();
// open where the address says (a refresh, a reopened app, or an app-icon shortcut like ./#people)
{ const st = parseRoute(location.hash); if (st) ui.stack = st; }
if (history.state && typeof history.state.d === 'number') histDepth = history.state.d;
else { histDepth = 0; history.replaceState({ d: 0 }, '', urlAt(0)); }   // a fresh open: Home is the first step back
render();
cloudInit();   // signed in: connect and sync in the background (never holds up opening the app)
