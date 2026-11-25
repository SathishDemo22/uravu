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
  ok(await ev(`return !$('[data-act="edit"]')`), 'no Edit button: everything is changed on the page itself');
  await click('[data-act="new"][data-id="appa"]'); s = await page(); eq([s.p, s.tabs], ['edit', false], 'add-person form, tab bar hidden on forms');
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
  await click('[data-act="new"][data-id="amma"]');
  ok((await ev('return location.hash')).startsWith('#/people/person?id=amma/edit?'), 'address of a form');
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
  await go(BASE + 'serve-404'); await go(BASE + '#/people/person?id=amma/edit?id=amma');
  s = await page(); eq([s.p, await ev('return cur().id')], ['person', 'amma'], 'an old edit link opens their page');
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

await test('From contacts: fills Add person and a saved person’s phone (Android picker)', async () => {
  await fresh();
  // like Chrome, the picker only opens straight from a tap
  const stub = list => `Object.defineProperty(navigator, 'contacts', { configurable: true, value: { getProperties: async () => ['name', 'tel'],
    select: () => navigator.userActivation.isActive ? Promise.resolve(${JSON.stringify(list)}) : Promise.reject(new DOMException('A user gesture is required', 'SecurityError')) } });`;
  await ev(stub([{ name: ['Ravi Kumar'], tel: ['+91 98400 12345'] }]));
  await touch('#fab'); await touch('.mi[data-go="new"]');
  ok(await ev(`return !!$('[data-act="contact-pick"]') && !$('#vcfIn')`), 'picker button, no file picker');
  await click('[data-act="contact-pick"]'); await sleep(200);
  eq(await ev(`const f = $('#pf'); return [f.querySelector('[name=name]').value, f.querySelector('[name=phone]').value]`), ['Ravi Kumar', '9840012345'], 'name and number filled, +91 dropped');
  // two numbers: choose one
  await ev(stub([{ name: ['Two Phones'], tel: ['044 2345 6789', '+91-98400-55555'] }]));
  await click('[data-act="contact-pick"]'); await sleep(200);
  eq(await ev(`return [...document.querySelectorAll('[data-act="contact-tel"]')].map(b => b.dataset.id)`), ['04423456789', '9840055555'], 'both numbers offered, landline keeps its 0');
  await click('[data-act="contact-tel"][data-id="9840055555"]');
  eq(await ev(`return [$('#pf [name=phone]').value, $('#ctTels').innerHTML]`), ['9840055555', ''], 'chosen number filled');
  // closing the picker without choosing changes nothing
  await ev(stub([]));
  await click('[data-act="contact-pick"]'); await sleep(200);
  eq(await ev(`return $('#pf [name=name]').value`), 'Two Phones', 'cancel keeps what was there');
  // on a saved person's page: only the number
  await ev(stub([{ name: ['Appa'], tel: ['0 98765 43210'] }]));
  await ev(`H.person('appa')`); await sleep(400);
  await click('[data-act="qf-open"][data-id="phone"]');
  await click('[data-act="contact-pick"]'); await sleep(200);
  eq(await ev(`return $('#qfIn').value`), '9876543210', 'phone box filled');
  await click('[data-act="qf-save"]');
  eq(await ev(`return S.people.appa.phone`), '9876543210', 'saved');
});

await test('From contact card: reads a .vcf file where the picker isn’t available', async () => {
  await fresh();
  await touch('#fab'); await touch('.mi[data-go="new"]');
  ok(await ev(`return !!$('#vcfIn') && !$('[data-act="contact-pick"]') && !!$('.ct-hint')`), 'file picker with iPhone hint');
  const vcf = ['BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=E0=AE=AE=E0=AF=81=E0=AE=B0=E0=AF=81=E0=AE=95=E0=AE=A9=E0=AF=8D;;;', 'TEL;CELL:+919840', ' 012345', 'TEL;HOME:+1 (415) 555-0100', 'END:VCARD',
    'BEGIN:VCARD', 'FN:Second Person', 'TEL:1111111111', 'END:VCARD'].join('\r\n');
  await ev(`const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(vcf)}], 'c.vcf', { type: 'text/vcard' })); const i = $('#vcfIn'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true }));`);
  await sleep(300);
  eq(await ev(`return $('#pf [name=name]').value`), 'முருகன்', 'Tamil name from a quoted-printable card, first card only');
  eq(await ev(`return [...document.querySelectorAll('[data-act="contact-tel"]')].map(b => b.dataset.id)`), ['9840012345', '+14155550100'], 'folded line joined; other countries kept');
  const v4 = ['BEGIN:VCARD', 'VERSION:4.0', 'FN:A\\, B', 'TEL;VALUE=uri:tel:+91-98400-11111', 'END:VCARD'].join('\n');
  eq(await ev(`return parseVcf(${JSON.stringify(v4)})`), { name: 'A, B', tels: ['9840011111'], photo: null }, 'vCard 4 with escapes');
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

await test('Long-press a person: Call, WhatsApp, Add date, Open', async () => {
  await fresh();
  await ev(`S.people.appa.phone = '98765 43210'; save(); render();`);
  await touch('.ppl[data-act="person"][data-id="appa"]', 750);
  let s = await page(); eq([s.p, s.sheet], ['quick', true], 'quick sheet (and the person page did not open)');
  eq(await ev(`return [...document.querySelectorAll('#sheet .qi')].map(b => b.textContent.trim())`), ['Call', 'WhatsApp', 'Add date', 'Open'], 'actions');
  eq(await ev(`return $('#sheet .qi.tel').getAttribute('href')`), 'tel:9876543210', 'call link');
  eq(await ev(`return $('#sheet .qi.wa').getAttribute('href')`), 'https://wa.me/919876543210', 'WhatsApp link');
  await shot('06-long-press');
await test('From contacts: if the phone refuses the picker, the button switches to a contact card', async () => {
  await fresh();
  await ev(`Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: () => Promise.reject(new DOMException('No permission', 'NotAllowedError')) } });`);
  await touch('#fab'); await touch('.mi[data-go="new"]');
  await click('[data-act="contact-pick"]'); await sleep(200);
  ok(await ev(`return !$('[data-act="contact-pick"]') && !!$('#vcfIn') && /Android/.test($('.ct-hint').textContent) === /android/i.test(navigator.userAgent)`), 'contact card picker shown instead');
  ok(await ev(`return $('#toast').textContent.includes('NotAllowedError')`), 'the reason is shown');
});

  await touch('.qi[data-go="person"]'); s = await page(); eq([s.p, s.sheet], ['person', false], 'Open');
  await backGesture(); s = await page(); eq(s.p, 'home', 'Back to Home');
  await touch('.ppl[data-act="person"][data-id="amma"]', 750); await touch('.qi[data-go="event-new"]');
  s = await page(); eq([s.p, s.sheet], ['event', true], 'Add date sheet');
  ok(await ev(`return $('#ef .pick input[value="amma"]').checked`), 'Amma pre-selected');
  await backGesture(); s = await page(); eq([s.p, s.sheet], ['home', false], 'closed');
  // no phone saved: Call is shown but disabled; tapping it opens their page with the phone box ready
  await touch('.ppl[data-act="person"][data-id="amma"]', 750);
  eq(await ev(`return $('#sheet .qi.tel').getAttribute('aria-disabled')`), 'true', 'Call disabled without a number');
  await touch('#sheet .qi.tel'); await sleep(400);
  s = await page(); eq([s.p, s.sheet, await ev(`return !!$('#qfIn[type="tel"]')`)], ['person', false, true], 'phone box open on their page');
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

await test('Profile photo: preview and adjust before it is used; Back cancels', async () => {
  await fresh();
  // a wide photo: red on the left, blue on the right
  const png = await ev(`const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d');
    x.fillStyle = '#f00'; x.fillRect(0, 0, 200, 200); x.fillStyle = '#00f'; x.fillRect(200, 0, 200, 200); return c.toDataURL('image/png').split(',')[1];`);
  const f = path.join(OUT, 'wide.png'); fs.writeFileSync(f, Buffer.from(png, 'base64'));
  const pick = async () => {
    await cdp('DOM.enable'); const { root } = await cdp('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#photoIn' });
    await cdp('DOM.setFileInputFiles', { nodeId, files: [f] }); await sleep(700);
  };
  await ev(`H.person(S.me)`); await sleep(400);
  ok(await ev(`return !!$('.ph .ph-photo #photoIn')`), 'photo is tappable on the person page');
  await pick(); ok(await ev(`return !!$('.cropper')`), 'adjuster opens after choosing a photo');
  await backGesture(); ok(await ev(`return !$('.cropper') && cur().p === 'person' && !S.people[S.me].photo`), 'Back closes the adjuster, page stays, photo not taken');
  await pick();
  // drag right: the left (red) side moves into the circle
  const a = await center('.crop-stage');
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + i * 40, y: a.y, button: 'left', buttons: 1 }); await sleep(16); }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x + 240, y: a.y, button: 'left', clickCount: 1 });
  await shot('photo-adjust');
  await click('.cropper [data-crop="use"]');
  const px = await ev(`const i = new Image(); i.src = S.people[S.me].photo; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { w: i.width, h: i.height, mid: [...x.getImageData(120, 120, 1, 1).data].slice(0, 3), shown: !!$('.ph .av.xl img'), open: !!$('.cropper') };`);
  eq([px.w, px.h], [240, 240], 'saved photo is 240x240');
  ok(px.mid[0] > 200 && px.mid[2] < 60, 'kept the part dragged into the circle: ' + px.mid);
  ok(px.shown && !px.open, 'saved straight away, the page shows it and the adjuster closes');
  ok(await ev(`return S.people[S.me].photo.startsWith('data:image/jpeg')`), 'photo saved on the person');
  // remove it from the name box
  await click('[data-act="qh-open"]'); await click('[data-act="photo-clear"]'); await click('[data-act="photo-clear"]');
  ok(await ev(`return !S.people[S.me].photo && !$('.ph .av.xl img')`), 'photo removed');
});

await test('Person page: name and every detail change right on the page', async () => {
  await fresh();
  await ev(`H.person('appa')`); await sleep(400);
  // name, Tamil name and nickname
  await click('[data-act="qh-open"]');
  await ev(`$('#qhName').value = 'Ramasamy K'; $('#qhTa').value = 'ராமசாமி'; $('#qhNick').value = 'Ramu';`);
  await click('[data-act="qh-save"]');
  eq(await ev(`const p = S.people.appa; return [p.name, p.tamilName, p.nickname, $('.ph-name').textContent.trim()]`), ['Ramasamy K', 'ராமசாமி', 'Ramu', 'Ramasamy K'], 'name saved and shown');
  await click('[data-act="qh-open"]'); await ev(`$('#qhName').value = ''`); await click('[data-act="qh-save"]');
  eq(await ev(`return [S.people.appa.name, !!$('#qhName')]`), ['Ramasamy K', true], 'an empty name is not saved');
  await click('[data-act="qh-cancel"]');
  // a typed detail: phone, saved with Enter
  await click('[data-act="qf-open"][data-id="phone"]');
  await ev(`$('#qfIn').value = '98400 12345'; $('#qfIn').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`); await sleep(100);
  eq(await ev(`return [S.people.appa.phone, !$('#qfIn'), !!$('.acts a[href^="tel:"]')]`), ['98400 12345', true, true], 'phone saved, Call shows');
  // groups split by commas
  await click('[data-act="qf-open"][data-id="groups"]'); await ev(`$('#qfIn').value = 'Temple, Village ,'`); await click('[data-act="qf-save"]');
  eq(await ev('return S.people.appa.groups'), ['Temple', 'Village'], 'groups');
  // birthday row in Important dates opens the birthday box
  await ev(`S.people.appa.dob = '1960-03-04'; save(); rerender();`);
  await click('.r[data-act="qf-open"][data-id="dob"]');
  ok(await ev(`return $('#qfIn').type === 'date' && $('#qfIn').value === '1960-03-04'`), 'birthday box opens from the date row');
  await ev(`$('#qfIn').value = '1961-05-06'`); await click('[data-act="qf-save"]');
  eq(await ev('return S.people.appa.dob'), '1961-05-06', 'birthday changed');
  // taps that save straight away
  await click('#aboutCard [data-act="set-relage"][data-v="elder"]');
  eq(await ev('return S.people.appa.relAge'), 'elder', 'older or younger');
  await click('#aboutCard [data-act="set-dead"][data-v="1"]');
  ok(await ev(`return S.people.appa.dead && !!$('#aboutCard [data-act="qf-open"][data-id="dod"]')`), 'passed away, date row shows');
  await click('#aboutCard [data-act="set-dead"][data-v=""]');
  ok(await ev(`return !S.people.appa.dead && !$('#aboutCard [data-id="dod"]')`), 'alive again');
  // gender not saved: the note offers Male / Female right there
  await ev(`S.people.joseph.gender = ''; save(); H.person('joseph');`); await sleep(400);
  await click('.pov-note [data-act="set-gender"][data-g="m"]');
  ok(await ev(`return S.people.joseph.gender === 'm' && !$('.pov-note [data-act="set-gender"]')`), 'gender set from the note');
  await shot('person-inline-edit');
  await ev(`H.person('appa')`); await sleep(400); await click('[data-act="qf-open"][data-id="callAs"]'); await sleep(200);
  await shot('person-about-card');
});

await test('Every page and sheet opens without errors', async () => {
  await fresh();
  const list = await ev(`const f = S.funcs[0].id, d = S.docs[0], dr = S.docs.find(x => x.terms.length);
    return [['people', {}], ['people', { f: 'friend' }], ['dates', {}], ['dates', { tab: 'once' }], ['family', {}], ['family', { pov: 'amma' }], ['family', { full: true }],
      ['person', { id: 'me' }], ['person', { id: 'appa' }], ['person', { id: 'arjun' }], ['person', { id: 'joseph' }], ['person', { id: 'appa', qh: 1 }], ['person', { id: 'appa', qf: 'groups' }], ['edit', { id: '', relTo: 'appa' }],
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

await test('Accounts switched off: no sign-in, app works on the device as before', async () => {
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

const signInUI = async (d, email, pass, act = 'acct-signin') => { await d.ev(`$('#acEmail').value = ${JSON.stringify(email)}; $('#acPass').value = ${JSON.stringify(pass)};`); await d.click(`[data-act="${act}"]`); };
// Nothing about the family may be stored in the browser: no app data in localStorage, no on-device photo store
const deviceHolds = d => d.ev(`const names = indexedDB.databases ? (await indexedDB.databases()).map(x => x.name) : [];
  const ls = Object.keys(localStorage).filter(k => !/^(fake\\.session|uravu\\.auth)/.test(k));
  let st = []; if (names.includes('uravu-sync')) { st = await new Promise(res => { const r = indexedDB.open('uravu-sync'); r.onsuccess = () => { const keys = r.result.transaction('kv').objectStore('kv').getAllKeys(); keys.onsuccess = () => res(keys.result.filter(k => !String(k).startsWith('key:'))); }; r.onerror = () => res(['?']); }); }
  return { ls, photoDb: names.includes('uravu'), sync: st };`);

await test('Online only: the app opens to sign-in, with nothing usable before signing in', async () => {
  await A.go(BASE);
  await A.waitFor(`return cloud.phase === 'signin' && !!$('#acEmail')`);
  ok(await A.ev(`return $('#tabbar').hidden && $('#fab').hidden && !S.people.appa`), 'no tabs, no sample family');
  await A.shot('20-sign-in');
  await signInUI(A, 'nope', 'short', 'acct-signup');
  eq(await A.ev(`return $('#acErr').textContent`), 'Enter your email address.', 'checks the email');
  await signInUI(A, EMAIL, PASS, 'acct-signup');
  await A.waitFor(`return cloud.phase === 'ready' && cur().p === 'home'`);
  UID = fake.uidOf(EMAIL); ok(UID, 'account made');
  eq(await A.ev('return [Object.keys(S.people).length, S.people[S.me].name]'), [1, 'Family'], 'a new account starts with just you');
  await A.waitFor(`return cloud.status === 'synced'`);
  eq([live('people').length, live('settings').length], [1, 1], 'saved to the account');
  ok(await A.ev(`return !$('#tabbar').hidden`), 'app open');
});

await test('Every change goes straight to the account; nothing about the family is kept on the device', cloudOk(async () => {
  await A.ev(`S.people.p1 = blankPerson('p1', { name: 'Kumar', gender: 'm', likes: [{ cat: 'Food', val: 'Dosa' }] });
    S.edges.push({ id: uid(), type: 'parent', child: S.me, parent: 'p1' });
    S.events.push({ id: 'e1', title: 'Kumar’s retirement', type: 'milestone', on: '2020-05-01', yearly: true, people: ['p1'], remind: 3, note: '' });
    S.funcs.push({ id: 'f1', title: 'Housewarming', kind: 'Housewarming', on: '', venue: '', msg: '', guests: [{ id: 'g1', pid: 'p1', invited: true }] });
    S.given.push({ id: 'gv1', pid: 'p1', title: 'Wedding', amount: '1001', on: '' }); save();`);
  await A.waitFor(`return cloud.status === 'synced' && cloud.pending === 0 && !!S.people.p1`);
  await sleep(300);
  eq([live('people').length, live('likes').length, live('links').length, live('events').length, live('functions').length, live('guests').length, live('gifts').length],
    [2, 1, 1, 1, 1, 1, 1], 'rows saved (people, likes, links, events, functions, guests, gifts)');
  ok(live('people').every(r => r.owner_id === UID && r.updated_at && r.deleted === false), 'rows carry owner, time and soft-delete flag');
  eq(await deviceHolds(A), { ls: [], photoDb: false, sync: [] }, 'nothing stored in the browser');
}));

await test('Second phone signs in, sees the same family, and changes appear live both ways', cloudOk(async () => {
  B = await newDevice(fakeApiScript(FAKE_URL), 'phone 2');
  await B.go(BASE);
  await B.waitFor(`return cloud.phase === 'signin'`);
  await signInUI(B, EMAIL, 'wrong-password');
  eq(await B.ev(`return $('#acErr').textContent`), 'Wrong email or password.', 'wrong password');
  await signInUI(B, EMAIL, PASS);
  await B.waitFor(`return cloud.phase === 'ready'`);
  eq(await B.ev('return Object.keys(S.people).sort()'), await A.ev('return Object.keys(S.people).sort()'), 'same people');
  await A.waitFor('return cloud.live', 8000); await B.waitFor('return cloud.live', 8000);
  ok((await A.ev('return cloudStatusText()')).includes('Live'), 'status says live');
  await A.ev(`ui.stack = [{ p: 'people' }]; render();`);
  await B.ev(`S.people.live1 = blankPerson('live1', { name: 'Live Kumar', circle: 'friend' }); save();`);
  await A.waitFor(`return !!S.people.live1`, 8000);   // nobody pressed anything
  await A.waitFor(`return document.querySelector('#app').textContent.includes('Live Kumar')`, 3000);
  await A.ev(`S.people.live1.phone = '9000000002'; S.funcs[0].guests[0].rsvp = 'maybe'; save();`);
  await B.waitFor(`return S.people.live1 && S.people.live1.phone === '9000000002' && S.funcs[0].guests[0].rsvp === 'maybe'`, 8000);
}));

await test('Offline: you can look but not change; back online it works again', cloudOk(async () => {
  await A.offline(true);
  await A.waitFor(`return document.body.classList.contains('read-only') && !$('#roBar').hidden`);
  await A.ev(`ui.stack = [{ p: 'people' }]; render();`);
  ok(await A.ev(`return document.querySelector('#app').textContent.includes('Kumar')`), 'still shows the family');
  await A.ev(`S.people.p1.notes = 'Written offline'; save();`); await sleep(100);
  eq(await A.ev('return S.people.p1.notes'), '', 'the change was undone');
  ok((await A.ev(`return $('#toast').textContent`)).includes('offline'), 'says why');
  await A.shot('23-offline-read-only');
  await A.offline(false);
  await A.waitFor(`return cloud.status === 'synced' && !document.body.classList.contains('read-only')`, 10000);
  await A.ev(`S.people.p1.notes = 'Written online'; save();`);
  await B.waitFor(`return S.people.p1.notes === 'Written online'`, 8000);
  // opening with no internet: an offline screen, then the family once back online
  await B.offline(true); await B.ev('loadAccount()');
  await B.waitFor(`return cloud.phase === 'offline' && document.querySelector('#app').textContent.includes('You’re offline')`);
  await B.offline(false);
  await B.waitFor(`return cloud.phase === 'ready' && !!S.people.p1`, 10000);
}));

await test('Same person edited on both phones: the newest edit wins', cloudOk(async () => {
  await A.ev(`S.people.p1.nickname = 'Edited on phone 1'; save();`); await sleep(300);
  await B.ev(`S.people.p1.nickname = 'Edited on phone 2, later'; save();`);
  await sleep(2500); await A.sync(); await B.sync();
  eq(await A.ev('return S.people.p1.nickname'), 'Edited on phone 2, later', 'phone 1');
  eq(await B.ev('return S.people.p1.nickname'), 'Edited on phone 2, later', 'phone 2');
}));

await test('Delete on one phone removes it on the other (soft delete)', cloudOk(async () => {
  await B.ev(`delete S.people.live1; save();`);
  await A.waitFor(`return !S.people.live1`, 8000);
  const row = fake.rowsOf(UID, 'people').find(r => r.id === 'live1');
  eq([row.deleted, JSON.stringify(row.data)], [true, '{}'], 'row kept as deleted, with its details removed');
}));

await test('Restoring a backup makes the account match it', cloudOk(async () => {
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }]; render();`);
  const n0 = downloads.length; await A.click('[data-act="backup"]');
  let f = null; for (let t = 0; t < 8000 && !f; t += 100) { f = downloads.slice(n0).find(d => /^uravu-backup-/.test(d.name) && d.done); if (!f) await sleep(100); }
  ok(f, 'backup saved');
  await A.ev(`S.people.temp1 = blankPerson('temp1', { name: 'Temporary' }); save();`);
  await B.waitFor('return !!S.people.temp1', 8000);
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }]; render();`);
  await A.c('DOM.enable'); const { root } = await A.c('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await A.c('DOM.querySelector', { nodeId: root.nodeId, selector: '#restoreIn' });
  await A.c('DOM.setFileInputFiles', { nodeId, files: [path.join(DL, f.guid)] }); await sleep(500);
  ok((await A.ev(`return $('.pov-note').textContent`)).includes('in your account'), 'warns that the account changes');
  await A.click('[data-act="restore-yes"]');
  await B.waitFor('return !S.people.temp1', 8000);
  eq(fake.rowsOf(UID, 'people').find(r => r.id === 'temp1').deleted, true, 'deleted in the account');
}));

await test('Vault: documents and files are encrypted before they’re saved; phone 2 needs the PIN', cloudOk(async () => {
  await A.ev(`S.docs.push({ id: 'd1', type: 'dl', owner: S.me, title: '', f: { number: 'TN5920150001234', to: '2030-01-01' }, remind: 60, photos: [], terms: [] });
    S.docs.push({ id: 'd2', type: 'vehicle_ins', owner: S.me, title: '', f: { vehicle: 'TN 59 AB 1234' }, remind: 30, photos: [], note: 'Agent: Ramesh', terms: [{ id: 't1', f: { insurer: 'ICICI Lombard', policyNo: '3001/2345/678' } }] }); save();`);
  await A.sync();
  eq(live('docs').length, 0, 'documents wait for a vault PIN');
  ok((await A.ev('return cloudStatusText()')).includes('vault PIN'), 'status says so');
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  eq(await A.ev(`try { await IDB.put('early', 'x'); return 'saved'; } catch (e) { return e.message; }`), 'Set or enter your vault PIN first: Settings › Account › Document vault.', 'files need the PIN');
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  ok(await A.ev(`return vaultState() === 'none' && !!$('#acPin2')`), 'asks for a new vault PIN');
  ok((await A.ev(`return $('.pov-note.warn').textContent`)).includes('can’t be opened'), 'warns about a forgotten PIN');
  await A.ev(`$('#acPin').value = ${JSON.stringify(PIN)}; $('#acPin2').value = ${JSON.stringify(PIN)};`); await A.click('[data-act="acct-vault-create"]');
  ok((await A.ev(`return $('#acVErr').textContent`)).includes('Tick the box'), 'the warning must be ticked');
  await A.ev(`$('#acKnow').checked = true;`); await A.click('[data-act="acct-vault-create"]');
  await A.waitFor(`return vaultState() === 'open' && cloud.status === 'synced'`, 20000);
  await A.sync();
  eq([live('docs').length, live('doc_terms').length], [2, 1], 'documents saved');
  ok(live('docs').every(r => /^v1:/.test(r.secret) && !('f' in r.data) && !('note' in r.data)), 'document details only in the encrypted part');
  const dump = JSON.stringify([...fake.rows.values()]);
  for (const plain of ['TN5920150001234', '3001/2345/678', 'Agent: Ramesh', 'ICICI Lombard']) ok(!dump.includes(plain), 'plain text reached the cloud: ' + plain);
  await A.ev(`await IDB.put('vph1', ${JSON.stringify(photo)}); S.docs[0].photos = ['vph1']; save();`); await A.sync();
  const fb = fake.files.get(UID + '/vph1'); ok(fb, 'file saved to the account');
  ok(!Buffer.from(fb, 'base64').toString('latin1').includes('data:image'), 'file is encrypted');
  eq((await deviceHolds(A)).photoDb, false, 'no file stored on the device');
  await sleep(200); await A.shot('22-account-vault');
  // phone 2: documents stay locked until the PIN
  await B.waitFor(`return cloud.lockedN > 0 && vaultState() === 'locked' && S.docs.length === 0`, 8000);
  await B.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  await B.ev(`$('#acPin').value = '111111'; $('[data-act="acct-vault-unlock"]').click();`);
  await B.waitFor(`return !$('#acVErr').hidden`, 15000);
  eq(await B.ev(`return $('#acVErr').textContent`), 'That PIN is wrong.', 'wrong PIN refused');
  await B.ev(`$('#acPin').value = ${JSON.stringify(PIN)}; $('[data-act="acct-vault-unlock"]').click();`);
  await B.waitFor(`return vaultState() === 'open' && S.docs.length === 2 && cloud.lockedN === 0`, 20000);
  eq(await B.ev(`return S.docs.find(d => d.type === 'dl').f.number`), 'TN5920150001234', 'phone 2 reads the licence number');
  eq(await B.ev(`return await IDB.get('vph1')`), photo, 'phone 2 opens the photo from the account');
  // deleting the photo removes the file
  await A.ev(`S.docs[0].photos = []; await IDB.del('vph1'); save();`); await A.sync();
  ok(!fake.files.has(UID + '/vph1'), 'file removed from the account');
}));

await test('Vault: change the PIN; documents stay readable, the old PIN stops working', cloudOk(async () => {
  const PIN2 = '13579246', vaultRow = () => fake.rows.get(`${UID}|settings|vault`).data;
  await A.ev(`await IDB.put('vph2', 'data:text/plain;base64,aGk='); S.docs[0].photos = ['vph2']; save();`); await A.sync();
  const before = vaultRow(), secretsBefore = live('docs').map(r => r.secret).sort();
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  await A.click('[data-act="acct-vault-chpin"]');
  ok(await A.ev(`return !!$('#acPinOld') && !!$('#acPinNew2')`), 'shows the change-PIN form');
  await A.ev(`$('#acPinOld').value = '000000'; $('#acPinNew').value = ${JSON.stringify(PIN2)}; $('#acPinNew2').value = ${JSON.stringify(PIN2)}; $('[data-act="acct-vault-change"]').click();`);
  await A.waitFor(`return !$('#acVErr').hidden`, 15000);
  eq(await A.ev(`return $('#acVErr').textContent`), 'The current PIN is wrong.', 'wrong current PIN refused');
  eq(vaultRow().salt, before.salt, 'vault untouched after a wrong PIN');
  await A.ev(`$('#acPinOld').value = ${JSON.stringify(PIN)}; $('[data-act="acct-vault-change"]').click();`);
  await A.waitFor(`return !$('#acPinOld') && vaultState() === 'open'`, 20000);
  const after = vaultRow();
  ok(after.salt !== before.salt && /\S/.test(after.wrap || ''), 'vault row has a new salt and a locked key');
  eq(live('docs').map(r => r.secret).sort(), secretsBefore, 'documents were not re-encrypted');
  ok(!JSON.stringify(after).includes(PIN2), 'the PIN isn’t stored');
  // phone 2 stays unlocked and picks up the new vault row
  await B.waitFor(`return cloud.vault && cloud.vault.salt === ${JSON.stringify(after.salt)} && vaultState() === 'open'`, 8000);
  eq(await B.ev(`return await IDB.get('vph2')`), 'data:text/plain;base64,aGk=', 'phone 2 still opens files');
  // locked again, the old PIN no longer opens it; the new one does
  await B.ev(`await vaultForget(); ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  eq(await B.ev(`try { await vaultUnlock(${JSON.stringify(PIN)}); return 'opened'; } catch (e) { return e.message; }`), 'wrong pin', 'old PIN refused');
  await B.ev(`await vaultUnlock(${JSON.stringify(PIN2)}); await syncNow();`);
  eq(await B.ev(`return [vaultState(), S.docs.find(d => d.type === 'dl').f.number]`), ['open', 'TN5920150001234'], 'new PIN opens the documents');
  // a PIN can be changed again (wrapped key → wrapped key), then put back for the later tests
  eq(await A.ev(`await vaultChange(${JSON.stringify(PIN2)}, ${JSON.stringify(PIN)}); return vaultState();`), 'open', 'changed back');
  eq(await B.ev(`await vaultForget(); await vaultUnlock(${JSON.stringify(PIN)}); return vaultState();`), 'open', 'original PIN works again');
  await A.ev(`S.docs[0].photos = []; await IDB.del('vph2'); save();`); await A.sync();
}));

await test('An old copy saved on a device is checked, added to the account, then removed', cloudOk(async () => {
  const C = await newDevice(fakeApiScript(FAKE_URL), 'phone 3');
  await C.go(BASE + 'serve-404');
  await C.ev(`localStorage.setItem('uravu.v1', JSON.stringify({ me: 'me', settings: { lang: 'both' }, edges: [], events: [], docs: [], funcs: [],
    people: { me: { id: 'me', name: 'Family', likes: [] }, p1: { id: 'p1', name: 'Kumar', likes: [] }, old1: { id: 'old1', name: 'Only In The Old Copy', likes: [] } } }));`);
  await C.go(BASE);
  await C.waitFor(`return cloud.phase === 'signin'`);
  await signInUI(C, EMAIL, PASS);
  await C.waitFor(`return cur().p === 'oldcopy' && !!cloud.old`, 10000);
  eq(await C.ev('return cloud.old.missing'), ['people|old1'], 'finds what only the old copy has');
  ok((await C.ev(`return document.querySelector('#app').textContent`)).includes('Only In The Old Copy'), 'names it');
  await C.shot('24-old-copy');
  await C.click('[data-act="old-add"]');
  await C.waitFor(`return cloud.old && cloud.old.missing.length === 0`, 8000);
  ok(live('people').some(r => r.id === 'old1'), 'added to the account');
  await A.waitFor('return !!S.people.old1', 8000);
  await C.ev(`const b = $('[data-act="old-remove"]'); b.click(); b.click();`);
  await C.waitFor(`return !cloud.old && cur().p !== 'oldcopy'`, 5000);
  eq(await deviceHolds(C), { ls: [], photoDb: false, sync: [] }, 'nothing left on the device');
  try { await send('Target.disposeBrowserContext', { browserContextId: C.ctx }); } catch (e) {}
}));

await test('Sign out: back to sign-in, nothing left in the app', cloudOk(async () => {
  await B.click('[data-act="acct-signout"]');
  await B.waitFor(`return cloud.phase === 'signin' && !cloud.user`);
  eq(await B.ev('return [Object.keys(S.people), S.docs.length, cloud.key]'), [['me'], 0, null], 'family gone from memory, vault key forgotten');
  eq(await deviceHolds(B), { ls: [], photoDb: false, sync: [] }, 'nothing stored in the browser');
}));

await test('Delete my account removes every row and file', cloudOk(async () => {
  await A.ev(`ui.stack = [{ p: 'home' }, { p: 'settings' }, { p: 'account' }]; render();`);
  await A.click('[data-act="acct-delete"]');
  await A.ev(`$('#acDel').value = 'nope';`); await A.click('[data-act="acct-delete-go"]');
  eq(await A.ev(`return $('#acDErr').textContent`), 'Type DELETE to confirm.', 'needs DELETE typed');
  await A.ev(`$('#acDel').value = 'DELETE';`); await A.click('[data-act="acct-delete-go"]');
  await A.waitFor(`return cloud.phase === 'signin'`);
  eq([...fake.rows.keys()].filter(k => k.startsWith(UID + '|')).length, 0, 'no rows left');
  eq([...fake.files.keys()].filter(k => k.startsWith(UID + '/')).length, 0, 'no files left');
  ok(!fake.users.has(EMAIL), 'account gone');
}));

await test('Real Supabase client: server out of reach, sign-in says why', async () => {
  // config.js pointing at an address where nothing answers
  const C = await newDevice('', 'phone 4', /^TypeError: Failed to fetch/, true);   // supabase-js logs the failed request itself
  await C.c('Fetch.enable', { patterns: [{ urlPattern: '*/config.js*' }] });
  listeners.push(m => {
    if (m.method === 'Fetch.requestPaused' && m.sessionId === C.sid)
      C.c('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(`window.URAVU_CONFIG = { supabaseUrl: 'http://127.0.0.1:9', supabaseAnonKey: 'test-anon-key', google: true };`).toString('base64') });
  });
  await C.go(BASE + '?code=abc123#/people');
  await C.waitFor(`return cloud.phase === 'signin'`);
  eq(await C.ev('return location.search'), '', 'sign-in code taken off the address');
  ok(await C.ev(`return typeof window.supabase.createClient === 'function' && !window.__uravuCloudApi`), 'real client loaded from vendor/');
  await C.waitFor(`return $('#toast').textContent.includes('sign-in link')`);
  ok(await C.ev(`return !!$('[data-act="acct-google"]') && $('#tabbar').hidden`), 'sign-in screen with Google, app closed');
  await signInUI(C, 'someone@example.com', 'long-enough-pw');
  await C.waitFor(`return !$('#acErr').hidden`, 15000);
  eq(await C.ev(`return $('#acErr').textContent`), 'No internet connection. Try again when you’re online.', 'clear message');
  try { await send('Target.disposeBrowserContext', { browserContextId: C.ctx }); } catch (e) {}
});

for (const d of [A, B]) if (d) { try { await send('Target.disposeBrowserContext', { browserContextId: d.ctx }); } catch (e) {} }
fake.close();

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
  // The service worker fetches config.js itself (the tests can't swap it there), so this may be the online-only app:
  // then the right result offline is its sign-in / offline screen; without accounts, the full app.
  await sleep(600);
  const s = await page(), gate = await ev(`return cloud.phase`);
  ok(s.p === 'home' && (s.tabs || ['signin', 'offline'].includes(gate)), `app opens offline (tabs ${s.tabs}, phase ${gate})`);
  ok(await ev(`return $('#app').textContent.trim().length > 0`), 'something is shown');
  await shot('11-offline');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
});

/* ---------- done ---------- */
console.log(`\n${pass} passed, ${fail} failed. Screenshots in test/out/\n`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
try { await send('Browser.close'); } catch (e) {}
chrome.kill(); srv.kill();
setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} process.exit(fail ? 1 : 0); }, 500);
