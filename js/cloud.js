/* Uravu – cloud: sign-in, sync with Supabase, document vault (encrypted on this device) */
/* The phone stays the main copy: everything is saved here first (localStorage, as before) and works offline.
   When signed in, changes are found by comparing the data with what was last synced, then pushed to
   Supabase; changes from other devices are pulled in. Newest edit wins (by updated_at). Deletes are soft. */
const CLOUD_CFG = window.URAVU_CONFIG || {};
const cloudConfigured = () => !!window.__uravuCloudApi || !!(CLOUD_CFG.supabaseUrl && CLOUD_CFG.supabaseAnonKey);
const CLOUD_TABLES = ['settings', 'people', 'likes', 'links', 'events', 'docs', 'doc_terms', 'functions', 'guests', 'gifts'];
const VAULT_TABLES = { docs: ['f', 'note', 'title', 'fileMeta'], doc_terms: ['f'] };   // these fields are encrypted
const VAULT_ITER = 600000;
// status: off | signedout | setup | syncing | synced | offline | error
const cloud = { api: null, user: null, status: 'off', last: '', err: '', key: null, vault: null, pending: 0, lockedN: 0, needsRender: false, live: false };

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

/* ---------- sync bookkeeping (IndexedDB, separate from the photos database) ---------- */
const SDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open('uravu-sync', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return { get: k => run('readonly', st => st.get(k)), put: (k, v) => run('readwrite', st => st.put(v, k)), del: k => run('readwrite', st => st.delete(k)) };
})();
const newState = () => ({ rows: {}, cursor: '', files: {}, setup: false, locked: {} });
let syncState = null;
async function loadState(id) { const st = await SDB.get('state:' + id); return Object.assign(newState(), st || {}); }
const saveState = () => cloud.user && syncState ? SDB.put('state:' + cloud.user.uid, syncState) : Promise.resolve();

/* ---------- vault: AES-GCM with a key made from the vault PIN (PBKDF2) ---------- */
const te = new TextEncoder(), td = new TextDecoder();
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const bin = atob(str), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
async function vaultKeyFrom(pin, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter || VAULT_ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
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
async function vaultCreate(pin) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16))), key = await vaultKeyFrom(pin, salt, VAULT_ITER);
  const v = { salt, iter: VAULT_ITER, check: await sealJSON(key, { ok: 'uravu' }) };
  const made = await cloud.api.insertVault(v);   // fails if another device made one first
  if (!made) { await vaultRefresh(); throw new Error('exists'); }
  cloud.vault = v; await vaultKeep(key);
}
async function vaultUnlock(pin) {
  if (!cloud.vault) await vaultRefresh();
  if (!cloud.vault) throw new Error('no vault');
  const key = await vaultKeyFrom(pin, cloud.vault.salt, cloud.vault.iter);
  try { const c = await openJSON(key, cloud.vault.check); if (c.ok !== 'uravu') throw 0; } catch (e) { throw new Error('wrong pin'); }
  await vaultKeep(key);
}
async function vaultKeep(key) { cloud.key = key; try { await SDB.put('key:' + cloud.user.uid, key); } catch (e) {} }
async function vaultForget() { cloud.key = null; try { await SDB.del('key:' + cloud.user.uid); } catch (e) {} }
async function vaultRefresh() { const v = await cloud.api.getVault(); if (v) cloud.vault = v; return v; }
const vaultState = () => !cloud.user ? 'off' : cloud.key ? 'open' : cloud.vault ? 'locked' : 'none';
const docsWaiting = () => !cloud.key && ((S.docs || []).length > 0 || cloud.lockedN > 0);

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
  const s = cloud.status;
  if (s === 'off') return '';
  if (s === 'signedout') return 'Not signed in. Saved on this device only.';
  if (s === 'setup') return 'Signed in. Choose how to start syncing.';
  if (s === 'syncing') return 'Syncing…';
  if (s === 'offline') return 'Offline. Changes are saved on this device and will sync when you’re back online.';
  if (s === 'error') return 'Couldn’t sync: ' + (cloud.err || 'unknown problem') + '. Your changes are safe on this device.';
  const v = docsWaiting() ? (cloud.vault ? ' Documents wait for your vault PIN.' : ' Set a vault PIN to back up documents.') : '';
  return 'Synced' + (cloud.last ? ' ' + agoTxt(cloud.last) : '') + '.' + (cloud.live ? ' Live: changes from your other devices appear by themselves.' : '') + v;
}
function agoTxt(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : 'on ' + fmtDate(iso.slice(0, 10));
}
const cloudDot = () => cloud.status === 'off' ? '' : cloud.status === 'synced' && !docsWaiting() ? 'ok' : cloud.status === 'syncing' ? 'busy' : cloud.status === 'signedout' ? '' : 'warn';
function setStatus(s, err) {
  cloud.status = s; if (err !== undefined) cloud.err = err;
  document.querySelectorAll('[data-cloud-status]').forEach(el => { el.textContent = cloudStatusText(); });
  document.querySelectorAll('[data-cloud-dot]').forEach(el => { el.dataset.cloudDot = cloudDot(); });
}

/* ---------- sync ---------- */
let syncChain = Promise.resolve(), syncTimer = null, cloudApplying = false;
const locked = fn => (syncChain = syncChain.then(fn, fn));
// Compare the data with what was last synced; anything different is marked to send
async function detect() {
  if (!syncState) return 0;
  if (ensureIds(S)) save(true);
  const rows = toRows(S), now = new Date().toISOString(); let n = 0;
  const later = u => { const t = Math.max(Date.parse(now), u ? Date.parse(u) + 1 : 0); return new Date(t).toISOString(); };
  for (const [k, r] of rows) {
    const h = rowHash(r.data), m = syncState.rows[k];
    if (!m || m.d || m.h !== h) { syncState.rows[k] = { h, u: later(m && m.u), p: 1 }; n++; }
  }
  for (const [k, m] of Object.entries(syncState.rows)) if (!m.d && !rows.has(k)) { syncState.rows[k] = { h: '', u: later(m.u), p: 1, d: 1 }; n++; }
  cloud.pending = Object.values(syncState.rows).filter(m => m.p).length;
  if (n) await saveState();
  return n;
}
// Put rows from the cloud into the app's data. Newest edit wins.
async function applyRemote(list, opts = {}) {
  const cur = opts.replace ? new Map() : toRows(S); let changed = 0;
  for (const { t, r } of list) {
    const k = t + '|' + r.id, m = syncState.rows[k];
    if (t === 'settings' && r.id === 'vault') { if (!r.deleted) cloud.vault = r.data; continue; }
    if (!opts.replace && m && m.u >= r.updated_at) continue;   // ours is the same or newer
    if (r.deleted) { cur.delete(k); delete syncState.locked[k]; syncState.rows[k] = { h: '', u: r.updated_at, p: 0, d: 1 }; changed++; continue; }
    let data = r.data;
    if (VAULT_TABLES[t]) {
      if (!r.secret) { /* nothing secret saved */ }
      else if (!cloud.key) { syncState.locked[k] = { t, r }; continue; }
      else { try { data = Object.assign({}, data, await openJSON(cloud.key, r.secret)); } catch (e) { syncState.locked[k] = { t, r }; continue; } }
    }
    delete syncState.locked[k];
    cur.set(k, { t, id: r.id, data });
    syncState.rows[k] = { h: rowHash(data), u: r.updated_at, p: 0 };
    changed++;
  }
  cloud.lockedN = Object.keys(syncState.locked).length;
  if (!changed && !opts.replace) return 0;
  let next = fromRows(cur, S);
  if (!next.people[next.me]) next.people[next.me] = (S.people[S.me] && S.me === next.me) ? S.people[S.me] : blankPerson(next.me, { name: (S.people[S.me] || {}).name || 'Me' });
  for (const id in next.people) next.people[id] = blankPerson(id, next.people[id]);
  ['edges', 'events', 'blocked', 'docs', 'funcs', 'given'].forEach(k => { next[k] = next[k] || []; });
  S = next; cloudApplying = true; try { save(true); } finally { cloudApplying = false; }
  if (typeof isForm === 'function' && (isForm(cur0()) || isSheet(cur0()))) cloud.needsRender = true; else if (typeof render === 'function') render();
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
      // the cloud had a newer edit: take it
      if (stale.length) { const got = await cloud.api.get(t, stale); for (const r of got) { const k = t + '|' + r.id; if (syncState.rows[k]) syncState.rows[k].u = ''; } await applyRemote(got.map(r => ({ t, r }))); }
      await saveState();
    }
  }
}
// Vault files: encrypted here, then uploaded; files from other devices are downloaded and opened here
async function syncFiles() {
  if (!cloud.key || cloud.lockedN) return;
  const want = new Set((S.docs || []).flatMap(d => d.photos || []));
  for (const pid of want) {
    if (syncState.files[pid]) continue;
    let local = null; try { local = await IDB.get(pid); } catch (e) {}
    if (local) { await cloud.api.upload(pid, await sealBytes(cloud.key, te.encode(local))); syncState.files[pid] = 1; }
    else {
      const enc = await cloud.api.download(pid); if (!enc) continue;   // not uploaded yet by the other device
      await IDB.put(pid, td.decode(await openBytes(cloud.key, enc))); syncState.files[pid] = 1;
      document.querySelectorAll(`img[data-photo="${CSS.escape(pid)}"]`).forEach(img => img.removeAttribute('src')); hydratePhotos();
    }
    await saveState();
  }
  const gone = Object.keys(syncState.files).filter(pid => !want.has(pid));
  if (gone.length) { await cloud.api.removeFiles(gone); gone.forEach(pid => delete syncState.files[pid]); await saveState(); }
}
function runSync(opts = {}) {
  if (!cloud.user || !syncState || !syncState.setup) return Promise.resolve();
  return locked(async () => {
    if (!navigator.onLine) { await detect(); setStatus('offline'); return; }
    setStatus('syncing');
    try {
      await detect();
      if (!cloud.vault) await vaultRefresh().catch(() => {});
      await pullAll(opts);
      if (cloud.key && Object.keys(syncState.locked).length) await applyRemote(Object.values(syncState.locked).map(x => ({ t: x.t, r: Object.assign({}, x.r) })));
      await detect();
      await pushAll();
      await syncFiles();
      await saveState();
      cloud.last = new Date().toISOString(); try { localStorage.setItem('uravu.lastSync.' + cloud.user.uid, cloud.last); } catch (e) {}
      setStatus('synced', '');
    } catch (e) {
      const offline = !navigator.onLine || /fetch|network|load failed/i.test(String(e && (e.message || e)));
      setStatus(offline ? 'offline' : 'error', offline ? '' : String(e && (e.message || e)).slice(0, 140));
    }
    if (cloud.needsRender && !(isForm(cur0()) || isSheet(cur0()))) { cloud.needsRender = false; render(); }
  });
}
// Called by save(): sync a few seconds after the last change
// The change is noted (with its time) straight away, so "newest edit wins" goes by when you edited, not when it synced.
let detectTimer = null;
function syncSoon() {
  if (!cloud.user || !syncState || !syncState.setup) return;
  clearTimeout(detectTimer); detectTimer = setTimeout(() => locked(detect), 400);
  clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync(), 1200);
}
const syncNow = () => { clearTimeout(syncTimer); return runSync(); };

/* ---------- signing in and the first sync ---------- */
async function onSignedIn(u) {
  cloud.user = u; syncState = await loadState(u.uid);
  try { cloud.last = localStorage.getItem('uravu.lastSync.' + u.uid) || ''; } catch (e) {}
  try { cloud.key = (await SDB.get('key:' + u.uid)) || null; } catch (e) { cloud.key = null; }
  askPersist();
  if (!syncState.setup) {
    setStatus('setup');
    let n = -1; try { n = await cloud.api.count('people'); } catch (e) {}
    cloud.cloudPeople = n;
    if (cur0().p !== 'cloudsetup') push('cloudsetup', {});
    else rerender();
    return;
  }
  setStatus('synced'); rerender();
  runSync(); liveStart();
}
function onSignedOut() {
  liveStop();
  cloud.user = null; syncState = null; cloud.key = null; cloud.vault = null; cloud.lockedN = 0;
  setStatus(cloud.api ? 'signedout' : 'off');
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
// mode: 'upload' (this device's data goes up and joins what's in the account; where both have the same item, this device's wins)
//       'replace' (this device takes the account's data; a backup file of this device is saved first)
async function cloudStart(mode) {
  if (!cloud.user) return;
  if (mode === 'replace') {
    await doBackup();
    setStatus('syncing');
    // only marked as set up once the account's data is here, so a failed download never uploads this device's data
    await locked(async () => {
      syncState = newState();
      try { await pullAll({ replace: true }); }
      catch (e) { syncState = newState(); setStatus('setup'); throw e; }
      syncState.setup = true; await saveState();
    });
  }
  else { syncState = newState(); syncState.setup = true; await saveState(); }
  await syncNow(); liveStart();
}
async function cloudSignOut(clearDevice) {
  clearTimeout(syncTimer);
  try { if (cloud.user && navigator.onLine) await syncNow(); } catch (e) {}
  const id = cloud.user && cloud.user.uid;
  try { await cloud.api.signOut(); } catch (e) {}
  if (clearDevice && id) await wipeDevice(id);
  onSignedOut();
}
async function wipeDevice(id) {
  try { await SDB.del('state:' + id); await SDB.del('key:' + id); } catch (e) {}
  try { localStorage.removeItem('uravu.lastSync.' + id); } catch (e) {}
  try { const all = await IDB.all(); for (const k of Object.keys(all)) await IDB.del(k); } catch (e) {}
  const me = S.people[S.me];
  S = { me: 'me', people: { me: blankPerson('me', { name: me ? me.name : '' }) }, edges: [], events: [], settings: { lang: S.settings.lang || 'both' }, blocked: [], docs: [], funcs: [], given: [] };
  save(true);
}
async function cloudDeleteAccount() {
  const id = cloud.user.uid; clearTimeout(syncTimer);
  await locked(async () => { await cloud.api.deleteAccount(); });
  try { await SDB.del('state:' + id); await SDB.del('key:' + id); localStorage.removeItem('uravu.lastSync.' + id); } catch (e) {}
  onSignedOut();
}

/* ---------- ask the browser to keep this site's data (not clear it when space is low) ---------- */
let persistAsked = false;
function askPersist() {
  if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
  persistAsked = true;
  navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
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
async function cloudInit() {
  if (!cloudConfigured()) return;
  setStatus('signedout');
  try {
    if (window.__uravuCloudApi) cloud.api = window.__uravuCloudApi;
    else { if (!window.supabase) await loadScript('vendor/supabase.js'); cloud.api = supabaseApi(); }
    if (authReturn && authReturn.err) toast('Sign-in didn’t work: ' + authReturn.err);
    if (authReturn && authReturn.code) { try { await cloud.api.exchange(authReturn.code); } catch (e) { toast('That sign-in link has expired or was opened on another device. Try again.'); } }
    const u = await cloud.api.session();
    cloud.api.onAuth((nu, ev) => {
      if (nu && (!cloud.user || cloud.user.uid !== nu.uid)) onSignedIn(nu);
      else if (!nu && cloud.user && ev === 'SIGNED_OUT') { onSignedOut(); rerender(); }
    });
    if (u) await onSignedIn(u); else rerender();
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline', String(e && (e.message || e)).slice(0, 140));
  }
}
window.addEventListener('online', () => { if (cloud.user) runSync(); });
window.addEventListener('offline', () => { if (cloud.user) setStatus('offline'); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cloud.user) { runSync(); if (!cloud.live) { liveStop(); liveStart(); } } });
setInterval(() => { if (document.visibilityState === 'visible' && cloud.user) runSync(); }, 120000);
