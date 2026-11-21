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
  return fam + soc;
}
function qrelPick(kind) {
  const id = cur().id, to = cur().qrel.to, p = S.people[id];
  if (!to || to === id) return;
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

  return bar('', `<button class="txt-btn" data-act="edit" data-id="${esc(id)}">Edit</button>`) +
    `<div class="ph">${avatar(p, 'xl')}<h2>${esc(p.name)}${isMe ? ' (you)' : ''}</h2>${p.dead ? `<div class="alt">${esc(lifeTxt(p))}</div>` : ''}
      ${p.tamilName || p.nickname ? `<div class="alt">${[p.tamilName ? `<span class="ta">${esc(p.tamilName)}</span>` : '', p.nickname ? `“${esc(p.nickname)}”` : ''].filter(Boolean).join(', ')}</div>` : ''}</div>
    ${call}
    ${!p.gender ? `<p class="pov-note" style="margin-top:14px;text-align:center">${esc(p.name)}’s gender isn’t saved, so some Tamil words may be wrong. <button class="link-btn" data-act="edit" data-id="${esc(id)}" style="margin:0">Add it now</button></p>` : ''}
    <div class="acts">${acts.join('')}</div>
    <section class="card"><h3>Important dates</h3>
      ${yearly.length || once.length ? `<div class="rows">${yearly.map(x => dateRow(x, x.kind === 'birthday' ? 'Birthday' : x.title)).join('')}${once.map(momentRow).join('')}</div>` : `<p class="muted" style="margin:0">No dates yet.</p>`}
      ${quickDate(id, c)}</section>
    ${funcsCard(id, c)}
    ${likesCard(id)}
    ${docsCard(id)}
    ${relCard(id, c)}
    ${near.length ? `<section class="card"><h3>${isMe ? 'Your' : esc(p.name) + '’s'} close family</h3><p class="muted" style="margin:-4px 0 10px;font-size:.88rem">What ${isMe ? 'you call' : esc(p.name) + ' calls'} them</p><div class="hs">${near.map(x => `<button class="ppl" data-act="person" data-id="${esc(x.o)}">${avatar(S.people[x.o])}<span class="nm">${esc(x.o === S.me ? 'You' : S.people[x.o].name)}</span>${termSmall(x.k)}${S.settings.lang === 'both' ? `<span class="rw">${esc(x.k.en)}</span>` : ''}</button>`).join('')}</div></section>` : ''}
    ${socialCard(id)}
    ${isMe ? '' : textCard(id, c, 'metHow', 'How you met', 'Where or how did you meet? e.g. at Arjun’s wedding')}
    ${textCard(id, c, 'notes', 'Notes', 'Anything to remember: kids’ names, a promise, their favourite temple…')}
    ${(p.groups || []).length || p.phone ? `<section class="card"><h3>Details</h3><p class="prose">${[p.phone ? 'Phone: ' + esc(p.phone) : '', (p.groups || []).length ? 'Groups: ' + esc(p.groups.join(', ')) : ''].filter(Boolean).join('<br>')}</p></section>` : ''}
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
function pgEdit(c) {
  const isNew = !c.id, id = c.id, isMe = id === S.me;
  const p = isNew ? blankPerson('', {}) : S.people[id];
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  const relTo = c.relTo || S.me;
  const links = isNew ? [] : directLinks(id);
  const preCircle = isNew ? (c.circle || '') : [...(p.circle === 'family' ? (kinOf(id).family ? [] : [p.circle]) : knownDirectly(id) ? [p.circle] : []), ...(p.also || [])].join(',');
  const title = isNew ? (c.relTo && c.relTo !== S.me ? `Add someone linked to ${esc(S.people[c.relTo].name)}` : 'Add person') : isMe ? 'Edit my profile' : 'Edit ' + esc(p.name);
  return bar(title) + `<div id="pf" data-id="${esc(id || '')}">
    <input type="hidden" id="f-rel" value=""><input type="hidden" id="f-circle" value="${esc(preCircle)}">
    <div class="photo-pick"><label aria-label="Choose photo"><span id="photoPrev">${avatar(isNew ? blankPerson('new', {}) : p, 'xl')}</span><span class="cam">${ICON.camera}</span><input type="file" accept="image/*" id="photoIn" hidden></label>
      ${p.photo ? `<button type="button" class="link-btn" data-act="photo-rm">Remove photo</button>` : ''}</div>
    <label class="fld big">Name<input name="name" value="${esc(p.name)}" autocomplete="off" placeholder="Their name"></label>
    <label class="fld">Name in Tamil <span class="hint">Optional</span><input name="tamilName" value="${esc(p.tamilName)}" class="ta" autocomplete="off"></label>
    <div class="fld"><span>Gender <span class="hint">Required, so the Tamil words come out right</span></span><div class="seg"><button type="button" data-act="pick-gender" data-id="m" aria-pressed="${(p.gender || 'm') === 'm'}">Male</button><button type="button" data-act="pick-gender" data-id="f" aria-pressed="${p.gender === 'f'}">Female</button></div><input type="hidden" name="gender" value="${esc(p.gender || 'm')}"></div>
    ${isMe ? '' : `<div class="deadf"><div class="fld"><span>Alive or passed away</span><div class="seg"><button type="button" data-act="pick-dead" data-id="" aria-pressed="${!p.dead}">Alive</button><button type="button" data-act="pick-dead" data-id="1" aria-pressed="${!!p.dead}">Passed away</button></div><input type="hidden" name="dead" value="${p.dead ? '1' : ''}"></div><label class="fld dodfld">Date they passed away <span class="hint">Optional</span><input type="date" name="dod" value="${esc(p.dod || '')}"></label></div>`}
    ${isMe ? '' : `<section class="who"><h3>${isNew ? 'Who are they?' : 'Relationship'}</h3>
      ${links.length ? `<p class="subh">Linked now</p>${links.map(x => `<div class="cur-link"><span><b>${esc(S.people[x.o].name)}</b> is their ${esc(x.word.toLowerCase())}</span><button type="button" data-act="rm-link" data-id="${esc(x.e.id)}" aria-label="Remove link">${ICON.x}</button></div>`).join('')}<p class="subh">Add another link</p>` : ''}
      <div class="relto"><span>Related to</span>${personPicker('relTo', relTo, id || '', 'Related to')}</div>
      <div class="relgrid" id="relgrid">${relChips(relTo, '')}</div>
      <p class="hint-line" style="margin:8px 0 0;font-size:.84rem">Tap every relationship that applies. To link them to someone else too, change “Related to” and tap again.</p>
      <div id="pending"></div>
      <p class="subh">Not family</p>
      <div class="relgrid" id="othergrid">${otherChips(relTo, preCircle)}</div>
    </section>`}
    <div class="two"><label class="fld">Birthday<input type="date" name="dob" value="${esc(p.dob)}"></label>
      <label class="fld">Phone<input type="tel" name="phone" value="${esc(p.phone)}" placeholder="For call and WhatsApp" autocomplete="off"></label></div>
    <div class="fld"><span>Likes</span><div id="likesEdit">${(p.likes || []).map(likeRow).join('')}</div>
      <div class="chips wrap">${QUICK_CATS.map(cat => `<button type="button" class="chip" data-act="like-add" data-id="${esc(cat)}">${catIcon(cat)} ${esc(cat)}</button>`).join('')}<button type="button" class="chip" data-act="like-add" data-id="">＋ Other</button></div></div>
    ${isMe ? '' : `<label class="fld">How or where you met <span class="hint">Helpful for friends and new people</span><textarea name="metHow">${esc(p.metHow)}</textarea></label>`}
    <details class="more"><summary>More details</summary>
      <label class="fld">Nickname<input name="nickname" value="${esc(p.nickname)}" autocomplete="off"></label>
      <div class="two">
        ${isMe ? '' : `<label class="fld">Older or younger than you?<select name="relAge">${opt('', 'Not sure', !p.relAge)}${opt('elder', 'Older', p.relAge === 'elder')}${opt('younger', 'Younger', p.relAge === 'younger')}</select></label>`}</div>
      ${isMe ? '' : `<label class="fld">What do you call them? <span class="hint">Only if your family uses a different word</span><input name="callAs" value="${esc(p.callAs)}" placeholder="e.g. சின்ன மாமா" class="ta" autocomplete="off"></label>`}
      <label class="fld">Groups <span class="hint">Separate with commas, like College gang, Office team</span><input name="groups" value="${esc((p.groups || []).join(', '))}" autocomplete="off"></label>
      <label class="fld">Notes<textarea name="notes">${esc(p.notes)}</textarea></label>
    </details>
    <datalist id="cats">${CATS.map(x => `<option value="${esc(x[0])}">`).join('')}</datalist>
  </div>
  <div class="savebar"><div class="in"><p class="err" id="err" hidden></p><button class="btn-p" data-act="save-person">${isNew ? 'Save person' : 'Save changes'}</button></div></div>`;
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
  if (pg && REL_GENDER[rel] && REL_GENDER[rel] !== pg) return `${cap(nm(id))} ${id === S.me ? 'are' : 'is'} saved as ${pg === 'm' ? 'male' : 'female'}, so “${(FAM_RELS.find(r => r[0] === rel) || [0, rel])[1]}” doesn’t fit. Change the gender in Edit first if it’s wrong.`;
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
function markRemoving() {
  document.querySelectorAll('.cur-link').forEach(r => {
    const b = r.querySelector('[data-act="rm-link"],[data-act="rm-undo"]'); if (!b) return;
    const on = pendingRemove.has(b.dataset.id);
    r.classList.toggle('removing', on); b.dataset.act = on ? 'rm-undo' : 'rm-link';
    b.innerHTML = on ? 'Undo' : ICON.x; b.setAttribute('aria-label', on ? 'Undo remove' : 'Remove link');
  });
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
  const f = $('#pf'); let id = f.dataset.id;
  const val = n => (f.querySelector(`[name="${n}"]`)?.value || '').trim();
  const name = val('name');
  if (!name) return formErr('Add a name to save.', '[name="name"]');
  if (!val('gender')) return formErr('Choose Male or Female to save.');
  if (id && S.people[id].gender && val('gender') !== S.people[id].gender) { const gp = genderProblem(id, val('gender')); if (gp) return formErr(gp); }
  const isNew = !id, circ = $('#f-circle').value, circs = circ.split(',').filter(Boolean), links = pendingLinks.filter(l => l.to !== id);
  const famL = links.find(l => l.rel), socL = links.find(l => l.social);
  if (isNew && !links.length && !circ) return formErr('Choose who they are, like Father or Friend.');
  for (const l of links) if (l.rel) { const pr = linkProblem(id, l.rel, l.to, name); if (pr) return formErr(pr); }
  if (isNew) { id = uid(); S.people[id] = blankPerson(id); }
  const p = S.people[id];
  Object.assign(p, { name, tamilName:val('tamilName'), nickname:val('nickname'), gender:val('gender'), dob:val('dob'), phone:val('phone'),
    groups: val('groups').split(',').map(x => x.trim()).filter(Boolean), notes:val('notes') });
  if (id !== S.me) Object.assign(p, { relAge:val('relAge'), callAs:val('callAs'), metHow:val('metHow') });
  p.dead = val('dead') === '1'; p.dod = p.dead ? val('dod') : '';
  let dropped = 0;
  if (p.dead) for (const fn of S.funcs || []) if (!fn.on || daysUntil(fn.on) >= 0) { const n = (fn.guests || []).length; fn.guests = (fn.guests || []).filter(g => g.pid !== id || g.moi); dropped += n - fn.guests.length; }
  if (famL && (famL.to === S.me || S.people[famL.to].circle === 'family')) p.circle = 'family';
  else if (circs.length) p.circle = circs.includes('family') ? 'family' : circs[0];
  else if (famL && (isNew || p.circle === 'family')) p.circle = S.people[famL.to].circle;
  else if (isNew && socL) p.circle = socL.social;
  p.also = circs.filter(x => x !== p.circle && SOCIAL[x]);
  p.direct = !!SOCIAL[p.circle] && circs.includes(p.circle);   // ticked Friend/Colleague/Met for me, not just inherited from who they came through
  if (pendingPhoto !== null) p.photo = pendingPhoto;
  f.querySelectorAll('input.lv[data-pick]').forEach(resolvePick);
  p.likes = [...f.querySelectorAll('.like-row')].map(r => ({ cat:r.querySelector('.lc').value.trim() || 'Other', val:r.querySelector('.lv').value.trim() })).filter(l => l.val);
  for (const c of pendingClicked) removeLinks(linkGroup(c));
  for (const l of links) {
    if (l.rel) addLink(id, l.rel, l.to);
    else if (!hasEdge(e => e.type === 'social' && [e.a, e.b].includes(id) && [e.a, e.b].includes(l.to))) S.edges.push({ id: uid(), type:'social', a:l.to, b:id, kind:l.social });
  }
  save(); pendingPhoto = null; pendingLinks = []; pendingRemove = new Set(); pendingClicked = new Set();
  ui.stack.pop();
  if (isNew) ui.stack.push({ p:'person', id });
  render(); window.scrollTo(0, 0);
  toast(isNew ? `Added ${p.name}` : dropped ? `Saved. Removed from ${dropped} upcoming guest list${dropped === 1 ? '' : 's'}.` : 'Saved');
}
function readPhoto(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'), s = 240, m = Math.min(img.width, img.height);
      cv.width = cv.height = s;
      cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      pendingPhoto = cv.toDataURL('image/jpeg', 0.82);
      $('#photoPrev').innerHTML = `<span class="av xl"><img src="${pendingPhoto}" alt=""></span>`;
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
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

