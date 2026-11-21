/* Uravu – cloud: sign-in, your data in Supabase, document vault (encrypted on this device) */
/* With config.js filled in, Uravu is online only: you must sign in, your data is read from your account and
   every change is saved straight to it. Nothing about your family is written to this device: it lives in
   memory while the app is open. Only the sign-in and the vault key are remembered on the device.
   Changes are found by comparing the data with what the account has, then pushed; changes from your other
   devices arrive live. Newest edit wins (by updated_at). Deletes are soft.
   Without config.js values the app works as before, on this device only. */
const CLOUD_CFG = window.URAVU_CONFIG || {};
const cloudConfigured = () => !!window.__uravuCloudApi || !!(CLOUD_CFG.supabaseUrl && CLOUD_CFG.supabaseAnonKey);
const CLOUD_TABLES = ['settings', 'people', 'likes', 'links', 'events', 'docs', 'doc_terms', 'functions', 'guests', 'gifts'];
const VAULT_TABLES = { docs: ['f', 'note', 'title', 'fileMeta'], doc_terms: ['f'] };   // these fields are encrypted
const VAULT_ITER = 600000;
// phase: off (no cloud) | connecting | signin | loading | offline (nothing loaded yet) | error | ready
// status, once ready: synced | syncing | offline (read only) | error
const cloud = { api: null, user: null, phase: 'off', status: 'off', last: '', err: '', key: null, vault: null, pending: 0, lockedN: 0, needsRender: false, live: false, base: null, old: null };

/* ---------- data ⇄ rows ---------- */
function hashStr(str) {   // cyrb53: a quick fingerprint, only to notice changes
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const stable = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
const rowHash = data => hashStr(stable(data));
const likeId = (pid, l) => pid + '~' + hashStr(String(l.cat) + '\u0001' + String(l.val));
// Old saved data may have items without an id; sync needs one
function ensureIds(s) {
  let n = 0; const fix = a => (a || []).forEach(x => { if (x && !x.id) { x.id = uid(); n++; } });
  fix(s.edges); fix(s.events); fix(s.docs); fix(s.funcs); fix(s.given);
  (s.docs || []).forEach(d => fix(d.terms)); (s.funcs || []).forEach(f => fix(f.guests));
  return n;
}
// One row per thing. Children carry their parent's id in _p.
function toRows(s) {
  const m = new Map(), put = (t, id, data) => m.set(t + '|' + id, { t, id, data });
  put('settings', 'main', { me: s.me, settings: s.settings || {}, blocked: s.blocked || [] });
  for (const [id, p] of Object.entries(s.people || {})) {
    const { likes, ...rest } = p; put('people', id, rest);
    (likes || []).forEach(l => put('likes', likeId(id, l), Object.assign({}, l, { _p: id })));
  }
  (s.edges || []).forEach(e => put('links', e.id, e));
  (s.events || []).forEach(e => put('events', e.id, e));
  (s.docs || []).forEach(d => { const { terms, ...rest } = d; put('docs', d.id, rest); (terms || []).forEach(t => put('doc_terms', t.id, Object.assign({}, t, { _p: d.id }))); });
  (s.funcs || []).forEach(f => { const { guests, ...rest } = f; put('functions', f.id, rest); (guests || []).forEach(g => put('guests', g.id, Object.assign({}, g, { _p: f.id }))); });
  (s.given || []).forEach(x => put('gifts', x.id, x));
  return m;
}
// Back from rows to the app's data. Things keep the order they had in prev; new ones go after.
function fromRows(m, prev) {
  const all = [...m.values()], of = t => all.filter(r => r.t === t);
  const ordered = (rows, prevIds) => { const ix = new Map(prevIds.map((id, i) => [id, i])); return rows.map((r, i) => [r, ix.has(r.id) ? ix.get(r.id) : 1e9 + i]).sort((a, b) => a[1] - b[1]).map(x => x[0]); };
  const strip = d => { const o = Object.assign({}, d); delete o._p; return o; };
  const kids = (t, pid, prevList) => ordered(of(t).filter(r => r.data._p === pid), (prevList || []).map(x => x.id)).map(r => strip(r.data));
  const main = (m.get('settings|main') || {}).data || {};
  const s = Object.assign({}, prev);
  s.me = main.me || prev.me; s.settings = main.settings || prev.settings || { lang: 'both' };
  if ('blocked' in prev || (main.blocked || []).length) s.blocked = main.blocked || prev.blocked || [];
  s.people = {};
  for (const r of ordered(of('people'), Object.keys(prev.people || {}))) {
    const old = (prev.people || {})[r.id], lk = ordered(of('likes').filter(x => x.data._p === r.id), (old && old.likes || []).map(l => likeId(r.id, l)));
    s.people[r.id] = Object.assign({}, r.data, { likes: lk.map(x => strip(x.data)) });
  }
  s.edges = ordered(of('links'), (prev.edges || []).map(x => x.id)).map(r => r.data);
  s.events = ordered(of('events'), (prev.events || []).map(x => x.id)).map(r => r.data);
  s.docs = ordered(of('docs'), (prev.docs || []).map(x => x.id)).map(r => { const old = (prev.docs || []).find(x => x.id === r.id); return Object.assign({}, r.data, { terms: kids('doc_terms', r.id, old && old.terms) }); });
  s.funcs = ordered(of('functions'), (prev.funcs || []).map(x => x.id)).map(r => { const old = (prev.funcs || []).find(x => x.id === r.id); return Object.assign({}, r.data, { guests: kids('guests', r.id, old && old.guests) }); });
  const gifts = ordered(of('gifts'), (prev.given || []).map(x => x.id)).map(r => r.data);
  if ('given' in prev || gifts.length) s.given = gifts;   // older saved data has no moi list: don't add an empty one
  return s;
}

/* ---------- small store on the device: only the vault key (and, from older versions, sync notes) ---------- */
const SDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open('uravu-sync', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return { get: k => run('readonly', st => st.get(k)), put: (k, v) => run('readwrite', st => st.put(v, k)), del: k => run('readwrite', st => st.delete(k)) };
})();
// What the account has, row by row (fingerprint + time). In memory only.
const newState = () => ({ rows: {}, cursor: '', setup: false, locked: {} });
let syncState = null;
const saveState = () => Promise.resolve();
// The empty starting point before the account's data has loaded
const cloudEmpty = () => ({ me: 'me', people: { me: blankPerson('me', {}) }, edges: [], events: [], settings: { lang: 'both' }, blocked: [], docs: [], funcs: [], given: [] });

/* ---------- vault: AES-GCM with a key made from the vault PIN (PBKDF2) ---------- */
const te = new TextEncoder(), td = new TextDecoder();
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const bin = atob(str), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
// 256 bits from the PIN. Used as the vault key itself (a vault whose PIN was never changed), or to unwrap it.
async function vaultBits(pin, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter || VAULT_ITER, hash: 'SHA-256' }, base, 256));
}
const aesKey = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
async function sealBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
async function openBytes(key, bytes) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12))); }
const sealJSON = async (key, obj) => 'v1:' + b64(await sealBytes(key, te.encode(JSON.stringify(obj))));
async function openJSON(key, str) { if (!/^v1:/.test(str)) throw new Error('unknown format'); return JSON.parse(td.decode(await openBytes(key, unb64(str.slice(3))))); }
// Split a document row into what may be stored as it is, and what must be encrypted
function splitSecret(t, data) {
  const plain = {}, secret = {};
  for (const [k, v] of Object.entries(data)) (VAULT_TABLES[t].includes(k) ? secret : plain)[k] = v;
  return { plain, secret };
}

/* ---------- the Supabase connection ---------- */
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
const backTo = () => location.origin + location.pathname;
function supabaseApi() {
  const sb = window.supabase.createClient(CLOUD_CFG.supabaseUrl, CLOUD_CFG.supabaseAnonKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'uravu.auth' },
  });
  const who = s => s && s.user ? { uid: s.user.id, email: s.user.email || '' } : null;
  const ok = r => { if (r.error) throw r.error; return r.data; };
  let me = null;
  const bucket = () => sb.storage.from('vault');
  return {
    google: !!CLOUD_CFG.google,
    async session() { const s = who(ok(await sb.auth.getSession()).session); me = s; return s; },
    onAuth(fn) { sb.auth.onAuthStateChange((ev, s) => { me = who(s); setTimeout(() => fn(me, ev), 0); }); },
    async exchange(code) { ok(await sb.auth.exchangeCodeForSession(code)); },
    async signUp(email, password) { const d = ok(await sb.auth.signUp({ email, password, options: { emailRedirectTo: backTo() } })); return { confirm: !d.session }; },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async sendCode(email) { ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: backTo(), shouldCreateUser: true } })); },
    async verifyCode(email, token) { ok(await sb.auth.verifyOtp({ email, token, type: 'email' })); },
    async signInGoogle() { ok(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: backTo() } })); },
    async signOut() { await sb.auth.signOut({ scope: 'local' }); me = null; },
    // rows changed since a server time, oldest first, in pages
    async pull(t, since) {
      const out = new Map(); let from = since || '', guard = 0;
      for (;;) {
        let q = sb.from(t).select('*').order('server_at', { ascending: true }).order('id', { ascending: true }).limit(1000);
        if (from) q = q.gte('server_at', from);
        const rows = ok(await q);
        rows.forEach(r => out.set(r.id, r));
        if (rows.length < 1000 || ++guard > 200) break;
        const next = rows[rows.length - 1].server_at; if (next === from) break; from = next;
      }
      return [...out.values()];
    },
    async get(t, ids) { return ok(await sb.from(t).select('*').in('id', ids)); },
    // returns the ids actually written (an older edit than the cloud's is skipped by the database)
    async push(t, rows) {
      const data = ok(await sb.from(t).upsert(rows.map(r => Object.assign({ owner_id: me.uid }, r)), { onConflict: 'owner_id,id' }).select('id'));
      return new Set(data.map(r => r.id));
    },
    async count(t) { const r = await sb.from(t).select('id', { count: 'exact', head: true }).eq('deleted', false); if (r.error) throw r.error; return r.count || 0; },
    async getVault() { const d = ok(await sb.from('settings').select('data').eq('id', 'vault').eq('deleted', false).maybeSingle()); return d ? d.data : null; },
    async insertVault(v) {
      const r = await sb.from('settings').insert({ owner_id: me.uid, id: 'vault', data: v, updated_at: new Date().toISOString() });
      if (r.error) { if (r.error.code === '23505') return false; throw r.error; }
      return true;
    },
    // Replace the vault row, only if it still is the one the PIN was checked against
    async updateVault(old, v) {
      const cur = ok(await sb.from('settings').select('data, updated_at').eq('id', 'vault').eq('deleted', false).maybeSingle());
      if (!cur || !cur.data || cur.data.salt !== old.salt) return false;
      const at = new Date(Math.max(Date.now(), Date.parse(cur.updated_at) + 1)).toISOString();   // newer than the row, even with a slow clock
      const d = ok(await sb.from('settings').update({ data: v, updated_at: at }).eq('id', 'vault').eq('data->>salt', old.salt).select('id'));
      return d.length > 0;
    },
    async upload(name, bytes) { ok(await bucket().upload(me.uid + '/' + name, new Blob([bytes], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' })); },
    // files open only through a signed link that lasts one minute
    async download(name) {
      const r = await bucket().createSignedUrl(me.uid + '/' + name, 60);
      if (r.error) { if (/not.?found|404/i.test(r.error.message + (r.error.statusCode || ''))) return null; throw r.error; }
      const res = await fetch(r.data.signedUrl); if (res.status === 404 || res.status === 400) return null; if (!res.ok) throw new Error('download ' + res.status);
      return new Uint8Array(await res.arrayBuffer());
    },
    async removeFiles(names) { if (names.length) ok(await bucket().remove(names.map(n => me.uid + '/' + n))); },
    async listFiles() {
      const out = []; for (let off = 0; ; off += 1000) { const d = ok(await bucket().list(me.uid, { limit: 1000, offset: off })); d.forEach(f => out.push(f.name)); if (d.length < 1000) break; }
      return out;
    },
    // Live updates: call fn whenever one of this user's rows changes on another device (RLS applies here too)
    subscribe(fn) {
      const ch = sb.channel('uravu-' + me.uid);
      for (const t of CLOUD_TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: 'owner_id=eq.' + me.uid }, () => fn('change'));
      ch.subscribe(st => fn(st === 'SUBSCRIBED' ? 'live' : st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED' ? 'down' : ''));
      return () => { sb.removeChannel(ch); };
    },
    async deleteAccount() {
      const files = await this.listFiles();
      for (let i = 0; i < files.length; i += 100) await this.removeFiles(files.slice(i, i + 100));
      ok(await sb.rpc('delete_my_account'));
      await sb.auth.signOut({ scope: 'local' }); me = null;
    },
  };
}

/* ---------- status ---------- */
function cloudStatusText() {
  if (!cloudConfigured()) return '';
  if (!cloud.user) return 'Not signed in.';
  const s = cloud.status;
  if (s === 'syncing') return 'Saving…';
  if (s === 'offline') return 'Offline. You can look around, but changes can’t be saved until you’re back online.';
  if (s === 'error') return 'Couldn’t reach your account: ' + (cloud.err || 'unknown problem') + '. Trying again.';
  const v = docsWaiting() ? (cloud.vault ? ' Documents need your vault PIN.' : ' Set a vault PIN to save documents.') : '';
  return 'Everything is saved in your account' + (cloud.last ? ', ' + agoTxt(cloud.last) : '') + '.' + (cloud.live ? ' Live: changes from your other devices appear by themselves.' : '') + v;
}
function agoTxt(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : 'on ' + fmtDate(iso.slice(0, 10));
}
const cloudDot = () => !cloud.user ? '' : cloud.status === 'synced' && !docsWaiting() ? 'ok' : cloud.status === 'syncing' ? 'busy' : 'warn';
const readOnly = () => cloud.phase === 'ready' && (cloud.status === 'offline' || !navigator.onLine);
function setStatus(s, err) {
  cloud.status = s; if (err !== undefined) cloud.err = err;
  document.querySelectorAll('[data-cloud-status]').forEach(el => { el.textContent = cloudStatusText(); });
  document.querySelectorAll('[data-cloud-dot]').forEach(el => { el.dataset.cloudDot = cloudDot(); });
  const bar = document.getElementById('roBar'); if (bar) bar.hidden = !readOnly();
  document.body.classList.toggle('read-only', readOnly());
}

/* ---------- saving ---------- */
let syncChain = Promise.resolve(), syncTimer = null, cloudApplying = false, retryTimer = null;
const locked = fn => (syncChain = syncChain.then(fn, fn));
// Compare the data with what the account has; anything different is marked to send, stamped with the time of the edit
async function detect() {
  if (!syncState) return 0;
  ensureIds(S);
  const rows = toRows(S), now = new Date().toISOString(); let n = 0;
  const later = u => { const t = Math.max(Date.parse(now), u ? Date.parse(u) + 1 : 0); return new Date(t).toISOString(); };
  for (const [k, r] of rows) {
    const h = rowHash(r.data), m = syncState.rows[k];
    if (!m || m.d || m.h !== h) { syncState.rows[k] = { h, u: later(m && m.u), p: 1 }; n++; }
  }
  for (const [k, m] of Object.entries(syncState.rows)) if (!m.d && !rows.has(k)) { syncState.rows[k] = { h: '', u: later(m.u), p: 1, d: 1 }; n++; }
  cloud.pending = Object.values(syncState.rows).filter(m => m.p).length;
  return n;
}
// The app's data after rows were put back together: fill in defaults
function finishData(next) {
  if (!next.people[next.me]) next.people[next.me] = blankPerson(next.me, { name: 'Me' });
  for (const id in next.people) next.people[id] = blankPerson(id, next.people[id]);
  ['edges', 'events', 'blocked', 'docs', 'funcs', 'given'].forEach(k => { next[k] = next[k] || []; });
  next.settings = next.settings || { lang: 'both' };
  return next;
}
const canDraw = () => !(isForm(cur0()) || isSheet(cur0()));
// Put rows from the account into the app's data. Newest edit wins.
async function applyRemote(list, opts = {}) {
  const cur = opts.replace ? new Map() : toRows(S); let changed = 0;
  for (const { t, r } of list) {
    const k = t + '|' + r.id, m = syncState.rows[k];
    if (t === 'settings' && r.id === 'vault') { if (!r.deleted) cloud.vault = r.data; continue; }
    if (!opts.replace && m && m.u >= r.updated_at) continue;   // ours is the same or newer
    if (r.deleted) { cur.delete(k); delete syncState.locked[k]; syncState.rows[k] = { h: '', u: r.updated_at, p: 0, d: 1 }; changed++; continue; }
    let data = r.data;
    if (VAULT_TABLES[t] && r.secret) {
      if (!cloud.key) { syncState.locked[k] = { t, r }; continue; }
      try { data = Object.assign({}, data, await openJSON(cloud.key, r.secret)); } catch (e) { syncState.locked[k] = { t, r }; continue; }
    }
    delete syncState.locked[k];
    cur.set(k, { t, id: r.id, data });
    syncState.rows[k] = { h: rowHash(data), u: r.updated_at, p: 0 };
    changed++;
  }
  cloud.lockedN = Object.keys(syncState.locked).length;
  if (!changed && !opts.replace) return 0;
  S = finishData(fromRows(cur, S)); kc = {}; dataVer++;
  if (cloud.phase === 'ready') { if (canDraw()) render(); else cloud.needsRender = true; }
  return changed;
}
const cur0 = () => ui.stack[ui.stack.length - 1];
async function pullAll(opts) {
  const since = syncState.cursor ? new Date(Date.parse(syncState.cursor) - 120000).toISOString() : '';   // a little overlap, in case of slow saves
  const list = []; let max = syncState.cursor;
  for (const t of CLOUD_TABLES) for (const r of await cloud.api.pull(t, since)) { list.push({ t, r }); if (!max || r.server_at > max) max = r.server_at; }
  await applyRemote(list, opts);
  syncState.cursor = max || '';
}
async function pushAll() {
  const byT = {}, current = toRows(S);
  for (const [k, m] of Object.entries(syncState.rows)) if (m.p) { const t = k.slice(0, k.indexOf('|')); (byT[t] = byT[t] || []).push([k, m]); }
  for (const t of CLOUD_TABLES) {
    const items = byT[t]; if (!items) continue;
    const send = [];
    for (const [k, m] of items) {
      const id = k.slice(t.length + 1);
      if (m.d) { send.push([k, Object.assign({ id, data: {}, updated_at: m.u, deleted: true }, VAULT_TABLES[t] ? { secret: null } : {})]); continue; }
      const r = current.get(k); if (!r) continue;
      if (VAULT_TABLES[t]) {
        if (!cloud.key) continue;   // documents wait for the vault PIN
        const { plain, secret } = splitSecret(t, r.data);
        send.push([k, { id, data: plain, secret: await sealJSON(cloud.key, secret), updated_at: m.u, deleted: false }]);
      }
      else send.push([k, { id, data: r.data, updated_at: m.u, deleted: false }]);
    }
    for (let i = 0; i < send.length; i += 200) {
      const part = send.slice(i, i + 200), done = await cloud.api.push(t, part.map(x => x[1]));
      const stale = [];
      for (const [k, row] of part) { if (syncState.rows[k] && syncState.rows[k].u === row.updated_at) syncState.rows[k].p = 0; if (!done.has(row.id)) stale.push(row.id); }
      // the account had a newer edit: take it
      if (stale.length) { const got = await cloud.api.get(t, stale); for (const r of got) { const k = t + '|' + r.id; if (syncState.rows[k]) syncState.rows[k].u = ''; } await applyRemote(got.map(r => ({ t, r }))); }
    }
  }
  cloud.pending = Object.values(syncState.rows).filter(m => m.p).length;
}
const isNetErr = e => !navigator.onLine || /fetch|network|load failed|timed? ?out/i.test(String(e && (e.message || e)));
function runSync() {
  if (!cloud.user || !syncState || !syncState.setup) return Promise.resolve();
  return locked(async () => {
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try {
      await detect();
      if (!cloud.vault) await vaultRefresh().catch(() => {});
      await pullAll();
      if (cloud.key && Object.keys(syncState.locked).length) await applyRemote(Object.values(syncState.locked).map(x => ({ t: x.t, r: Object.assign({}, x.r) })));
      await detect();
      await pushAll();
      cloud.base = structuredClone(toRows(S));   // what the account has now: an offline edit goes back to this
      cloud.last = new Date().toISOString();
      setStatus('synced', ''); clearTimeout(retryTimer);
    } catch (e) {
      const off = isNetErr(e);
      setStatus(off ? 'offline' : 'error', off ? '' : String(e && (e.message || e)).slice(0, 140));
      clearTimeout(retryTimer); retryTimer = setTimeout(() => runSync(), 15000);   // keep trying
    }
    if (cloud.needsRender && canDraw()) { cloud.needsRender = false; render(); }
  });
}
// Called by save(). Offline, the change can't be kept: the data goes back to what the account has.
// Online, the change is noted now (its time decides "newest wins") and sent half a second later.
function cloudSaved() {
  if (cloudApplying || cloud.phase !== 'ready' || !syncState) return;
  if (readOnly()) { undoOffline(); return; }
  locked(detect);
  clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync(), 500);
}
let undoQueued = false;
function undoOffline() {
  if (cloud.base) S = finishData(fromRows(structuredClone(cloud.base), S));
  kc = {}; dataVer++;
  toast('You’re offline. That change wasn’t saved.');
  if (!undoQueued) { undoQueued = true; setTimeout(() => { undoQueued = false; render(); }, 0); }   // after the tap that changed it has finished
}
const syncNow = () => { clearTimeout(syncTimer); return runSync(); };

/* ---------- vault files: kept in your account, encrypted; opened into memory when shown ---------- */
// The device's own photo store (pages.js) is used only to move an old copy; in online mode files go to the account.
const LOCAL_IDB = { get: IDB.get, all: IDB.all };
const PHOTO_MEM = new Map();
const uravuErr = msg => Object.assign(new Error(msg), { uravu: true });
if (cloudConfigured()) Object.assign(IDB, {
  async get(pid) {
    if (PHOTO_MEM.has(pid)) return PHOTO_MEM.get(pid);
    if (!cloud.key || !cloud.user) return null;
    const enc = await cloud.api.download(pid); if (!enc) return null;
    const v = td.decode(await openBytes(cloud.key, enc)); PHOTO_MEM.set(pid, v); return v;
  },
  async put(pid, v) {
    if (readOnly()) throw uravuErr('You’re offline. Add the file when you’re back online.');
    if (!cloud.key) throw uravuErr('Set or enter your vault PIN first: Settings › Account › Document vault.');
    await cloud.api.upload(pid, await sealBytes(cloud.key, te.encode(v))); PHOTO_MEM.set(pid, v);
  },
  async del(pid) { PHOTO_MEM.delete(pid); if (cloud.user) await cloud.api.removeFiles([pid]); },
  async all() {   // for "Download all my data"
    const out = {};
    for (const pid of new Set((S.docs || []).flatMap(d => d.photos || []))) { try { const v = await IDB.get(pid); if (v) out[pid] = v; } catch (e) {} }
    return out;
  },
});

/* ---------- vault PIN ---------- */
// The vault row (settings 'vault') holds { salt, iter, check } and, once the PIN has been changed, wrap: the vault
// key locked with the PIN. Without wrap, the key is made from the PIN directly. Either way, no PIN and no open key.
async function vaultCreate(pin) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16))), key = await aesKey(await vaultBits(pin, salt, VAULT_ITER));
  const v = { salt, iter: VAULT_ITER, check: await sealJSON(key, { ok: 'uravu' }) };
  const made = await cloud.api.insertVault(v);   // fails if another device made one first
  if (!made) { await vaultRefresh(); throw new Error('exists'); }
  cloud.vault = v; await vaultKeep(key);
}
// The vault key's bytes from the PIN, checked against the vault's check value
async function vaultOpenRaw(pin, v) {
  const bits = await vaultBits(pin, v.salt, v.iter);
  let raw = bits;
  if (v.wrap) { try { raw = await openBytes(await aesKey(bits), unb64(v.wrap)); } catch (e) { throw new Error('wrong pin'); } finally { bits.fill(0); } }
  const key = await aesKey(raw);
  try { const c = await openJSON(key, v.check); if (c.ok !== 'uravu') throw 0; } catch (e) { raw.fill(0); throw new Error('wrong pin'); }
  return { raw, key };
}
async function vaultUnlock(pin) {
  await vaultRefresh().catch(() => {});   // the PIN may have been changed on another device
  if (!cloud.vault) throw new Error('no vault');
  const { raw, key } = await vaultOpenRaw(pin, cloud.vault); raw.fill(0);
  await vaultKeep(key);
}
// Change the PIN: the vault key stays the same, it is locked again with the new PIN. Documents and files aren't
// touched, so this is one small change to the vault row: it either happens completely or not at all.
async function vaultChange(oldPin, newPin) {
  const old = await vaultRefresh(); if (!old) throw new Error('no vault');
  const { raw, key } = await vaultOpenRaw(oldPin, old);
  try {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16))), bits = await vaultBits(newPin, salt, VAULT_ITER), lock = await aesKey(bits); bits.fill(0);
    const v = { salt, iter: VAULT_ITER, check: old.check, wrap: b64(await sealBytes(lock, raw)) };
    if (!await cloud.api.updateVault(old, v)) { await vaultRefresh().catch(() => {}); throw new Error('changed'); }   // another device changed it first
    cloud.vault = v; await vaultKeep(key);
  } finally { raw.fill(0); }
}
// The key is remembered on this device (it can't be read out of the browser), so the PIN is asked once per device
async function vaultKeep(key) { cloud.key = key; try { await SDB.put('key:' + cloud.user.uid, key); } catch (e) {} }
async function vaultForget() { cloud.key = null; PHOTO_MEM.clear(); try { if (cloud.user) await SDB.del('key:' + cloud.user.uid); } catch (e) {} }
async function vaultRefresh() { const v = await cloud.api.getVault(); if (v) cloud.vault = v; return v; }
const vaultState = () => !cloud.user ? 'off' : cloud.key ? 'open' : cloud.vault ? 'locked' : 'none';
const docsWaiting = () => !cloud.key && ((S.docs || []).length > 0 || cloud.lockedN > 0);

/* ---------- signing in, loading your account ---------- */
function gotoPhase(p) { cloud.phase = p; render(); }
async function onSignedIn(u) {
  if (cloud.user && cloud.user.uid === u.uid && cloud.phase !== 'signin') return;
  cloud.user = u;
  try { cloud.key = (await SDB.get('key:' + u.uid)) || null; } catch (e) { cloud.key = null; }
  await loadAccount();
}
// Fetch everything from the account into memory, then open the app
async function loadAccount() {
  if (!cloud.user) return;
  if (!navigator.onLine) { gotoPhase('offline'); return; }
  gotoPhase('loading');
  try {
    syncState = newState(); S = cloudEmpty();
    await vaultRefresh().catch(() => {});
    let fresh = false;
    await locked(async () => {
      await pullAll({ replace: true });
      fresh = !syncState.rows['settings|main'];
    });
    if (fresh) {   // a new account: start with just you
      const nm = (cloud.user.email || '').split('@')[0].replace(/[._\d]+/g, ' ').trim();
      S = cloudEmpty(); S.people.me.name = nm ? nm.replace(/\b\w/g, c => c.toUpperCase()) : 'Me';
    }
    syncState.setup = true;
    cloud.base = structuredClone(toRows(S)); cloud.last = new Date().toISOString();
    cloud.phase = 'ready'; setStatus('synced', '');
    const st = parseRoute(cloud.route || ''); ui = { stack: st || [{ p: 'home' }], q: '' };
    render();
    if (fresh) { await syncNow(); toast('Welcome! Tap your picture to add your name and details.'); }
    liveStart();
    checkOldCopy();
  } catch (e) {
    cloud.err = String(e && (e.message || e)).slice(0, 140);
    gotoPhase(isNetErr(e) ? 'offline' : 'error');
  }
}
function signedOutReset() {
  liveStop(); clearTimeout(syncTimer); clearTimeout(retryTimer);
  cloud.user = null; syncState = null; cloud.key = null; cloud.vault = null; cloud.lockedN = 0; cloud.base = null; cloud.old = null;
  PHOTO_MEM.clear(); S = cloudEmpty(); kc = {}; dataVer++;
  ui = { stack: [{ p: 'home' }], q: '' };
  cloud.status = 'off'; gotoPhase('signin');
}
// Live updates: another device saved something, so pull it in now (short pause, so a burst of changes is one sync)
let liveOff = null, liveTimer = null;
function liveStart() {
  if (liveOff || !cloud.user || !syncState || !syncState.setup || !cloud.api.subscribe) return;
  try {
    liveOff = cloud.api.subscribe(ev => {
      if (ev === 'change') { clearTimeout(liveTimer); liveTimer = setTimeout(() => runSync(), 400); }
      else if (ev === 'live') { if (!cloud.live) { cloud.live = true; runSync(); } }   // also catch anything missed while disconnected
      else if (ev === 'down') cloud.live = false;
      if (ev) setStatus(cloud.status);
    });
  } catch (e) { liveOff = null; }
}
function liveStop() { if (liveOff) { try { liveOff(); } catch (e) {} } liveOff = null; cloud.live = false; clearTimeout(liveTimer); }
// Sign out: the session and this device's vault key are removed; nothing else was stored here
async function cloudSignOut() {
  try { if (cloud.user && navigator.onLine && cloud.pending) await syncNow(); } catch (e) {}
  await vaultForget();
  try { await cloud.api.signOut(); } catch (e) {}
  signedOutReset();
}
async function cloudDeleteAccount() {
  const id = cloud.user.uid; clearTimeout(syncTimer);
  await locked(async () => { await cloud.api.deleteAccount(); });
  try { await SDB.del('key:' + id); } catch (e) {}
  signedOutReset();
}

/* ---------- a copy saved on this device by the earlier (offline) version ---------- */
async function oldPhotoDbExists() {
  try { if (indexedDB.databases) return (await indexedDB.databases()).some(d => d.name === 'uravu'); } catch (e) {}
  return false;
}
// What the old copy has that the account doesn't
async function checkOldCopy(quiet) {
  let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) {}
  const hasDb = await oldPhotoDbExists();
  if (!raw && !hasDb) { cloud.old = null; return null; }
  let data = null; try { data = JSON.parse(raw); } catch (e) {}
  let photos = {}; if (hasDb) { try { photos = await LOCAL_IDB.all(); } catch (e) {} }
  let notes = null; try { notes = await SDB.get('state:' + cloud.user.uid); } catch (e) {}
  const missing = [];
  if (data && data.people) {
    ensureIds(data);
    for (const [k, r] of toRows(data)) {
      const acc = syncState.rows[k], was = notes && notes.rows && notes.rows[k];
      if (!acc) missing.push(k);   // the account has never had it (not even deleted)
      else if (was && (was.p || was.h !== rowHash(r.data)) && !acc.d && (acc.u || '') <= (was.u || '')) missing.push(k);   // changed here, never sent, not changed since in the account
    }
  }
  let inAccount = new Set(); try { inAccount = new Set(await cloud.api.listFiles()); } catch (e) {}
  const wantPhotos = new Set([...(S.docs || []), ...((data && data.docs) || [])].flatMap(d => d.photos || []));
  const missingPhotos = Object.keys(photos).filter(pid => wantPhotos.has(pid) && !inAccount.has(pid));
  cloud.old = { data, photos, missing, missingPhotos, people: data && data.people ? Object.keys(data.people).length : 0 };
  if (!quiet && cur0().p !== 'oldcopy') push('oldcopy', {});
  return cloud.old;
}
// Add what's missing to the account
async function oldCopyAdd() {
  const o = cloud.old; if (!o) return;
  const needsKey = o.missingPhotos.length || o.missing.some(k => /^(docs|doc_terms)\|/.test(k));
  if (needsKey && !cloud.key) throw uravuErr('Some of it is documents. Set or enter your vault PIN first (Account › Document vault), then try again.');
  if (o.missing.length) {
    const from = toRows(o.data), cur = toRows(S);
    for (const k of o.missing) cur.set(k, from.get(k));
    S = finishData(fromRows(cur, S)); kc = {}; dataVer++;
    await locked(detect); await syncNow();
    if (cloud.pending) throw uravuErr('Couldn’t save everything to your account. Check the internet and try again.');
  }
  for (const pid of o.missingPhotos) await IDB.put(pid, o.photos[pid]);
  await checkOldCopy(true);
}
function oldCopyDownload() {
  const o = cloud.old; if (!o) return;
  saveFile(`uravu-old-copy-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'uravu', version: 1, savedAt: new Date().toISOString(), data: o.data, photos: o.photos }, null, 1), 'application/json');
}
async function oldCopyRemove() {
  try { localStorage.removeItem(KEY); Object.keys(localStorage).filter(k => k.startsWith('uravu.lastSync.')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  try { if (cloud.user) await SDB.del('state:' + cloud.user.uid); } catch (e) {}
  await new Promise(res => { try { const r = indexedDB.deleteDatabase('uravu'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); } });
  cloud.old = null;
}

/* ---------- start ---------- */
// After Google or an email link, Supabase sends the person back with ?code=… (or an error). Take it off the
// address now, before the app reads its page address.
const authReturn = (() => {
  try {
    const q = new URLSearchParams(location.search), code = q.get('code'), err = q.get('error_description') || q.get('error');
    if (!code && !err) return null;
    ['code', 'error', 'error_code', 'error_description', 'state'].forEach(k => q.delete(k));
    history.replaceState(history.state, '', location.pathname + (String(q) ? '?' + q : '') + location.hash);
    return { code, err };
  } catch (e) { return null; }
})();
if (cloudConfigured()) { cloud.phase = 'connecting'; cloud.route = location.hash; }
async function cloudInit() {
  if (!cloudConfigured()) return;
  const bar = document.createElement('div'); bar.id = 'roBar'; bar.className = 'ro-bar'; bar.hidden = true; bar.setAttribute('role', 'status');
  bar.textContent = 'Offline: view only. Changes need internet.'; document.body.appendChild(bar);
  try {
    if (window.__uravuCloudApi) cloud.api = window.__uravuCloudApi;
    else { if (!window.supabase) await loadScript('vendor/supabase.js'); cloud.api = supabaseApi(); }
    if (authReturn && authReturn.err) toast('Sign-in didn’t work: ' + authReturn.err);
    if (authReturn && authReturn.code) { try { await cloud.api.exchange(authReturn.code); } catch (e) { toast('That sign-in link has expired or was opened on another device. Sign in with your password.'); } }
    const u = await cloud.api.session();
    cloud.api.onAuth((nu, ev) => {
      if (nu && (!cloud.user || cloud.user.uid !== nu.uid)) onSignedIn(nu);
      else if (!nu && cloud.user && ev === 'SIGNED_OUT') signedOutReset();
    });
    if (u) await onSignedIn(u); else gotoPhase('signin');
  } catch (e) {
    cloud.err = String(e && (e.message || e)).slice(0, 140);
    gotoPhase(isNetErr(e) ? 'offline' : 'error');
  }
}
window.addEventListener('online', () => {
  if (!cloud.user) { if (cloud.phase === 'offline' && !cloud.api) cloudInit(); return; }
  if (cloud.phase === 'offline' || cloud.phase === 'error') loadAccount(); else runSync();
});
window.addEventListener('offline', () => { if (cloud.phase === 'ready') setStatus('offline'); });
document.addEventListener('visibilitychange', () => {
  if (!cloud.user || cloud.phase !== 'ready') return;
  if (document.visibilityState === 'visible') { runSync(); if (!cloud.live) { liveStop(); liveStart(); } }
  else if (cloud.pending) syncNow();   // going to the background: send anything not yet sent
});
setInterval(() => { if (document.visibilityState === 'visible' && cloud.user && cloud.phase === 'ready') runSync(); }, 120000);
/* ---------- ask the browser to keep this site's data (not clear it when space is low) ---------- */
let persistAsked = false;
function askPersist() {
  if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
  persistAsked = true;
  navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
}

