/* Uravu – pages: settings, how connected, documents, functions, Ask Uravu, backup, bulk tools, moi */
/* ---------- settings ---------- */
function pgSettings(c) {
  const me = S.people[S.me], lang = S.settings.lang;
  const sb = (act, v, l, cur) => `<button data-act="${act}" data-id="${v}" aria-pressed="${cur === v}">${l}</button>`;
  return bar('Settings') + `
    <button class="prof" data-act="edit" data-id="${esc(S.me)}">${avatar(me)}<span class="tx"><b>${esc(me.name)}</b><span>Edit my profile</span></span></button>
    ${installRow()}
    ${accountRow()}
    <div class="fld"><span>Show relationship names in</span><div class="seg">${sb('lang', 'both', 'Both', lang)}${sb('lang', 'ta', 'தமிழ்', lang)}${sb('lang', 'en', 'English', lang)}</div></div>
    <div class="fld"><span>I am <span class="hint">Some Tamil words depend on this, like Machan</span></span><div class="seg">${sb('my-gender', 'm', 'Male', me.gender)}${sb('my-gender', 'f', 'Female', me.gender)}</div></div>
    <div class="fld"><span>Gender</span><button class="plain-btn" data-act="go" data-id="genders" style="margin-top:0">Update gender for everyone${noGender().length ? ` (${noGender().length} not set)` : ''}</button></div>
    <div class="fld"><span>Alive or passed away</span><button class="plain-btn" data-act="go" data-id="living" style="margin-top:0">Mark who has passed away${deadPeople().length ? ` (${deadPeople().length} marked)` : ''}</button></div>
    <div class="fld"><span>Backup <span class="hint">${cloud.user ? 'Everything is saved in your account. A backup file is a good extra copy; it isn’t encrypted, so keep it somewhere safe.' : 'Your people are saved only in this browser. Keep a backup file somewhere safe, like Google Drive or WhatsApp to yourself.'}${S.settings.lastBackup ? ' Last backup: ' + fmtDate(S.settings.lastBackup.slice(0, 10)) + '.' : ' No backup yet.'}</span></span>
      ${c.restore ? `<div class="pov-note" style="margin:4px 0 0">Restore <b>${c.restore.count} people</b>${c.restore.savedAt ? ` from the backup of ${esc(fmtDate(c.restore.savedAt.slice(0, 10)))}` : ''}? This replaces everything ${cloud.user ? 'in your account, on all your devices' : 'saved here now'}.
        <div class="qbtns"><button class="btn-s p" data-act="restore-yes">Restore</button><button class="btn-s" data-act="restore-no">Cancel</button></div></div>`
      : `<button class="plain-btn" data-act="backup" style="margin-top:0">Save a backup file</button>
      <label class="plain-btn" style="display:grid;place-items:center;cursor:pointer">Restore from a backup file<input type="file" id="restoreIn" accept=".json,application/json" hidden></label>`}</div>
    <div class="fld"><span>Start over <span class="hint">${cloud.user ? 'Deletes everything in your account, on all your devices' : 'Both options replace what’s saved on this phone'}</span></span>
      ${cloud.user ? '' : '<button class="plain-btn" data-act="reset-demo">Load the sample family</button>'}
      <button class="plain-btn danger" data-act="clear-all">Start with an empty list</button></div>`;
}

/* People who can reach you now but couldn’t if this person were deleted */
function reachMe(skip) { const seen = new Set([S.me]), q = [S.me]; while (q.length) { const x = q.shift(); for (const [y] of socialNeighbors(x)) if (y !== skip && !seen.has(y)) { seen.add(y); q.push(y); } } return seen; }
function unlinkedIfDeleted(id) {
  const now = reachMe(null), after = reachMe(id);
  return [...now].filter(x => x !== id && x !== S.me && !after.has(x));
}

/* ---------- how connected ---------- */
const possess = id => id === S.me ? 'your' : S.people[id].name + '’s';
function stepSentence(from, to, kind) {
  const word = SOCIAL[kind] ? SOCIAL[kind][2] : (WORDS[kind === 'sibling' ? sibTok(from, to) : gTok(S.people[to], kind)] || 'relative');
  return to === S.me ? `You are ${esc(possess(from))} <b>${word}</b>` : `${esc(S.people[to].name)} is ${esc(possess(from))} <b>${word}</b>`;
}
function callRow(from, to, k) {
  const lang = S.settings.lang, f = S.people[from], t = S.people[to];
  const who = from === S.me ? `You call ${esc(t.name)}` : to === S.me ? `${esc(f.name)} calls you` : `${esc(f.name)} calls ${esc(t.name)}`;
  const big = lang === 'en' ? k.en : (k.custom || k.ta);
  const sub = lang === 'both' ? (k.custom ? k.en : `${k.tl} (${k.en})`) : lang === 'ta' ? (k.custom ? '' : k.tl) : '';
  return `<div class="callrow">${avatar(f)}<span class="tx"><small>${who}</small><span class="big${lang === 'en' ? ' en' : ''}">${esc(big)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`;
}
/* Friends, colleagues and people I met are joined to me by a "social" link, so a friend's
   family can be reached too: You -> Arjun (friend) -> Gowmathi (Arjun's wife). */
const SOCIAL = { friend:['நண்பர்','Nanbar','friend'], colleague:['சக ஊழியர்','Saga Oozhiyar','colleague'], acquaintance:['அறிமுகமானவர்','Arimugamanavar','acquaintance'] };
const socialWord = (kind, id) => kind === 'friend' && S.people[id].gender === 'f' ? ['தோழி','Thozhi','friend'] : SOCIAL[kind];
function socialNeighbors(x) {
  const out = allLinks(x);
  const isRoot = id => knownDirectly(id);
  if (x === S.me) { for (const id in S.people) if (isRoot(id)) out.push([id, S.people[id].circle]); }
  else if (isRoot(x)) out.push([S.me, S.people[x].circle]);
  return out;
}
function socialPath(a, b) {
  const prev = { [a]: null }, q = [a];
  outer: while (q.length) {
    const x = q.shift();
    for (const [y, k] of socialNeighbors(x)) { if (y in prev) continue; prev[y] = [x, k]; if (y === b) break outer; q.push(y); }
  }
  if (!(b in prev)) return null;
  const nodes = [b], kinds = []; let c = b;
  while (prev[c]) { const [p, k] = prev[c]; kinds.unshift(k); nodes.unshift(p); c = p; }
  return { nodes, kinds };
}
// What nodes[0] calls the last node. Across a social link, name them through the person
// on the far side of it, e.g. "Arjun மனைவி" (Arjun's wife) or "Arjun நண்பர்" (Arjun's friend).
function connTerm(nodes, kinds) {
  const src = nodes[0], tgt = nodes[nodes.length - 1];
  let li = -1; kinds.forEach((k, i) => { if (SOCIAL[k]) li = i; });
  const saved = EGO;
  try {
    if (li < 0) { EGO = src; return kinOf(tgt); }
    const piv = nodes[li + 1];
    if (piv === tgt) {
      const prev = nodes[li], w = socialWord(kinds[li], tgt);
      if (prev === src) return { ta:w[0], tl:w[1], en:cap(w[2]) };
      const pv = S.people[prev];
      return { ta:`${pv.tamilName || pv.name} ${w[0]}`, tl:w[1], en:`${pv.name}’s ${w[2]}` };
    }
    EGO = piv;
    const r = kinOf(tgt), pv = S.people[piv];
    return { ta:`${pv.tamilName || pv.name} ${r.ta}`, tl:r.tl, en:`${pv.name}’s ${r.en.toLowerCase()}` };
  } finally { EGO = saved; }
}
function pgConnect(c) {
  const a = c.a && S.people[c.a] ? c.a : S.me, b = c.b && S.people[c.b] ? c.b : '';
  const slot = (key, id, label) => `<button class="slot" data-act="pick-person" data-id="${key}">${id ? avatar(S.people[id]) : `<span class="av add">${ICON.plus}</span>`}<span class="tx"><small>${label}</small><b>${id ? esc(id === S.me ? 'You (' + S.people[id].name + ')' : S.people[id].name) : 'Choose a person'}</b></span></button>`;
  let body = '';
  if (!b) body = `<p class="empty">Choose two people to see how they’re connected and what they call each other.</p>`;
  else if (a === b) body = `<p class="empty">That’s the same person. Choose someone else.</p>`;
  else {
    let path, ab, ba;
    path = socialPath(a, b);
    if (path) { ab = connTerm(path.nodes, path.kinds); ba = connTerm([...path.nodes].reverse(), [...path.kinds].reverse()); }
    if (!path) body = `<p class="empty">${esc(S.people[a].name)} and ${esc(S.people[b].name)} aren’t linked yet. Open either person and add a relationship to connect them.</p>`;
    else {
      const n = path.kinds.length;
      let steps = '';
      path.nodes.forEach((id, i) => {
        if (i > 0) steps += `<li class="plink">${stepSentence(path.nodes[i - 1], id, path.kinds[i - 1])}</li>`;
        steps += `<li><button class="pnode" data-act="person" data-id="${esc(id)}">${avatar(S.people[id])}<b>${esc(id === S.me ? 'You' : S.people[id].name)}</b></button></li>`;
      });
      body = `<section class="card"><h3>What they call each other</h3>${callRow(a, b, ab)}${callRow(b, a, ba)}</section>
        <section class="card"><h3>The connection, ${n} step${n === 1 ? '' : 's'}</h3><ol class="path">${steps}</ol></section>`;
    }
  }
  return bar('How connected') + `<div class="slots">${slot('a', a, 'From')}<button class="icon-btn swap" data-act="swap" aria-label="Swap the two people">${ICON.swap}</button>${slot('b', b, 'To')}</div>` + body;
}
function pgPickPerson() {
  const list = Object.values(S.people).sort((x, y) => (x.id === S.me ? -1 : y.id === S.me ? 1 : x.name.localeCompare(y.name)));
  return bar('Choose a person') + `<label class="pill" style="margin-bottom:8px">${ICON.search}<input id="ppf" type="search" placeholder="Search names" autocomplete="off" aria-label="Search names"></label>
    <div class="rows">${list.map(p => `<button class="r" data-act="pick-done" data-id="${esc(p.id)}" data-name="${esc((p.name + ' ' + p.tamilName).toLowerCase())}">${avatar(p)}<span class="tx"><span class="t1">${esc(p.id === S.me ? p.name + ' (you)' : p.name)}</span><span class="t2">${termLine(kinOf(p.id))}</span></span></button>`).join('')}</div>`;
}



/* ================= Functions & guest lists ================= */
const FUNC_TPL = [['Naming ceremony','பெயர் சூட்டு விழா','👶'],['Wedding','திருமணம்','💍'],['Engagement','நிச்சயதார்த்தம்','💐'],['Housewarming','கிரகப்பிரவேசம்','🏠'],
  ['Ear piercing','காது குத்து','✨'],['Birthday','பிறந்தநாள்','🎂'],['Puberty ceremony','மஞ்சள் நீராட்டு','🌼'],['Other function','மற்றவை','🎉']];
const funcIcon = f => (FUNC_TPL.find(t => f.kind === t[0]) || FUNC_TPL[FUNC_TPL.length - 1])[2];
const gName = g => g.pid && S.people[g.pid] ? (g.pid === S.me ? 'You' : S.people[g.pid].name) : (g.name || 'Guest');
const RSVP = { yes:['Coming','வருகிறார்'], maybe:['Maybe','தெரியவில்லை'], no:['Not coming','வரவில்லை'] };
const VIA = { person:'In person', call:'Phone call', whatsapp:'WhatsApp', card:'Card given' };
// People the family tree and groups say may have been left off this guest list.
// A guest’s husband, wife and unmarried children are counted with that guest, so they are not suggested.
function funcMissed(f) {
  const on = new Set((f.guests || []).map(g => g.pid).filter(Boolean)), skip = new Set(f.skip || []), out = [];
  if (!on.size) return out;
  const nm = id => S.people[id].name, host = o => on.has(o) || o === S.me;
  for (const p of Object.values(S.people)) {
    const id = p.id;
    if (id === S.me || p.dead || on.has(id) || skip.has(id)) continue;
    const nb = neighbors(id), married = nb.some(([, t]) => t === 'spouse');
    if (nb.some(([o, t]) => t === 'spouse' && host(o))) continue;
    if (!married && nb.some(([o, t]) => t === 'parent' && host(o))) continue;
    const pars = nb.filter(([, t]) => t === 'parent').map(([o]) => o);
    const sibs = [...nb.filter(([, t]) => t === 'sibling').map(([o]) => o), ...S.edges.filter(e => e.type === 'parent' && pars.includes(e.parent) && e.child !== id).map(e => e.child)];
    const k = kinOf(id), sib = sibs.find(o => on.has(o)), kid = nb.find(([o, t]) => t === 'child' && on.has(o));
    let why = '', rank = 9;
    if (k.family && (k.tk || []).length <= 2) { why = 'Close family'; rank = 0; }
    else if (sib) { why = `${nm(sib)} is invited, ${p.gender === 'f' ? 'her' : 'his'} ${p.gender === 'f' ? 'sister' : 'brother'} ${p.name} is not`; rank = 1; }
    else if (kid) { why = `${nm(kid[0])} is invited, ${p.gender === 'f' ? 'mother' : 'father'} is not`; rank = 2; }
    else { const g = (p.groups || []).find(g => [...on].some(o => (S.people[o]?.groups || []).includes(g))); if (g) { why = `Others from ${g} are invited`; rank = 3; } }
    if (why) out.push({ p, why: rank === 1 ? `${p.gender === 'f' ? 'Sister' : 'Brother'} of ${nm(sib)}, who is invited` : why, rank });
  }
  return out.sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name));
}
function missCard(f, c) {
  if (!(f.guests || []).some(g => g.pid)) return '';
  const ms = funcMissed(f);
  if (!ms.length) return `<p class="hint-line" style="margin:14px 0 0">✓ No close family or group members are missing from this list.</p>`;
  const show = c.missAll ? ms : ms.slice(0, 4);
  return `<section class="card"><h3>Did you miss anyone? (${ms.length})</h3>
    <p class="muted" style="margin:-4px 0 6px;font-size:.86rem">Found from your family tree and groups. A guest\u2019s husband, wife and children are counted with them.</p>
    ${show.map(m => `<div class="gline" style="padding:4px 0"><button class="gmain" data-act="person" data-id="${esc(m.p.id)}">${avatar(m.p)}<span class="tx"><span class="t1">${esc(m.p.name)} ${termSmall(kinOf(m.p.id))}</span><span class="t2">${esc(m.why)}</span></span></button>
      <button class="btn-s" style="flex:none;padding:0 14px" data-act="miss-add" data-id="${esc(m.p.id)}">＋ Add</button><button class="icon-btn" style="width:36px;height:36px;color:var(--muted)" data-act="miss-skip" data-id="${esc(m.p.id)}" aria-label="Don\u2019t suggest ${esc(m.p.name)}" title="Not inviting">${ICON.x}</button></div>`).join('')}
    <div class="qbtns" style="margin-top:8px">${ms.length > 1 ? `<button class="btn-s p" data-act="miss-all">Add all ${ms.length}</button>` : ''}${ms.length > show.length ? `<button class="btn-s" data-act="miss-more">Show all ${ms.length}</button>` : ''}</div></section>`;
}
// A person’s history across functions: invited, coming, and the moi they gave
function funcsCard(id, c) {
  if (id === S.me) return '';
  const nm = S.people[id].name, rows = [];
  for (const f of (S.funcs || []).slice().sort((a, b) => String(b.on || '').localeCompare(String(a.on || '')))) {
    const g = (f.guests || []).find(g => g.pid === id); if (!g) continue;
    const t2 = [f.on ? fmtDate(f.on) : '', g.rsvp ? RSVP[g.rsvp][0] : g.invited ? 'Invited' : 'Not invited yet'].filter(Boolean).join(', ');
    rows.push(`<div class="r gr"><button class="gmain" data-act="func" data-id="${esc(f.id)}"><span class="docic lg">${funcIcon(f)}</span><span class="tx"><span class="t1">${esc(f.title)}</span><span class="t2">${esc(t2)}</span></span></button>${g.moi ? `<span class="when">Got ${esc(money(g.moi))}</span><button class="icon-btn" style="width:36px;height:36px;color:var(--muted)" data-act="mg-clear" data-id="${esc(f.id)}" aria-label="Delete this moi" title="Delete moi only">${ICON.x}</button>` : ''}</div>`);
  }
  const given = (S.given || []).filter(x => x.pid === id).sort((a, b) => String(b.on || '').localeCompare(String(a.on || '')));
  const gRows = given.map(x => `<div class="r gr"><span class="docic lg">🎁</span><span class="tx"><span class="t1">${esc(x.title)}</span><span class="t2">${esc(x.on ? fmtDate(x.on) : 'Date not saved')}</span></span><span class="when">Gave ${esc(money(x.amount))}</span><button class="icon-btn" style="width:36px;height:36px;color:var(--muted)" data-act="mg-del" data-id="${esc(x.id)}" aria-label="Delete this entry">${ICON.x}</button></div>`);
  const total = (S.funcs || []).reduce((a, f) => a + (f.guests || []).filter(g => g.pid === id).reduce((x, g) => x + (Number(g.moi) || 0), 0), 0);
  const gave = given.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const fl = (S.funcs || []).slice().sort((a, b) => String(b.on || '9').localeCompare(String(a.on || '9')));
  const gotForm = fl.length ? `<div class="qlike">
      <div class="qrow" style="grid-template-columns:1fr"><select id="mgFunc" aria-label="Your function">${fl.map(f => `<option value="${esc(f.id)}">${esc(f.title + (f.on ? ', ' + fmtDate(f.on) : '') + ((f.guests || []).some(g => g.pid === id) ? '' : ' (not on the guest list yet)'))}</option>`).join('')}</select></div>
      <div class="qrow" style="grid-template-columns:1fr;margin-top:6px"><input id="mgAmt" inputmode="numeric" placeholder="Moi they gave ₹ (leave empty if none yet)" aria-label="Moi they gave in rupees" autocomplete="off"></div>
      <p class="hint-line" style="margin:8px 0 0;font-size:.84rem">If ${esc(nm)} isn\u2019t on that guest list, they\u2019ll be added to it.</p>
      <div class="qbtns"><button class="btn-s p" data-act="mg-got-save">Save</button><button class="btn-s" data-act="mg-cancel">Cancel</button></div></div>`
    : `<div class="qlike"><p class="muted" style="margin:0">You haven\u2019t planned a function yet.</p><div class="qbtns"><button class="btn-s p" data-act="func-new">＋ Plan a function</button><button class="btn-s" data-act="mg-cancel">Cancel</button></div></div>`;
  const form = c && c.mg === 'got' ? gotForm : c && c.mg ? `<div class="qlike">
      <div class="qrow" style="grid-template-columns:1fr"><input id="mgTitle" placeholder="Their function, e.g. Daughter\u2019s wedding" aria-label="Their function" autocomplete="off"></div>
      <div class="qrow" style="grid-template-columns:1fr 1fr;margin-top:6px"><input id="mgAmt" inputmode="numeric" placeholder="Amount ₹" aria-label="Amount you gave in rupees" autocomplete="off"><input type="date" id="mgDate" aria-label="Date of their function"></div>
      <div class="qbtns"><button class="btn-s p" data-act="mg-save">Save</button><button class="btn-s" data-act="mg-cancel">Cancel</button></div></div>`
    : `<button class="link-btn" style="display:block" data-act="mg-open" data-id="got">＋ Add to my function, or moi they gave</button><button class="link-btn" style="display:block" data-act="mg-open" data-id="gave">＋ Moi I gave at their function</button>`;
  return `<section class="card"><h3>Functions &amp; moi</h3>
    ${total || gave ? `<p class="muted" style="margin:-4px 0 8px;font-size:.9rem">${esc(nm)} gave you <b>${esc(money(total))}</b>. You gave ${esc(nm)} <b>${esc(money(gave))}</b>.</p>` : `<p class="muted" style="margin:-4px 0 8px;font-size:.88rem">Keep track of moi both ways: what ${esc(nm)} gave at your functions and what you gave at theirs.</p>`}
    ${rows.length ? `<p class="subh" style="margin:8px 0 2px">At your functions</p><div class="rows">${rows.join('')}</div>` : ''}
    ${gRows.length ? `<p class="subh" style="margin:10px 0 2px">At their functions</p><div class="rows">${gRows.join('')}</div>` : ''}
    ${form}<button class="link-btn" style="display:block" data-act="go" data-id="moi">See everyone\u2019s moi</button></section>`;
}
function funcStats(f) {
  const gs = f.guests || [], yes = gs.filter(g => g.rsvp === 'yes');
  return { n: gs.length, inv: gs.filter(g => g.invited).length, yes: yes.length, heads: yes.reduce((a, g) => a + (Number(g.count) || 1), 0),
    maybe: gs.filter(g => g.rsvp === 'maybe').length, no: gs.filter(g => g.rsvp === 'no').length, moi: gs.reduce((a, g) => a + (Number(g.moi) || 0), 0) };
}
function inviteText(f) {
  if (f.msg) return f.msg;
  return `வணக்கம்! You and your family are warmly invited to our ${f.title}${f.on ? ' on ' + fmtDate(f.on) : ''}${f.venue ? ' at ' + f.venue : ''}. Please do come and bless us. - ${S.people[S.me].name}`;
}
function funcRow(f) {
  const st = funcStats(f), days = f.on ? daysUntil(f.on) : null;
  return `<button class="r" data-act="func" data-id="${esc(f.id)}"><span class="docic">${funcIcon(f)}</span>
    <span class="tx"><span class="t1">${esc(f.title)}</span><span class="t2">${f.on ? fmtDate(f.on) + ', ' : ''}${st.inv} of ${st.n} invited</span></span>
    ${days != null && days >= 0 ? `<span class="badge${days <= 14 ? ' hot' : ' calm'}">${days === 0 ? 'Today' : days + 'd'}</span>` : ''}</button>`;
}
function pgFuncs() {
  const fs = (S.funcs || []).slice().sort((a, b) => String(a.on || '9').localeCompare(String(b.on || '9')));
  const up = fs.filter(f => !f.on || daysUntil(f.on) >= 0), past = fs.filter(f => f.on && daysUntil(f.on) < 0).reverse();
  return bar('Functions', `<button class="icon-btn" data-act="func-new" aria-label="Plan a function">${ICON.plus}</button>`) +
    (fs.length ? `${up.length ? `<div class="rows">${up.map(funcRow).join('')}</div>` : ''}${past.length ? `<p class="subh" style="margin:16px 0 2px">Finished</p><div class="rows">${past.map(funcRow).join('')}</div>` : ''}`
      : `<p class="empty">Plan a naming ceremony, wedding or housewarming. Pick guests from your people, tick them off as you invite them, and track who is coming.</p>`) +
    `<button class="plain-btn" data-act="go" data-id="moi" style="margin-top:18px">💰 Moi notebook</button>${ui.stack.length === 1 ? '' : `<button class="btn-p" data-act="func-new" style="margin-top:10px">＋ Plan a function</button>`}`;
}
function guestRow(f, g, open) {
  const p = g.pid ? S.people[g.pid] : null, k = p && g.pid !== S.me ? kinOf(g.pid) : null;
  const sub = [k ? (S.settings.lang === 'en' ? k.en : (k.custom || k.ta)) : (p ? '' : 'Not in your people'), p && p.dead ? 'Passed away' : '', g.invited && g.via ? VIA[g.via] : '', g.rsvp === 'yes' && (Number(g.count) || 1) > 1 ? `${g.count} people` : ''].filter(Boolean).join(', ');
  const badge = g.rsvp ? `<span class="gbadge ${g.rsvp}">${RSVP[g.rsvp][0]}</span>` : '';
  let panel = '';
  if (open) {
    const ph = p && p.phone ? phoneLinks(p) : null;
    const chip = (act, v, l, cur0) => `<button type="button" class="chip" data-act="${act}" data-id="${esc(g.id)}" data-v="${v}" aria-pressed="${cur0 === v}">${l}</button>`;
    panel = `<div class="gpanel">
      <p class="subh" style="margin:0 0 6px">Are they coming?</p><div class="chips wrap">${chip('g-rsvp', 'yes', '✓ Coming', g.rsvp)}${chip('g-rsvp', 'maybe', 'Maybe', g.rsvp)}${chip('g-rsvp', 'no', 'Not coming', g.rsvp)}</div>
      ${g.rsvp === 'yes' || g.rsvp === 'maybe' ? `<div class="stepper"><span>How many people from their family?</span><span class="zgrp"><button data-act="g-count" data-id="${esc(g.id)}" data-v="-1" aria-label="One fewer">−</button><span class="zpct">${Number(g.count) || 1}</span><button data-act="g-count" data-id="${esc(g.id)}" data-v="1" aria-label="One more">+</button></span></div>` : ''}
      <p class="subh" style="margin:12px 0 6px">How did you invite them?</p><div class="chips wrap">${Object.entries(VIA).map(([v, l]) => chip('g-via', v, l, g.via)).join('')}</div>
      <div class="two" style="margin-top:4px"><label class="fld" style="margin-top:8px">Gift / Moi received <span class="hint">₹</span><input data-gfield="moi" data-gid="${esc(g.id)}" inputmode="numeric" value="${esc(g.moi || '')}" autocomplete="off"></label>
        <label class="fld" style="margin-top:8px">Note<input data-gfield="note" data-gid="${esc(g.id)}" value="${esc(g.note || '')}" placeholder="e.g. coming by train" autocomplete="off"></label></div>
      <div class="qbtns">${ph ? `<a class="btn-s" href="tel:${esc(ph.tel)}" data-mark="call" data-gid="${esc(g.id)}">📞 Call</a><a class="btn-s" href="https://wa.me/${esc(ph.wa)}?text=${encodeURIComponent(inviteText(f))}" target="_blank" rel="noopener" data-mark="whatsapp" data-gid="${esc(g.id)}">💬 WhatsApp invite</a>` : ''}
        ${p ? `<button class="btn-s" data-act="person" data-id="${esc(g.pid)}">Open ${esc(p.name)}</button>` : ''}<button class="btn-s danger" data-act="g-rm" data-id="${esc(g.id)}">Remove</button></div>
      ${p && !p.phone ? `<p class="hint-line" style="margin:8px 0 0;font-size:.82rem">Add ${esc(p.name)}\u2019s phone number to call or send a WhatsApp invite from here.</p>` : ''}</div>`;
  }
  const gq = (cur().q || '').trim().toLowerCase(), gkey = (gName(g) + ' ' + (p ? (p.tamilName || '') + ' ' + (p.nickname || '') + ' ' + (k ? k.tl + ' ' + k.en + ' ' + (k.custom || k.ta) : '') : '')).toLowerCase();
  return `<div class="grow${g.invited ? ' done' : ''}" data-name="${esc(gkey)}"${gq && !gkey.includes(gq) ? ' hidden' : ''}><div class="gline">
      <button class="gchk" data-act="g-inv" data-id="${esc(g.id)}" role="checkbox" aria-checked="${!!g.invited}" aria-label="${g.invited ? 'Invited' : 'Not invited yet'}: ${esc(gName(g))}">${g.invited ? '✓' : ''}</button>
      <button class="gmain" data-act="g-open" data-id="${esc(g.id)}" aria-expanded="${!!open}">${p ? avatar(p) : `<span class="av" style="--h:#44505C" aria-hidden="true">${esc((g.name || '?')[0].toUpperCase())}</span>`}
        <span class="tx"><span class="t1">${esc(gName(g))}</span><span class="t2">${esc(sub) || (g.invited ? 'Invited' : 'Not invited yet')}</span></span></button>${badge}</div>${panel}</div>`;
}
function pgFunc(c) {
  const f = (S.funcs || []).find(x => x.id === c.id); if (!f) return bar('Function') + `<p class="empty">This function was deleted.</p>`;
  const st = funcStats(f), flt = c.f || 'all', days = f.on ? daysUntil(f.on) : null;
  const order = { family: 0, friend: 1, colleague: 2, acquaintance: 3 };
  let gs = (f.guests || []).slice().sort((a, b) => ((a.pid ? order[S.people[a.pid]?.circle] ?? 4 : 5) - (b.pid ? order[S.people[b.pid]?.circle] ?? 4 : 5)) || gName(a).localeCompare(gName(b)));
  if (flt === 'todo') gs = gs.filter(g => !g.invited); else if (flt === 'inv') gs = gs.filter(g => g.invited); else if (flt === 'yes') gs = gs.filter(g => g.rsvp === 'yes'); else if (flt === 'noreply') gs = gs.filter(g => g.invited && !g.rsvp);
  const chip = (id, l) => `<button class="chip" data-act="filter" data-id="${id}" aria-pressed="${flt === id}">${l}</button>`;
  const pct = st.n ? Math.round(st.inv / st.n * 100) : 0;
  return bar('Function', `<button class="txt-btn" data-act="func-edit" data-id="${esc(f.id)}">Edit</button>`) + `
    <div class="ph"><span class="docic xl">${funcIcon(f)}</span><h2>${esc(f.title)}</h2>
      <div class="alt">${[f.on ? fmtDate(f.on) + (days != null && days >= 0 ? ` (${days === 0 ? 'today' : 'in ' + days + ' day' + (days === 1 ? '' : 's')})` : '') : 'Date not set', f.venue].filter(Boolean).map(esc).join('<br>')}</div></div>
    <div class="stats"><div><b>${st.n}</b><span>Guests</span></div><div><b>${st.inv}<small>/${st.n}</small></b><span>Invited</span></div><div><b>${st.yes}</b><span>Coming${st.heads > st.yes ? `, ${st.heads} people` : ''}</span></div><div><b>${st.n - st.inv}</b><span>To invite</span></div></div>
    <div class="prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Invited"><i style="width:${pct}%"></i></div>
    ${st.moi ? `<p class="hint-line" style="margin:8px 0 0">Gifts / Moi received so far: <b>${money(st.moi)}</b></p>` : ''}
    <div class="qbtns" style="margin-top:14px"><button class="btn-s p" data-act="func-add" data-id="${esc(f.id)}">＋ Add guests</button>${st.n ? `<button class="btn-s" data-act="func-txt" data-id="${esc(f.id)}">⬇ Save list</button>` : ''}</div>
    ${missCard(f, c)}
    ${st.n ? `<label class="pill" style="margin:14px 0 0">${ICON.search}<input id="gq" type="search" placeholder="Search guests" autocomplete="off" aria-label="Search guests" value="${esc(c.q || '')}"></label><div class="chips" style="margin-top:10px">${chip('all', `All (${st.n})`)}${chip('todo', `To invite (${st.n - st.inv})`)}${chip('inv', `Invited (${st.inv})`)}${chip('noreply', `No reply (${f.guests.filter(g => g.invited && !g.rsvp).length})`)}${chip('yes', `Coming (${st.yes})`)}</div>
      <div class="glist">${gs.length ? gs.map(g => guestRow(f, g, c.open === g.id)).join('') : `<p class="empty">No one in this list.</p>`}</div>
      <p class="empty" id="gqNone" hidden>No guest matches that name.</p>
      <p class="hint-line" style="margin-top:12px;font-size:.84rem">Tap the circle when you\u2019ve invited someone. Tap their name for more: coming or not, how many people, gift received.</p>`
      : `<p class="empty" style="margin-top:14px">No guests yet. Tap <b>＋ Add guests</b> to pick from your family and friends.</p>`}
    <button class="danger-txt" data-act="func-del" data-id="${esc(f.id)}">Delete this function</button>`;
}
function pgFuncEdit(c) {
  const f = c.id ? S.funcs.find(x => x.id === c.id) : { title:'', kind:'', on:'', venue:'', msg:'' };
  return bar(c.id ? 'Edit function' : 'Plan a function') + `<div id="ff">
    <input type="hidden" id="f-kind" value="${esc(f.kind || '')}">
    <p class="subh">What kind?</p>
    <div class="relgrid">${FUNC_TPL.map(([en, ta, ic]) => `<button type="button" class="rc" data-act="func-tpl" data-id="${esc(en)}" aria-pressed="${f.kind === en}"><b>${ic} ${esc(en)}</b><span class="ta">${esc(ta)}</span></button>`).join('')}</div>
    <label class="fld big">Name of the function<input name="title" value="${esc(f.title)}" placeholder="e.g. Aadhavan\u2019s naming ceremony" autocomplete="off"></label>
    <div class="two"><label class="fld">Date<input type="date" name="on" value="${esc(f.on || '')}"></label><label class="fld">Place<input name="venue" value="${esc(f.venue || '')}" placeholder="e.g. Home, Madurai" autocomplete="off"></label></div>
    <label class="fld">Invitation message <span class="hint">Optional. Used for WhatsApp invites. Leave empty for a ready-made one.</span><textarea name="msg" placeholder="${esc(c.id ? inviteText(Object.assign({}, f, { msg: '' })) : 'வணக்கம்! You and your family are warmly invited to…')}">${esc(f.msg || '')}</textarea></label>
  </div><div class="savebar"><div class="in"><p class="err" id="err" hidden></p><button class="btn-p" data-act="func-save">${c.id ? 'Save changes' : 'Save and add guests'}</button></div></div>`;
}
function saveFunc() {
  const c = cur(), box = $('#ff'), val = n => (box.querySelector(`[name="${n}"]`)?.value || '').trim();
  if (!val('title')) return formErr('Give the function a name to save.', '[name="title"]');
  const data = { title: val('title'), kind: $('#f-kind').value, on: val('on'), venue: val('venue'), msg: val('msg') };
  if (c.id) { Object.assign(S.funcs.find(x => x.id === c.id), data); save(); ui.stack.pop(); render(); toast('Saved'); return; }
  const f = Object.assign({ id: uid(), guests: [] }, data); S.funcs.push(f); save();
  ui.stack.pop(); ui.stack.push({ p:'func', id:f.id }, { p:'funcadd', id:f.id }); render(); window.scrollTo(0, 0); toast('Now choose the guests');
}
function pgFuncAdd(c) {
  const f = S.funcs.find(x => x.id === c.id), have = new Set(f.guests.map(g => g.pid).filter(Boolean)), sel = new Set(c.sel || []);
  const ppl = Object.values(S.people).filter(p => p.id !== S.me && !have.has(p.id) && !p.dead);
  const close = p => { const k = kinOf(p.id); return k.family && (k.tk || []).length <= 2; };
  const groups = [...new Set(ppl.flatMap(p => p.groups || []))].sort();
  const bulk = [['close', 'Close family', ppl.filter(close).length], ['family', 'All family', ppl.filter(p => p.circle === 'family').length], ['friend', 'Friends', ppl.filter(p => p.circle === 'friend' || (p.also || []).includes('friend')).length],
    ['colleague', 'Colleagues', ppl.filter(p => p.circle === 'colleague' || (p.also || []).includes('colleague')).length], ['acquaintance', 'People I met', ppl.filter(p => p.circle === 'acquaintance').length]].filter(b => b[2]);
  const tags = p => [close(p) ? 'close' : '', p.circle, ...(p.also || []), ...(p.groups || []).map(g => 'g:' + g)].filter(Boolean).join('|');
  const sec = (circle, label) => { const list = ppl.filter(p => p.circle === circle).sort((a, b) => a.name.localeCompare(b.name)); return list.length ? `<p class="subh fa-sec" style="margin:12px 4px 2px">${label}</p>${list.map(p => `<label class="pk" data-name="${esc((p.name + ' ' + p.tamilName + ' ' + kinOf(p.id).tl).toLowerCase())}" data-tags="${esc(tags(p))}"><input type="checkbox" value="${esc(p.id)}"${sel.has(p.id) ? ' checked' : ''}>${avatar(p)}<span class="tx" style="flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3"><b style="font-weight:600">${esc(p.name)}</b><small class="muted">${termLine(kinOf(p.id))}</small></span><button type="button" class="pkgo" data-act="fa-open" data-id="${esc(p.id)}" aria-label="Open ${esc(p.name)}’s profile" title="Open profile">${sv('<path d="M9 6l6 6-6 6"/>')}</button></label>`).join('')}` : ''; };
  return bar('Add guests') + `<p class="hint-line">${esc(f.title)}</p>
    <label class="pill" style="margin:8px 0">${ICON.search}<input id="faq" type="search" placeholder="Search names" autocomplete="off" aria-label="Search names"></label>
    ${bulk.length || groups.length ? `<p class="subh" style="margin:6px 0">Select a whole group</p><div class="chips wrap" style="margin-bottom:8px">${bulk.map(([v, l, n]) => `<button class="chip" data-act="fa-bulk" data-id="${v}">${l} (${n})</button>`).join('')}${groups.map(g => `<button class="chip" data-act="fa-bulk" data-id="${esc('g:' + g)}">${esc(g)}</button>`).join('')}</div>` : ''}
    ${ppl.length ? `<div class="pick" id="faList" style="max-height:none">${CIRCLES.map(([cv, cl]) => sec(cv, cl)).join('')}</div>` : `<p class="empty">Everyone you\u2019ve saved is already on this guest list.</p>`}
    <div class="fld"><span>Someone not saved yet? <span class="hint">Add just their name to the list</span></span><div style="display:flex;gap:8px"><input id="faName" placeholder="e.g. Neighbour Raman family" autocomplete="off" aria-label="Guest name"><button class="btn-s" data-act="fa-name" style="flex:none">Add</button></div></div>
    <div class="savebar"><div class="in"><button class="btn-p" data-act="fa-save" id="faSave">${(n => n ? `Add ${n} guest${n === 1 ? '' : 's'}` : 'Add guests')(ppl.filter(p => sel.has(p.id)).length)}</button></div></div>`;
}
function faCount() { const n = document.querySelectorAll('#faList input:checked').length, b = $('#faSave'); if (b) b.textContent = n ? `Add ${n} guest${n === 1 ? '' : 's'}` : 'Done'; }
function funcText(f) {
  const st = funcStats(f), L = [f.title, [f.on ? fmtDate(f.on) : '', f.venue].filter(Boolean).join(', '), `Guests ${st.n} | Invited ${st.inv} | Coming ${st.yes} (${st.heads} people)${st.moi ? ' | Moi ' + money(st.moi) : ''}`, ''];
  f.guests.forEach((g, i) => { const k = g.pid && S.people[g.pid] && g.pid !== S.me ? kinOf(g.pid) : null;
    L.push(`${i + 1}. [${g.invited ? 'x' : ' '}] ${gName(g)}${k ? ' (' + k.tl + ')' : ''}${g.via ? ', invited: ' + VIA[g.via] : ''}${g.rsvp ? ', ' + RSVP[g.rsvp][0] + (g.rsvp === 'yes' ? ' x' + (Number(g.count) || 1) : '') : ''}${g.moi ? ', moi ' + money(g.moi) : ''}${g.note ? ', ' + g.note : ''}`); });
  return L.join('\n');
}
const funcGuest = gid => { const f = S.funcs.find(x => x.id === cur().id); return [f, f.guests.find(g => g.id === gid)]; };
function funcResults(q) {
  const hits = (S.funcs || []).filter(f => [f.title, f.kind, f.venue].some(v => v && v.toLowerCase().includes(q)));
  return hits.length ? `<p class="subh" style="margin:10px 0 0">Functions</p>${hits.slice(0, 4).map(funcRow).join('')}` : '';
}
// tapping Call or WhatsApp on a guest also ticks them as invited that way
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[data-mark]'); if (!a) return;
  const [, g] = funcGuest(a.dataset.gid); if (!g) return;
  g.invited = true; g.via = a.dataset.mark; save(); setTimeout(rerender, 400);
});

/* ================= Documents & renewals ================= */
// Field: [key, label, kind ('text' | 'date' | 'money' | 'num'), placeholder]
const DOC_TYPES = {
  vehicle_ins: { label:'Vehicle insurance', ta:'வாகன காப்பீடு', icon:'🚗', renew:true, remind:30,
    fields:[['vehicle','Vehicle number','text','TN 01 AB 1234'],['model','Vehicle','text','e.g. Maruti Swift, Activa']],
    term:[['insurer','Insurance company','text','e.g. ICICI Lombard'],['policyNo','Policy number'],['from','Policy start','date'],['to','Own damage valid till','date'],['tpTo','Third party valid till','date'],['premium','Premium paid','money'],['idv','IDV (insured value)','money'],['ncb','No-claim bonus %','num']],
    due:[['to','Own damage cover'],['tpTo','Third party cover']] },
  puc: { label:'Pollution certificate (PUC)', ta:'புகை சான்று', icon:'💨', renew:true, remind:7,
    fields:[['vehicle','Vehicle number','text','TN 01 AB 1234']],
    term:[['number','Certificate number'],['from','Tested on','date'],['to','Valid till','date']], due:[['to','PUC']] },
  rc: { label:'Vehicle RC', ta:'வாகன பதிவு', icon:'📄', remind:60,
    fields:[['vehicle','Vehicle number','text','TN 01 AB 1234'],['number','RC / chassis number'],['to','Registration valid till','date']], due:[['to','Registration']] },
  dl: { label:'Driving licence', ta:'ஓட்டுநர் உரிமம்', icon:'🪪', remind:60,
    fields:[['number','Licence number'],['classes','Vehicle classes','text','e.g. LMV, MCWG'],['issued','Issued on','date'],['to','Valid till','date']], due:[['to','Licence']] },
  term_ins: { label:'Term insurance', ta:'டேர்ம் காப்பீடு', icon:'🛡️', renew:true, remind:30,
    fields:[['insurer','Insurance company'],['policyNo','Policy number'],['cover','Cover amount','money'],['endDate','Policy ends on','date'],['nominee','Nominee']],
    term:[['from','Premium paid on','date'],['to','Next premium due','date'],['premium','Premium amount','money']], due:[['to','Premium']] },
  health_ins: { label:'Health insurance', ta:'மருத்துவ காப்பீடு', icon:'🏥', renew:true, remind:30,
    fields:[['insurer','Insurance company'],['members','People covered','text','e.g. Self, wife, son']],
    term:[['policyNo','Policy number'],['from','Start date','date'],['to','Valid till','date'],['cover','Sum insured','money'],['premium','Premium paid','money']], due:[['to','Renewal']] },
  life_ins: { label:'Life insurance / LIC', ta:'ஆயுள் காப்பீடு', icon:'💼', renew:true, remind:30,
    fields:[['insurer','Company','text','e.g. LIC'],['policyNo','Policy number'],['cover','Sum assured','money'],['maturity','Maturity date','date'],['nominee','Nominee']],
    term:[['from','Premium paid on','date'],['to','Next premium due','date'],['premium','Premium amount','money']], due:[['to','Premium']] },
  passport: { label:'Passport', ta:'கடவுச்சீட்டு', icon:'🛂', remind:180,
    fields:[['number','Passport number'],['issued','Issued on','date'],['to','Valid till','date'],['place','Place of issue']], due:[['to','Passport']] },
  aadhaar: { label:'Aadhaar', ta:'ஆதார்', icon:'🆔', remind:0,
    fields:[['number','Aadhaar number','text','Last 4 digits are enough, e.g. 1234'],['mobile','Linked mobile number']], due:[] },
  pan: { label:'PAN card', ta:'பான் கார்டு', icon:'💳', remind:0, fields:[['number','PAN number']], due:[] },
  voter: { label:'Voter ID', ta:'வாக்காளர் அட்டை', icon:'🗳️', remind:0, fields:[['number','Voter ID number']], due:[] },
  other: { label:'Other document', ta:'மற்றவை', icon:'📁', remind:30,
    fields:[['number','Number / reference'],['to','Valid till or due date','date']], due:[['to','Due']] },
};
const SECRET_KEYS = ['number', 'policyNo', 'mobile'];
const dt = d => DOC_TYPES[d.type] || DOC_TYPES.other;
const docTitle = d => d.title || dt(d).label + (d.f.vehicle ? ` (${d.f.vehicle})` : '');
const latestTerm = d => (d.terms || []).slice().sort((a, b) => String(b.f.from || b.f.to || '').localeCompare(String(a.f.from || a.f.to || '')))[0] || null;
const mask = v => { v = String(v || ''); return v.length > 4 ? '•••• ' + v.slice(-4) : v; };
const money = v => v === '' || v == null || isNaN(Number(v)) ? String(v || '') : '₹' + Number(v).toLocaleString('en-IN');
function daysUntil(on) { const [y, m, d] = on.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - today()) / 864e5); }
function addYears(on, n) { if (!on) return ''; const [y, m, d] = on.split('-').map(Number); const x = new Date(y + n, m - 1, d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
function addDays(on, n) { if (!on) return ''; const [y, m, d] = on.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
// The dates that matter for a document: from this year's policy for renewable ones
function dueList(d) {
  const t = dt(d), src = t.renew ? (latestTerm(d) || { f: {} }).f : d.f;
  return t.due.filter(([k]) => src[k]).map(([k, label]) => ({ key: k, label, date: src[k], days: daysUntil(src[k]) }));
}
const nextDue = d => dueList(d).sort((a, b) => a.days - b.days)[0] || null;
const remindOf = d => d.remind ?? dt(d).remind;
const isDueSoon = (d, x) => x && (x.days < 0 || x.days <= Math.max(remindOf(d), 1));
function allDues() { const out = []; for (const d of S.docs || []) for (const x of dueList(d)) out.push(Object.assign({ d }, x)); return out.sort((a, b) => a.days - b.days); }
const dueWhen = n => n < 0 ? `Overdue by ${-n} day${n === -1 ? '' : 's'}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `In ${n} days`;
const ownerName = d => d.owner === S.me ? 'You' : S.people[d.owner]?.name || '';
function gcalLink(d, x) {
  const lead = remindOf(d), on = lead && daysUntil(addDays(x.date, -lead)) > 0 ? addDays(x.date, -lead) : x.date;
  const a = on.replace(/-/g, ''), b = addDays(on, 1).replace(/-/g, '');
  const title = `Renew ${dt(d).label}${d.f.vehicle ? ' ' + d.f.vehicle : ''} (${x.label}) for ${d.owner === S.me ? 'me' : ownerName(d)}, due ${fmtDate(x.date)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${a}/${b}&details=${encodeURIComponent('Reminder from Uravu. Due on ' + fmtDate(x.date) + '.')}`;
}

/* photos of documents live in IndexedDB on this device (too big for normal storage) */
const IDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open('uravu', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('photos', mode), r = fn(t.objectStore('photos')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return {
    put: (k, v) => run('readwrite', st => st.put(v, k)),
    get: k => run('readonly', st => st.get(k)),
    del: k => run('readwrite', st => st.delete(k)),
    all: async () => { const db = await open(); return new Promise((res, rej) => { const out = {}, t = db.transaction('photos'), c = t.objectStore('photos').openCursor(); c.onsuccess = () => { const k = c.result; if (k) { out[k.key] = k.value; k.continue(); } }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); },
  };
})();
function hydratePhotos() { document.querySelectorAll('img[data-photo]:not([src])').forEach(img => { IDB.get(img.dataset.photo).then(v => { if (v) img.src = v; else img.alt = 'Photo not on this device'; }).catch(() => { img.alt = 'Photo not available'; }); }); }
function readDocPhoto(file) {
  if (!file) return;
  const docId = cur().id, isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf && file.size > 15 * 1024 * 1024) { toast('That PDF is over 15 MB. Try a smaller copy.'); return; }
  const r = new FileReader();
  const keep = async (data, meta) => {
    const pid = uid();
    try {
      await IDB.put(pid, data);
      const d = S.docs.find(x => x.id === docId); d.photos = [...(d.photos || []), pid];
      d.fileMeta = Object.assign({}, d.fileMeta, { [pid]: meta });
      save(); if (cur().id === docId) rerender(); toast(meta.kind === 'pdf' ? 'PDF saved on this device' : 'Photo saved on this device');
    } catch (e) { toast(e && e.uravu ? e.message : 'Files can’t be saved in this browser.'); }
  };
  r.onload = () => {
    if (isPdf) { keep(r.result, { kind: 'pdf', name: file.name || 'document.pdf', size: file.size }); return; }
    const img = new Image();
    img.onload = () => {
      const max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      keep(cv.toDataURL('image/jpeg', 0.78), { kind: 'image', name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg' });
    };
    img.onerror = () => toast('That file couldn’t be opened. Use a photo or a PDF.');
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
const fileKind = (d, pid) => (d.fileMeta && d.fileMeta[pid] && d.fileMeta[pid].kind) || 'image';
const fileSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function dataUrlToBlob(u) {
  const [head, b64] = u.split(','), mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
// A normal browser download (goes to the phone's Downloads folder)
function saveFile(filename, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function saveDocFile(pid) {
  const d = S.docs.find(x => x.id === cur().id), meta = (d.fileMeta || {})[pid] || { kind: 'image', name: 'photo.jpg' };
  try {
    const data = await IDB.get(pid); if (!data) { toast('This file isn’t on this device.'); return; }
    const base = docTitle(d).replace(/[^\w\- ]+/g, '').trim() || 'document';
    saveFile(meta.kind === 'pdf' ? (meta.name || base + '.pdf') : `${base}.jpg`, dataUrlToBlob(data));
  } catch (e) { toast('Couldn’t save the file here.'); }
}

/* ---- pages ---- */
function docRow(d, showOwner) {
  const t = dt(d), x = nextDue(d), soon = isDueSoon(d, x);
  const sub = x ? `${x.label}: ${fmtDate(x.date)}` : t.due.length ? 'No date saved yet' : (d.f.number ? mask(d.f.number) : 'No expiry');
  return `<button class="r" data-act="doc" data-id="${esc(d.id)}"><span class="docic">${t.icon}</span>
    <span class="tx"><span class="t1">${esc(docTitle(d))}</span><span class="t2">${showOwner ? esc(ownerName(d)) + ', ' : ''}${esc(sub)}</span></span>
    ${x ? `<span class="badge${soon ? ' hot' : ' calm'}">${x.days < 0 ? 'Overdue' : x.days <= 99 ? x.days + 'd' : fmtDate(x.date).slice(-4)}</span>` : ''}</button>`;
}
function dueCard(x) {
  const soon = isDueSoon(x.d, x);
  return `<button class="up ${soon ? 'soon' : ''}" data-act="doc" data-id="${esc(x.d.id)}"><span class="avs"><span class="docic lg">${dt(x.d).icon}</span></span>
    <span class="when">${dueWhen(x.days)}</span><span class="nm">${esc(ownerName(x.d))}</span><span class="what">${esc(dt(x.d).label)}${x.d.f.vehicle ? ' ' + esc(x.d.f.vehicle) : ''}: ${esc(x.label)}</span></button>`;
}
function docsCard(id) {
  const mine = (S.docs || []).filter(d => d.owner === id).sort((a, b) => (nextDue(a)?.days ?? 1e9) - (nextDue(b)?.days ?? 1e9));
  return `<section class="card"><h3>Documents</h3>${mine.length ? `<div class="rows">${mine.map(d => docRow(d)).join('')}</div>` : `<p class="muted" style="margin:0">Insurance, licence, Aadhaar and more, with renewal reminders.</p>`}
    <button class="link-btn" data-act="doc-new" data-id="${esc(id)}">＋ Add a document</button></section>`;
}
function pgDocs(c) {
  const f = c.f || 'all', docs = (S.docs || []).slice();
  const owners = [...new Set(docs.map(d => d.owner))].filter(o => S.people[o]).sort((a, b) => (a === S.me ? -1 : b === S.me ? 1 : S.people[a].name.localeCompare(S.people[b].name)));
  const chip = (id, label) => `<button class="chip" data-act="filter" data-id="${esc(id)}" aria-pressed="${f === id}">${label}</button>`;
  let list = docs;
  if (f === 'due') list = docs.filter(d => isDueSoon(d, nextDue(d)));
  else if (f !== 'all') list = docs.filter(d => d.owner === f);
  list.sort((a, b) => (nextDue(a)?.days ?? 1e9) - (nextDue(b)?.days ?? 1e9));
  const groups = f === 'all' ? owners.map(o => [o, list.filter(d => d.owner === o)]).filter(g => g[1].length) : [[null, list]];
  return bar('Documents', `<button class="icon-btn" data-act="doc-new" data-id="" aria-label="Add document">${ICON.plus}</button>`) +
    `<div class="chips">${chip('all', 'Everyone')}${chip('due', `Due soon (${docs.filter(d => isDueSoon(d, nextDue(d))).length})`)}${owners.map(o => chip(o, esc(o === S.me ? 'Me' : S.people[o].name))).join('')}</div>
    ${!docs.length ? `<p class="empty">Save insurance, licence, Aadhaar, PAN, passport and more, for you and your family. Uravu shows renewals before they\u2019re due.</p>`
      : !list.length ? `<p class="empty">Nothing here.</p>`
      : groups.map(([o, ds]) => `${o ? `<p class="subh" style="margin:14px 0 2px">${esc(o === S.me ? 'You' : S.people[o].name)}</p>` : ''}<div class="rows">${ds.map(d => docRow(d, !o)).join('')}</div>`).join('')}
    <button class="btn-p" data-act="doc-new" data-id="" style="margin-top:18px">＋ Add a document</button>
    <p class="hint-line" style="margin-top:18px;font-size:.84rem">${cloud.user ? (cloud.key ? 'Saved in your account, locked with your vault PIN.' : 'Set or enter your vault PIN in Settings › Account to save documents.') : 'Saved only on this phone, and included in your backup file.'} For Aadhaar, the last 4 digits are enough.</p>`;
}
function fieldRows(defs, f, reveal) {
  return defs.filter(([k]) => f[k] !== undefined && f[k] !== '').map(([k, label, kind]) => {
    let v = f[k];
    if (kind === 'date') v = fmtDate(v); else if (kind === 'money') v = money(v); else if (kind === 'num') v = v + (k === 'ncb' ? '%' : '');
    else if (SECRET_KEYS.includes(k) && !reveal) v = mask(v);
    return `<div class="kv"><span>${esc(label)}</span><b>${esc(v)}</b></div>`;
  }).join('');
}
function pgDoc(c) {
  const d = (S.docs || []).find(x => x.id === c.id); if (!d) return bar('Document') + `<p class="empty">This document was deleted.</p>`;
  const t = dt(d), lt = latestTerm(d), dues = dueList(d);
  const hasSecret = [...Object.entries(d.f), ...(lt ? Object.entries(lt.f) : [])].some(([k, v]) => SECRET_KEYS.includes(k) && String(v || '').length > 4);
  const terms = (d.terms || []).slice().sort((a, b) => String(b.f.from || b.f.to || '').localeCompare(String(a.f.from || a.f.to || '')));
  const vk = c.view ? fileKind(d, c.view) : '', vm = c.view ? (d.fileMeta || {})[c.view] || {} : {};
  const viewer = c.view ? `<div class="viewer" role="dialog" aria-label="${vk === 'pdf' ? 'PDF file' : 'Document photo'}">
    ${vk === 'pdf' ? `<div class="pdfcard"><span class="pdfic">PDF</span><b>${esc(vm.name || 'document.pdf')}</b><small>${vm.size ? fileSize(vm.size) : ''}</small><p>Save it to your phone to open it.</p></div>` : `<img data-photo="${esc(c.view)}" alt="Document photo">`}
    <div class="qbtns"><button class="btn-s p" data-act="file-save" data-id="${esc(c.view)}">⬇ Save to phone</button><button class="btn-s" data-act="photo-close">Close</button><button class="btn-s danger" data-act="photo-del" data-id="${esc(c.view)}">Delete</button></div></div>` : '';
  return bar(esc(t.label), `<button class="txt-btn" data-act="doc-edit" data-id="${esc(d.id)}">Edit</button>`) + `
    <div class="ph"><span class="docic xl">${t.icon}</span><h2>${esc(docTitle(d))}</h2>
      <button class="link-btn" data-act="person" data-id="${esc(d.owner)}" style="margin-top:2px">${esc(d.owner === S.me ? 'Yours' : ownerName(d) + '\u2019s')}</button></div>
    ${dues.map(x => `<section class="card due ${isDueSoon(d, x) ? 'soon' : ''}"><div class="due-top"><span><small>${esc(x.label)}</small><b>${fmtDate(x.date)}</b></span><span class="when">${dueWhen(x.days)}</span></div>
      <a class="btn-s cal" href="${gcalLink(d, x)}" target="_blank" rel="noopener">📅 Add reminder to Google Calendar</a></section>`).join('')}
    ${t.renew ? `<button class="btn-p" data-act="term-new" data-id="${esc(d.id)}" style="margin-top:14px">${terms.length ? '↻ Renewed? Add the new policy' : '＋ Add policy details'}</button>` : ''}
    <section class="card"><h3>Details</h3>${fieldRows(t.fields, d.f, c.reveal) || '<p class="muted" style="margin:0">No details yet.</p>'}
      ${lt ? `<p class="subh" style="margin:12px 0 4px">Current policy</p>${fieldRows(t.term, lt.f, c.reveal)}` : ''}
      ${hasSecret ? `<button class="link-btn" data-act="doc-reveal">${c.reveal ? 'Hide numbers' : 'Show full numbers'}</button>` : ''}
      ${d.note ? `<p class="prose" style="margin-top:10px">${esc(d.note)}</p>` : ''}</section>
    ${t.renew && terms.length ? `<section class="card"><h3>Every year</h3><div class="rows">${terms.map(tm => `<button class="r" data-act="term-edit" data-id="${esc(tm.id)}"><span class="cal"><b>${(tm.f.from || tm.f.to || '').slice(0, 4) || '?'}</b><small>${tm.f.to ? 'to ' + tm.f.to.slice(0, 4) : ''}</small></span><span class="tx"><span class="t1">${esc(tm.f.insurer || d.f.insurer || t.label)}</span><span class="t2">${esc([tm.f.premium ? money(tm.f.premium) : '', tm.f.to ? 'till ' + fmtDate(tm.f.to) : '', tm.f.ncb ? 'NCB ' + tm.f.ncb + '%' : ''].filter(Boolean).join(', '))}</span></span></button>`).join('')}</div></section>` : ''}
    <section class="card"><h3>Photos &amp; PDFs</h3>
      ${(d.photos || []).length ? `<div class="thumbs">${d.photos.map(pid => fileKind(d, pid) === 'pdf'
        ? `<button class="thumb pdf" data-act="photo-view" data-id="${esc(pid)}" aria-label="Open PDF ${esc((d.fileMeta[pid] || {}).name || '')}"><span class="pdfic">PDF</span><small>${esc((d.fileMeta[pid] || {}).name || 'document.pdf')}</small></button>`
        : `<button class="thumb" data-act="photo-view" data-id="${esc(pid)}" aria-label="Open photo"><img data-photo="${esc(pid)}" alt=""></button>`).join('')}</div>` : '<p class="muted" style="margin:0 0 6px">Add a photo of the card, or the policy PDF, so you have it handy.</p>'}
      <label class="link-btn" style="display:inline-block;cursor:pointer">＋ Add photo or PDF<input type="file" accept="image/*,application/pdf,.pdf" id="docPhotoIn" multiple hidden></label>
      <p class="hint-line" style="margin:6px 0 0;font-size:.82rem">${cloud.user ? 'Locked with your vault PIN and saved in your account.' : 'Files stay on this device only, and are included in your backup.'}</p></section>
    <button class="danger-txt" data-act="doc-del" data-id="${esc(d.id)}">Delete this document</button>${viewer}`;
}
function docInput(prefix, [k, label, kind = 'text', ph = ''], val) {
  const type = kind === 'date' ? 'date' : 'text', im = kind === 'money' || kind === 'num' ? ' inputmode="numeric"' : '';
  return `<label class="fld">${esc(label)}${kind === 'money' ? ' <span class="hint">₹</span>' : ''}<input name="${prefix}${k}" type="${type}"${im} value="${esc(val ?? '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
}
function pgDocEdit(c) {
  const d = c.id ? S.docs.find(x => x.id === c.id) : null, type = d ? d.type : c.type;
  if (!type) return bar('Add a document') + `<p class="subh">What kind of document?</p>
    <div class="relgrid">${Object.entries(DOC_TYPES).map(([k, t]) => `<button type="button" class="rc" data-act="doc-type" data-id="${k}"><b>${t.icon} ${esc(t.label)}</b><span class="ta">${esc(t.ta)}</span></button>`).join('')}</div>`;
  const t = DOC_TYPES[type], f = d ? d.f : {}, owner = d ? d.owner : (c.owner || S.me);
  return bar(d ? 'Edit ' + esc(t.label) : t.icon + ' ' + esc(t.label)) + `<div id="df">
    <div class="fld"><span>Whose document?</span>${personPicker('docOwner', owner, '', 'Whose document')}</div>
    ${t.fields.map(x => docInput('d_', x, f[x[0]])).join('')}
    ${!d && t.renew ? `<p class="subh" style="margin-top:22px">This year\u2019s policy</p>${t.term.map(x => docInput('t_', x, '')).join('')}` : ''}
    ${t.due.length ? `<div class="fld"><span>Remind me before it\u2019s due</span><div class="chips wrap">${[7, 15, 30, 60].map(n => `<button type="button" class="chip" data-act="pick" data-group="remind" data-id="${n}" aria-pressed="${remindOf(d || { type }) === n}">${n} days</button>`).join('')}</div><input type="hidden" id="f-remind" value="${remindOf(d || { type })}"></div>` : ''}
    <label class="fld">Name it <span class="hint">Optional, e.g. \u201cSwift insurance\u201d</span><input name="title" value="${esc(d?.title || '')}" autocomplete="off"></label>
    <label class="fld">Notes <span class="hint">Optional: agent name, branch, where the original is kept</span><textarea name="note">${esc(d?.note || '')}</textarea></label>
  </div><div class="savebar"><div class="in"><p class="err" id="err" hidden></p><button class="btn-p" data-act="doc-save">${d ? 'Save changes' : 'Save document'}</button></div></div>`;
}
function saveDoc() {
  const c = cur(), box = $('#df'), val = n => (box.querySelector(`[name="${n}"]`)?.value || '').trim();
  let d = c.id ? S.docs.find(x => x.id === c.id) : null; const type = d ? d.type : c.type, t = DOC_TYPES[type];
  const f = {}; t.fields.forEach(([k]) => { const v = val('d_' + k); if (v) f[k] = v; });
  if (f.vehicle) f.vehicle = f.vehicle.toUpperCase();
  const isNew = !d;
  if (isNew) { d = { id: uid(), type, f: {}, terms: [], photos: [] }; S.docs.push(d); }
  Object.assign(d, { owner: $('#docOwner').value || S.me, f, title: val('title'), note: val('note') });
  const r = $('#f-remind'); if (r) d.remind = Number(r.value);
  if (isNew && t.renew) { const tf = {}; t.term.forEach(([k]) => { const v = val('t_' + k); if (v) tf[k] = v; }); if (Object.keys(tf).length) d.terms.push({ id: uid(), f: tf }); }
  save(); ui.stack.pop(); if (isNew) { if (cur().p === 'docedit') ui.stack.pop(); ui.stack.push({ p:'doc', id:d.id }); }
  render(); window.scrollTo(0, 0); toast(isNew ? 'Document saved' : 'Saved');
}
function pgTerm(c) {
  const d = S.docs.find(x => x.id === c.doc), t = dt(d), tm = c.term ? d.terms.find(x => x.id === c.term) : null;
  let f = tm ? tm.f : {};
  if (!tm) { const lt = latestTerm(d); if (lt) { f = Object.assign({}, lt.f); if (lt.f.to) { f.from = addDays(lt.f.to, 1); f.to = addYears(lt.f.to, 1); } if (lt.f.tpTo && daysUntil(lt.f.tpTo) < 60) f.tpTo = addYears(lt.f.tpTo, 1); if (f.ncb !== undefined) f.ncb = ''; } }
  return bar(tm ? 'Edit policy year' : 'New policy') + `<div id="tf"><p class="hint-line">${esc(docTitle(d))}${!tm && latestTerm(d) ? '. Filled in from last year; change what\u2019s different.' : ''}</p>
    ${(t.term || []).map(x => docInput('t_', x, f[x[0]])).join('')}
    ${tm ? `<button class="danger-txt" data-act="term-del" data-id="${esc(tm.id)}">Delete this year</button>` : ''}
  </div><div class="savebar"><div class="in"><button class="btn-p" data-act="term-save">${tm ? 'Save changes' : 'Save new policy'}</button></div></div>`;
}
function saveTerm() {
  const c = cur(), d = S.docs.find(x => x.id === c.doc), t = dt(d), box = $('#tf');
  const f = {}; (t.term || []).forEach(([k]) => { const v = (box.querySelector(`[name="t_${k}"]`)?.value || '').trim(); if (v) f[k] = v; });
  if (c.term) d.terms.find(x => x.id === c.term).f = f; else d.terms.push({ id: uid(), f });
  save(); ui.stack.pop(); render(); toast(c.term ? 'Saved' : 'New policy saved. Reminders now follow the new dates.');
}
function docResults(q) {
  const hits = (S.docs || []).filter(d => { const t = dt(d), lt = latestTerm(d); return [t.label, t.ta, d.title, d.note, ...Object.values(d.f), ...(lt ? Object.values(lt.f) : []), ownerName(d)].some(v => v && String(v).toLowerCase().includes(q)); });
  return hits.length ? `<p class="subh" style="margin:10px 0 0">Documents</p>${hits.slice(0, 6).map(d => docRow(d, true)).join('')}<p class="subh" style="margin:12px 0 0">People</p>` : '';
}

/* ---------- Ask Uravu (AI) ---------- */
let aiAvailable = false, aiCtl = null; // AI switched off by choice
async function checkAI() {
  try { aiAvailable = !!(window.claude && await window.claude.use('sample')); } catch (e) { aiAvailable = false; }
  if (!aiAvailable && cur().p === 'home') rerender();
}
function aiContext() {
  const t = today(), lines = [];
  for (const p of Object.values(S.people)) {
    const k = kinOf(p.id), parts = [`name: ${p.name}`];
    if (p.tamilName) parts.push(`Tamil name: ${p.tamilName}`);
    if (p.nickname) parts.push(`nickname: ${p.nickname}`);
    parts.push(p.id === S.me ? 'THIS IS THE USER' : `relation to user: ${k.tl} (${k.custom || k.ta}), ${k.en}${k.desc ? '; ' + k.desc : ''}`);
    parts.push(`gender: ${p.gender === 'm' ? 'male' : p.gender === 'f' ? 'female' : 'unknown'}`, `circle: ${[p.circle, ...(p.also || [])].join(' + ')}`);
    if ((p.groups || []).length) parts.push(`groups: ${p.groups.join(', ')}`);
    if (p.dead) parts.push('PASSED AWAY (no longer alive)' + (p.dod ? ' on ' + fmtDate(p.dod) : '') + (p.dob ? ', born ' + fmtDate(p.dob) : ''));
    else if (p.dob) { const n = nextOcc(p.dob); parts.push(`birthday: ${fmtDate(p.dob)} (next one in ${n.days} days, turns ${n.years})`); }
    if ((p.likes || []).length) parts.push('likes: ' + p.likes.map(l => `${l.cat}: ${l.val}`).join('; '));
    if (p.metHow) parts.push(`how the user met them: ${p.metHow}`);
    if (p.notes) parts.push(`notes: ${p.notes}`);
    lines.push('- ' + parts.join(' | '));
  }
  const ev = S.events.map(e => {
    const n = e.yearly ? nextOcc(e.on) : null;
    return `- ${e.title} | ${fmtDate(e.on)} | ${e.yearly ? `every year, next in ${n.days} days (${n.years} years)` : 'one-time'} | people: ${e.people.map(id => S.people[id]?.name).filter(Boolean).join(', ')}${e.note ? ' | note: ' + e.note : ''}`;
  });
  const docs = (S.docs || []).map(d => { const lt = latestTerm(d); return `- ${dt(d).label} of ${ownerName(d) === 'You' ? 'the user' : ownerName(d)}${d.f.vehicle ? ' for vehicle ' + d.f.vehicle : ''}${d.f.model ? ' (' + d.f.model + ')' : ''}${(lt?.f.insurer || d.f.insurer) ? ' | insurer: ' + (lt?.f.insurer || d.f.insurer) : ''}${lt?.f.premium ? ' | premium: ₹' + lt.f.premium : ''} | ${dueList(d).map(x => `${x.label} due ${fmtDate(x.date)} (${x.days < 0 ? 'overdue by ' + -x.days + ' days' : 'in ' + x.days + ' days'})`).join('; ') || 'no expiry'}`; });
  return `Today is ${t.toDateString()}.\n\nPEOPLE:\n${lines.join('\n')}\n\nDATES:\n${ev.join('\n') || '(none)'}\n\nDOCUMENTS (numbers are private and not included):\n${docs.join('\n') || '(none)'}`;
}
function aiErr(code) {
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) return 'AI isn’t allowed here. Normal search still works.';
  if (code === 'rate_limited') return 'Too many questions right now. Try again in a minute.';
  if (code === 'session_expired') return 'Please sign in to Claude again, then try.';
  if (code === 'refused' || code === 'empty_completion') return 'Couldn’t answer that. Try asking it a different way.';
  if (code === 'prompt_too_large') return 'You have too many people saved for one question. Ask about fewer people.';
  if (code === 'cancelled') return '';
  return 'Something went wrong. Try again.';
}
const cleanAns = t => String(t || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
async function askAI(question) {
  const c = cur(); question = (question || '').trim();
  if (c.p !== 'ask' || !question) return;
  Object.assign(c, { q: question, answer: '', status: 'thinking', err: '' }); rerender();
  const sample = window.claude ? await window.claude.use('sample').catch(() => null) : null;
  if (!sample) { Object.assign(c, { status: 'error', err: 'AI isn’t available in this view. Normal search still works.' }); if (cur() === c) rerender(); return; }
  aiCtl?.abort(); const ctl = aiCtl = new AbortController();
  const prompt = `You are the helper inside "Uravu", an app where the user keeps their family, friends, colleagues and people they met. Answer the user's question using ONLY the saved data below.
Rules:
- Be brief and warm: 1 to 5 short sentences, or a short plain list with "- ".
- Mention people by name; for family add the Tamil term in brackets, e.g. "Murugan (Periyappa)".
- If the data does not contain the answer, say so plainly and suggest what the user could add.
- Reply in the same language as the question (Tamil or English).
- Never invent facts. No markdown headings or bold.

${aiContext()}

QUESTION: ${question}`;
  try {
    const { text } = await sample(prompt, { modelTier: 'quick', signal: ctl.signal, onText: ({ text }) => { c.answer = text; const el = $('#ans'); if (el && cur() === c) el.textContent = cleanAns(text); } });
    Object.assign(c, { answer: text, status: 'done' });
  } catch (e) {
    Object.assign(c, { answer: e.text || '', status: e.code === 'cancelled' ? 'done' : 'error', err: aiErr(e.code) });
  }
  if (cur() === c) rerender();
}
function aiSuggestions() {
  const ps = Object.values(S.people).filter(p => p.id !== S.me);
  const amma = ps.find(p => kinOf(p.id).tl === 'Amma'), liked = ps.find(p => (p.likes || []).length);
  const out = ['Whose birthdays are coming up this month?'];
  if (amma) out.push(`அம்மாவுக்கு என்ன பிடிக்கும்?`);
  if (liked) out.push(`Suggest a birthday gift for ${liked.name}`);
  out.push('Who did I meet recently and where?', 'Which friends work in the same office as me?');
  return out.slice(0, 5);
}
function pgAsk(c) {
  const mentioned = c.status === 'done' && c.answer ? Object.values(S.people).filter(p => p.id !== S.me && p.name.length >= 3 && c.answer.toLowerCase().includes(p.name.toLowerCase())).slice(0, 8) : [];
  const ans = c.status ? `<section class="card"><h3>${esc(c.q)}</h3>
      <p class="ans" id="ans" aria-live="polite">${esc(cleanAns(c.answer)) || (c.status === 'thinking' ? 'Thinking…' : '')}</p>
      ${c.status === 'thinking' ? `<button class="btn-s" data-act="ask-stop">Stop</button>` : ''}
      ${c.status === 'error' && c.err ? `<p class="err" style="text-align:left;margin-top:8px">${esc(c.err)}</p>` : ''}
      ${mentioned.length ? `<div class="hs" style="margin-top:12px">${mentioned.map(p => pplItem(p)).join('')}</div>` : ''}</section>` : '';
  return bar('Ask Uravu') + `
    <div class="askbox"><textarea id="askIn" rows="2" placeholder="Ask in Tamil or English, e.g. What does Amma like?" aria-label="Your question">${esc(c.status ? '' : c.q || '')}</textarea>
      <button class="btn-p" data-act="ask-go" ${c.status === 'thinking' ? 'disabled' : ''}>Ask</button></div>
    ${ans}
    <p class="subh" style="margin-top:20px">Try asking</p>
    <div class="chips wrap">${aiSuggestions().map(s => `<button class="chip" data-act="ask-sugg" data-id="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <p class="hint-line" style="margin-top:22px;font-size:.84rem">To answer, your saved details (names, relations, dates, likes, notes, document types and due dates) are sent to Claude. Phone numbers, document numbers and photos are not sent. Each question uses your own Claude usage.</p>`;
}

/* ---------- backup ---------- */
async function doBackup() {
  const when = new Date().toISOString();
  let photos = {}; try { photos = await IDB.all(); } catch (e) {}
  const data = JSON.stringify({ app: 'uravu', version: 1, savedAt: when, data: S, photos }, null, 1);
  try {
    saveFile(`uravu-backup-${when.slice(0, 10)}.json`, data, 'application/json');
    S.settings.lastBackup = when; save(); rerender(); toast('Backup saved to Downloads');
  } catch (e) { toast('Couldn’t save the backup here.'); }
}
function readRestore(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result), d = obj && obj.data ? obj.data : obj;
      if (!d || !d.people || !d.me || !d.people[d.me] || !Array.isArray(d.edges)) throw new Error('bad');
      cur().restore = { data: d, savedAt: obj.savedAt || '', count: Object.keys(d.people).length, photos: obj.photos || {} };
      rerender();
    } catch (e) { toast('That file isn’t an Uravu backup.'); }
  };
  r.readAsText(file);
}
const needsBackup = () => Object.keys(S.people).length > 5 && (!S.settings.lastBackup || (Date.now() - Date.parse(S.settings.lastBackup)) > 14 * 864e5);

/* ---------- bulk gender ---------- */
const noGender = () => Object.values(S.people).filter(p => !p.gender);
function pgGenders(c) {
  const missing = noGender(), f = c.f || (missing.length ? 'missing' : 'all');
  const list = (f === 'missing' ? missing : Object.values(S.people)).sort((a, b) => (a.id === S.me ? -1 : b.id === S.me ? 1 : a.name.localeCompare(b.name)));
  const chip = (id, label) => `<button class="chip" data-act="filter" data-id="${id}" aria-pressed="${f === id}">${label}</button>`;
  const row = p => `<div class="r gr"><button class="gmain" data-act="person" data-id="${esc(p.id)}" aria-label="Open ${esc(p.name)}’s profile">${avatar(p)}<span class="tx"><span class="t1">${esc(p.id === S.me ? p.name + ' (you)' : p.name)}</span><span class="t2">${termLine(kinOf(p.id))}</span></span></button>
    <div class="seg sm"><button data-act="set-gender" data-id="${esc(p.id)}" data-g="m" aria-pressed="${p.gender === 'm'}">Male</button><button data-act="set-gender" data-id="${esc(p.id)}" data-g="f" aria-pressed="${p.gender === 'f'}">Female</button></div></div>`;
  return bar('Gender for everyone') +
    `<p class="hint-line">Tap Male or Female. Each change saves straight away.</p>
    <div class="chips">${chip('missing', `Not set (${missing.length})`)}${chip('all', 'Everyone')}</div>
    ${missing.length ? `<button class="plain-btn" data-act="bulk-male" style="margin:0 0 12px">Set all ${missing.length} not set to Male</button>` : ''}
    <div class="rows">${list.length ? list.map(row).join('') : `<p class="empty">Everyone has a gender saved.</p>`}</div>`;
}

/* ---------- moi notebook ---------- */
// One line per person: moi they gave at my functions, moi I gave at theirs
function moiLedger() {
  const m = {}, row = k => m[k] || (m[k] = { got: 0, gave: 0 });
  for (const f of S.funcs || []) for (const g of f.guests || []) if (Number(g.moi) > 0) row(g.pid && S.people[g.pid] ? g.pid : 'n:' + (g.name || 'Guest')).got += Number(g.moi);
  for (const x of S.given || []) if (S.people[x.pid] && Number(x.amount) > 0) row(x.pid).gave += Number(x.amount);
  return Object.entries(m).map(([k, v]) => { const p = S.people[k] || null; return { k, p, name: p ? p.name : k.slice(2), got: v.got, gave: v.gave, diff: v.got - v.gave }; });
}
function moiForm(c) {
  if (!c.add) return `<div class="qbtns" style="margin-top:14px"><button class="btn-s p" data-act="moi-add">＋ Add moi</button></div>`;
  const got = c.add === 'got';
  const ppl = Object.values(S.people).filter(p => p.id !== S.me).sort((a, b) => a.name.localeCompare(b.name));
  if (!ppl.length) return `<div class="qlike" style="margin-top:14px"><p class="muted" style="margin:0">Add a person first, then you can save moi for them.</p><div class="qbtns"><button class="btn-s" data-act="moi-cancel">Close</button></div></div>`;
  const fl = (S.funcs || []).slice().sort((a, b) => String(b.on || '9').localeCompare(String(a.on || '9')));
  return `<div class="qlike" style="margin-top:14px">
    <div class="seg"><button type="button" data-act="moi-mode" data-id="got" aria-pressed="${got}">They gave me</button><button type="button" data-act="moi-mode" data-id="gave" aria-pressed="${!got}">I gave them</button></div>
    <div class="qrow" style="grid-template-columns:1fr;margin-top:8px"><select id="mnPerson" aria-label="Person"><option value="">Choose the person</option>${ppl.map(p => `<option value="${esc(p.id)}">${esc(p.name + (p.dead ? ' (passed away)' : ''))}</option>`).join('')}</select></div>
    <div id="mnGot"${got ? '' : ' hidden'}>${fl.length ? `<div class="qrow" style="grid-template-columns:1fr;margin-top:6px"><select id="mnFunc" aria-label="Your function">${fl.map(f => `<option value="${esc(f.id)}">${esc('At my ' + f.title + (f.on ? ', ' + fmtDate(f.on) : ''))}</option>`).join('')}</select></div><p class="hint-line" style="margin:6px 0 0;font-size:.84rem">If they aren\u2019t on that guest list, they\u2019ll be added to it.</p>` : `<p class="muted" style="margin:8px 0 0">You haven\u2019t planned a function yet. <button class="link-btn" data-act="func-new" style="margin:0">Plan a function</button></p>`}</div>
    <div id="mnGave"${got ? ' hidden' : ''}><div class="qrow" style="grid-template-columns:1.4fr 1fr;margin-top:6px"><input id="mnTitle" placeholder="Their function, e.g. Wedding" aria-label="Their function" autocomplete="off"><input type="date" id="mnDate" aria-label="Date of their function"></div></div>
    <div class="qrow" style="grid-template-columns:1fr;margin-top:6px"><input id="mnAmt" inputmode="numeric" placeholder="Amount ₹" aria-label="Amount in rupees" autocomplete="off"></div>
    <div class="qbtns"><button class="btn-s p" data-act="moi-save">Save</button><button class="btn-s" data-act="moi-cancel">Cancel</button></div></div>`;
}
function pgMoi(c) {
  const L = moiLedger(), f = c.f || 'all';
  const got = L.reduce((a, x) => a + x.got, 0), gave = L.reduce((a, x) => a + x.gave, 0);
  const owe = L.filter(x => x.diff > 0), ahead = L.filter(x => x.diff < 0);
  const list = (f === 'owe' ? owe : f === 'ahead' ? ahead : L).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name));
  const chip = (id, label) => `<button class="chip" data-act="filter" data-id="${id}" aria-pressed="${f === id}">${label}</button>`;
  const row = x => {
    const more = x.diff > 0 ? `They gave ${money(x.diff)} more` : x.diff < 0 ? `You gave ${money(-x.diff)} more` : 'Even';
    const inner = `${x.p ? avatar(x.p) : `<span class="av" style="--h:#44505C" aria-hidden="true">${esc((x.name || '?')[0].toUpperCase())}</span>`}<span class="tx"><span class="t1">${esc(x.name)}</span><span class="t2">${esc(`They gave ${money(x.got)}, you gave ${money(x.gave)}`)}</span><span class="t2" style="font-weight:700;color:var(--ink)">${esc(more)}</span></span>`;
    return x.p ? `<button class="r" data-act="person" data-id="${esc(x.k)}">${inner}</button>` : `<div class="r gr">${inner}</div>`;
  };
  return bar('Moi notebook') +
    `<div class="stats" style="grid-template-columns:repeat(3,1fr);margin-top:4px"><div><b style="font-size:1.1rem">${esc(money(got))}</b><span>You received</span></div><div><b style="font-size:1.1rem">${esc(money(gave))}</b><span>You gave</span></div><div><b style="font-size:1.1rem">${esc(money(Math.abs(got - gave)))}</b><span>${got >= gave ? 'More received' : 'More given'}</span></div></div>
    ${moiForm(c)}
    ${L.length ? `<div class="chips" style="margin-top:14px">${chip('all', `Everyone (${L.length})`)}${chip('owe', `They gave more (${owe.length})`)}${chip('ahead', `You gave more (${ahead.length})`)}</div>
      <div class="rows">${list.length ? list.map(row).join('') : `<p class="empty">No one in this list.</p>`}</div>
      <p class="hint-line" style="margin-top:12px;font-size:.84rem">Tap a person to add or change their moi. \u201cThey gave more\u201d is a quick list of who to return moi to at their next function.</p>`
      : `<p class="empty" style="margin-top:14px">No moi saved yet. Enter moi received in a function\u2019s guest list, or open a person and tap <b>＋ Moi I gave at their function</b>.</p>`}`;
}

/* ---------- bulk alive / passed away ---------- */
const deadPeople = () => Object.values(S.people).filter(p => p.dead);
function dropFromGuests(id) {
  let dropped = 0;
  for (const fn of S.funcs || []) if (!fn.on || daysUntil(fn.on) >= 0) { const n = (fn.guests || []).length; fn.guests = (fn.guests || []).filter(g => g.pid !== id || g.moi); dropped += n - fn.guests.length; }
  return dropped;
}
function pgLiving(c) {
  const dead = deadPeople(), f = c.f || 'all';
  const list = (f === 'dead' ? dead : Object.values(S.people).filter(p => p.id !== S.me)).sort((a, b) => a.name.localeCompare(b.name));
  const chip = (id, label) => `<button class="chip" data-act="filter" data-id="${id}" aria-pressed="${f === id}">${label}</button>`;
  const row = p => `<div class="r gr"><button class="gmain" data-act="person" data-id="${esc(p.id)}" aria-label="Open ${esc(p.name)}’s profile">${avatar(p)}<span class="tx"><span class="t1">${esc(p.name)}</span><span class="t2">${termLine(kinOf(p.id))}</span></span></button>
    <div class="seg sm"><button data-act="set-dead" data-id="${esc(p.id)}" data-v="" aria-pressed="${!p.dead}">Alive</button><button data-act="set-dead" data-id="${esc(p.id)}" data-v="1" aria-pressed="${!!p.dead}">Passed away</button></div></div>`;
  return bar('Alive or passed away') +
    `<p class="hint-line">Tap Passed away for anyone who is no more. Each change saves straight away. They won\u2019t be suggested as guests for functions. To add the date, open the person and tap Edit.</p>
    <div class="chips">${chip('all', 'Everyone')}${chip('dead', `Passed away (${dead.length})`)}</div>
    <div class="rows">${list.length ? list.map(row).join('') : `<p class="empty">${f === 'dead' ? 'No one is marked as passed away.' : 'No people saved yet.'}</p>`}</div>`;
}

