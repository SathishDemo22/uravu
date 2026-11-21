/* Uravu – account pages: sign in, sync status, first sync, document vault PIN, delete account */
/* ---------- the row in Settings ---------- */
function accountRow() {
  if (!cloudConfigured()) return '';
  const u = cloud.user;
  return `<button class="prof acct" data-act="go" data-id="account"><span class="av acct-ic" aria-hidden="true">${ICON.cloud}</span><span class="tx"><b>${u ? esc(u.email || 'Signed in') : 'Sign in to sync'}</b><small class="muted" data-cloud-status>${esc(cloudStatusText())}</small><span>${u ? 'Account, sync and document vault' : 'Back up and use Uravu on your other devices'}</span></span></button>`;
}
const privacyLink = () => `<a class="link-btn" style="display:inline-block;margin-top:12px" href="privacy.html" target="_blank" rel="noopener">Privacy: what is stored and how</a>`;

/* ---------- account page ---------- */
function pgAccount(c) {
  if (!cloudConfigured()) return bar('Account') + `<p class="empty">Cloud sync isn’t set up in this copy of Uravu. Everything is saved on this device.</p>`;
  if (!cloud.api) return bar('Account') + `<p class="empty" data-cloud-status>${esc(cloudStatusText() || 'Connecting…')}</p>`;
  return bar('Account') + (cloud.user ? acctSignedIn(c) : acctSignIn(c));
}
function acctSignIn(c) {
  const em = esc(c.email || '');
  const code = c.codeSent ? `<div class="card"><h3>Enter the code</h3>
      <p class="muted" style="margin:-4px 0 0">We emailed a code to <b>${esc(c.codeSent)}</b>. You can also tap the link in that email.</p>
      <label class="fld">Code<input id="acCode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code"></label>
      <div class="qbtns"><button class="btn-s p" data-act="acct-verify">Sign in</button><button class="btn-s" data-act="acct-code-cancel">Back</button></div></div>` : '';
  return `<p class="hint-line">Sign in to keep a copy of your data in the cloud and use Uravu on your other phones and computers. Without signing in, everything stays on this device as before.</p>
    ${code || `<label class="fld">Email<input id="acEmail" type="email" autocomplete="email" inputmode="email" value="${em}" placeholder="you@example.com"></label>
    <label class="fld">Password <span class="hint">At least 8 characters</span><input id="acPass" type="password" autocomplete="current-password"></label>
    <p class="err" id="acErr" role="alert"${c.err ? '' : ' hidden'}>${esc(c.err || '')}</p>
    ${c.msg ? `<p class="pov-note" role="status">${esc(c.msg)}</p>` : ''}
    <button class="btn-p" data-act="acct-signin" style="margin-top:16px">Sign in</button>
    <button class="plain-btn" data-act="acct-signup">Create an account</button>
    <button class="plain-btn" data-act="acct-code">Email me a sign-in code instead</button>
    ${cloud.api.google ? `<button class="plain-btn" data-act="acct-google">Continue with Google</button>` : ''}`}
    ${c.codeSent ? `<p class="err" id="acErr" role="alert"${c.err ? '' : ' hidden'}>${esc(c.err || '')}</p>` : ''}
    <p class="hint-line" style="margin-top:18px;font-size:.84rem">Your people stay on this device too, and the app keeps working offline.</p>
    ${privacyLink()}`;
}
function acctSignedIn(c) {
  const vs = vaultState(), nd = (S.docs || []).length;
  let vault;
  if (vs === 'open') vault = `<p class="muted" style="margin:0">Unlocked on this device. Document numbers, notes, photos and PDFs are encrypted on this device before they’re uploaded.</p>
      ${cloud.lockedN ? `<p class="muted">Opening ${cloud.lockedN} document${cloud.lockedN === 1 ? '' : 's'} from your other devices…</p>` : ''}
      <button class="link-btn" data-act="acct-vault-forget">Lock the vault on this device</button>`;
  else if (vs === 'locked') vault = `<p class="muted" style="margin:0">Enter your vault PIN to open your documents on this device${cloud.lockedN ? ` (${cloud.lockedN} waiting)` : ''}.</p>
      <label class="fld">Vault PIN<input id="acPin" type="password" inputmode="numeric" autocomplete="off"></label>
      <p class="err" id="acVErr" role="alert"${c.verr ? '' : ' hidden'}>${esc(c.verr || '')}</p>
      <div class="qbtns"><button class="btn-s p" data-act="acct-vault-unlock">Unlock</button></div>`;
  else vault = `<p class="muted" style="margin:0">${nd ? `Your ${nd} document${nd === 1 ? ' isn’t' : 's aren’t'} backed up yet. ` : ''}Choose a vault PIN. Document numbers (Aadhaar, PAN, policy, licence), notes, photos and PDFs are locked with it on this device before upload. Supabase only ever gets the locked version.</p>
      <label class="fld">New vault PIN <span class="hint">At least 6 digits. A longer PIN is much safer.</span><input id="acPin" type="password" inputmode="numeric" autocomplete="new-password"></label>
      <label class="fld">Type it again<input id="acPin2" type="password" inputmode="numeric" autocomplete="new-password"></label>
      <div class="pov-note warn" style="margin-top:12px"><b>If you forget this PIN, your vault can’t be opened.</b> Not by you, not by us. Your documents stay on the devices where they already are, but the cloud copy can’t be recovered. Write the PIN down somewhere safe.</div>
      <label class="chk"><input type="checkbox" id="acKnow"> I understand a forgotten PIN can’t be recovered</label>
      <p class="err" id="acVErr" role="alert"${c.verr ? '' : ' hidden'}>${esc(c.verr || '')}</p>
      <div class="qbtns"><button class="btn-s p" data-act="acct-vault-create">Set vault PIN</button></div>`;
  const del = c.del ? `<div class="pov-note warn" style="margin-top:10px">This deletes your account, every row synced to it and every vault file. It can’t be undone. The data on this device stays until you clear it.
      <label class="fld" style="margin-top:10px">Type DELETE to confirm<input id="acDel" autocomplete="off" autocapitalize="characters"></label>
      <p class="err" id="acDErr" role="alert"${c.derr ? '' : ' hidden'}>${esc(c.derr || '')}</p>
      <div class="qbtns"><button class="btn-s danger" data-act="acct-delete-go">Delete everything</button><button class="btn-s" data-act="acct-delete-no">Cancel</button></div></div>`
    : `<button class="danger-txt" data-act="acct-delete">Delete my account and all data</button>`;
  return `<section class="card"><h3>${esc(cloud.user.email || 'Signed in')}</h3>
      <p class="sync-line" data-cloud-dot="${cloudDot()}"><i aria-hidden="true"></i><span data-cloud-status>${esc(cloudStatusText())}</span></p>
      ${syncState && !syncState.setup ? `<button class="btn-s p" data-act="go" data-id="cloudsetup">Choose how to start syncing</button>` : `<div class="qbtns"><button class="btn-s p" data-act="acct-sync">Sync now</button></div>`}</section>
    <section class="card"><h3>🔒 Document vault</h3>${vault}</section>
    <section class="card"><h3>Your data</h3>
      <p class="muted" style="margin:0">Download everything as one file. It also works as a backup you can restore later.</p>
      <div class="qbtns"><button class="btn-s" data-act="backup">⬇ Download all my data</button></div>${privacyLink()}</section>
    <button class="plain-btn" data-act="acct-signout">Sign out</button>
    <button class="plain-btn danger" data-act="acct-signout-clear">Sign out and remove data from this device</button>
    <p class="hint-line" style="margin-top:8px;font-size:.84rem">Signing out keeps your data on this device. Use the second button on a shared or borrowed device.</p>
    ${del}`;
}

/* ---------- first sync on this device ---------- */
function pgCloudSetup(c) {
  if (!cloud.user) return bar('Start syncing') + `<p class="empty">Sign in first.</p><button class="btn-p" data-act="go" data-id="account">Sign in</button>`;
  if (syncState && syncState.setup) return bar('Start syncing') + `<p class="empty">Sync is on for this device.</p><button class="btn-p" data-act="back">Done</button>`;
  const n = Object.keys(S.people).length, ev = S.events.length, nd = (S.docs || []).length, cn = cloud.cloudPeople;
  const here = `${n} ${n === 1 ? 'person' : 'people'}${ev ? `, ${ev} date${ev === 1 ? '' : 's'}` : ''}${nd ? `, ${nd} document${nd === 1 ? '' : 's'}` : ''}`;
  const restore = c.restore ? `<div class="pov-note" style="margin-top:10px">Restore <b>${c.restore.count} people</b>${c.restore.savedAt ? ` from the backup of ${esc(fmtDate(c.restore.savedAt.slice(0, 10)))}` : ''} on this device and upload them to your account? This replaces what’s on this device now.
      <div class="qbtns"><button class="btn-s p" data-act="acct-restore-up">Restore and upload</button><button class="btn-s" data-act="restore-no">Cancel</button></div></div>`
    : `<label class="plain-btn" style="display:grid;place-items:center;cursor:pointer">Restore a backup file, then upload it<input type="file" id="cloudRestoreIn" accept=".json,application/json" hidden></label>`;
  const busy = c.busy ? ' disabled' : '';
  let body;
  if (cn < 0) body = `<p class="empty">Couldn’t reach your account. Check the internet connection and try again.</p><button class="btn-p" data-act="acct-setup-retry">Try again</button>`;
  else if (cn === 0) body = `<p class="hint-line">Your account is empty. This device has <b>${esc(here)}</b>.</p>
    <button class="btn-p" data-act="acct-start-upload" style="margin-top:12px"${busy}>Upload this device’s data</button>
    ${restore}
    <p class="hint-line" style="margin-top:14px;font-size:.86rem">If this is the sample family and not your real people, restore your backup file instead, or upload and then use Settings › Start with an empty list.</p>`;
  else body = `<p class="hint-line">Your account already has <b>${cn} ${cn === 1 ? 'person' : 'people'}</b>. This device has <b>${esc(here)}</b>.</p>
    <button class="btn-p" data-act="acct-start-replace" style="margin-top:12px"${busy}>Use my account’s data on this device</button>
    <p class="hint-line" style="margin:6px 4px 0;font-size:.86rem">Replaces what’s on this device. A backup file of this device is saved to Downloads first.</p>
    <button class="plain-btn" data-act="acct-start-upload"${busy}>Add this device’s data to my account</button>
    <p class="hint-line" style="margin:6px 4px 0;font-size:.86rem">Joins both. Where both have the same item, this device’s version is kept.</p>
    ${restore}`;
  return bar('Start syncing') + body + `<p class="err" id="acErr" role="alert"${c.err ? '' : ' hidden'}>${esc(c.err || '')}</p>
    <button class="link-btn" data-act="acct-signout" style="margin-top:16px">Not now, sign out</button>`;
}

/* ---------- actions ---------- */
const acVal = id => ($('#' + id)?.value || '').trim();
function authErr(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  if (!navigator.onLine || /failed to fetch|network|load failed/i.test(m)) return 'No internet connection. Try again when you’re online.';
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Open the email we sent you and tap the link first, then sign in.';
  if (/already registered|already exists/i.test(m)) return 'There’s already an account with this email. Sign in instead.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/token.*(expired|invalid)|otp/i.test(m)) return 'That code is wrong or has expired. Ask for a new one.';
  if (/signups not allowed|signup.*disabled/i.test(m)) return 'New accounts aren’t allowed in this copy of Uravu.';
  return m || 'Something went wrong. Try again.';
}
// Run a task with the button showing it’s busy; show any error in the page’s error line
async function acRun(btn, errId, fn) {
  const c = cur(), el = () => $('#' + errId);
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Please wait…'; }
  if (el()) el().hidden = true;
  try { await fn(c); return true; }
  catch (e) {
    const msg = e && e.uravu ? e.message : authErr(e);
    if (errId === 'acVErr') c.verr = msg; else if (errId === 'acDErr') c.derr = msg; else c.err = msg;
    if (el()) { el().textContent = msg; el().hidden = false; } else rerender();
    return false;
  }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.label; } }
}
const say = msg => Object.assign(new Error(msg), { uravu: true });
function credentials(c, needPass) {
  const email = acVal('acEmail'), pass = $('#acPass') ? $('#acPass').value : '';
  c.email = email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw say('Enter your email address.');
  if (needPass && pass.length < 8) throw say('The password needs at least 8 characters.');
  return { email, pass };
}
Object.assign(H, {
  'acct-signin': (id, a) => acRun(a, 'acErr', async c => { const { email, pass } = credentials(c, true); await cloud.api.signIn(email, pass); c.err = ''; }),
  'acct-signup': (id, a) => acRun(a, 'acErr', async c => {
    const { email, pass } = credentials(c, true), r = await cloud.api.signUp(email, pass);
    if (r.confirm) { c.msg = `We sent an email to ${email}. Tap the link in it to finish, then sign in here.`; c.err = ''; rerender(); }
  }),
  'acct-code': (id, a) => acRun(a, 'acErr', async c => { const { email } = credentials(c, false); await cloud.api.sendCode(email); c.codeSent = email; c.err = ''; rerender(); $('#acCode')?.focus(); }),
  'acct-code-cancel': () => { delete cur().codeSent; delete cur().err; rerender(); },
  'acct-verify': (id, a) => acRun(a, 'acErr', async c => { const t = acVal('acCode').replace(/\s/g, ''); if (!/^\d{6,10}$/.test(t)) throw say('Enter the code from the email.'); await cloud.api.verifyCode(c.codeSent, t); delete c.codeSent; }),
  'acct-google': (id, a) => acRun(a, 'acErr', async () => { await cloud.api.signInGoogle(); }),
  'acct-sync': (id, a) => acRun(a, 'acErr', async () => { await syncNow(); rerender(); }),
  'acct-signout': async () => { await cloudSignOut(false); ui.stack = [{ p: 'home' }, { p: 'settings' }]; render(); toast('Signed out. Your data stays on this device.'); },
  'acct-signout-clear': (id, a) => arm(a, 'Tap again to sign out and clear', async () => {
    await cloudSignOut(true); ui = { stack: [{ p: 'home' }], q: '' }; render(); toast('Signed out. This device is cleared.');
  }),
  'acct-vault-create': (id, a) => acRun(a, 'acVErr', async c => {
    const p1 = $('#acPin').value, p2 = $('#acPin2').value;
    if (p1.length < 6) throw say('The PIN needs at least 6 digits or characters.');
    if (p1 !== p2) throw say('The two PINs don’t match.');
    if (!$('#acKnow').checked) throw say('Tick the box to confirm you understand a forgotten PIN can’t be recovered.');
    try { await vaultCreate(p1); }
    catch (e) { if (e.message === 'exists') { c.verr = 'Your other device already set a vault PIN. Enter that PIN to unlock.'; rerender(); return; } throw e; }
    c.verr = ''; toast('Vault PIN set. Uploading your documents…'); rerender(); await syncNow(); rerender();
  }),
  'acct-vault-unlock': (id, a) => acRun(a, 'acVErr', async c => {
    const pin = $('#acPin').value; if (!pin) throw say('Enter your vault PIN.');
    try { await vaultUnlock(pin); } catch (e) { if (e.message === 'wrong pin') throw say('That PIN is wrong.'); throw e; }
    c.verr = ''; toast('Vault unlocked'); rerender(); await syncNow(); rerender();
  }),
  'acct-vault-forget': async () => { await vaultForget(); rerender(); toast('Vault locked on this device'); },
  'acct-delete': () => { cur().del = true; rerender(); $('#acDel')?.focus(); },
  'acct-delete-no': () => { const c = cur(); delete c.del; delete c.derr; rerender(); },
  'acct-delete-go': (id, a) => acRun(a, 'acDErr', async c => {
    if (acVal('acDel').toUpperCase() !== 'DELETE') throw say('Type DELETE to confirm.');
    if (!navigator.onLine) throw say('You need to be online to delete your account.');
    await cloudDeleteAccount(); delete c.del;
    ui.stack = [{ p: 'home' }, { p: 'settings' }]; render(); toast('Your account and its data were deleted. This device still has its copy.');
  }),
  'acct-setup-retry': async () => { try { cloud.cloudPeople = await cloud.api.count('people'); } catch (e) { cloud.cloudPeople = -1; } rerender(); },
  'acct-start-upload': (id, a) => acRun(a, 'acErr', async () => { await cloudStart('upload'); acDone(); }),
  'acct-start-replace': (id, a) => arm(a, 'Tap again to replace this device’s data', () => acRun(a, 'acErr', async () => { await cloudStart('replace'); acDone(); })),
  'acct-restore-up': (id, a) => acRun(a, 'acErr', async c => {
    const ph = c.restore.photos || {}; for (const [k, v] of Object.entries(ph)) await IDB.put(k, v).catch(() => {});
    S = c.restore.data; normalize(); save(); delete c.restore;
    await cloudStart('upload'); acDone();
  }),
});
function acDone() {
  if (cur().p === 'cloudsetup') ui.stack.pop();
  render(); window.scrollTo(0, 0);
  toast(cloud.status === 'synced' ? 'Sync is on' : 'Sync is on. ' + cloudStatusText());
}
document.addEventListener('change', e => { if (e.target.id === 'cloudRestoreIn') readRestore(e.target.files[0]); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.id) return;
  const go = { acPass: 'acct-signin', acEmail: 'acct-signin', acCode: 'acct-verify', acPin: null, acPin2: 'acct-vault-create', acDel: 'acct-delete-go' }[e.target.id];
  const act = e.target.id === 'acPin' ? ($('#acPin2') ? null : 'acct-vault-unlock') : go;
  if (act) { e.preventDefault(); $(`[data-act="${act}"]`)?.click(); }
});
PAGES.account = pgAccount; PAGES.cloudsetup = pgCloudSetup;
