// End-to-end tests for Uravu, run in real Chrome (or Edge) at phone size.
// Run:  npm test      (needs Node 20+ and Chrome or Edge; nothing to install)
// Screenshots and downloaded files go to test/out/.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--window-size=412,915', 'about:blank'], { stdio: 'ignore' });
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
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*__original.html*' }] });
listeners.push(m => {
  if (m.method === 'Fetch.requestPaused' && m.sessionId === S)
    cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(ORIGINAL).toString('base64') });
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
const fresh = async (url = BASE) => { await go(BASE + 'serve-404'); await ev('localStorage.clear(); indexedDB.deleteDatabase("uravu");'); await go(url); };

let pass = 0, fail = 0; const results = [];
async function test(name, fn) {
  const e0 = errors.length;
  try { await fn(); if (errors.length > e0) throw new Error('page error: ' + errors.slice(e0).join(' | ')); pass++; results.push(['PASS', name]); console.log('  \u2713 ' + name); }
  catch (e) { fail++; results.push(['FAIL', name, e.message]); console.log('  \u2717 ' + name + '\n      ' + e.message); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

console.log(`\nTesting Uravu in ${path.basename(CHROME)} at 412x915 (phone)\n`);

/* ================= tests ================= */
await test('No window.claude is used any more', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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
  let s = await page(); eq([s.p, s.tabs], ['person', false], 'person page, tabs hidden');
  await click('[data-act="edit"][data-id="appa"]'); s = await page(); eq(s.p, 'edit', 'edit page');
  await backGesture(); s = await page(); eq(s.p, 'person', 'back to person');
  await click('#app .bar [data-act="back"]'); s = await page(); eq(s.p, 'people', 'in-app back to People');
  await backGesture(); s = await page(); eq(s.p, 'home', 'back to Home');
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
