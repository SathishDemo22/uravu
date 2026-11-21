// End-to-end tests for Uravu, run in real Chrome (or Edge) at phone size.
// Run:  npm test      (needs Node 20+ and Chrome or Edge; nothing to install)
// Screenshots and downloaded files go to test/out/.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startFakeCloud, fakeApiScript } from './fake-cloud.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'test', 'out'), DL = path.join(OUT, 'downloads');
const PORT = 8765, DBG = 9339, BASE = `http://localhost:${PORT}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome or Edge not found. Set CHROME=path/to/chrome'); process.exit(1); }

// The first commit holds the original app, used to check the saved-data format is unchanged
let ORIGINAL = '';
try { ORIGINAL = execSync('git show $(git rev-list --max-parents=0 HEAD):index.html', { cwd: ROOT, shell: 'bash', maxBuffer: 1e8 }).toString(); } catch (e) {}

/* ---------- start the web server and the browser ---------- */
const srv = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], { stdio: 'pipe' });
await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('running')) r(); }));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'uravu-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--window-size=412,915', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json()).webSocketDebuggerUrl; } catch (e) { await sleep(200); } }

/* ---------- a minimal Chrome DevTools Protocol client ---------- */
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
let nextId = 0; const pending = new Map(), listeners = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else listeners.forEach(fn => fn(m));
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => send(m, p, S);
await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true });
await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
await cdp('Network.setBypassServiceWorker', { bypass: true });   // switched back on for the PWA tests at the end
await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const errors = [];
listeners.push(m => {
  if (m.sessionId !== S) return;
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
// downloads: Chrome names them by GUID; remember the suggested name
const downloads = [];
listeners.push(m => {
  if (m.method === 'Browser.downloadWillBegin') downloads.push({ guid: m.params.guid, name: m.params.suggestedFilename, done: false });
  if (m.method === 'Browser.downloadProgress' && m.params.state === 'completed') { const d = downloads.find(x => x.guid === m.params.guid); if (d) d.done = true; }
});
async function waitDownload(re, ms = 8000) {
  for (let t = 0; t < ms; t += 100) { const d = downloads.find(x => re.test(x.name) && x.done); if (d) return { name: d.name, file: path.join(DL, d.guid) }; await sleep(100); }
  throw new Error('no download matching ' + re);
}
// serve the original app at a fake address on the same origin (shares localStorage)
// and give the app an empty config.js, so the tests never talk to the real Supabase project
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*__original.html*' }, { urlPattern: '*/config.js*' }] });
listeners.push(m => {
  if (m.method !== 'Fetch.requestPaused' || m.sessionId !== S) return;
  const isConfig = /\/config\.js/.test(m.params.request.url);
  cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: isConfig ? 'text/javascript' : 'text/html; charset=utf-8' }],
    body: Buffer.from(isConfig ? "window.URAVU_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', google: false };" : ORIGINAL).toString('base64') });
});

/* ---------- page helpers ---------- */
async function ev(expr) {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function go(url) {
  const loaded = new Promise(r => { const f = m => { if (m.method === 'Page.loadEventFired' && m.sessionId === S) { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
  await cdp('Page.navigate', { url }); await loaded; await sleep(400);
}
const click = async sel => { await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('not found: ' + ${JSON.stringify(sel)}); el.click();`); await sleep(380); };
const backGesture = async () => { await ev('history.back()'); await sleep(450); };
async function center(sel) {
  return ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('not found: ' + ${JSON.stringify(sel)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
}
async function touch(sel, holdMs = 80) {
  const p = await center(sel); await sleep(80);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await sleep(holdMs);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(450);
}
async function shot(name) { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64')); }
const page = () => ev(`return { p: cur().p, depth: ui.stack.length, sheet: !!document.querySelector('#sheet .sheet'), tabs: !$('#tabbar').hidden, fab: !$('#fab').hidden, h1: document.querySelector('#app .bar h1')?.textContent || '' }`);
const fresh = async (url = BASE) => { await go(BASE + 'serve-404'); await ev('localStorage.clear(); indexedDB.deleteDatabase("uravu"); indexedDB.deleteDatabase("uravu-sync");'); await go(url); };

let pass = 0, fail = 0; const results = [];
// ONLY=regex runs just the matching tests, e.g.  ONLY="sync|Vault|phone" npm test
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const e0 = errors.length;
  try { await fn(); if (errors.length > e0) throw new Error('page error: ' + errors.slice(e0).join(' | ')); pass++; results.push(['PASS', name]); console.log('  \u2713 ' + name); }
  catch (e) { fail++; results.push(['FAIL', name, e.message]); console.log('  \u2717 ' + name + '\n      ' + e.message); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

console.log(`\nTesting Uravu in ${path.basename(CHROME)} at 412x915 (phone)\n`);

/* ================= tests ================= */
await test('No window.claude is used any more', async () => {
  const files = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).map(f => 'js/' + f)];
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  ok(!/window\.claude\.use\('downloads'\)/.test(src), 'downloads capability still referenced');
});

await test('Opens on Home with tab bar, ＋ button and no errors', async () => {
  await fresh();
  const s = await page();
  eq(s.p, 'home', 'page'); ok(s.tabs && s.fab, 'tab bar and ＋ visible');
  eq(await ev(`return [...document.querySelectorAll('.tab')].map(t => t.lastChild.textContent.trim())`), ['Home', 'People', 'Family tree', 'Functions'], 'tabs');
  ok(await ev(`return document.querySelectorAll('.tab')[0].getAttribute('aria-current') === 'page'`), 'Home tab active');
  await shot('01-home-light');
});

await test('Saved data from the original app loads unchanged', async () => {
  ok(ORIGINAL, 'original index.html not found in git history');
  await fresh(BASE + '__original.html');
  const before = await ev(`return localStorage.getItem('uravu.v1')`);
  ok(before && JSON.parse(before).people.me, 'original app saved its sample family');
  await go(BASE);
  const after = await ev(`return localStorage.getItem('uravu.v1')`);
  eq(after === before, true, 'stored JSON changed when the new app opened it');
  eq(await ev(`return Object.keys(S.people).length`), Object.keys(JSON.parse(before).people).length, 'people count');
});

await test('Fresh sample data has exactly the same shape as the original app', async () => {
  const shape = o => Array.isArray(o) ? (o.length ? [shape(o[0])] : []) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [/^x[a-z0-9]{8}$/.test(k) ? '<id>' : k, shape(o[k])])) : typeof o;
  await fresh(BASE + '__original.html'); const a = JSON.parse(await ev(`return localStorage.getItem('uravu.v1')`));
  await fresh(); const b = JSON.parse(await ev(`return localStorage.getItem('uravu.v1')`));
  eq(shape(b), shape(a), 'data shape');
});

await test('Data saved by the new app still opens in the original app', async () => {
  await fresh();
  await ev(`S.people.appa.phone = '9876543210'; S.people.appa.likes.push({ cat: 'Food', val: 'Idli' }); save();`);
  const n = await ev(`return Object.keys(S.people).length`);
  await go(BASE + '__original.html');
  eq(await ev(`return Object.keys(S.people).length`), n, 'original app people count');
  eq(await ev(`return S.people.appa.phone`), '9876543210', 'phone kept');
});

await test('Tabs switch pages; phone Back returns to Home, then leaves', async () => {
  await fresh();
  await touch('.tab[data-id="people"]');
  let s = await page(); eq([s.p, s.h1, s.tabs], ['people', 'People', true], 'People tab');
  await touch('.tab[data-id="funcs"]'); s = await page(); eq(s.p, 'funcs', 'Functions tab');
  await touch('.tab[data-id="family"]'); s = await page(); eq(s.p, 'family', 'Family tab');
  await shot('03-family-tab');
  await backGesture(); s = await page(); eq(s.p, 'home', 'Back from a tab goes Home');
  eq(await ev('return history.state.d'), 0, 'history at the start');
});

await test('Opening a person slides in; Back gesture walks back step by step', async () => {
  await fresh();
  await touch('.tab[data-id="people"]');
  await touch('.r[data-act="person"][data-id="appa"]');
  let s = await page(); eq([s.p, s.tabs, s.fab], ['person', true, false], 'person page: tab bar stays, no ＋');
  ok(await ev(`return !$('#app .bar [data-act="go-home"]') && !!$('#app .bar [data-act="back"]')`), 'header has Back and no Home button');
  await sleep(300); await shot('14-person-page');
  await click('[data-act="edit"][data-id="appa"]'); s = await page(); eq([s.p, s.tabs], ['edit', false], 'edit page, tab bar hidden on forms');
  await backGesture(); s = await page(); eq(s.p, 'person', 'back to person');
  await click('#app .bar [data-act="back"]'); s = await page(); eq(s.p, 'people', 'in-app back to People');
  await backGesture(); s = await page(); eq(s.p, 'home', 'back to Home');
});

await test('Each tab remembers its pages and scroll; tapping the open tab goes to its first page', async () => {
  await fresh();
  await touch('.tab[data-id="people"]');
  await ev('window.scrollTo(0, 300)'); await sleep(100);
  const y = await ev('return Math.round(window.scrollY)'); ok(y > 0, 'People list scrolls');
  await touch('.tab[data-id="funcs"]'); await touch('.tab[data-id="people"]');
  eq(await ev('return Math.round(window.scrollY)'), y, 'People scroll place kept');
  await touch('.r[data-act="person"][data-id="appa"]');
  await touch('.tab[data-id="home"]'); let s = await page(); eq(s.p, 'home', 'left by the tab bar, on Home');
  await touch('.tab[data-id="people"]'); s = await page(); eq(s.p, 'person', 'People tab reopens on the person');
  eq(await ev('return cur().id'), 'appa', 'same person');
  await backGesture(); s = await page(); eq(s.p, 'people', 'Back walks the People pages');
  await touch('.r[data-act="person"][data-id="appa"]');
  await touch('.tab[data-id="people"]'); s = await page(); eq([s.p, s.fab], ['people', true], 'tapping People again goes to its first page');
  await backGesture(); s = await page(); eq(s.p, 'home', 'then Back goes Home');
  eq(await ev('return history.state.d'), 0, 'history at the start');
});

await test('The address shows the page; refresh and links open the same place', async () => {
  await fresh();
  await touch('.tab[data-id="people"]'); await touch('.r[data-act="person"][data-id="appa"]');
  eq(await ev('return location.hash'), '#/people/person?id=appa', 'address');
  await touch('.tab[data-id="people"]');   // back to the list by the tab bar
  await touch('.r[data-act="person"][data-id="amma"]');
  await click('[data-act="edit"][data-id="amma"]');
  eq(await ev('return location.hash'), '#/people/person?id=amma/edit?id=amma', 'address of a form');
  await backGesture(); await backGesture();
  eq(await ev('return location.hash'), '#/people', 'address after Back');
  await touch('.r[data-act="person"][data-id="appa"]');
  await cdp('Page.reload'); await sleep(1200);   // refresh
  let s = await page(); eq([s.p, await ev('return cur().id')], ['person', 'appa'], 'refresh keeps the page');
  await backGesture(); s = await page(); eq(s.p, 'people', 'Back after refresh');
  await backGesture(); s = await page(); eq(s.p, 'home', 'then Home');
  eq(await ev('return location.hash'), '', 'Home has a plain address');
  // a link opened fresh: Back still leads Home step by step
  await go(BASE + 'serve-404'); await go(BASE + '#/home/docs');
  s = await page(); eq([s.p, s.depth], ['docs', 2], 'link opens Documents');
  await backGesture(); s = await page(); eq(s.p, 'home', 'Back to Home');
  // something deleted, or made up: stops at the last good page
  await go(BASE + 'serve-404'); await go(BASE + '#/people/person?id=nobody/edit?id=nobody');
  s = await page(); eq(s.p, 'people', 'unknown person cut off');
  await go(BASE + 'serve-404'); await go(BASE + '#/settings/x');
  s = await page(); eq(s.p, 'home', 'made-up address goes Home');
  await go(BASE + 'serve-404'); await go(BASE + '#family');
  s = await page(); eq(s.p, 'family', 'app-icon shortcut still works');
});

await test('Pages slide: the old page moves out while the new one moves in', async () => {
  await fresh();
  await touch('.tab[data-id="people"]');
  await ev(`H.person('appa')`); await sleep(110); await shot('12-slide-midway');
  const g =await ev(`const g = $('.ghost'); return g ? { cls: g.className, ids: g.querySelectorAll('[id]').length, inert: g.inert } : null`);
  ok(g && g.cls.includes('fwd'), 'old page shown while sliding'); eq([g.ids, g.inert], [0, true], 'copy has no ids and cannot be tapped');
  await sleep(700); ok(await ev(`return !$('.ghost')`), 'copy removed after the slide');
  await backGesture(); ok(await ev(`return !$('.ghost')`), 'and after going back');
  eq((await page()).p, 'people', 'back on People');
});

await test('Swipe in from the left edge goes back', async () => {
  await fresh();
  await touch('.tab[data-id="people"]'); await touch('.r[data-act="person"][data-id="appa"]');
  const swipe = async (to, steps = 8) => {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y: 400 }] });
    for (let i = 1; i <= steps; i++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 8 + (to - 8) * i / steps, y: 402 }] }); await sleep(30); }
    const mid = await ev(`return { drag: $('#app').classList.contains('dragging'), under: !!$('.ghost.under') }`);
    if (mid.drag && to > 200) await shot('13-swipe-back');
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(800);
    return mid;
  };
  const short = await swipe(80, 12);
  ok(short.drag && short.under, 'page follows the finger with People underneath');
  let s = await page(); eq(s.p, 'person', 'a short slow swipe springs back');
  ok(await ev(`return !$('.ghost') && !$('#app').style.transform`), 'cleaned up');
  await swipe(300); s = await page(); eq(s.p, 'people', 'a long swipe goes back');
  ok(await ev(`return !$('.ghost') && !$('#app').style.transform && !$('#app').classList.contains('dragging')`), 'cleaned up after');
  eq(await ev('return location.hash'), '#/people', 'history in step');
  // on a tab's first page there is nothing to drag (desktop Chrome may still do its own touch Back, which also goes Home)
  const root = await swipe(300); eq(root.drag, false, 'no page drag on a tab’s first page');
});

await test('＋ button opens a menu sheet with 4 choices; Back closes it', async () => {
  await fresh();
  await touch('#fab');
  let s = await page(); eq([s.p, s.sheet], ['menu', true], 'menu sheet');
  eq(await ev(`return [...document.querySelectorAll('#sheet .mi')].map(b => b.textContent.trim())`), ['Add person', 'Add date', 'Add document', 'Add function'], 'menu items');
  eq(await ev(`return $('#fab').getAttribute('aria-expanded')`), 'true', 'fab expanded');
  await shot('04-fab-menu');
  await backGesture(); s = await page(); eq([s.p, s.sheet], ['home', false], 'closed by Back');
  await touch('#fab'); await touch('.scrim'); s = await page(); eq([s.p, s.sheet], ['home', false], 'closed by tapping outside');
});

await test('＋ › Add date: fill the sheet and save', async () => {
  await fresh();
  const n = await ev('return S.events.length');
  await touch('#fab'); await touch('.mi[data-go="event-new"]');
  let s = await page(); eq([s.p, s.sheet], ['event', true], 'date sheet');
  await shot('05-add-date-sheet');
  await ev(`const f = $('#ef'); f.querySelector('[name=title]').value = 'Test day'; f.querySelector('[name=on]').value = '2020-01-05'; f.querySelector('.pick input[value="amma"]').checked = true;`);
  await click('#sheet [data-act="save-event"]'); await sleep(300);
  s = await page(); eq([s.p, s.sheet], ['home', false], 'sheet closed after save');
  eq(await ev('return S.events.length'), n + 1, 'event saved');
  eq(await ev(`return S.events.at(-1).title + '|' + S.events.at(-1).people.join()`), 'Test day|amma', 'event data');
  eq(await ev('return history.state.d'), 0, 'history in step');
});

await test('＋ › Add person opens the full form; Add document asks the type in a sheet', async () => {
  await fresh();
  await touch('#fab'); await touch('.mi[data-go="new"]');
  let s = await page(); eq([s.p, s.sheet], ['edit', false], 'person form page');
  await backGesture(); s = await page(); eq(s.p, 'home', 'back home');
  await touch('#fab'); await touch('.mi[data-go="doc-new"]');
  s = await page(); eq([s.p, s.sheet], ['docedit', true], 'document type sheet');
  await click('#sheet [data-act="doc-type"][data-id="passport"]');
  s = await page(); eq([s.p, s.sheet], ['docedit', false], 'document form page');
  ok(await ev(`return document.body.classList.contains('has-save') && !!$('#df')`), 'form with save bar');
  await ev(`$('#df [name="d_number"]').value = 'P1234567'; $('#df [name="d_to"]').value = '2030-01-01';`);
  await click('[data-act="doc-save"]');
  s = await page(); eq(s.p, 'doc', 'opened the new document');
  eq(await ev(`return S.docs.at(-1).type + '|' + S.docs.at(-1).f.number`), 'passport|P1234567', 'saved');
  await backGesture(); s = await page(); eq(s.p, 'home', 'Back from the new document goes Home');
});

await test('＋ › Add function: sheet, then guest picker', async () => {
  await fresh();
  await touch('#fab'); await touch('.mi[data-go="func-new"]');
  let s = await page(); eq([s.p, s.sheet], ['funcedit', true], 'function sheet');
  await click('#sheet [data-act="func-tpl"][data-id="Wedding"]');
  await click('#sheet [data-act="func-save"]');
  s = await page(); eq([s.p, s.sheet], ['funcadd', false], 'guest picker');
  await backGesture(); s = await page(); eq(s.p, 'func', 'function page under it');
});

await test('Long-press a person: Call, WhatsApp, Edit, Add date, Open', async () => {
  await fresh();
  await ev(`S.people.appa.phone = '98765 43210'; save(); render();`);
  await touch('.ppl[data-act="person"][data-id="appa"]', 750);
  let s = await page(); eq([s.p, s.sheet], ['quick', true], 'quick sheet (and the person page did not open)');
  eq(await ev(`return [...document.querySelectorAll('#sheet .qi')].map(b => b.textContent.trim())`), ['Call', 'WhatsApp', 'Edit', 'Add date', 'Open'], 'actions');
  eq(await ev(`return $('#sheet .qi.tel').getAttribute('href')`), 'tel:9876543210', 'call link');
  eq(await ev(`return $('#sheet .qi.wa').getAttribute('href')`), 'https://wa.me/919876543210', 'WhatsApp link');
  await shot('06-long-press');
  await touch('.qi[data-go="person"]'); s = await page(); eq([s.p, s.sheet], ['person', false], 'Open');
  await backGesture(); s = await page(); eq(s.p, 'home', 'Back to Home');
  await touch('.ppl[data-act="person"][data-id="amma"]', 750); await touch('.qi[data-go="event-new"]');
  s = await page(); eq([s.p, s.sheet], ['event', true], 'Add date sheet');
  ok(await ev(`return $('#ef .pick input[value="amma"]').checked`), 'Amma pre-selected');
  await backGesture(); s = await page(); eq([s.p, s.sheet], ['home', false], 'closed');
  await touch('.ppl[data-act="person"][data-id="amma"]', 750); await touch('.qi[data-go="edit"]');
  s = await page(); eq(s.p, 'edit', 'Edit');
  await backGesture();
  // no phone saved: Call is shown but disabled
  await touch('.ppl[data-act="person"][data-id="amma"]', 750);
  eq(await ev(`return $('#sheet .qi.tel').getAttribute('aria-disabled')`), 'true', 'Call disabled without a number');
  await backGesture();
  // long-press works on the tree and on lists too
  await touch('.tab[data-id="family"]'); await touch('.tnode[data-id="amma"]', 750);
  s = await page(); eq(s.p, 'quick', 'long-press in the tree'); await backGesture();
  s = await page(); eq(s.p, 'family', 'tree still there');
  await touch('.tnode[data-id="amma"]'); s = await page(); eq([s.p, await ev('return cur().pov')], ['family', 'amma'], 'a short tap still changes the view');
});

await test('Red badges: birthdays today, renewals due, functions coming up', async () => {
  await fresh();
  await ev(`const t = new Date(), md = '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    for (const p of Object.values(S.people)) if (p.dob && p.dob.slice(4) === md) p.dob = '1950-01-01';   // clear any sample birthday on today
    S.people.arjun.dob = '1990' + md; S.people.senthil.dob = '1986' + md;
    const d = new Date(); d.setDate(d.getDate() + 5); S.funcs[0].on = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    save(); render();`);
  const want = await ev(`return badges()`);
  eq(want.bdays, 2, 'two birthdays today'); eq(want.funcs, 1, 'one function soon'); ok(want.dues >= 1, 'renewals due');
  const dot = id => ev(`return document.querySelector('.tab[data-id="${id}"] .dot')?.textContent || ''`);
  eq(await dot('people'), '2', 'People tab badge'); eq(await dot('funcs'), '1', 'Functions tab badge'); eq(await dot('home'), String(want.dues), 'Home tab badge = renewals due');
  eq(await ev(`return document.querySelector('[data-act="go"][data-id="dates"] .dot')?.textContent`), String(want.today), 'Dates tile badge');
  eq(await ev(`return document.querySelector('[data-act="go"][data-id="docs"] .dot')?.textContent`), String(want.dues), 'Documents tile badge');
  await shot('07-badges');
  await touch('.tab[data-id="people"]');
  ok(await ev(`return [...document.querySelectorAll('.badge.hot')].some(b => b.textContent.includes('Today'))`), 'red "Today" badge in People');
  await shot('08-people');
});

await test('Download: backup file, then restore it', async () => {
  await fresh();
  await click('.me-btn'); eq((await page()).p, 'settings', 'settings');
  await click('[data-act="backup"]');
  const f = await waitDownload(/^uravu-backup-\d{4}-\d\d-\d\d\.json$/);
  const j = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  eq([j.app, j.version, !!j.data.people.me], ['uravu', 1, true], 'backup format');
  await ev(`delete S.people.joseph; save();`);
  const n = Object.keys(j.data.people).length;
  await cdp('DOM.enable'); const { root } = await cdp('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#restoreIn' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [f.file] }); await sleep(500);
  await click('[data-act="restore-yes"]');
  eq(await ev('return Object.keys(S.people).length'), n, 'restored people');
});

await test('Download: guest list, family tree image, document photo', async () => {
  await fresh();
  await touch('.tab[data-id="funcs"]'); await touch('.r[data-act="func"]');
  await click('[data-act="func-txt"]');
  const t = await waitDownload(/-guests\.txt$/); ok(fs.readFileSync(t.file, 'utf8').includes('Housewarming'), 'guest list text');
  await ev("H['tab-go']('family')"); await sleep(300); await click('[data-act="tree-png"]');
  const p = await waitDownload(/^uravu-family-tree-.*\.png$/, 15000);
  ok(fs.readFileSync(p.file).subarray(1, 4).toString() === 'PNG', 'tree is a PNG');
  // a document photo: add one, open it, save it
  await ev(`ui.stack = [{ p: 'home' }]; render();`);
  await click('[data-act="go"][data-id="docs"]'); await click('.r[data-act="doc"]');
  await cdp('DOM.enable'); const { root } = await cdp('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#docPhotoIn' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [path.join(ROOT, 'icons', 'icon-192.png')] }); await sleep(1200);
  await click('.thumb[data-act="photo-view"]'); ok(await ev(`return !!$('.viewer')`), 'viewer open');
  await backGesture(); ok(await ev(`return !$('.viewer') && cur().p === 'doc'`), 'Back closes the viewer first, page stays');
  await click('.thumb[data-act="photo-view"]'); await click('[data-act="file-save"]');
  const j = await waitDownload(/\.jpg$/); ok(fs.statSync(j.file).size > 500, 'photo saved');
});

await test('Every page and sheet opens without errors', async () => {
  await fresh();
  const list = await ev(`const f = S.funcs[0].id, d = S.docs[0], dr = S.docs.find(x => x.terms.length);
    return [['people', {}], ['people', { f: 'friend' }], ['dates', {}], ['dates', { tab: 'once' }], ['family', {}], ['family', { pov: 'amma' }], ['family', { full: true }],
      ['person', { id: 'me' }], ['person', { id: 'appa' }], ['person', { id: 'arjun' }], ['person', { id: 'joseph' }], ['edit', { id: 'appa' }], ['edit', { id: '', relTo: 'appa' }],
      ['event', { eid: '' }], ['event', { eid: S.events[0].id }], ['settings', {}], ['genders', {}], ['living', {}], ['moi', {}], ['docs', {}], ['docs', { f: 'due' }],
      ['doc', { id: d.id }], ['docedit', { id: d.id }], ['docedit', { id: '', type: 'health_ins' }], ['docedit', { id: '' }], ['term', { doc: dr.id, term: '' }], ['term', { doc: dr.id, term: dr.terms[0].id }],
      ['funcs', {}], ['func', { id: f }], ['func', { id: f, open: S.funcs[0].guests[0].id }], ['funcedit', { id: f }], ['funcedit', { id: '' }], ['funcadd', { id: f }],
      ['connect', { a: 'me', b: 'arjun' }], ['connect', { a: 'priya', b: 'senthil' }], ['pickp', { key: 'b' }], ['menu', {}], ['quick', { id: 'wife' }]];`);
  for (const [p, params] of list) {
    await ev(`ui.stack = [{ p: 'home' }]; push(${JSON.stringify(p)}, ${JSON.stringify(params)});`); await sleep(60);
    const s = await page();
    ok(s.p === p, `${p} did not open (got ${s.p})`);
    ok(await ev(`return (isSheet(cur()) ? $('#sheet .sheet') : $('#app')).textContent.trim().length > 0`), `${p} is empty`);
  }
  await ev(`ui.stack = [{ p: 'family' }]; S.settings.famView = 'cards'; render();`); await ev(`S.settings.famView = 'tree'; render();`);
});

await test('Two wives: children stay with their own mother; tree seats both wives', async () => {
  await fresh();
  const r = await ev(`
    const add = (id, name, g) => { S.people[id] = blankPerson(id, { name, gender: g }); };
    add('kt', 'Kandhasamy', 'm'); add('w1', 'First Wife', 'f'); add('w2', 'Second Wife', 'f'); add('g4', 'Daughter', 'f'); add('b5', 'Son', 'm');
    addLink('kt', 'father', 'appa');   // appa, periyappa, athai: first wife's children
    addLink('w1', 'wife', 'kt');
    addLink('w2', 'wife', 'kt');
    addLink('g4', 'daughter', 'kt');   // father first: must NOT guess a mother
    const g4auto = S.edges.filter(e => e.type === 'parent' && e.child === 'g4').map(e => e.parent).sort();
    addLink('w2', 'mother', 'g4');
    addLink('b5', 'son', 'w2');        // mother first: her only husband is the father
    save();
    const par = c => S.edges.filter(e => e.type === 'parent' && e.child === c).map(e => e.parent).sort();
    const fromMe = { grand: kin('w2'), aunt: kin('g4').tl };
    EGO = 'appa'; kc = {}; const step = kin('w2'), half = kin('b5').en; EGO = null; kc = {};
    // half-brothers also saved as brothers must not turn the step-mother into "Anna's Amma"
    addLink('b5', 'ybrother', 'periyappa'); addLink('periyappa', 'ebrother', 'b5'); save();
    EGO = 'b5'; kc = {}; const viaSib = kin('w1').en, bro = kin('appa').tl; EGO = null; kc = {};
    return Object.assign({ g4auto, appa: par('appa'), athai: par('athai'), g4: par('g4'), b5: par('b5'), step, half, viaSib, bro }, fromMe);`);
  eq(r.viaSib, 'Step-mother', 'father’s first wife seen by second wife’s son (with brothers saved)');
  ok(/Anna/.test(r.bro) && !/ /.test(r.bro.replace(' / ', '')), 'half-brother is plain Anna: ' + r.bro);
  eq(r.g4auto, ['kt'], 'daughter added to father only gets no guessed mother');
  eq(r.appa, ['kt', 'w1'], 'appa: father + first wife');
  eq(r.athai, ['kt', 'w1'], 'athai: father + first wife');
  eq(r.g4, ['kt', 'w2'], 'daughter: father + second wife');
  eq(r.b5, ['kt', 'w2'], 'son: father + second wife');
  eq(r.step.en, 'Step-mother', 'father’s second wife'); ok(/Chithi/.test(r.step.tl), 'step-mother term: ' + r.step.tl);
  eq(r.half, 'Brother', 'appa’s half-brother is a brother');
  eq([r.grand.tl, r.grand.en], ['Paati', 'Step-grandmother'], 'grandfather’s second wife');
  eq(r.aunt, 'Athai', 'half-sister of appa is Athai');
  await ev(`ui.stack = [{ p: 'family' }]; S.settings.famView = 'tree'; render();`); await sleep(300);
  const pos = await ev(`const b = id => { const n = document.querySelector('.tnode[data-id="' + id + '"]'); return n ? [Math.round(parseFloat(n.style.left)), Math.round(parseFloat(n.style.top))] : null; }; return { w1: b('w1'), kt: b('kt'), w2: b('w2') };`);
  ok(pos.w1 && pos.kt && pos.w2, 'all three in the tree: ' + JSON.stringify(pos));
  eq(pos.w1[1] === pos.kt[1] && pos.kt[1] === pos.w2[1], true, 'same row');
  const [a, k, c] = [pos.w1[0], pos.kt[0], pos.w2[0]].sort((x, y) => x - y);
  eq(k, pos.kt[0], 'Kandhasamy sits between his two wives');
  ok(k - a < 140 && c - k < 140, 'wives sit right next to him: ' + JSON.stringify(pos));
  await shot('tree-two-wives');
  await ev(`S.settings.treeScope = 'extended'; render();`); await sleep(200); await click('[data-act="zoom"][data-id="fit"]');
  await ev(`document.querySelector('.tree-scroll').scrollIntoView()`); await sleep(200);
  await shot('tree-two-wives-extended'); await ev(`delete S.settings.treeScope; render();`);
});

await test('Sheet can be dragged down to close', async () => {
  await fresh();
  await touch('#fab');
  const a = await center('#sheet .sheet-drag'); await sleep(50);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y + i * 30, button: 'left' }); await sleep(16); }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: a.y + 180, button: 'left', clickCount: 1 });
  await sleep(500);
  const s = await page(); eq([s.p, s.sheet], ['home', false], 'closed');
});

await test('Search still works on Home', async () => {
  await fresh();
  await ev(`const q = $('#q'); q.value = 'butterscotch'; q.dispatchEvent(new Event('input', { bubbles: true }));`);
  ok(await ev(`return $('#homeBody').textContent.includes('Lakshmi')`), 'found Amma by what she likes');
});

await test('Dark mode keeps working', async () => {
  await fresh();
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await sleep(200);
  eq(await ev(`return getComputedStyle(document.body).backgroundColor`), 'rgb(18, 20, 24)', 'dark page');
  eq(await ev(`return getComputedStyle($('#tabbar')).backgroundColor`), 'rgb(18, 20, 24)', 'dark tab bar');
  await shot('02-home-dark');
  await touch('#fab'); await shot('04b-fab-menu-dark'); await backGesture();
  await touch('.ppl[data-act="person"][data-id="amma"]', 750); await shot('06b-long-press-dark'); await backGesture();
  await touch('.tab[data-id="funcs"]'); await shot('09-functions-dark');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await touch('.tab[data-id="funcs"]'); await shot('09-functions-light');
  await touch('.r[data-act="person"], .r[data-act="func"]'); await shot('10-function-page');
});

/* ================= cloud sync, against a fake Supabase in this process ================= */
const FAKE_PORT = 8766, fake = startFakeCloud(FAKE_PORT), FAKE_URL = `http://127.0.0.1:${FAKE_PORT}/`;
const EMAIL = 'family@example.com', PASS = 'correct-horse-9', PIN = '246810';

await test('Cloud sync switched off: no account row, app works as before', async () => {
  await fresh(); await click('.me-btn');
  ok(await ev(`return !document.querySelector('.prof.acct') && cloud.status === 'off'`), 'no account row without config');
});

await test('Data turns into table rows and back without any change', async () => {
  await fresh();
  const r = await ev(`const rows = toRows(S), back = fromRows(rows, S);
    const t = {}; for (const x of rows.values()) t[x.t] = (t[x.t] || 0) + 1;
    const diffs = [], walk = (x, y, p) => { if (stable(x) === stable(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); } else diffs.push(p + ': ' + JSON.stringify(x) + ' => ' + JSON.stringify(y)); };
    walk(S, back, 'S');
    return { diffs: diffs.slice(0, 3), keys: JSON.stringify(Object.keys(back.people)) === JSON.stringify(Object.keys(S.people)), t };`);
  eq(r.diffs, [], 'round trip changed the data'); ok(r.keys, 'people order kept');
  eq(Object.keys(r.t).sort(), ['doc_terms', 'docs', 'events', 'functions', 'guests', 'likes', 'links', 'people', 'settings'], 'tables used');
});

// Each phone is its own browser profile (separate storage), all talking to the same fake cloud
function device(sid, label) {
  const c = (m, p) => send(m, p, sid);
  const dev = { sid, c, label };
  dev.ev = async expr => {
    const r = await c('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  dev.go = async url => {
    const loaded = new Promise(r => { const f = m => { if (m.method === 'Page.loadEventFired' && m.sessionId === sid) { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
    await c('Page.navigate', { url }); await loaded; await sleep(500);
  };
  dev.click = async sel => { await dev.ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('not found: ' + ${JSON.stringify(sel)}); el.click();`); await sleep(350); };
  dev.waitFor = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await dev.ev(expr)) return; await sleep(100); } throw new Error('timed out waiting for: ' + expr); };
  dev.sync = () => dev.ev('await syncNow(); return cloud.status');
  dev.offline = on => c('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  dev.shot = async name => { const { data } = await c('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64')); };
  dev.page = () => dev.ev(`return { p: cur().p, sheet: !!document.querySelector('#sheet .sheet') }`);
  return dev;
}
async function newDevice(script, label, ignoreConsole, keepConfig) {
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const d = device(sessionId, label); d.ctx = browserContextId;
  await d.c('Page.enable'); await d.c('Runtime.enable'); await d.c('Network.enable');
  await d.c('Network.setBypassServiceWorker', { bypass: true });
  await d.c('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await d.c('Page.addScriptToEvaluateOnNewDocument', { source: script });
  if (!keepConfig) {   // an empty config.js: the fake cloud (or nothing) instead of the real project
    await d.c('Fetch.enable', { patterns: [{ urlPattern: '*/config.js*' }] });
    listeners.push(m => { if (m.method === 'Fetch.requestPaused' && m.sessionId === sessionId) d.c('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from("window.URAVU_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', google: false };").toString('base64') }); });
  }
  await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, browserContextId, eventsEnabled: true });
  listeners.push(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') errors.push(`[${label}] (exception) ` + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { const t = m.params.args.map(a => a.value ?? a.description).join(' '); if (!(ignoreConsole && ignoreConsole.test(t))) errors.push(`[${label}] ` + t); }
  });
  return d;
}
// Phone 1 is a fresh profile too: the main tab's history is long from the tests above (Chrome keeps 50 steps)
const A = await newDevice(fakeApiScript(FAKE_URL), 'phone 1');
let B = null, UID = '';
const live = t => fake.rowsOf(UID, t).filter(r => !r.deleted);
const cloudOk = fn => async () => { if (!UID) throw new Error('skipped: sign-up failed'); await fn(); };

await test('Sign up; the first sync uploads this phone’s data (documents wait for the vault PIN)', async () => {
  await A.go(BASE);
  eq(await A.ev('return cloud.status'), 'signedout', 'status before signing in');
  await A.click('.me-btn'); await A.click('.prof.acct');
  eq((await A.page()).p, 'account', 'account page'); await A.shot('20-sign-in');
  await A.ev(`$('#acEmail').value = 'nope'; $('#acPass').value = 'short';`); await A.click('[data-act="acct-signup"]');
  eq(await A.ev(`return $('#acErr').textContent`), 'Enter your email address.', 'checks the email');
  await A.ev(`$('#acEmail').value = ${JSON.stringify(EMAIL)}; $('#acPass').value = ${JSON.stringify(PASS)};`);
  await A.click('[data-act="acct-signup"]');
  await A.waitFor(`return cur().p === 'cloudsetup' && cloud.cloudPeople === 0`);
  await A.shot('21-first-sync');
  UID = fake.uidOf(EMAIL); ok(UID, 'account made');
  const local = await A.ev(`return { people: Object.keys(S.people).length, edges: S.edges.length, docs: S.docs.length, events: S.events.length,
    likes: Object.values(S.people).reduce((a, p) => a + new Set(p.likes.map(l => l.cat + '|' + l.val)).size, 0), guests: S.funcs.reduce((a, f) => a + f.guests.length, 0) }`);
  await A.click('[data-act="acct-start-upload"]');
  await A.waitFor(`return cloud.status === 'synced' && cur().p !== 'cloudsetup'`);
  eq([live('people').length, live('links').length, live('likes').length, live('events').length, live('functions').length, live('guests').length, live('settings').length],
    [local.people, local.edges, local.likes, local.events, 1, local.guests, 1], 'rows uploaded (people, links, likes, events, functions, guests, settings)');
  eq(live('docs').length, 0, 'documents not uploaded before a vault PIN');
  ok(live('people').every(r => r.owner_id === UID && r.updated_at && r.deleted === false), 'rows carry owner, time and soft-delete flag');
  ok((await A.ev('return cloudStatusText()')).includes('vault PIN'), 'status says documents wait for a vault PIN');
  await A.ev(`ui.stack = [{ p: 'home' }]; render();`);
  eq(await A.ev(`return $('.me-btn .cdot').dataset.cloudDot`), 'warn', 'dot on the profile button');
});

await test('Second phone signs in and takes the account’s data; edits go both ways', cloudOk(async () => {
  B = await newDevice(fakeApiScript(FAKE_URL), 'phone 2');
  await B.go(BASE);
  await B.ev(`S.people.zz = blankPerson('zz', { name: 'Only on phone 2' }); save();`);
  await B.ev(`push('account', {})`);
  await B.ev(`$('#acEmail').value = ${JSON.stringify(EMAIL)}; $('#acPass').value = 'wrong-password';`); await B.click('[data-act="acct-signin"]');
  eq(await B.ev(`return $('#acErr').textContent`), 'Wrong email or password.', 'wrong password');
  await B.ev(`$('#acPass').value = ${JSON.stringify(PASS)};`); await B.click('[data-act="acct-signin"]');
  await B.waitFor(`return cur().p === 'cloudsetup' && cloud.cloudPeople > 0`);
  await B.ev(`const b = $('[data-act="acct-start-replace"]'); b.click(); b.click();`);   // tap twice to confirm
  await B.waitFor(`return cloud.status === 'synced' && cur().p !== 'cloudsetup'`, 15000);
  eq(await B.ev('return Object.keys(S.people).sort()'), await A.ev('return Object.keys(S.people).sort()'), 'phone 2 has the account’s people');
  ok(!(await B.ev('return !!S.people.zz')), 'phone 2’s own data was replaced');
  ok(downloads.some(d => /^uravu-backup-/.test(d.name)), 'a backup of phone 2 was saved first');
  // phone 2 -> phone 1
  await B.ev(`S.people.bnew = blankPerson('bnew', { name: 'Added on phone 2', circle: 'friend' }); save();`);
  eq(await B.sync(), 'synced', 'phone 2 synced'); await A.sync();
  eq(await A.ev('return S.people.bnew && S.people.bnew.name'), 'Added on phone 2', 'phone 1 got the new person');
  // phone 1 -> phone 2, including a like and a guest
  await A.ev(`S.people.appa.phone = '9000000001'; S.people.appa.likes.push({ cat: 'Sweets', val: 'Mysore pak' }); S.funcs[0].guests[0].rsvp = 'maybe'; save();`);
  await A.sync(); await B.sync();
  eq(await B.ev('return [S.people.appa.phone, S.people.appa.likes.some(l => l.val === "Mysore pak"), S.funcs[0].guests[0].rsvp]'), ['9000000001', true, 'maybe'], 'phone 2 got the edits');
}));

await test('Offline edits stay on the phone and go up when it’s back online', cloudOk(async () => {
  await A.offline(true);
  await A.ev(`S.people.amma.notes = 'Written offline'; save();`);
  eq(await A.sync(), 'offline', 'status offline');
  ok((await A.ev('return cloudStatusText()')).startsWith('Offline'), 'offline message');
  ok(await A.ev(`return JSON.parse(localStorage.getItem('uravu.v1')).people.amma.notes === 'Written offline'`), 'saved on the phone');
  ok(await A.ev(`const st = await SDB.get('state:' + cloud.user.uid); return st.rows['people|amma'].p === 1`), 'remembered as waiting to send');
  await A.offline(false);
  await A.waitFor(`return cloud.status === 'synced'`, 10000);   // coming back online syncs by itself
  await B.sync(); eq(await B.ev('return S.people.amma.notes'), 'Written offline', 'phone 2 got it');
}));

await test('Same person edited on both phones: the newest edit wins', cloudOk(async () => {
  await A.ev(`S.people.periyappa.notes = 'Edited on phone 1'; save();`); await sleep(700);
  await B.ev(`S.people.periyappa.notes = 'Edited on phone 2, later'; save();`); await sleep(700);
  await B.sync(); await A.sync(); await B.sync();   // the older edit is sent last, and still loses
  eq(await A.ev('return S.people.periyappa.notes'), 'Edited on phone 2, later', 'phone 1');
  eq(await B.ev('return S.people.periyappa.notes'), 'Edited on phone 2, later', 'phone 2');
}));

await test('Delete on one phone removes it on the other (soft delete)', cloudOk(async () => {
  await B.ev(`delete S.people.joseph; save();`); await B.sync(); await A.sync();
  ok(!(await A.ev('return !!S.people.joseph')), 'gone on phone 1');
  const row = fake.rowsOf(UID, 'people').find(r => r.id === 'joseph');
  eq([row.deleted, JSON.stringify(row.data)], [true, '{}'], 'row kept as deleted, with its details removed');
}));

await test('Restoring a backup while signed in makes the account match it', cloudOk(async () => {
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }]; render();`);
  const n0 = downloads.length; await A.click('[data-act="backup"]');
  let f = null; for (let t = 0; t < 8000 && !f; t += 100) { f = downloads.slice(n0).find(d => /^uravu-backup-/.test(d.name) && d.done); if (!f) await sleep(100); }
  ok(f, 'backup saved');
  await A.ev(`S.people.temp1 = blankPerson('temp1', { name: 'Temporary' }); save();`); await A.sync(); await B.sync();
  ok(await B.ev('return !!S.people.temp1'), 'phone 2 had the new person');
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }]; render();`);
  await A.c('DOM.enable'); const { root } = await A.c('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await A.c('DOM.querySelector', { nodeId: root.nodeId, selector: '#restoreIn' });
  await A.c('DOM.setFileInputFiles', { nodeId, files: [path.join(DL, f.guid)] }); await sleep(500);
  ok((await A.ev(`return $('.pov-note').textContent`)).includes('in your account'), 'warns that the account changes too');
  await A.click('[data-act="restore-yes"]'); await A.sync(); await B.sync();
  ok(!(await B.ev('return !!S.people.temp1')), 'phone 2 matches the backup');
  eq(fake.rowsOf(UID, 'people').find(r => r.id === 'temp1').deleted, true, 'deleted in the account');
}));

await test('Vault: documents and files are encrypted before upload; phone 2 needs the PIN', cloudOk(async () => {
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  ok(await A.ev(`return vaultState() === 'none' && !!$('#acPin2')`), 'asks for a new vault PIN');
  ok((await A.ev(`return $('.pov-note.warn').textContent`)).includes('can’t be opened'), 'warns about a forgotten PIN');
  await A.ev(`$('#acPin').value = ${JSON.stringify(PIN)}; $('#acPin2').value = ${JSON.stringify(PIN)};`); await A.click('[data-act="acct-vault-create"]');
  ok((await A.ev(`return $('#acVErr').textContent`)).includes('Tick the box'), 'the warning must be ticked');
  await A.ev(`$('#acKnow').checked = true;`); await A.click('[data-act="acct-vault-create"]');
  await A.waitFor(`return vaultState() === 'open' && cloud.status === 'synced'`, 20000);
  await A.sync();
  const nd = await A.ev('return S.docs.length'), docs = live('docs');
  eq(docs.length, nd, 'documents uploaded'); ok(live('doc_terms').length > 0, 'policy years uploaded');
  ok(docs.every(r => /^v1:/.test(r.secret) && !('f' in r.data) && !('note' in r.data)), 'document details only in the encrypted part');
  const dump = JSON.stringify([...fake.rows.values()]);
  for (const plain of ['TN5920150001234', '3001/2345/678', '912345678', 'Agent: Ramesh', 'ICICI Lombard']) ok(!dump.includes(plain), 'plain text reached the cloud: ' + plain);
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await A.ev(`await IDB.put('vph1', ${JSON.stringify(photo)}); S.docs[0].photos = [...(S.docs[0].photos || []), 'vph1']; save();`); await A.sync();
  const fb = fake.files.get(UID + '/vph1'); ok(fb, 'file uploaded');
  ok(!Buffer.from(fb, 'base64').toString('latin1').includes('data:image'), 'file is encrypted');
  await sleep(200); await A.shot('22-account-vault');
  // phone 2: documents stay locked until the PIN
  await B.sync();
  ok(await B.ev(`return S.docs.length === 0 && cloud.lockedN > 0 && vaultState() === 'locked'`), 'phone 2: documents locked');
  await B.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  await B.ev(`$('#acPin').value = '111111'; $('[data-act="acct-vault-unlock"]').click();`);
  await B.waitFor(`return !$('#acVErr').hidden`, 15000);
  eq(await B.ev(`return $('#acVErr').textContent`), 'That PIN is wrong.', 'wrong PIN refused');
  await B.ev(`$('#acPin').value = ${JSON.stringify(PIN)}; $('[data-act="acct-vault-unlock"]').click();`);
  await B.waitFor(`return vaultState() === 'open' && S.docs.length > 0 && cloud.lockedN === 0 && cloud.status === 'synced'`, 20000);
  await B.sync();
  eq(await B.ev(`return S.docs.find(d => d.type === 'dl').f.number`), 'TN5920150001234', 'phone 2 reads the licence number');
  eq(await B.ev(`return await IDB.get('vph1')`), photo, 'phone 2 opened the photo');
  // deleting the photo removes the file
  await A.ev(`S.docs[0].photos = S.docs[0].photos.filter(p => p !== 'vph1'); save();`); await A.sync();
  ok(!fake.files.has(UID + '/vph1'), 'file removed from the cloud');
}));

await test('Sign out keeps the phone’s data', cloudOk(async () => {
  const n = await B.ev('return Object.keys(S.people).length');
  await B.click('[data-act="acct-signout"]');
  await B.waitFor(`return cloud.status === 'signedout' && !cloud.user`);
  eq(await B.ev('return Object.keys(S.people).length'), n, 'people still on phone 2');
  ok((await B.ev(`return document.querySelector('[data-cloud-status]')?.textContent || ''`)).includes('Not signed in'), 'status says signed out');
}));

await test('Delete my account removes every row and file', cloudOk(async () => {
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  const n = await A.ev('return Object.keys(S.people).length');
  await A.click('[data-act="acct-delete"]');
  await A.ev(`$('#acDel').value = 'nope';`); await A.click('[data-act="acct-delete-go"]');
  eq(await A.ev(`return $('#acDErr').textContent`), 'Type DELETE to confirm.', 'needs DELETE typed');
  await A.ev(`$('#acDel').value = 'DELETE';`); await A.click('[data-act="acct-delete-go"]');
  await A.waitFor(`return cloud.status === 'signedout' && cur().p === 'settings'`);
  eq([...fake.rows.keys()].filter(k => k.startsWith(UID + '|')).length, 0, 'no rows left');
  eq([...fake.files.keys()].filter(k => k.startsWith(UID + '/')).length, 0, 'no files left');
  ok(!fake.users.has(EMAIL), 'account gone');
  eq(await A.ev('return Object.keys(S.people).length'), n, 'this phone keeps its copy');
}));

await test('Real Supabase client: server out of reach, the app still opens and says why', async () => {
  // config.js pointing at an address where nothing answers
  const C = await newDevice('', 'phone 3', /^TypeError: Failed to fetch/, true);   // supabase-js logs the failed request itself
  await C.c('Fetch.enable', { patterns: [{ urlPattern: '*/config.js*' }] });
  listeners.push(m => {
    if (m.method === 'Fetch.requestPaused' && m.sessionId === C.sid)
      C.c('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(`window.URAVU_CONFIG = { supabaseUrl: 'http://127.0.0.1:9', supabaseAnonKey: 'test-anon-key', google: true };`).toString('base64') });
  });
  await C.go(BASE + '?code=abc123#/people');
  await C.waitFor(`return cloud.api && cloud.status !== 'off'`);
  eq(await C.ev('return [location.search, location.hash, cur().p]'), ['', '#/people', 'people'], 'sign-in code taken off the address, page kept');
  ok(await C.ev(`return typeof window.supabase.createClient === 'function' && !window.__uravuCloudApi`), 'real client loaded from vendor/');
  await C.waitFor(`return $('#toast').textContent.includes('sign-in link')`);
  eq(await C.ev('return cloud.status'), 'signedout', 'signed out');
  await C.ev(`push('account', {})`);
  ok(await C.ev(`return !!$('[data-act="acct-google"]')`), 'Google button when switched on');
  await C.ev(`$('#acEmail').value = 'someone@example.com'; $('#acPass').value = 'long-enough-pw'; $('[data-act="acct-signin"]').click();`);
  await C.waitFor(`return !$('#acErr').hidden`, 15000);
  eq(await C.ev(`return $('#acErr').textContent`), 'No internet connection. Try again when you’re online.', 'clear message');
  await C.ev(`S.people.appa.notes = 'still works'; save();`);
  eq(await C.ev(`return JSON.parse(localStorage.getItem('uravu.v1')).people.appa.notes`), 'still works', 'saving still works');
  try { await send('Target.disposeBrowserContext', { browserContextId: C.ctx }); } catch (e) {}
});

for (const d of [A, B]) if (d) { try { await send('Target.disposeBrowserContext', { browserContextId: d.ctx }); } catch (e) {} }
fake.server.close();

await test('Installable PWA: manifest, icons, service worker', async () => {
  await cdp('Network.setBypassServiceWorker', { bypass: false });
  await fresh();
  const m = await cdp('Page.getAppManifest');
  ok(m.url && m.url.endsWith('manifest.webmanifest'), 'manifest linked'); eq(m.errors, [], 'manifest errors');
  const man = JSON.parse(m.data); eq([man.display, man.start_url], ['standalone', './'], 'manifest basics');
  for (const ic of man.icons) eq(await ev(`return (await fetch(${JSON.stringify(ic.src)})).status`), 200, ic.src);
  ok(await ev(`const r = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 8000))]); return !!(r && r.active)`), 'service worker active');
  try { const ie = await cdp('Page.getInstallabilityErrors'); eq(ie.installabilityErrors.map(e => e.errorId), [], 'installability'); } catch (e) { if (!/wasn't found|not found/i.test(e.message)) throw e; }
});

await test('Works offline after the first visit', async () => {
  await go(BASE); await sleep(800); await go(BASE); await sleep(500);   // second load is controlled by the service worker
  ok(await ev(`return !!navigator.serviceWorker.controller`), 'page controlled by the service worker');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await go(BASE);
  const s = await page(); eq([s.p, s.tabs], ['home', true], 'app opens offline');
  await shot('11-offline');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
});

/* ---------- done ---------- */
console.log(`\n${pass} passed, ${fail} failed. Screenshots in test/out/\n`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
try { await send('Browser.close'); } catch (e) {}
chrome.kill(); srv.kill();
setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} process.exit(fail ? 1 : 0); }, 500);
