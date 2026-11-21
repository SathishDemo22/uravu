// A tiny stand-in for Supabase, for the sync tests. It runs in the test process and keeps everything in memory.
// It copies the parts of the real database that the app relies on: each user sees only their own rows,
// an older edit never overwrites a newer one (same as the uravu_touch trigger), documents refuse plain-text
// numbers (same as the CHECKs), and files live in a folder per user. The real rules are tested against
// Supabase itself by test/cloud-rls.mjs.
import http from 'node:http';

export function startFakeCloud(port) {
  const users = new Map();          // email -> { uid, password }
  const rows = new Map();           // `${uid}|${table}|${id}` -> row
  const files = new Map();          // `${uid}/${name}` -> base64
  let last = 0;
  const streams = new Map();       // uid -> Set of open event streams (live updates)
  const notify = (uid, t) => { for (const res of streams.get(uid) || []) res.write(`data: ${t}\n\n`); };
  const serverAt = () => { last = Math.max(Date.now() * 1000, last + 1); return new Date(Math.floor(last / 1000)).toISOString().replace('Z', String(last % 1000).padStart(3, '0') + 'Z'); };
  const of = (uid, t) => [...rows.values()].filter(r => r.owner_id === uid && r.t === t);
  const strip = r => { const o = Object.assign({}, r); delete o.t; return o; };
  const SECRET = { docs: ['f', 'note', 'title', 'fileMeta'], doc_terms: ['f'] };
  const need = uid => { if (!uid || ![...users.values()].some(u => u.uid === uid)) throw new Error('not signed in'); return uid; };

  const ops = {
    signUp({ email, password }) {
      if (users.has(email)) throw new Error('User already registered');
      const u = { uid: 'u-' + Math.random().toString(36).slice(2, 10), password }; users.set(email, u);
      return { uid: u.uid, email };
    },
    signIn({ email, password }) {
      const u = users.get(email); if (!u || u.password !== password) throw new Error('Invalid login credentials');
      return { uid: u.uid, email };
    },
    pull({ t, since }, uid) { need(uid); return of(uid, t).filter(r => !since || r.server_at >= since).sort((a, b) => a.server_at.localeCompare(b.server_at)).map(strip); },
    get({ t, ids }, uid) { need(uid); return of(uid, t).filter(r => ids.includes(r.id)).map(strip); },
    push({ t, list }, uid) {
      need(uid); const done = [];
      for (const r of list) {
        if (SECRET[t] && Object.keys(r.data || {}).some(k => SECRET[t].includes(k))) throw new Error('violates check constraint (plain document field)');
        if (SECRET[t] && r.secret != null && !String(r.secret).startsWith('v1:')) throw new Error('violates check constraint (secret format)');
        const k = `${uid}|${t}|${r.id}`, old = rows.get(k);
        if (old && r.updated_at < old.updated_at) continue;   // older edit: keep the newer row
        rows.set(k, Object.assign({}, r, { owner_id: uid, t, server_at: serverAt() })); done.push(r.id);
      }
      if (done.length) setTimeout(() => notify(uid, t), 30);   // like Supabase Realtime: every device of this user hears it
      return done;
    },
    count({ t }, uid) { need(uid); return of(uid, t).filter(r => !r.deleted).length; },
    getVault(a, uid) { need(uid); const r = rows.get(`${uid}|settings|vault`); return r && !r.deleted ? r.data : null; },
    insertVault({ v }, uid) {
      need(uid); const k = `${uid}|settings|vault`; if (rows.has(k)) return false;
      rows.set(k, { owner_id: uid, t: 'settings', id: 'vault', data: v, updated_at: new Date().toISOString(), deleted: false, server_at: serverAt() }); return true;
    },
    updateVault({ old, v }, uid) {
      need(uid); const k = `${uid}|settings|vault`, r = rows.get(k);
      if (!r || r.deleted || r.data.salt !== old.salt) return false;
      rows.set(k, Object.assign({}, r, { data: v, updated_at: new Date(Math.max(Date.now(), Date.parse(r.updated_at) + 1)).toISOString(), server_at: serverAt() }));
      setTimeout(() => notify(uid, 'settings'), 30); return true;
    },
    upload({ name, b64 }, uid) { need(uid); files.set(`${uid}/${name}`, b64); return true; },
    download({ name }, uid) { need(uid); return files.get(`${uid}/${name}`) || null; },
    removeFiles({ names }, uid) { need(uid); names.forEach(n => files.delete(`${uid}/${n}`)); return true; },
    listFiles(a, uid) { need(uid); return [...files.keys()].filter(k => k.startsWith(uid + '/')).map(k => k.slice(uid.length + 1)); },
    deleteAccount(a, uid) {
      need(uid);
      for (const k of [...rows.keys()]) if (k.startsWith(uid + '|')) rows.delete(k);
      for (const k of [...files.keys()]) if (k.startsWith(uid + '/')) files.delete(k);
      for (const [e, u] of users) if (u.uid === uid) users.delete(e);
      return true;
    },
  };

  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
    if (req.method === 'GET' && req.url.startsWith('/events')) {
      const uid = new URL(req.url, 'http://x').searchParams.get('uid') || '';
      res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }, cors));
      res.write(': open\n\n');
      if (!streams.has(uid)) streams.set(uid, new Set());
      streams.get(uid).add(res); req.on('close', () => streams.get(uid).delete(res));
      return;
    }
    let body = ''; req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const { op, args } = JSON.parse(body || '{}'), uid = (req.headers.authorization || '').replace(/^Bearer /, '');
        if (!ops[op]) throw new Error('unknown op ' + op);
        const out = JSON.stringify({ ok: ops[op](args || {}, uid) });
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)).end(out);
      } catch (e) { res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, cors)).end(JSON.stringify({ error: e.message })); }
    });
  });
  server.listen(port, '127.0.0.1');
  return {
    server, users, rows, files,
    close() { for (const set of streams.values()) for (const res of set) res.end(); server.close(); },
    rowsOf: (uid, t) => of(uid, t),
    uidOf: email => (users.get(email) || {}).uid,
  };
}

// The browser side: the same methods as supabaseApi() in js/cloud.js, talking to the fake server.
export const fakeApiScript = url => `(() => {
  const URL0 = ${JSON.stringify(url)}, KEY = 'fake.session';
  let me = null, cb = null;
  try { me = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  const call = async (op, args) => {
    const r = await fetch(URL0, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (me ? me.uid : '') }, body: JSON.stringify({ op, args }) });
    const j = await r.json(); if (j.error) throw new Error(j.error); return j.ok;
  };
  const setMe = (u, ev) => { me = u; if (u) localStorage.setItem(KEY, JSON.stringify(u)); else localStorage.removeItem(KEY); if (cb) setTimeout(() => cb(me, ev), 0); };
  const b64 = a => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  window.__uravuCloudApi = {
    google: false,
    async session() { return me; },
    onAuth(fn) { cb = fn; },
    async exchange() {},
    async signUp(email, password) { setMe(await call('signUp', { email, password }), 'SIGNED_IN'); return { confirm: false }; },
    async signIn(email, password) { setMe(await call('signIn', { email, password }), 'SIGNED_IN'); },
    async sendCode() { throw new Error('codes not in the fake'); },
    async verifyCode() { throw new Error('codes not in the fake'); },
    async signInGoogle() { throw new Error('no google in the fake'); },
    async signOut() { setMe(null, 'SIGNED_OUT'); },
    pull: (t, since) => call('pull', { t, since }),
    get: (t, ids) => call('get', { t, ids }),
    push: async (t, list) => new Set(await call('push', { t, list })),
    count: t => call('count', { t }),
    getVault: () => call('getVault', {}),
    insertVault: v => call('insertVault', { v }),
    updateVault: (old, v) => call('updateVault', { old, v }),
    upload: (name, bytes) => call('upload', { name, b64: b64(bytes) }),
    download: async name => { const s = await call('download', { name }); return s ? unb64(s) : null; },
    removeFiles: names => call('removeFiles', { names }),
    listFiles: () => call('listFiles', {}),
    async deleteAccount() { await call('deleteAccount', {}); setMe(null, 'SIGNED_OUT'); },
    subscribe(fn) {
      const es = new EventSource(URL0 + 'events?uid=' + encodeURIComponent(me ? me.uid : ''));
      es.onopen = () => fn('live'); es.onmessage = () => fn('change'); es.onerror = () => fn('down');
      return () => es.close();
    },
  };
})();`;
