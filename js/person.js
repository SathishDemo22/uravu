/* Uravu – person page, quick edits, person and event forms */
/* ---------- person page ---------- */
function relOfOther(e, id) {
  if (e.type === 'social') return [e.a === id ? e.b : e.a, e.kind];
  if (e.type === 'parent') {
    if (e.parent === id) return [e.child, gTok(S.people[e.child], 'child')];
    return [e.parent, gTok(S.people[e.parent], 'parent')];
  }
  if (e.type === 'spouse') { const o = e.a === id ? e.b : e.a; return [o, gTok(S.people[o], 'spouse')]; }
  const o = e.a === id ? e.b : e.a; return [o, sibTok(id, o)];
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const directLinks = id => S.edges.filter(e => [e.child, e.parent, e.a, e.b].includes(id))
  .map(e => { const [o, tok] = relOfOther(e, id); return { e, o, word: cap(SOCIAL[tok] ? SOCIAL[tok][2] : (WORDS[tok] || 'relative')) }; }).filter(x => S.people[x.o]);
function phoneLinks(p) {
  const tel = p.phone.replace(/[^\d+]/g, '');
  let wa = tel.replace(/\D/g, '');
  if (wa.length === 10) wa = '91' + wa; // assume India when no country code
  return { tel, wa };
}
function socialCard(id) {
  if (id === S.me) return '';
  const p = S.people[id], items = socialEdges(id).map(([o, kind]) => ({ o, kind }));
  const mine = [...(knownDirectly(id) ? [p.circle] : []), ...(p.also || [])].filter((k, i, a) => SOCIAL[k] && a.indexOf(k) === i);
  if (mine.length) items.unshift({ o: S.me, kinds: mine });
  if (!items.length) return '';
  const word = { friend:'Friend', colleague:'Colleague', acquaintance:'Met' };
  return `<section class="card"><h3>${esc(p.name)}’s friends &amp; contacts</h3><div class="hs">${items.map(x => `<button class="ppl" data-act="person" data-id="${esc(x.o)}">${avatar(S.people[x.o])}<span class="nm">${esc(x.o === S.me ? 'You' : S.people[x.o].name)}</span><span class="rw">${(x.kinds || [x.kind]).map(k => word[k] || '').join(' & ')}</span></button>`).join('')}</div></section>`;
}
/* ---------- quick notes and dates, right on the person page ---------- */
function textCard(id, c, field, title, ph) {
  const v = S.people[id][field] || '';
  let body;
  if (c.qt === field) body = `<div class="qlike" style="margin-top:0"><textarea id="qtIn" class="qta" rows="3" placeholder="${esc(ph)}" aria-label="${esc(title)}">${esc(v)}</textarea>
    <div class="qbtns"><button class="btn-s p" data-act="qt-save" data-id="${field}">Save</button><button class="btn-s" data-act="qt-cancel">Cancel</button></div></div>`;
  else if (v) body = `<button class="qt-view" data-act="qt-open" data-id="${field}"><span class="prose">${esc(v)}</span><span class="qt-edit">Tap to change</span></button>`;
  else body = `<button class="link-btn" data-act="qt-open" data-id="${field}" style="margin:0">＋ Add ${title.toLowerCase()}</button>`;
  return `<section class="card" id="qt-${field}"><h3>${title}</h3>${body}</section>`;
}
function quickDate(id, c) {
  const p = S.people[id], k = c.qd;
  if (!k) return `<div class="chips wrap" style="margin-top:10px">${!p.dob ? `<button class="chip" data-act="qd-open" data-id="birthday">🎂 Add birthday</button>` : ''}<button class="chip" data-act="qd-open" data-id="anniversary">💍 Anniversary</button><button class="chip" data-act="qd-open" data-id="milestone">⭐ Special moment</button></div>`;
  const sp = spouseOf(id);
  const hint = k === 'anniversary' && sp ? `<p class="hint-line" style="margin:8px 0 0;font-size:.84rem">Saved for ${esc(p.name)} and ${esc(sp === S.me ? 'you' : S.people[sp].name)}.</p>` : '';
  return `<div class="qlike">
    <div class="qrow" style="grid-template-columns:${k === 'birthday' ? '1fr' : '1.4fr 1fr'}">${k !== 'birthday' ? `<input id="qdTitle" value="${k === 'anniversary' ? 'Wedding anniversary' : ''}" placeholder="${k === 'anniversary' ? 'Wedding anniversary' : 'e.g. First day at work'}" aria-label="What is it">` : ''}<input type="date" id="qdDate" aria-label="Date"></div>
    ${k !== 'birthday' ? `<label class="switch" style="margin-top:10px;font-size:.9rem">Remember every year<input type="checkbox" id="qdYearly" ${k === 'anniversary' ? 'checked' : ''}></label>` : ''}${hint}
    <div class="qbtns"><button class="btn-s p" data-act="qd-save">Save</button><button class="btn-s" data-act="qd-cancel">Cancel</button>${k !== 'birthday' ? `<button class="btn-s" data-act="event-new" data-id="${esc(id)}">More options</button>` : ''}</div></div>`;
}
function qdSave() {
  const c = cur(), id = c.id, p = S.people[id], k = c.qd, on = $('#qdDate').value;
  if (!on) { $('#qdDate').focus(); toast('Pick a date first'); return; }
  if (k === 'birthday') { p.dob = on; toast('Birthday saved'); }
  else {
    const title = $('#qdTitle').value.trim() || (k === 'anniversary' ? 'Wedding anniversary' : 'Special moment');
    const people = [id]; const sp = spouseOf(id); if (k === 'anniversary' && sp) people.push(sp);
    S.events.push({ id: uid(), title, type: k, on, yearly: $('#qdYearly').checked, people, remind: k === 'anniversary' ? 7 : 1, note: '' });
    toast('Date saved');
  }
  delete c.qd; save(); rerender();
}

/* ---------- name, photo and details, changed right on the person page ---------- */
// Tap the photo to pick a new one (it goes through the adjuster and saves straight away); tap the name to change it.
function headCard(id, c) {
  const p = S.people[id], isMe = id === S.me;
  const photo = `<label class="ph-photo" aria-label="${p.photo ? 'Change photo' : 'Add a photo'}">${avatar(p, 'xl')}<span class="cam">${ICON.camera}</span><input type="file" accept="image/*" id="photoIn" hidden></label>`;
  if (c.qh) return `<div class="ph">${photo}<div class="qlike ph-edit">
    <label class="fld" style="margin-top:0">Name<input id="qhName" value="${esc(p.name)}" autocomplete="off" placeholder="Their name"></label>
    <label class="fld">Name in Tamil <span class="hint">Optional</span><input id="qhTa" value="${esc(p.tamilName)}" class="ta" autocomplete="off"></label>
    <label class="fld">Nickname <span class="hint">Optional</span><input id="qhNick" value="${esc(p.nickname)}" autocomplete="off"></label>
    <div class="qbtns"><button class="btn-s p" data-act="qh-save">Save</button><button class="btn-s" data-act="qh-cancel">Cancel</button>${p.photo ? `<button class="btn-s danger" data-act="photo-clear" data-id="${esc(id)}">Remove photo</button>` : ''}</div></div></div>`;
  return `<div class="ph">${photo}<h2><button class="ph-name" data-act="qh-open" aria-label="Change name: ${esc(p.name)}">${esc(p.name)}${isMe ? ' (you)' : ''}<span class="pen" aria-hidden="true">${ICON.edit}</span></button></h2>${p.dead ? `<div class="alt">${esc(lifeTxt(p))}</div>` : ''}
      ${p.tamilName || p.nickname ? `<div class="alt">${[p.tamilName ? `<span class="ta">${esc(p.tamilName)}</span>` : '', p.nickname ? `“${esc(p.nickname)}”` : ''].filter(Boolean).join(', ')}</div>` : ''}</div>`;
}
function qhSave() {
  const c = cur(), p = S.people[c.id], name = $('#qhName').value.trim();
  if (!name) { $('#qhName').focus(); toast('Add a name to save.'); return; }
  Object.assign(p, { name, tamilName: $('#qhTa').value.trim(), nickname: $('#qhNick').value.trim() });
  delete c.qh; save(); rerender(); toast('Saved');
}
// One detail: shows the value, tap to change it in place
const QF = {
  dob: ['Birthday', 'date', ''], dod: ['Date they passed away', 'date', ''], phone: ['Phone', 'tel', 'For call and WhatsApp'],
  callAs: ['What you call them', 'text', 'Your own word, e.g. சின்ன மாமா'], groups: ['Groups', 'text', 'Separate with commas, like College gang, Office team'],
};
function fieldRow(id, c, f) {
  const p = S.people[id], [label, type, ph] = QF[f];
  const v = f === 'groups' ? (p.groups || []).join(', ') : p[f] || '';
  if (c.qf === f) return `<div class="ab-row ed"><label class="ab-l" for="qfIn">${label}</label><div class="qlike" style="margin-top:6px">
    <input id="qfIn" class="qin${f === 'callAs' ? ' ta' : ''}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off">
    <div class="qbtns"><button class="btn-s p" data-act="qf-save">Save</button><button class="btn-s" data-act="qf-cancel">Cancel</button></div>
    ${f === 'phone' ? `<div class="ct-row">${contactBtn()}</div>` : ''}</div></div>`;
  const shown = type === 'date' && v ? fmtDate(v) : v;
  return `<button class="ab-row" data-act="qf-open" data-id="${f}"><span class="ab-l">${label}</span>${shown ? `<span class="ab-v">${esc(shown)}</span>` : `<span class="ab-v add">＋ Add</span>`}<span class="pen" aria-hidden="true">${ICON.edit}</span></button>`;
}
function qfSave() {
  const c = cur(), p = S.people[c.id], f = c.qf, v = $('#qfIn').value.trim();
  if (f === 'groups') p.groups = v.split(',').map(x => x.trim()).filter(Boolean); else p[f] = v;
  delete c.qf; save(); rerender(); toast('Saved');
}
function aboutCard(id, c) {
  const p = S.people[id], isMe = id === S.me;
  const sb = (act, attrs, on, l) => `<button data-act="${act}" data-id="${esc(id)}" ${attrs} aria-pressed="${on}">${l}</button>`;
  const segRow = (label, btns) => `<div class="ab-row"><span class="ab-l">${label}</span><div class="seg sm">${btns}</div></div>`;
  return `<section class="card" id="aboutCard"><h3>About ${isMe ? 'you' : esc(p.name)}</h3>
    ${segRow('Gender', sb('set-gender', 'data-g="m"', p.gender === 'm', 'Male') + sb('set-gender', 'data-g="f"', p.gender === 'f', 'Female'))}
    ${isMe ? '' : segRow('Alive or passed away', sb('set-dead', 'data-v=""', !p.dead, 'Alive') + sb('set-dead', 'data-v="1"', !!p.dead, 'Passed away'))}
    ${p.dead ? fieldRow(id, c, 'dod') : ''}
    ${fieldRow(id, c, 'dob')}
    ${fieldRow(id, c, 'phone')}
    ${isMe ? '' : segRow('Older or younger than you', sb('set-relage', 'data-v=""', !p.relAge, 'Not sure') + sb('set-relage', 'data-v="elder"', p.relAge === 'elder', 'Older') + sb('set-relage', 'data-v="younger"', p.relAge === 'younger', 'Younger'))}
    ${isMe ? '' : fieldRow(id, c, 'callAs')}
    ${fieldRow(id, c, 'groups')}
  </section>`;
}

/* ---------- quick likes, right on the person page ---------- */
function likesCard(id) {
  const p = S.people[id], likes = p.likes || [];
  return `<section class="card" id="likesCard"><h3>Likes</h3>
    ${likes.length ? `<div class="lk">${likes.map((l, i) => `<button class="lkb" data-act="qlike-edit" data-id="${i}" aria-label="Change ${esc(l.cat)}: ${esc(l.val)}"><small>${catIcon(l.cat)} ${esc(l.cat)}</small><b>${esc(l.val)}</b></button>`).join('')}</div>`
      : `<p class="muted" style="margin:0">What does ${esc(p.name)} love? Tap a category below.</p>`}
    <div id="qlike"></div>
    <div class="chips wrap" id="qlikeChips" style="margin-top:12px">${QUICK_CATS.map(c => `<button class="chip" data-act="qlike-open" data-id="${esc(c)}">${catIcon(c)} ${esc(c)}</button>`).join('')}<button class="chip" data-act="qlike-open" data-id="">＋ Other</button></div>
  </section>`;
}
function qlikeForm(cat, val, idx) {
  return `<div class="qlike" data-idx="${idx}">
    <div class="qrow"><input class="lc" list="qcats" value="${esc(cat)}" placeholder="Category" aria-label="Category">${valueField(cat, val)}</div>
    <datalist id="qcats">${CATS.map(c => `<option value="${esc(c[0])}">`).join('')}</datalist>
    <div class="qbtns"><button class="btn-s p" data-act="qlike-save">Save</button>${idx >= 0 ? `<button class="btn-s danger" data-act="qlike-del" data-id="${idx}">Remove</button>` : ''}<button class="btn-s" data-act="qlike-cancel">Cancel</button></div>
  </div>`;
}
function qlikeOpen(cat, val, idx) {
  $('#qlike').innerHTML = qlikeForm(cat, val, idx); $('#qlikeChips').hidden = true;
  $('#qlike ' + (cat ? '.lv' : '.lc')).focus();
}
function qlikeRefresh(msg) { $('#likesCard').outerHTML = likesCard(cur().id); if (msg) toast(msg); }
function qlikeSave() {
  const f = $('#qlike .qlike'); if (!f) return;
  const pv = f.querySelector('input.lv[data-pick]');
  if (pv && !resolvePick(pv)) { pv.focus(); showPick(pv); toast('Choose one from the list'); return; }
  const cat = f.querySelector('.lc').value.trim() || 'Other', val = f.querySelector('.lv').value.trim(), idx = Number(f.dataset.idx);
  if (!val) { f.querySelector('.lv').focus(); return; }
  const p = S.people[cur().id]; p.likes = p.likes || [];
  if (idx >= 0) p.likes[idx] = { cat, val }; else p.likes.push({ cat, val });
  save(); qlikeRefresh(idx >= 0 ? 'Saved' : `Added to ${p.name}’s likes`);
}
/* ---------- searchable person picker (used for “Related to”) ---------- */
// A hidden input keeps the chosen id (same id as the old dropdown), so existing “change” handling keeps working.
function personPicker(hid, value, exclude, label) {
  const p = S.people[value];
  return `<div class="ppick"><input type="hidden" id="${hid}" value="${esc(value)}">
    <button type="button" class="ppick-btn" data-act="ppick-open" data-id="${hid}" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}: ${esc(value === S.me ? 'Me' : p?.name || '')}">${p ? avatar(p, 'sm') : ''}<span class="ppick-name">${esc(value === S.me ? 'Me' : p?.name || 'Choose')}</span><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="ppick-dd" hidden data-for="${hid}" data-exclude="${esc(exclude || '')}"><input class="ppick-q" type="search" placeholder="Search names or உறவு" autocomplete="off" aria-label="Search names"><div class="ppick-list" role="listbox"></div></div></div>`;
}
function ppickList(dd) {
  const q = dd.querySelector('.ppick-q').value.trim().toLowerCase(), ex = dd.dataset.exclude, cur0 = $('#' + dd.dataset.for).value;
  const list = Object.values(S.people).filter(p => p.id !== ex).sort((a, b) => (a.id === S.me ? -1 : b.id === S.me ? 1 : a.name.localeCompare(b.name)))
    .filter(p => { if (!q) return true; const k = kinOf(p.id); return [p.name, p.tamilName, p.nickname, k.tl, k.ta, k.en, p.id === S.me ? 'me' : ''].some(x => x && String(x).toLowerCase().includes(q)); });
  dd.querySelector('.ppick-list').innerHTML = list.length ? list.slice(0, 60).map(p => `<button type="button" class="ppick-opt${p.id === cur0 ? ' on' : ''}" role="option" aria-selected="${p.id === cur0}" data-act="ppick-choose" data-id="${esc(p.id)}">${avatar(p, 'sm')}<span class="tx"><b>${esc(p.id === S.me ? 'Me (' + p.name + ')' : p.name)}</b><small>${p.id === S.me ? '' : termLine(kinOf(p.id))}</small></span></button>`).join('')
    : `<p class="muted" style="margin:8px 10px;font-size:.88rem">No one matches.</p>`;
}
function ppickClose() { document.querySelectorAll('.ppick-dd:not([hidden])').forEach(dd => { dd.hidden = true; dd.parentElement.querySelector('.ppick-btn').setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', e => { if (e.target.closest && !e.target.closest('.ppick')) ppickClose(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.ppick-dd:not([hidden])')) { e.stopImmediatePropagation(); ppickClose(); } }, true);

/* ---------- quick relationships, right on the person page ---------- */
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function relCard(id, c) {
  const p = S.people[id], isMe = id === S.me, links = directLinks(id);
  const whose = isMe ? 'Your' : esc(p.name) + '’s';
  const list = links.length ? `<div class="rows">${links.map(x => `<div class="rl"><button class="rl-main" data-act="person" data-id="${esc(x.o)}">${avatar(S.people[x.o])}<span class="tx"><span class="t1">${esc(x.o === S.me ? 'You' : S.people[x.o].name)}</span><span class="t2">${whose} ${esc(x.word.toLowerCase())}</span></span></button><button class="icon-btn" data-act="rel-rm" data-id="${esc(x.e.id)}" aria-label="Remove link to ${esc(S.people[x.o].name)}">${ICON.x}</button></div>`).join('')}</div>`
    : `<p class="muted" style="margin:0">No relationships saved yet.</p>`;
  const panel = c.qrel ? qrelPanel(id, c.qrel.to) : `<button class="link-btn" data-act="qrel-open">＋ Add a relationship</button>`;
  return `<section class="card" id="relCard"><h3>Relationships</h3>${list}${panel}</section>`;
}
function qrelPanel(id, to) {
  const p = S.people[id];
  return `<div class="qlike">
    <div class="relto" style="margin:0 0 10px;flex-wrap:wrap"><span>${id === S.me ? 'You are the' : esc(p.name) + ' is the'} … of</span>${personPicker('qrelTo', to, id, 'Of whom')}</div>
    <div class="relgrid" id="qrelgrid">${qrelChips(to)}</div>
    <p class="hint-line" style="margin:8px 0 0;font-size:.84rem">Each tap saves straight away. Pick another person above to add more.</p>
    <div class="qbtns"><button class="btn-s p" data-act="qrel-close">Done</button></div></div>`;
}
function qrelChips(to) {
  const toMe = to === S.me, nm = esc(S.people[to]?.name || '');
  const fam = relsFor(cur().id).map(([v, en, ta]) => hasRel(cur().id, v, to) ? `<button type="button" class="rc done" data-act="rel-already" data-id="${v}" aria-disabled="true"><b>${en}</b><span class="of">✓ Already linked</span></button>` : `<button type="button" class="rc" data-act="qrel-pick" data-id="${v}"><b>${en}</b>${toMe ? `<span class="ta">${ta}</span>` : `<span class="of">of ${nm}</span>`}</button>`).join('');
  const soc = OTHER_CIRCLES.filter(([v]) => v !== 'family').map(([v, en, ta]) => `<button type="button" class="rc" data-act="qrel-pick" data-id="${v}"><b>${v === 'acquaintance' && !toMe ? 'Met through' : en}</b>${toMe ? `<span class="ta">${ta}</span>` : `<span class="of">${v === 'acquaintance' ? nm : 'of ' + nm}</span>`}</button>`).join('');
  // a relative you can't link yet (no family path saved): keep them in the family circle
  const p = S.people[cur().id], rel = toMe && cur().id !== S.me && p.circle !== 'family' && !kinOf(p.id).family ? `<button type="button" class="rc" data-act="qrel-pick" data-id="family"><b>Other relative</b><span class="ta">உறவினர்</span></button>` : '';
  return fam + soc + rel;
}
function qrelPick(kind) {
  const id = cur().id, to = cur().qrel.to, p = S.people[id];
  if (!to || to === id) return;
  if (kind === 'family') { p.circle = 'family'; save(); rerender(); toast('Saved as a relative'); return; }
  if (SOCIAL[kind]) {
    if (to === S.me) {
      if (p.circle === kind) p.direct = true;   // same circle as who they came through: mark them as mine too
      else if (p.circle === 'family' && !pathTo(id)) p.circle = kind;
      else { p.also = p.also || []; p.also = p.also.includes(kind) ? p.also.filter(x => x !== kind) : [...p.also, kind]; }
    }
    else if (!hasEdge(e => e.type === 'social' && [e.a, e.b].includes(id) && [e.a, e.b].includes(to))) {
      const e = { id: uid(), type:'social', a:to, b:id, kind };
      if (p.circle === 'family' && !pathTo(id)) { e.pc = { who: id, c: p.circle }; p.circle = kind; }
      S.edges.push(e);
    }
  } else {
    const pr = linkProblem(id, kind, to, p.name); if (pr) { toast(pr); return; }
    const wasFamily = p.circle === 'family';
    addLink(id, kind, to);
    if (!wasFamily && p.circle !== 'family' && S.people[to].circle !== 'family') { /* keep their own circle */ }
  }
  save(); rerender();
  const label = SOCIAL[kind] ? (to === S.me ? `Now your ${SOCIAL[kind][2]}` : `Linked to ${S.people[to].name}`) : `${FAM_RELS.find(r => r[0] === kind)[1]} of ${to === S.me ? 'you' : S.people[to].name}`;
  toast(label);
}
function pgPerson(c) {
  const id = c.id, p = S.people[id], k = kinOf(id), isMe = id === S.me, lang = S.settings.lang;
  let call = '';
  if (!isMe) {
    const main = lang === 'en' ? k.en : (k.custom || k.ta);
    call = `<div class="call"><span class="lbl">${k.anchor ? 'Who they are' : 'You call them'}</span><span class="${lang === 'en' ? 'en-big' : 'ta-big'}">${esc(main)}</span>
      ${lang === 'both' ? `<span class="en">${esc(k.custom ? k.en : k.tl + ', ' + k.en)}</span>` : lang === 'ta' && !k.custom ? `<span class="en">${esc(k.tl)}</span>` : ''}
      ${k.desc ? `<span class="desc">${esc(k.desc)}</span>` : ''}${k.custom ? `<span class="desc">Standard term: ${esc(k.ta)} (${esc(k.tl)})</span>` : ''}</div>`;
  }
  const act = (a, ic, l) => `<button data-act="${a}" data-id="${esc(id)}"><span class="ic">${ic}</span>${l}</button>`;
  const acts = [];
  if (p.phone) {
    const { tel, wa } = phoneLinks(p);
    acts.push(`<a href="tel:${esc(tel)}"><span class="ic">${ICON.phone}</span>Call</a>`);
    acts.push(`<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><span class="ic">${ICON.chat}</span>WhatsApp</a>`);
  }
  acts.push(act('event-new', ICON.addDate, 'Add date'));
  acts.push(act('new', ICON.addPerson, 'Add person'));
  if (k.family || directLinks(id).some(x => x.e.type !== 'social')) acts.push(act('see-family', ICON.tree, isMe ? 'Family tree' : 'Their family'));
  if (!isMe) acts.push(act('connect-to', ICON.link, 'How connected'));

  const evs = S.events.filter(e => e.people.includes(id));
  const yearly = [];
  if (p.dead && p.dod) yearly.push(Object.assign({ kind:'memorial', title:'Remembrance day', on:p.dod, people:[id], remind:3 }, nextOcc(p.dod)));
  if (p.dob && !p.dead) yearly.push(Object.assign({ kind:'birthday', title:'Birthday', on:p.dob, people:[id], remind:7 }, nextOcc(p.dob)));
  evs.filter(e => e.yearly).forEach(e => yearly.push(Object.assign({ kind:e.type }, e, nextOcc(e.on))));
  yearly.sort((a, b) => a.days - b.days);
  const once = evs.filter(e => !e.yearly).sort((a, b) => b.on.localeCompare(a.on));
  // Close family: everyone within 2 links (so in-laws like a son-in-law show too), named from this person’s side
  const near = [];
  {
    const dist = { [id]: 0 }, q = [id];
    while (q.length) { const x = q.shift(); if (dist[x] >= 2) continue; for (const [y] of neighbors(x)) if (!(y in dist)) { dist[y] = dist[x] + 1; q.push(y); near.push(y); } }
    const saved = EGO;
    try { EGO = id; near.forEach((o, i) => { near[i] = { o, k: kinOf(o), d: dist[o] }; }); } finally { EGO = saved; }
    near.sort((a, b) => a.d - b.d || a.k.tk.join('.').localeCompare(b.k.tk.join('.')));
  }

  const sexBtn = (g, l) => `<button class="btn-s" data-act="set-gender" data-id="${esc(id)}" data-g="${g}">${l}</button>`;
  return bar('') + headCard(id, c) + `
    ${call}
    ${!p.gender ? `<div class="pov-note" style="margin-top:14px;text-align:center">${esc(p.name)}’s gender isn’t saved, so some Tamil words may be wrong.<div class="qbtns" style="justify-content:center">${sexBtn('m', 'Male')}${sexBtn('f', 'Female')}</div></div>` : ''}
    <div class="acts">${acts.join('')}</div>
    <section class="card"><h3>Important dates</h3>
      ${yearly.length || once.length ? `<div class="rows">${yearly.map(x => dateRow(x, x.kind === 'birthday' ? 'Birthday' : x.title, x.kind === 'birthday' ? 'dob' : x.kind === 'memorial' ? 'dod' : '')).join('')}${once.map(momentRow).join('')}</div>` : `<p class="muted" style="margin:0">No dates yet.</p>`}
      ${quickDate(id, c)}</section>
    ${aboutCard(id, c)}
    ${funcsCard(id, c)}
    ${likesCard(id)}
    ${docsCard(id)}
    ${relCard(id, c)}
    ${near.length ? `<section class="card"><h3>${isMe ? 'Your' : esc(p.name) + '’s'} close family</h3><p class="muted" style="margin:-4px 0 10px;font-size:.88rem">What ${isMe ? 'you call' : esc(p.name) + ' calls'} them</p><div class="hs">${near.map(x => `<button class="ppl" data-act="person" data-id="${esc(x.o)}">${avatar(S.people[x.o])}<span class="nm">${esc(x.o === S.me ? 'You' : S.people[x.o].name)}</span>${termSmall(x.k)}${S.settings.lang === 'both' ? `<span class="rw">${esc(x.k.en)}</span>` : ''}</button>`).join('')}</div></section>` : ''}
    ${socialCard(id)}
    ${isMe ? '' : textCard(id, c, 'metHow', 'How you met', 'Where or how did you meet? e.g. at Arjun’s wedding')}
    ${textCard(id, c, 'notes', 'Notes', 'Anything to remember: kids’ names, a promise, their favourite temple…')}
    ${isMe ? '' : `<button class="danger-txt" data-act="del-person" data-id="${esc(id)}">Delete ${esc(p.name)}</button>`}`;
}

/* ---------- person form ---------- */
const REL_GENDER = { father:'m', mother:'f', husband:'m', wife:'f', ebrother:'m', ybrother:'m', esister:'f', ysister:'f', son:'m', daughter:'f' };
// For someone already saved as male or female, only offer the relationships that fit (a man can’t be a Mother or Wife)
const relsFor = id => { const g = id && S.people[id] ? S.people[id].gender : ''; return FAM_RELS.filter(([v]) => !g || REL_GENDER[v] === g); };
const FAM_RELS = [['father','Father','அப்பா'],['mother','Mother','அம்மா'],['husband','Husband','கணவர்'],['wife','Wife','மனைவி'],
  ['ebrother','Elder brother','அண்ணா'],['ybrother','Younger brother','தம்பி'],['esister','Elder sister','அக்கா'],['ysister','Younger sister','தங்கை'],
  ['son','Son','மகன்'],['daughter','Daughter','மகள்']];
const OTHER_CIRCLES = [['friend','Friend','நண்பர்'],['colleague','Colleague','சக ஊழியர்'],['acquaintance','Someone I met','அறிமுகமானவர்'],['family','Other relative','உறவினர்']];
function otherChips(relTo, sel) {
  const toMe = relTo === S.me, nm = S.people[relTo]?.name || '';
  return OTHER_CIRCLES.map(([v, en, ta]) => {
    const on = toMe || v === 'family' ? String(sel || '').split(',').includes(v) : pendingLinks.some(l => l.social === v && l.to === relTo);
    return `<button type="button" class="rc" data-act="pick-circle" data-id="${v}" aria-pressed="${on}"><b>${en}</b>${toMe || v === 'family' ? `<span class="ta">${ta}</span>` : `<span class="of">of ${esc(nm)}</span>`}</button>`;
  }).join('');
}
// Is “id is the <rel> of <to>” already saved?
function hasRel(id, rel, to) {
  if (!id || !S.people[id]) return false;
  const g = S.people[id].gender, male = /father|son|husband|brother/.test(rel), sexOk = !g || (male ? g === 'm' : g === 'f');
  if (!sexOk) return false;
  if (rel === 'father' || rel === 'mother') return hasEdge(e => e.type === 'parent' && e.child === to && e.parent === id);
  if (rel === 'son' || rel === 'daughter') return hasEdge(e => e.type === 'parent' && e.child === id && e.parent === to);
  if (rel === 'husband' || rel === 'wife') return hasEdge(e => e.type === 'spouse' && [e.a, e.b].includes(id) && [e.a, e.b].includes(to));
  const elder = rel[0] === 'e' ? id : to;
  return hasEdge(e => e.type === 'sibling' && [e.a, e.b].includes(id) && [e.a, e.b].includes(to) && (!e.elder || e.elder === elder));
}
function relChips(relTo) {
  const toMe = relTo === S.me, nm = S.people[relTo]?.name || '', me = cur().id;
  return relsFor(me).map(([v, en, ta]) => {
    if (hasRel(me, v, relTo)) return `<button type="button" class="rc done" data-act="rel-already" data-id="${v}" aria-disabled="true"><b>${en}</b><span class="of">✓ Already linked</span></button>`;
    const on = pendingLinks.some(l => l.rel === v && l.to === relTo);
    return `<button type="button" class="rc" data-act="pick-rel" data-id="${v}" aria-pressed="${on}"><b>${en}</b>${toMe ? `<span class="ta">${ta}</span>` : `<span class="of">of ${esc(nm)}</span>`}</button>`;
  }).join('');
}
const likeRow = l => `<div class="like-row"><input class="lc" list="cats" placeholder="Category" value="${esc(l.cat)}" aria-label="Category">${valueField(l.cat, l.val)}<button type="button" data-act="like-rm" aria-label="Remove">${ICON.x}</button></div>`;
// The full form is only for adding someone new; everyone saved is changed right on their page.
function pgEdit(c) {
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  const relTo = c.relTo || S.me, preCircle = c.circle || '';
  const title = c.relTo && c.relTo !== S.me ? `Add someone linked to ${esc(S.people[c.relTo].name)}` : 'Add person';
  return bar(title) + `<div id="pf" data-id="">
    <input type="hidden" id="f-rel" value=""><input type="hidden" id="f-circle" value="${esc(preCircle)}">
    <div class="photo-pick"><label aria-label="Choose photo"><span id="photoPrev">${avatar(blankPerson('new', {}), 'xl')}</span><span class="cam">${ICON.camera}</span><input type="file" accept="image/*" id="photoIn" hidden></label></div>
    <div class="ct-row">${contactBtn()}</div>
    <label class="fld big">Name<input name="name" value="" autocomplete="off" placeholder="Their name"></label>
    <label class="fld">Name in Tamil <span class="hint">Optional</span><input name="tamilName" value="" class="ta" autocomplete="off"></label>
    <div class="fld"><span>Gender <span class="hint">Required, so the Tamil words come out right</span></span><div class="seg"><button type="button" data-act="pick-gender" data-id="m" aria-pressed="true">Male</button><button type="button" data-act="pick-gender" data-id="f" aria-pressed="false">Female</button></div><input type="hidden" name="gender" value="m"></div>
    <div class="deadf"><div class="fld"><span>Alive or passed away</span><div class="seg"><button type="button" data-act="pick-dead" data-id="" aria-pressed="true">Alive</button><button type="button" data-act="pick-dead" data-id="1" aria-pressed="false">Passed away</button></div><input type="hidden" name="dead" value=""></div><label class="fld dodfld">Date they passed away <span class="hint">Optional</span><input type="date" name="dod" value=""></label></div>
    <section class="who"><h3>Who are they?</h3>
      <div class="relto"><span>Related to</span>${personPicker('relTo', relTo, '', 'Related to')}</div>
      <div class="relgrid" id="relgrid">${relChips(relTo)}</div>
      <p class="hint-line" style="margin:8px 0 0;font-size:.84rem">Tap every relationship that applies. To link them to someone else too, change “Related to” and tap again.</p>
      <div id="pending"></div>
      <p class="subh">Not family</p>
      <div class="relgrid" id="othergrid">${otherChips(relTo, preCircle)}</div>
    </section>
    <div class="two"><label class="fld">Birthday<input type="date" name="dob" value=""></label>
      <label class="fld">Phone<input type="tel" name="phone" value="" placeholder="For call and WhatsApp" autocomplete="off"></label></div>
    <div class="fld"><span>Likes</span><div id="likesEdit"></div>
      <div class="chips wrap">${QUICK_CATS.map(cat => `<button type="button" class="chip" data-act="like-add" data-id="${esc(cat)}">${catIcon(cat)} ${esc(cat)}</button>`).join('')}<button type="button" class="chip" data-act="like-add" data-id="">＋ Other</button></div></div>
    <label class="fld">How or where you met <span class="hint">Helpful for friends and new people</span><textarea name="metHow"></textarea></label>
    <details class="more"><summary>More details</summary>
      <label class="fld">Nickname<input name="nickname" value="" autocomplete="off"></label>
      <div class="two"><label class="fld">Older or younger than you?<select name="relAge">${opt('', 'Not sure', true)}${opt('elder', 'Older')}${opt('younger', 'Younger')}</select></label></div>
      <label class="fld">What do you call them? <span class="hint">Only if your family uses a different word</span><input name="callAs" value="" placeholder="e.g. சின்ன மாமா" class="ta" autocomplete="off"></label>
      <label class="fld">Groups <span class="hint">Separate with commas, like College gang, Office team</span><input name="groups" value="" autocomplete="off"></label>
      <label class="fld">Notes<textarea name="notes"></textarea></label>
    </details>
    <datalist id="cats">${CATS.map(x => `<option value="${esc(x[0])}">`).join('')}</datalist>
  </div>
  <div class="savebar"><div class="in"><p class="err" id="err" hidden></p><button class="btn-p" data-act="save-person">Save person</button></div></div>`;
}
const hasEdge = fn => S.edges.some(fn);
// the husband/wife, only when there is exactly one – with two or more we can’t guess which one is meant
const spouseOf = id => { const s = spousesOf(id); return s.length === 1 ? s[0] : null; };
// Stops links that can’t be true: two fathers, being your own ancestor, marrying your own parent, and so on.
// Returns a message to show, or '' when the link is fine. `selfName` is used for someone not saved yet.
function linkProblem(id, rel, to, selfName) {
  const nm = x => x === S.me ? 'you' : x === id ? (selfName || S.people[x]?.name || 'This person') : S.people[x].name;
  const Pof = x => S.edges.filter(e => e.type === 'parent' && e.child === x).map(e => e.parent);
  const anc = (x, seen = new Set()) => { for (const p of Pof(x)) if (!seen.has(p)) { seen.add(p); anc(p, seen); } return seen; };
  const direct = (a, b) => S.edges.find(e => (e.type === 'parent' && ((e.child === a && e.parent === b) || (e.child === b && e.parent === a))) || ((e.type === 'spouse' || e.type === 'sibling') && [e.a, e.b].includes(a) && [e.a, e.b].includes(b)));
  if (id && id === to) return 'A person can’t be related to themselves.';
  const pg = id && S.people[id] ? S.people[id].gender : '';
  if (pg && REL_GENDER[rel] && REL_GENDER[rel] !== pg) return `${cap(nm(id))} ${id === S.me ? 'are' : 'is'} saved as ${pg === 'm' ? 'male' : 'female'}, so “${(FAM_RELS.find(r => r[0] === rel) || [0, rel])[1]}” doesn’t fit. Change the gender under About on their page first if it’s wrong.`;
  const isParent = rel === 'father' || rel === 'mother', isChild = rel === 'son' || rel === 'daughter';
  if (isParent || isChild) {
    const child = isParent ? to : id, parent = isParent ? id : to;
    if (child && Pof(child).includes(parent)) return '';
    if (child && parent && direct(child, parent)) return `${cap(nm(child))} and ${nm(parent)} are already linked in another way. Remove that link first.`;
    if (child && parent && (anc(parent).has(child) || parent === child)) return `${cap(nm(child))} is already an elder in ${nm(parent)}’s line, so ${nm(parent)} can’t be the parent.`;
    const g = isParent ? (rel === 'father' ? 'm' : 'f') : S.people[parent].gender, mine = child ? Pof(child) : [];
    const same = g && mine.find(p => S.people[p] && S.people[p].gender === g);
    if (same) return `${cap(nm(child))} already ${child === S.me ? 'have' : 'has'} a ${g === 'm' ? 'father' : 'mother'} saved: ${S.people[same].name}. Remove that link first if it’s wrong.`;
    if (mine.length >= 2) return `${cap(nm(child))} already ${child === S.me ? 'have' : 'has'} two parents saved.`;
    return '';
  }
  if (!id) return '';
  const ex = direct(id, to), wantSpouse = rel === 'husband' || rel === 'wife';
  if (ex && (ex.type === 'parent' || (ex.type === 'spouse') !== wantSpouse)) return `${cap(nm(id))} and ${nm(to)} are already linked in another way. Remove that link first.`;
  if (anc(id).has(to) || anc(to).has(id)) return `${cap(nm(id))} and ${nm(to)} are in the same direct line (parent, grandparent…), so they can’t be ${wantSpouse ? 'husband and wife' : 'brother or sister'}.`;
  return '';
}
// Changing someone’s gender must not leave a child with two fathers or two mothers
function genderProblem(id, g) {
  for (const e of S.edges.filter(x => x.type === 'parent' && x.parent === id)) {
    const other = S.edges.find(x => x.type === 'parent' && x.child === e.child && x.parent !== id && S.people[x.parent] && S.people[x.parent].gender === g);
    if (other) return `${S.people[id].name} is saved as a parent of ${S.people[e.child].name}, who already has a ${g === 'm' ? 'father' : 'mother'} (${S.people[other.parent].name}). Fix that link first.`;
  }
  return '';
}
function addLink(id, rel, to) {
  // g groups every link made by this one action; auto:true marks the extra links the app added on its own,
  // so removing the link you made also removes those (but removing an extra one leaves yours alone)
  const before = S.people[id].circle;
  const g = uid(), p = S.people[id], E = (o, auto) => S.edges.push(Object.assign({ id: uid(), g }, auto ? { auto: true } : {}, o));
  const gm = { father:'m', mother:'f', son:'m', daughter:'f', husband:'m', wife:'f', ebrother:'m', ybrother:'m', esister:'f', ysister:'f' };
  p.gender = gm[rel] || p.gender;
  if ((rel === 'wife' || rel === 'husband') && !S.people[to].gender) S.people[to].gender = rel === 'wife' ? 'm' : 'f';
  if (S.people[to].circle === 'family' || to === S.me) p.circle = 'family';
  if (rel === 'father' || rel === 'mother') {
    if (hasEdge(e => e.type === 'parent' && e.child === to && e.parent === id)) return;
    unblock(to, id); E({ type:'parent', child:to, parent:id });
    const other = S.edges.find(e => e.type === 'parent' && e.child === to && e.parent !== id && S.people[e.parent]?.gender !== p.gender);
    if (other && !spousesOf(id).length && !spousesOf(other.parent).length) E({ type:'spouse', a:id, b:other.parent }, true);
  } else if (rel === 'son' || rel === 'daughter') {
    unblock(id, to);
    if (!hasEdge(e => e.type === 'parent' && e.child === id && e.parent === to)) E({ type:'parent', child:id, parent:to });
    const sp = spouseOf(to);
    const spG = sp && S.people[sp].gender, mine = S.edges.filter(e => e.type === 'parent' && e.child === id).map(e => e.parent);
    if (sp && sp !== id && !isBlocked(id, sp) && !mine.includes(sp) && mine.length < 2 && !mine.some(x => x !== to && S.people[x] && S.people[x].gender === spG)) E({ type:'parent', child:id, parent:sp }, true);
  } else if (rel === 'husband' || rel === 'wife') {
    if (!hasEdge(e => e.type === 'spouse' && ((e.a === id && e.b === to) || (e.a === to && e.b === id)))) E({ type:'spouse', a:id, b:to });
    linkSpouseKids(g);
  } else if (!hasEdge(e => e.type === 'sibling' && ((e.a === id && e.b === to) || (e.a === to && e.b === id)))) {
    E({ type:'sibling', a:id, b:to, elder: rel[0] === 'e' ? id : to });
  }
  linkSiblingParents(g); linkSpouseKids(g);
  // remember the circle this link replaced, so removing the link can put it back
  if (p.circle !== before) S.edges.filter(e => e.g === g && !e.auto).forEach(e => { e.pc = { who: id, c: before }; });
}
// The link plus any extra links the app added automatically when it was made
function linkGroup(eid) {
  const e = S.edges.find(x => x.id === eid); if (!e) return [];
  if (e.auto || !e.g) return [e];
  return S.edges.filter(x => x.id === eid || (x.g === e.g && x.auto));
}
function removeLinks(grp) {
  const ids = new Set(grp.map(x => x.id));
  S.edges = S.edges.filter(e => !ids.has(e.id));
  S.blocked = S.blocked || [];
  for (const e of grp) {
    // block the link you chose to remove (not extras removed along with it), so the app never re-adds it
    if (e.type === 'parent' && (!e.auto || grp.length === 1) && !S.blocked.includes(e.child + '|' + e.parent)) S.blocked.push(e.child + '|' + e.parent);
    if (e.pc && S.people[e.pc.who] && !pathTo(e.pc.who)) S.people[e.pc.who].circle = e.pc.c;
  }
  kc = {};
}
function formErr(m, focusSel) { const er = $('#err'); er.textContent = m; er.hidden = false; if (focusSel) $(focusSel)?.focus(); }
function renderPending() {
  const el = $('#pending'); if (!el) return;
  const lbl = l => {
    const nm = l.to === S.me ? null : S.people[l.to].name;
    if (l.rel) { const en = FAM_RELS.find(r => r[0] === l.rel)[1]; return nm ? `${en} of ${nm}` : `Your ${en.toLowerCase()}`; }
    if (l.social === 'acquaintance') return `Met through ${nm}`;
    return `${OTHER_CIRCLES.find(r => r[0] === l.social)[1]} of ${nm}`;
  };
  el.innerHTML = pendingLinks.length ? `<p class="subh">Will be linked when you save</p><div class="chips wrap">${pendingLinks.map((l, i) => `<span class="pchip">${esc(lbl(l))}<button type="button" data-act="pending-rm" data-id="${i}" aria-label="Remove ${esc(lbl(l))}">${ICON.x}</button></span>`).join('')}</div>` : '';
  // keep the tiles in step: chosen ones stay highlighted
  const rt = $('#relTo');
  if (rt) { $('#relgrid').innerHTML = relChips(rt.value); const og = $('#othergrid'); if (og) og.innerHTML = otherChips(rt.value, $('#f-circle').value); }
}
function savePerson() {
  const f = $('#pf');
  const val = n => (f.querySelector(`[name="${n}"]`)?.value || '').trim();
  const name = val('name');
  if (!name) return formErr('Add a name to save.', '[name="name"]');
  if (!val('gender')) return formErr('Choose Male or Female to save.');
  const circ = $('#f-circle').value, circs = circ.split(',').filter(Boolean), links = pendingLinks;
  const famL = links.find(l => l.rel), socL = links.find(l => l.social);
  if (!links.length && !circ) return formErr('Choose who they are, like Father or Friend.');
  for (const l of links) if (l.rel) { const pr = linkProblem('', l.rel, l.to, name); if (pr) return formErr(pr); }
  const id = uid(); S.people[id] = blankPerson(id);
  const p = S.people[id];
  Object.assign(p, { name, tamilName:val('tamilName'), nickname:val('nickname'), gender:val('gender'), dob:val('dob'), phone:val('phone'),
    groups: val('groups').split(',').map(x => x.trim()).filter(Boolean), notes:val('notes'), relAge:val('relAge'), callAs:val('callAs'), metHow:val('metHow') });
  p.dead = val('dead') === '1'; p.dod = p.dead ? val('dod') : '';
  if (famL && (famL.to === S.me || S.people[famL.to].circle === 'family')) p.circle = 'family';
  else if (circs.length) p.circle = circs.includes('family') ? 'family' : circs[0];
  else if (famL) p.circle = S.people[famL.to].circle;
  else if (socL) p.circle = socL.social;
  p.also = circs.filter(x => x !== p.circle && SOCIAL[x]);
  p.direct = !!SOCIAL[p.circle] && circs.includes(p.circle);   // ticked Friend/Colleague/Met for me, not just inherited from who they came through
  if (pendingPhoto) p.photo = pendingPhoto;
  f.querySelectorAll('input.lv[data-pick]').forEach(resolvePick);
  p.likes = [...f.querySelectorAll('.like-row')].map(r => ({ cat:r.querySelector('.lc').value.trim() || 'Other', val:r.querySelector('.lv').value.trim() })).filter(l => l.val);
  for (const l of links) {
    if (l.rel) addLink(id, l.rel, l.to);
    else if (!hasEdge(e => e.type === 'social' && [e.a, e.b].includes(id) && [e.a, e.b].includes(l.to))) S.edges.push({ id: uid(), type:'social', a:l.to, b:id, kind:l.social });
  }
  save(); pendingPhoto = null; pendingLinks = [];
  ui.stack.pop(); ui.stack.push({ p:'person', id });
  render(); window.scrollTo(0, 0);
  toast(`Added ${p.name}`);
}
function readPhoto(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => photoCropOpen(img);
    img.onerror = () => toast('That photo couldn’t be opened. Try another one.');
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

/* ---------- name, number and photo from the phone's contacts ---------- */
// Android Chrome lets the app ask for one contact. Everywhere else (iPhone, computers) a contact card
// file (.vcf) is opened instead, so the button is a file picker there.
const contactPickOk = () => 'contacts' in navigator && typeof navigator.contacts.select === 'function';
function contactBtn() {
  if (contactPickOk()) return `<button type="button" class="chip" data-act="contact-pick">📇 From contacts</button><div id="ctTels"></div>`;
  return `<label class="chip ct-file">📇 From contact card<input type="file" accept=".vcf,text/vcard,text/x-vcard" id="vcfIn" hidden></label><div id="ctTels"></div>
    <p class="hint-line ct-hint">On iPhone: Contacts › the person › Share Contact › Save to Files, then pick it here.</p>`;
}
// Plain digits; Indian mobile numbers lose +91 / 0 so they match what people type (phoneLinks adds 91 back for WhatsApp)
function cleanTel(t) {
  const s = String(t || '').replace(/[^\d+]/g, '');
  const m = s.match(/^(?:\+91|0091|91|0)([6-9]\d{9})$/);   // mobiles only: landlines keep their 0 / +91
  return m ? m[1] : s;
}
async function pickContact() {
  const props = ['name', 'tel'];
  try { if ((await navigator.contacts.getProperties()).includes('icon')) props.push('icon'); } catch { /* older Chrome: name and number only */ }
  let got;
  try { got = await navigator.contacts.select(props, { multiple: false }); } catch { toast('Couldn’t open your contacts. Type the details instead.'); return; }
  const c = got && got[0]; if (!c) return;   // closed without choosing
  useContact({ name: (c.name || []).find(Boolean) || '', tels: (c.tel || []).map(cleanTel), photo: (c.icon || [])[0] || null });
}
function readVcf(inp) {
  const file = inp.files[0]; if (!file) return;
  file.text().then(t => {
    inp.value = '';   // so picking the same file again still works
    const ct = parseVcf(t);
    if (!ct.name && !ct.tels.length) { toast('No contact found in that file'); return; }
    useContact(ct);
  }, () => toast('That file couldn’t be opened.'));
}
// Reads the first contact in a vCard file (2.1, 3.0 or 4.0): name, phone numbers and an embedded photo
function parseVcf(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = { name: '', tels: [], photo: null };
  let inCard = false, n = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^BEGIN:VCARD$/i.test(line.trim())) { inCard = true; continue; }
    if (/^END:VCARD$/i.test(line.trim())) { if (inCard) break; continue; }
    if (!inCard) continue;
    const at = line.indexOf(':'); if (at < 0) continue;
    const params = line.slice(0, at).split(';'), key = params[0].replace(/^.*\./, '').toUpperCase(), P = params.slice(1).join(';').toUpperCase();
    if (/QUOTED-PRINTABLE/.test(P)) while (line.endsWith('=') && i + 1 < lines.length) line = line.slice(0, -1) + lines[++i];   // soft line breaks
    let v = line.slice(line.indexOf(':') + 1);
    if (/QUOTED-PRINTABLE/.test(P)) v = qpDecode(v, (P.match(/CHARSET=([\w-]+)/) || [0, 'utf-8'])[1]);
    const unesc = s => s.replace(/\\([,;\\nN])/g, (m0, c) => c === 'n' || c === 'N' ? ' ' : c).trim();
    if (key === 'FN') out.name = unesc(v);
    else if (key === 'N') { const [fam, giv, mid, pre, suf] = v.split(/(?<!\\);/).map(unesc); n = [pre, giv, mid, fam, suf].filter(Boolean).join(' '); }
    else if (key === 'TEL') out.tels.push(cleanTel(v.replace(/^tel:/i, '')));
    else if (key === 'PHOTO' && !out.photo) {
      const d = v.match(/^data:([^;,]+)?;base64,(.*)$/i), b64 = d ? d[2] : /ENCODING=(B|BASE64)\b/.test(P) ? v : '';
      if (b64) try {
        const bin = atob(b64.replace(/\s/g, '')), u = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
        out.photo = new Blob([u], { type: d && d[1] ? d[1] : 'image/jpeg' });
      } catch { /* a broken photo is skipped, the rest still comes through */ }
    }
  }
  if (!out.name) out.name = n;
  return out;
}
function qpDecode(s, charset) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(s.charCodeAt(i) & 0xff);
  }
  try { return new TextDecoder(charset).decode(new Uint8Array(bytes)); } catch { return new TextDecoder().decode(new Uint8Array(bytes)); }
}
// Fills the Add person form (name, number, photo) or the open Phone box on someone's page (number only)
function useContact(ct) {
  const form = $('#pf'), tels = [...new Set(ct.tels.filter(t => t.replace(/\D/g, '').length >= 5))];
  const telIn = form ? form.querySelector('[name="phone"]') : $('#qfIn'), self = form ? '' : cur().id;
  if (form && ct.name) form.querySelector('[name="name"]').value = ct.name;
  if (!tels.length) toast(form ? `${ct.name || 'That contact'} has no phone number saved` : 'That contact has no phone number');
  else if (tels.length === 1) telIn.value = tels[0];
  else $('#ctTels').innerHTML = `<p class="subh">Which number?</p><div class="chips wrap">${tels.map(t => `<button type="button" class="chip" data-act="contact-tel" data-id="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  if (form && ct.photo && !pendingPhoto) readPhoto(ct.photo);   // goes through the photo adjuster, as a picked photo does
  if (tels.length === 1 && !contactDup(tels[0], self)) toast(form ? `Filled in from ${ct.name || 'contacts'}` : 'Number filled in. Tap Save.');
}
function contactTel(t) {
  const i = $('#pf [name="phone"]') || $('#qfIn'); if (!i) return;
  i.value = t; $('#ctTels').innerHTML = ''; contactDup(t, $('#pf') ? '' : cur().id);
}
// Warns, without stopping you, when the number already belongs to someone saved
function contactDup(t, self) {
  const p = Object.values(S.people).find(x => x.id !== self && x.phone && cleanTel(x.phone) === t);
  if (p) toast(`This number is already saved for ${p.id === S.me ? 'you' : p.name}`);
  return !!p;
}

/* ---------- profile photo: preview and adjust before it is used ---------- */
// Drag to move, pinch / wheel / slider to zoom, ⟳ to turn. The circle shows exactly what is kept.
let photoCrop = null;
const CROP_OUT = 240;   // saved size, in pixels
function photoCropOpen(img) {
  // work from a copy no bigger than 1600px, so huge phone photos stay quick
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)), src = document.createElement('canvas');
  src.width = Math.round(img.width * k); src.height = Math.round(img.height * k);
  src.getContext('2d').drawImage(img, 0, 0, src.width, src.height);
  photoCropClose();
  const el = document.createElement('div');
  el.className = 'cropper'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Adjust photo');
  el.innerHTML = `<h2>Adjust photo</h2><p class="crop-hint">Drag to move · pinch or slide to zoom</p>
    <div class="crop-stage"><canvas></canvas><div class="crop-ring" aria-hidden="true"></div></div>
    <div class="crop-tools"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><span aria-hidden="true">＋</span>
      <button type="button" class="crop-rot" data-crop="rot" aria-label="Turn photo">⟳</button></div>
    <div class="qbtns"><button type="button" class="btn-s" data-crop="cancel">Cancel</button><button type="button" class="btn-s p" data-crop="use">Use photo</button></div>`;
  document.body.appendChild(el);
  const stage = el.querySelector('.crop-stage'), cv = el.querySelector('canvas'), zoomIn = el.querySelector('input');
  const c = photoCrop = { el, src, cv, zoomIn, z: 1, x: 0, y: 0, size: 0, ptrs: new Map(), pinch: null };
  const fit = () => {
    c.size = stage.clientWidth; const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = Math.round(c.size * dpr); cropDraw();
  };
  c.onResize = fit; window.addEventListener('resize', fit); fit();
  zoomIn.addEventListener('input', () => cropZoom(+zoomIn.value));
  stage.addEventListener('wheel', e => { e.preventDefault(); cropZoom(c.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); c.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.pinch = null; });
  stage.addEventListener('pointermove', e => {
    const p = c.ptrs.get(e.pointerId); if (!p) return;
    const nx = e.clientX, ny = e.clientY;
    if (c.ptrs.size === 1) { c.x += nx - p.x; c.y += ny - p.y; p.x = nx; p.y = ny; cropDraw(); return; }
    p.x = nx; p.y = ny;
    const [a, b] = [...c.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (c.pinch) cropZoom(c.pinch.z * d / c.pinch.d); else c.pinch = { d, z: c.z };
  });
  const up = e => { c.ptrs.delete(e.pointerId); c.pinch = null; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-crop]'); if (!b) return;
    if (b.dataset.crop === 'rot') cropRotate();
    else if (b.dataset.crop === 'use') cropUse();
    else photoCropClose();
  });
  el.querySelector('[data-crop="use"]').focus();
}
// scale at which the photo just covers the circle
const cropBase = c => c.size / Math.min(c.src.width, c.src.height);
function cropClamp(c) {
  const s = cropBase(c) * c.z, mx = Math.max(0, (c.src.width * s - c.size) / 2), my = Math.max(0, (c.src.height * s - c.size) / 2);
  c.x = Math.min(mx, Math.max(-mx, c.x)); c.y = Math.min(my, Math.max(-my, c.y));
}
function cropZoom(z) {
  const c = photoCrop; if (!c) return;
  z = Math.min(4, Math.max(1, z));
  const r = z / c.z; c.x *= r; c.y *= r; c.z = z;   // zoom about the middle
  c.zoomIn.value = z; cropDraw();
}
function cropPaint(ctx, c, out) {
  const k = out / c.size, s = cropBase(c) * c.z * k, w = c.src.width * s, h = c.src.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c.src, (out - w) / 2 + c.x * k, (out - h) / 2 + c.y * k, w, h);
}
function cropDraw() {
  const c = photoCrop; if (!c || !c.size) return;
  cropClamp(c);
  const ctx = c.cv.getContext('2d'); ctx.clearRect(0, 0, c.cv.width, c.cv.height); cropPaint(ctx, c, c.cv.width);
}
function cropRotate() {
  const c = photoCrop, r = document.createElement('canvas');
  r.width = c.src.height; r.height = c.src.width;
  const ctx = r.getContext('2d'); ctx.translate(r.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(c.src, 0, 0);
  const ox = c.x; c.x = -c.y; c.y = ox;   // turn the offset with the photo
  c.src = r; cropDraw();
}
function cropUse() {
  const c = photoCrop, out = document.createElement('canvas');
  out.width = out.height = CROP_OUT;
  cropPaint(out.getContext('2d'), c, CROP_OUT);
  const data = out.toDataURL('image/jpeg', 0.82), c0 = cur();
  photoCropClose();
  if ($('#pf')) { pendingPhoto = data; $('#photoPrev').innerHTML = `<span class="av xl"><img src="${data}" alt=""></span>`; }   // adding someone: kept until Save
  else if (c0.p === 'person' && S.people[c0.id]) { S.people[c0.id].photo = data; save(); rerender(); toast('Photo saved'); }
}
function photoCropClose() {
  const c = photoCrop; if (!c) return false;
  window.removeEventListener('resize', c.onResize); c.el.remove(); photoCrop = null;
  const inp = $('#photoIn'); if (inp) inp.value = '';   // so picking the same file again still opens the adjuster
  return true;
}

/* ---------- event form ---------- */
function pgEvent(c) {
  const eid = c.eid, e = eid ? S.events.find(x => x.id === eid) : { title:'', type:'milestone', on:'', yearly:true, people: c.preset ? [c.preset] : [], remind:3, note:'' };
  const pick = (group, v, l, cur) => `<button type="button" class="chip" data-act="pick" data-group="${group}" data-id="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`;
  const ppl = Object.values(S.people).sort((a, b) => (e.people.includes(b.id) - e.people.includes(a.id)) || (a.id === S.me ? -1 : b.id === S.me ? 1 : a.name.localeCompare(b.name)));
  return bar(eid ? 'Edit date' : 'Add date') + `<div id="ef" data-id="${esc(eid || '')}">
    <input type="hidden" id="f-type" value="${esc(e.type)}"><input type="hidden" id="f-remind" value="${esc(e.remind)}">
    <label class="fld big">What is it?<input name="title" value="${esc(e.title)}" placeholder="e.g. First called me “Appa”" autocomplete="off"></label>
    <div class="fld"><span>Type</span><div class="chips wrap">${pick('type', 'anniversary', 'Anniversary', e.type)}${pick('type', 'milestone', 'Milestone', e.type)}${pick('type', 'other', 'Other', e.type)}</div></div>
    <label class="fld">Date<input type="date" name="on" value="${esc(e.on)}"></label>
    <label class="switch">Remember it every year<input type="checkbox" name="yearly" ${e.yearly ? 'checked' : ''}></label>
    <div class="fld"><span>Remind me</span><div class="chips wrap">${[[0, 'On the day'], [1, '1 day before'], [3, '3 days before'], [7, '1 week before']].map(([v, l]) => pick('remind', v, l, e.remind)).join('')}</div></div>
    <div class="fld"><span>Who is it about?</span><input id="pfilter" placeholder="Search names" autocomplete="off" aria-label="Search names">
      <div class="pick">${ppl.map(p => `<label class="pk" data-name="${esc((p.name + ' ' + p.tamilName).toLowerCase())}"><input type="checkbox" value="${esc(p.id)}" ${e.people.includes(p.id) ? 'checked' : ''}>${avatar(p)}<span>${esc(p.id === S.me ? 'Me (' + p.name + ')' : p.name)}</span></label>`).join('')}</div></div>
    <label class="fld">Note <span class="hint">Optional</span><textarea name="note">${esc(e.note)}</textarea></label>
    ${eid ? `<button class="danger-txt" data-act="del-event" data-id="${esc(eid)}">Delete this date</button>` : ''}
  </div>
  <div class="savebar"><div class="in"><p class="err" id="err" hidden></p><button class="btn-p" data-act="save-event">${eid ? 'Save changes' : 'Save date'}</button></div></div>`;
}
function saveEvent() {
  const f = $('#ef'), eid = f.dataset.id;
  const val = n => (f.querySelector(`[name="${n}"]`)?.value || '').trim();
  const people = [...f.querySelectorAll('.pick input:checked')].map(i => i.value);
  if (!val('title')) return formErr('Add what it is to save.', '[name="title"]');
  if (!val('on')) return formErr('Pick a date to save.');
  if (!people.length) return formErr('Choose at least one person.');
  const data = { title:val('title'), type:$('#f-type').value, on:val('on'), yearly:f.querySelector('[name="yearly"]').checked, remind:Number($('#f-remind').value), note:val('note'), people };
  if (eid) Object.assign(S.events.find(x => x.id === eid), data); else S.events.push(Object.assign({ id: uid() }, data));
  save(); ui.stack.pop(); render(); toast(eid ? 'Saved' : 'Date saved');
}

