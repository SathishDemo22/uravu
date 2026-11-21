// Security tests against your real Supabase project: proves one user can't read or change another user's data.
// Run:  npm run test:cloud
// Needs a file .env.test (never commit it) with:
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_ANON_KEY=eyJ...            (the public anon key, NOT service_role)
//   URAVU_TEST_EMAIL_A=...  URAVU_TEST_PASSWORD_A=...
//   URAVU_TEST_EMAIL_B=...  URAVU_TEST_PASSWORD_B=...
// Make the two test users in Supabase: Authentication › Users › Add user (tick "Auto confirm").
// The test only adds rows whose id starts with "rls-test-", and removes them at the end.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const envFile = path.join(ROOT, '.env.test');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const E = process.env, URL0 = (E.SUPABASE_URL || '').replace(/\/$/, ''), ANON = E.SUPABASE_ANON_KEY || '';
const need = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'URAVU_TEST_EMAIL_A', 'URAVU_TEST_PASSWORD_A', 'URAVU_TEST_EMAIL_B', 'URAVU_TEST_PASSWORD_B'].filter(k => !E[k]);
if (need.length) { console.error('Missing in .env.test: ' + need.join(', ')); process.exit(2); }
if (/^sb_secret_/.test(ANON) || /service_role/.test(Buffer.from((ANON.split('.')[1] || ''), 'base64').toString())) { console.error('SUPABASE_ANON_KEY is a service_role key. Use the anon public key.'); process.exit(2); }

const TABLES = ['people', 'links', 'events', 'likes', 'docs', 'doc_terms', 'functions', 'guests', 'gifts', 'settings'];
const VAULT = ['docs', 'doc_terms'];
const RUN = 'rls-test-' + Date.now().toString(36);
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m); };

async function req(method, p, { token, body, headers = {} } = {}) {
  // new-style keys (sb_publishable_…) aren't JWTs: send them only as apikey; a signed-in user's token goes in Authorization
  const h = Object.assign({ apikey: ANON }, token || !/^sb_/.test(ANON) ? { Authorization: 'Bearer ' + (token || ANON) } : {}, headers);
  if (body !== undefined && !(body instanceof Uint8Array)) h['Content-Type'] = 'application/json';
  const r = await fetch(URL0 + p, { method, headers: h, body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text };
}
async function signIn(email, password) {
  const r = await req('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
  if (r.status !== 200) throw new Error(`sign-in failed for ${email}: ${r.status} ${r.text.slice(0, 200)}`);
  return { token: r.json.access_token, uid: r.json.user.id };
}
const row = (t, id, extra = {}) => Object.assign({ id, data: { name: 'test' }, updated_at: new Date().toISOString(), deleted: false }, VAULT.includes(t) ? { data: { type: 'other' }, secret: 'v1:dGVzdA==' } : {}, extra);
const rest = (t, q = '') => `/rest/v1/${t}${q}`;
const ret = { Prefer: 'return=representation' };

console.log(`\nUravu security tests against ${URL0}\n`);
const A = await signIn(E.URAVU_TEST_EMAIL_A, E.URAVU_TEST_PASSWORD_A);
const B = await signIn(E.URAVU_TEST_EMAIL_B, E.URAVU_TEST_PASSWORD_B);
if (A.uid === B.uid) { console.error('Test users A and B must be two different accounts.'); process.exit(2); }

await test('Signed-out visitors can’t read or write any table', async () => {
  for (const t of TABLES) {
    const r = await req('GET', rest(t, '?select=id&limit=1'));
    ok(r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `${t}: anon read gave ${r.status} ${r.text.slice(0, 80)}`);
    const w = await req('POST', rest(t), { body: row(t, RUN + '-anon') });
    ok(w.status >= 400, `${t}: anon insert allowed (${w.status})`);
  }
});

await test('User A can write and read their own rows in every table', async () => {
  for (const t of TABLES) {
    const w = await req('POST', rest(t), { token: A.token, body: row(t, RUN, { owner_id: A.uid }), headers: ret });
    ok(w.status === 201, `${t}: insert ${w.status} ${w.text.slice(0, 160)}`);
    const r = await req('GET', rest(t, `?id=eq.${RUN}&select=id,owner_id`), { token: A.token });
    ok(r.status === 200 && r.json.length === 1 && r.json[0].owner_id === A.uid, `${t}: read back ${r.status} ${r.text.slice(0, 120)}`);
  }
});

await test('User B can’t see user A’s rows (by id or by listing everything)', async () => {
  for (const t of TABLES) {
    const r = await req('GET', rest(t, `?id=eq.${RUN}&select=id`), { token: B.token });
    ok(r.status === 200 && r.json.length === 0, `${t}: B saw A's row (${r.text.slice(0, 80)})`);
    const all = await req('GET', rest(t, `?owner_id=eq.${A.uid}&select=id&limit=5`), { token: B.token });
    ok(all.status === 200 && all.json.length === 0, `${t}: B listed A's rows`);
  }
});

await test('User B can’t change or delete user A’s rows', async () => {
  for (const t of TABLES) {
    const u = await req('PATCH', rest(t, `?id=eq.${RUN}&owner_id=eq.${A.uid}`), { token: B.token, body: { data: VAULT.includes(t) ? { type: 'hacked' } : { name: 'hacked' } }, headers: ret });
    ok(u.status >= 400 || (Array.isArray(u.json) && u.json.length === 0), `${t}: B update returned ${u.status} ${u.text.slice(0, 80)}`);
    const d = await req('DELETE', rest(t, `?id=eq.${RUN}&owner_id=eq.${A.uid}`), { token: B.token, headers: ret });
    ok(d.status >= 400 || (Array.isArray(d.json) && d.json.length === 0), `${t}: B delete returned ${d.status}`);
    const still = await req('GET', rest(t, `?id=eq.${RUN}&select=data`), { token: A.token });
    ok(still.json.length === 1 && !JSON.stringify(still.json[0].data).includes('hacked'), `${t}: A's row was changed`);
  }
});

await test('User B can’t write rows as user A (insert or upsert with A’s owner_id)', async () => {
  for (const t of TABLES) {
    const w = await req('POST', rest(t), { token: B.token, body: row(t, RUN + '-forged', { owner_id: A.uid }) });
    ok(w.status === 401 || w.status === 403, `${t}: forged insert gave ${w.status} ${w.text.slice(0, 80)}`);
    const up = await req('POST', rest(t, '?on_conflict=owner_id,id'), { token: B.token, body: row(t, RUN, { owner_id: A.uid, data: VAULT.includes(t) ? { type: 'hacked' } : { name: 'hacked' } }), headers: { Prefer: 'resolution=merge-duplicates' } });
    ok(up.status >= 400, `${t}: forged upsert gave ${up.status}`);
  }
  const still = await req('GET', rest('people', `?id=eq.${RUN}&select=data`), { token: A.token });
  ok(still.json[0].data.name === 'test', 'A’s row changed by the forged upsert');
});

await test('An older edit never overwrites a newer one; a far-future time is pulled back', async () => {
  const old = new Date(Date.now() - 3600e3).toISOString();
  await req('POST', rest('people', '?on_conflict=owner_id,id'), { token: A.token, body: row('people', RUN, { owner_id: A.uid, data: { name: 'older' }, updated_at: old }), headers: { Prefer: 'resolution=merge-duplicates' } });
  let r = await req('GET', rest('people', `?id=eq.${RUN}&select=data,updated_at`), { token: A.token });
  ok(r.json[0].data.name === 'test', 'older edit overwrote the row');
  const future = new Date(Date.now() + 30 * 864e5).toISOString();
  await req('POST', rest('people', '?on_conflict=owner_id,id'), { token: A.token, body: row('people', RUN, { owner_id: A.uid, data: { name: 'future' }, updated_at: future }), headers: { Prefer: 'resolution=merge-duplicates' } });
  r = await req('GET', rest('people', `?id=eq.${RUN}&select=data,updated_at`), { token: A.token });
  ok(r.json[0].data.name === 'future' && Date.parse(r.json[0].updated_at) < Date.now() + 2 * 864e5, 'future time not pulled back: ' + r.json[0].updated_at);
});

await test('Documents refuse plain-text numbers (must be encrypted)', async () => {
  const a = await req('POST', rest('docs'), { token: A.token, body: row('docs', RUN + '-plain', { owner_id: A.uid, data: { type: 'pan', f: { number: 'ABCDE1234F' } } }) });
  ok(a.status === 400, `docs with plain f was accepted (${a.status})`);
  const b = await req('POST', rest('doc_terms'), { token: A.token, body: row('doc_terms', RUN + '-plain', { owner_id: A.uid, data: { f: { policyNo: '123' } } }) });
  ok(b.status === 400, `doc_terms with plain f was accepted (${b.status})`);
  const c = await req('POST', rest('docs'), { token: A.token, body: row('docs', RUN + '-badsecret', { owner_id: A.uid, secret: 'ABCDE1234F' }) });
  ok(c.status === 400, `docs with a non-encrypted secret was accepted (${c.status})`);
});

const fileA = `vault/${A.uid}/${RUN}.bin`, bytes = new Uint8Array([1, 2, 3, 4, 5]);
await test('Vault files: only the owner can upload, list, download or delete', async () => {
  const up = await req('POST', '/storage/v1/object/' + fileA, { token: A.token, body: bytes, headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' } });
  ok(up.status === 200, `A upload ${up.status} ${up.text.slice(0, 120)}`);
  const bRead = await req('GET', '/storage/v1/object/authenticated/' + fileA, { token: B.token });
  ok(bRead.status >= 400, `B downloaded A's file (${bRead.status})`);
  const bSign = await req('POST', '/storage/v1/object/sign/' + fileA, { token: B.token, body: { expiresIn: 60 } });
  ok(bSign.status >= 400 || !(bSign.json && bSign.json.signedURL), `B got a signed link to A's file (${bSign.status})`);
  const bList = await req('POST', '/storage/v1/object/list/vault', { token: B.token, body: { prefix: A.uid + '/', limit: 100 } });
  ok(bList.status >= 400 || (Array.isArray(bList.json) && bList.json.length === 0), 'B listed A’s folder');
  const bWrite = await req('POST', `/storage/v1/object/vault/${A.uid}/${RUN}-planted.bin`, { token: B.token, body: bytes, headers: { 'Content-Type': 'application/octet-stream' } });
  ok(bWrite.status >= 400, `B wrote into A's folder (${bWrite.status})`);
  const bDel = await req('DELETE', '/storage/v1/object/vault', { token: B.token, body: { prefixes: [`${A.uid}/${RUN}.bin`] } });
  const still = await req('GET', '/storage/v1/object/authenticated/' + fileA, { token: A.token });
  ok(still.status === 200, `B deleted A's file (delete ${bDel.status}, A read ${still.status})`);
  const anon = await req('GET', '/storage/v1/object/authenticated/' + fileA);
  ok(anon.status >= 400, `signed-out visitor downloaded the file (${anon.status})`);
  const pub = await req('GET', '/storage/v1/object/public/' + fileA);
  ok(pub.status >= 400, `the bucket is public (${pub.status})`);
});

await test('A’s short-lived signed link works', async () => {
  const s = await req('POST', '/storage/v1/object/sign/' + fileA, { token: A.token, body: { expiresIn: 60 } });
  ok(s.status === 200 && s.json.signedURL, `sign ${s.status} ${s.text.slice(0, 120)}`);
  const f = await fetch(URL0 + '/storage/v1' + s.json.signedURL);
  ok(f.status === 200 && Buffer.from(await f.arrayBuffer()).equals(Buffer.from(bytes)), `download ${f.status}`);
});

await test('Signed-out visitors can’t call delete_my_account', async () => {
  const r = await req('POST', '/rest/v1/rpc/delete_my_account', { body: {} });
  ok(r.status >= 400, `anon could call it (${r.status})`);
});

// clean up
for (const t of TABLES) await req('DELETE', rest(t, `?id=like.${RUN}*`), { token: A.token });
await req('DELETE', '/storage/v1/object/vault', { token: A.token, body: { prefixes: [`${A.uid}/${RUN}.bin`] } });

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
