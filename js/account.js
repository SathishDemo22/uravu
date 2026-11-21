/* Uravu – account: sign-in screen, account page, document vault PIN, an old copy on this device, delete account */
/* ---------- the screen before the app (online only): connecting, sign in, loading, offline ---------- */
// Returns true when it drew the screen, so render() stops there
function cloudGate() {
  if (!cloudConfigured() || cloud.phase === 'ready') { document.body.classList.remove('gated'); return false; }
  document.body.classList.add('gated');
  $('#app').innerHTML = pgGate(cur());
  $('#tabbar').hidden = true; $('#fab').hidden = true;
  const sh = $('#sheet'); if (sh) { sh.hidden = true; sh.innerHTML = ''; }
  document.body.classList.remove('has-save');
  return true;
}
function pgGate(c) {
  const head = `<div class="gate-head"><img src="icons/icon.svg" alt="" width="64" height="64"><h1>Uravu <span class="ta">உறவு</span></h1><p class="muted">Family and friends, in Tamil and English</p></div>`;
  const p = cloud.phase;
  if (p === 'signin') return head + acctSignIn(c);
  if (p === 'offline') return head + `<div class="gate-msg"><p><b>You’re offline.</b></p><p class="muted">Connect to the internet to open your family. Uravu keeps your data in your account, not on this device.</p>
    <button class="btn-p" data-act="acct-retry" style="margin-top:14px">Try again</button></div>`;
  if (p === 'error') return head + `<div class="gate-msg"><p><b>Couldn’t open your account.</b></p><p class="muted">${esc(cloud.err || 'Something went wrong.')}</p>
    <button class="btn-p" data-act="acct-retry" style="margin-top:14px">Try again</button><button class="plain-btn" data-act="acct-signout">Sign out</button></div>`;
  return head + `<div class="gate-msg" role="status"><p class="muted">${p === 'loading' ? 'Opening your family…' : 'Connecting…'}</p></div>`;
}

/* ---------- the row in Settings ---------- */
function accountRow() {
  if (!cloudConfigured() || !cloud.user) return '';
  return `<button class="prof acct" data-act="go" data-id="account"><span class="av acct-ic" aria-hidden="true">${ICON.cloud}</span><span class="tx"><b>${esc(cloud.user.email || 'Signed in')}</b><small class="muted" data-cloud-status>${esc(cloudStatusText())}</small><span>Account, document vault, sign out</span></span></button>`;
}
const privacyLink = () => `<a class="link-btn" style="display:inline-block;margin-top:12px" href="privacy.html" target="_blank" rel="noopener">Privacy: what is stored and how</a>`;

/* ---------- account page ---------- */
function pgAccount(c) {
  if (!cloudConfigured()) return bar('Account') + `<p class="empty">Accounts aren’t set up in this copy of Uravu. Everything is saved on this device.</p>`;
  if (!cloud.user) return bar('Account') + `<p class="empty">Not signed in.</p>`;
  return bar('Account') + acctSignedIn(c);
}
function acctSignIn(c) {
  const em = esc(c.email || '');
  const code = c.codeSent ? `<div class="card"><h3>Enter the code</h3>
      <p class="muted" style="margin:-4px 0 0">We emailed a code to <b>${esc(c.codeSent)}</b>. You can also tap the link in that email.</p>
      <label class="fld">Code<input id="acCode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code"></label>
      <div class="qbtns"><button class="btn-s p" data-act="acct-verify">Sign in</button><button class="btn-s" data-act="acct-code-cancel">Back</button></div></div>` : '';
  return `<p class="hint-line">Sign in to see your family. Your data is kept in your account, so it’s the same on your phone and computer.</p>
    ${code || `<label class="fld">Email<input id="acEmail" type="email" autocomplete="email" inputmode="email" value="${em}" placeholder="you@example.com"></label>
    <label class="fld">Password <span class="hint">At least 8 characters</span><input id="acPass" type="password" autocomplete="current-password"></label>
    <p class="err" id="acErr" role="alert"${c.err ? '' : ' hidden'}>${esc(c.err || '')}</p>
    ${c.msg ? `<p class="pov-note" role="status">${esc(c.msg)}</p>` : ''}
    <button class="btn-p" data-act="acct-signin" style="margin-top:16px">Sign in</button>
    <button class="plain-btn" data-act="acct-signup">Create an account</button>
    <button class="plain-btn" data-act="acct-code">Email me a sign-in code instead</button>
    ${cloud.api && cloud.api.google ? `<button class="plain-btn" data-act="acct-google">Continue with Google</button>` : ''}`}
    ${c.codeSent ? `<p class="err" id="acErr" role="alert"${c.err ? '' : ' hidden'}>${esc(c.err || '')}</p>` : ''}
    ${privacyLink()}`;
}
function acctSignedIn(c) {
  const vs = vaultState(), nd = (S.docs || []).length;
  let vault;
  if (vs === 'open') vault = `<p class="muted" style="margin:0">Unlocked on this device. Document numbers, notes, photos and PDFs are locked on this device before they’re saved to your account.</p>
      ${cloud.lockedN ? `<p class="muted">Opening ${cloud.lockedN} document${cloud.lockedN === 1 ? '' : 's'}…</p>` : ''}
      <button class="link-btn" data-act="acct-vault-forget">Lock the vault on this device</button>`;
  else if (vs === 'locked') vault = `<p class="muted" style="margin:0">Enter your vault PIN to open your documents on this device${cloud.lockedN ? ` (${cloud.lockedN} waiting)` : ''}. It’s asked once per device.</p>
      <label class="fld">Vault PIN<input id="acPin" type="password" inputmode="numeric" autocomplete="off"></label>
      <p class="err" id="acVErr" role="alert"${c.verr ? '' : ' hidden'}>${esc(c.verr || '')}</p>
      <div class="qbtns"><button class="btn-s p" data-act="acct-vault-unlock">Unlock</button></div>`;
  else vault = `<p class="muted" style="margin:0">${nd ? `Your ${nd} document${nd === 1 ? ' isn’t' : 's aren’t'} saved yet. ` : ''}Choose a vault PIN. Document numbers (Aadhaar, PAN, policy, licence), notes, photos and PDFs are locked with it on this device before they’re saved. Supabase only ever gets the locked version.</p>
      <label class="fld">New vault PIN <span class="hint">At least 6 digits. A longer PIN is much safer.</span><input id="acPin" type="password" inputmode="numeric" autocomplete="new-password"></label>
      <label class="fld">Type it again<input id="acPin2" type="password" inputmode="numeric" autocomplete="new-password"></label>
      <div class="pov-note warn" style="margin-top:12px"><b>If you forget this PIN, your vault can’t be opened.</b> Not by you, not by us. Your documents can’t be recovered. Write the PIN down somewhere safe.</div>
      <label class="chk"><input type="checkbox" id="acKnow"> I understand a forgotten PIN can’t be recovered</label>
      <p class="err" id="acVErr" role="alert"${c.verr ? '' : ' hidden'}>${esc(c.verr || '')}</p>
      <div class="qbtns"><button class="btn-s p" data-act="acct-vault-create">Set vault PIN</button></div>`;
  const del = c.del ? `<div class="pov-note warn" style="margin-top:10px">This deletes your account, all your people, dates, functions and documents, and every vault file. It can’t be undone. Download your data first if you want a copy.
      <label class="fld" style="margin-top:10px">Type DELETE to confirm<input id="acDel" autocomplete="off" autocapitalize="characters"></label>
      <p class="err" id="acDErr" role="alert"${c.derr ? '' : ' hidden'}>${esc(c.derr || '')}</p>
      <div class="qbtns"><button class="btn-s danger" data-act="acct-delete-go">Delete everything</button><button class="btn-s" data-act="acct-delete-no">Cancel</button></div></div>`
    : `<button class="danger-txt" data-act="acct-delete">Delete my account and all data</button>`;
  return `<section class="card"><h3>${esc(cloud.user.email || 'Signed in')}</h3>
      <p class="sync-line" data-cloud-dot="${cloudDot()}"><i aria-hidden="true"></i><span data-cloud-status>${esc(cloudStatusText())}</span></p>
      <div class="qbtns"><button class="btn-s p" data-act="acct-sync">Refresh</button></div></section>
    <section class="card"><h3>🔒 Document vault</h3>${vault}</section>
    <section class="card"><h3>Your data</h3>
      <p class="muted" style="margin:0">Download everything as one file. You can restore it later from Settings. The file isn’t encrypted, so keep it somewhere safe.</p>
      <div class="qbtns"><button class="btn-s" data-act="backup">⬇ Download all my data</button></div>${privacyLink()}</section>
    <button class="plain-btn" data-act="acct-signout">Sign out</button>
    <p class="hint-line" style="margin-top:8px;font-size:.84rem">Nothing about your family is kept on this device. Signing out also forgets the vault PIN here.</p>
    ${del}`;
}

/* ---------- an old copy saved on this device by the earlier version ---------- */
function pgOldCopy(c) {
  const o = cloud.old;
  if (!o) return bar('Old copy') + `<p class="empty">There’s no old copy on this device.</p><button class="btn-p" data-act="back">Done</button>`;
  const n = o.missing.length, np = o.missingPhotos.length;
  const names = o.missing.filter(k => k.startsWith('people|')).map(k => (o.data.people[k.slice(7)] || {}).name).filter(Boolean);
  const left = n + np;
  return bar('Old copy on this device') + `<p class="hint-line">Before Uravu kept everything in your account, it saved a copy on this device${o.people ? ` (${o.people} people)` : ''}. It isn’t used any more.</p>
    ${left ? `<section class="card"><h3>${left} thing${left === 1 ? ' is' : 's are'} only in this copy</h3>
        <p class="muted" style="margin:0">${names.length ? 'Including ' + esc(names.slice(0, 5).join(', ')) + (names.length > 5 ? ' and others' : '') + '. ' : ''}${np ? `${np} document file${np === 1 ? '' : 's'}. ` : ''}Add them to your account so nothing is lost.</p>
        <p class="err" id="acErr" role="alert"${c.err ? '' : ' hidden'}>${esc(c.err || '')}</p>
        <div class="qbtns"><button class="btn-s p" data-act="old-add">Add to my account</button></div></section>`
      : `<p class="pov-note" style="margin-top:12px">✓ Everything in it is already in your account.</p>`}
    <button class="plain-btn" data-act="old-download">⬇ Download the old copy as a file</button>
    <button class="plain-btn danger" data-act="old-remove">${left ? `Remove it anyway (${left} thing${left === 1 ? '' : 's'} will be lost)` : 'Remove the old copy from this device'}</button>
    <p class="hint-line" style="margin-top:8px;font-size:.84rem">Removing it deletes only this device’s old copy. Your account isn’t touched.</p>`;
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
  'acct-retry': () => { if (cloud.user) loadAccount(); else cloudInit(); },
  'acct-sync': (id, a) => acRun(a, 'acErr', async () => { await syncNow(); rerender(); }),
  'acct-signout': async () => { await cloudSignOut(); toast('Signed out.'); },
  'acct-vault-create': (id, a) => acRun(a, 'acVErr', async c => {
    const p1 = $('#acPin').value, p2 = $('#acPin2').value;
    if (p1.length < 6) throw say('The PIN needs at least 6 digits or characters.');
    if (p1 !== p2) throw say('The two PINs don’t match.');
    if (!$('#acKnow').checked) throw say('Tick the box to confirm you understand a forgotten PIN can’t be recovered.');
    try { await vaultCreate(p1); }
    catch (e) { if (e.message === 'exists') { c.verr = 'Your other device already set a vault PIN. Enter that PIN to unlock.'; rerender(); return; } throw e; }
    c.verr = ''; toast('Vault PIN set. Saving your documents…'); rerender(); await syncNow(); rerender();
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
    await cloudDeleteAccount(); toast('Your account and all its data were deleted.');
  }),
  'old-add': (id, a) => acRun(a, 'acErr', async c => {
    if (readOnly()) throw say('You’re offline. Try again when you’re back online.');
    await oldCopyAdd(); c.err = ''; rerender(); toast('Added to your account');
  }),
  'old-download': () => oldCopyDownload(),
  'old-remove': (id, a) => arm(a, 'Tap again to remove it from this device', async () => {
    await oldCopyRemove(); if (cur().p === 'oldcopy') ui.stack.pop(); render(); toast('The old copy was removed from this device');
  }),
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.id) return;
  const go = { acPass: 'acct-signin', acEmail: 'acct-signin', acCode: 'acct-verify', acPin: null, acPin2: 'acct-vault-create', acDel: 'acct-delete-go' }[e.target.id];
  const act = e.target.id === 'acPin' ? ($('#acPin2') ? null : 'acct-vault-unlock') : go;
  if (act) { e.preventDefault(); $(`[data-act="${act}"]`)?.click(); }
});
PAGES.account = pgAccount; PAGES.oldcopy = pgOldCopy;
