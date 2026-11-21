/* Uravu – views: small pieces, Home, People, Dates */
/* ---------- small pieces ---------- */
const HUES = ['#1A56C4','#C5283D','#1E7B3C','#A86400','#7B2CBF','#00707A','#A8246A','#44505C'];
function hue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return HUES[Math.abs(h) % HUES.length]; }
function avatar(p, cls = '') {
  const st = `style="--h:${hue(p.id)}"`;
  if (p.photo) return `<span class="av ${cls}" ${st}><img src="${p.photo}" alt=""></span>`;
  return `<span class="av ${cls}" ${st} aria-hidden="true">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`;
}
function termSmall(k) {
  if (S.settings.lang === 'en') return `<span class="tm en">${esc(k.en)}</span>`;
  return `<span class="tm">${esc(k.custom || k.ta)}</span>`;
}
function termLine(k) {
  const lang = S.settings.lang, ta = k.custom || k.ta;
  if (lang === 'en') return esc(k.en);
  if (lang === 'ta') return `<span class="ta">${esc(ta)}</span>`;
  return `<span class="ta">${esc(ta)}</span> ${esc(k.custom ? '' : k.tl)} (${esc(k.en)})`;
}
// Someone I know myself (not only as a friend's relative or a friend's friend)
function knownDirectly(id) {
  const p = S.people[id];
  if (id === S.me || !SOCIAL[p.circle]) return false;
  if (p.direct) return true;   // I marked them as my own friend/colleague, even if they came in through someone else
  if (addedVia(id)) return false;
  const a = anchorOf(id);
  return a === id || S.people[a].circle !== p.circle;
}
// The people I know only through this person (their family, their friends), not passing through me or other people I know
function groupOf(id) {
  const seen = new Set([id]), q = [id], out = [];
  while (q.length) {
    const x = q.shift();
    for (const [y] of allLinks(x)) {
      if (seen.has(y)) continue; seen.add(y);
      if (y === S.me || S.people[y].circle === 'family' || knownDirectly(y)) continue;
      out.push(y); q.push(y);
    }
  }
  return out;
}
function pplItem(p, n = 0) {
  return `<button class="ppl" data-act="person" data-id="${esc(p.id)}"><span class="avw">${avatar(p)}${n ? `<span class="cnt" aria-label="${n} more linked">+${n}</span>` : ''}</span><span class="nm">${esc(p.name)}</span>${termSmall(kinOf(p.id))}</button>`;
}
function personRow(p, extra = '') {
  const bd = p.dob && !p.dead ? nextOcc(p.dob) : null;
  const badge = bd && bd.days <= 14 ? `<span class="badge${bd.days === 0 ? ' hot' : ''}">${bd.days === 0 ? '🎂 Today' : '🎂 ' + bd.days + 'd'}</span>` : '';
  return `<button class="r" data-act="person" data-id="${esc(p.id)}">${avatar(p)}
    <span class="tx"><span class="t1">${esc(p.id === S.me ? p.name + ' (you)' : p.name)}</span><span class="t2">${termLine(kinOf(p.id))}${p.dead ? ', passed away' : ''}</span>${extra}</span>${badge}</button>`;
}
let inSheet = false;   // true while a page is being drawn inside a bottom sheet
const bar = (title, right = '') => inSheet
  ? `<header class="bar sheet-bar"><h1>${title}</h1>${right}<button class="icon-btn" data-act="back" aria-label="Close">${ICON.x}</button></header>`
  : ui.stack.length === 1 ? `<header class="bar top"><h1>${title}</h1>${right}</header>`
  : `<header class="bar"><button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button><h1>${title}</h1>${right}</header>`;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); t.classList.toggle('long', msg.length > 44); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), Math.max(2200, msg.length * 60)); }
function circlePeople(c) {
  const list = Object.values(S.people).filter(p => p.id !== S.me && ((p.circle === c && (c === 'family' || knownDirectly(p.id))) || (c !== 'family' && (p.also || []).includes(c))));
  if (c === 'family') return list.sort((a, b) => { const ka = kinOf(a.id), kb = kinOf(b.id); return (kb.gen ?? -9) - (ka.gen ?? -9) || (ka.tk || []).join('.').localeCompare((kb.tk || []).join('.')) || a.name.localeCompare(b.name); });
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- home ---------- */
function pgHome() {
  return `<div class="homebar"><label class="pill">${ICON.search}<input id="q" type="search" placeholder="Search people, உறவு, likes" autocomplete="off" aria-label="Search"></label>
    <button class="me-btn" data-act="go" data-id="settings" aria-label="Settings and my profile">${avatar(S.people[S.me])}<i class="cdot" data-cloud-dot="${cloudDot()}" aria-hidden="true"></i></button></div>
    <div id="homeBody">${homeBody()}</div>`;
}
function homeBody() {
  if (ui.q.trim()) return `${aiAvailable !== false ? `<button class="askrow" data-act="ask-q">${ICON.spark}<span>Ask Uravu: “${esc(ui.q.trim())}”</span></button>` : ''}<div class="rows" style="margin-top:6px">${resultsHTML(ui.q)}</div>`;
  const b = badges();
  const tile = (id, ic, l, n, hint) => `<button data-act="go" data-id="${id}"${n ? ` aria-label="${l}, ${n} ${hint}"` : ''}><span class="ic">${ic}${n ? `<span class="dot" aria-hidden="true">${n}</span>` : ''}</span>${l}</button>`;
  let h = `<div class="qa">${tile('dates', ICON.cake, 'Dates', b.today, 'today')}${tile('docs', ICON.doc, 'Documents', b.dues, 'due')}${tile('moi', ICON.rupee, 'Moi')}${tile('connect', ICON.link, 'Connected')}</div>`;
  if (installEvt) h += installRow();
  if (aiAvailable !== false) h += `<button class="askbar" data-act="go" data-id="ask">${ICON.spark}<span><b>Ask Uravu</b><small>“What does Amma like?” “Whose birthday is next?”</small></span></button>`;
  if (cloud.user && syncState && syncState.setup) {   // signed in: the account is the backup; only nudge about the vault
    if (docsWaiting()) h += `<button class="pov-note" data-act="go" data-id="account" style="display:block;width:100%;text-align:left;margin-top:12px">🔒 Documents aren’t backed up yet. <b style="color:var(--primary)">${cloud.vault ? 'Enter vault PIN' : 'Set a vault PIN'}</b></button>`;
  }
  else if (needsBackup()) h += `<button class="pov-note" data-act="go" data-id="settings" style="display:block;width:100%;text-align:left;margin-top:12px">💾 Saved only on this phone. <b style="color:var(--primary)">Back up now</b></button>`;
  const missingG = noGender().length;
  if (missingG) h += `<button class="pov-note" data-act="go" data-id="genders" style="display:block;width:100%;text-align:left;margin-top:12px">${missingG} without gender, so some Tamil words may be wrong. <b style="color:var(--primary)">Fix</b></button>`;
  const up = upcoming().filter(x => x.days <= 30);
  h += `<div class="sh"><h2>Coming up</h2><button data-act="go" data-id="dates">See all</button></div>`;
  h += up.length ? `<div class="hs">${up.map(upCard).join('')}</div>` : `<p class="empty">No birthdays or anniversaries in the next 30 days.</p>`;
  const soonF = (S.funcs || []).filter(f => f.on && daysUntil(f.on) >= 0 && daysUntil(f.on) <= 60).sort((a, b) => a.on.localeCompare(b.on));
  if (soonF.length) h += `<div class="sh"><h2>Your functions<span class="sub ta">விழாக்கள்</span></h2><button data-act="go" data-id="funcs">See all</button></div><div class="hs">${soonF.map(f => { const st = funcStats(f), dd = daysUntil(f.on); return `<button class="up${dd <= 14 ? ' soon' : ''}" data-act="func" data-id="${esc(f.id)}"><span class="avs"><span class="docic lg">${funcIcon(f)}</span></span><span class="when">${dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : 'In ' + dd + ' days'}</span><span class="nm">${esc(f.title)}</span><span class="what">${st.inv} of ${st.n} invited${st.yes ? ', ' + st.yes + ' coming' : ''}</span></button>`; }).join('')}</div>`;
  const dues = allDues().filter(x => x.days <= 60);
  if (dues.length) h += `<div class="sh"><h2>Renewals due<span class="sub ta">புதுப்பிக்க</span></h2><button data-act="go" data-id="docs">See all</button></div><div class="hs">${dues.map(dueCard).join('')}</div>`;
  for (const [c, label, ta] of CIRCLES) {
    const list = circlePeople(c), many = list.length > 8;
    h += `<div class="sh"><h2>${label}<span class="sub ta">${ta}</span></h2>${many ? `<button data-act="go" data-id="people" data-f="${c}">See all ${list.length}</button>` : ''}</div>`;
    h += `<div class="grid">${(many ? list.slice(0, 7) : list).map(p => pplItem(p, c === 'family' ? 0 : groupOf(p.id).length)).join('')}`;
    if (many) h += `<button class="ppl" data-act="go" data-id="people" data-f="${c}"><span class="av more">${ICON.more}</span><span class="nm">More</span></button>`;
    else h += `<button class="ppl" data-act="new" data-id="" data-circle="${c}"><span class="av add">${ICON.plus}</span><span class="nm">Add</span></button>`;
    h += `</div>`;
  }
  return h;
}
function hl(text, q) {
  const s = String(text), i = s.toLowerCase().indexOf(q);
  if (i < 0) return esc(s);
  return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}
function resultsHTML(raw) {
  const q = raw.trim().toLowerCase(), res = [];
  for (const p of Object.values(S.people)) {
    const k = kinOf(p.id), hits = [];
    const f = (label, val) => { if (val && String(val).toLowerCase().includes(q)) hits.push([label, val]); };
    f('Name', p.name); f('Tamil name', p.tamilName); f('Nickname', p.nickname);
    f('Relation', k.ta); f('Relation', k.tl); f('Relation', k.en); f('Relation', k.desc); f('You call them', p.callAs);
    CIRCLES.forEach(c => { if (c[0] === p.circle || (p.also || []).includes(c[0])) { f('Circle', c[1]); f('Circle', c[2]); } });
    (p.groups || []).forEach(g => f('Group', g));
    (p.likes || []).forEach(l => { if ((l.cat + ' ' + l.val).toLowerCase().includes(q)) hits.push([l.cat, l.val]); });
    f('Phone', p.phone); f('How you met', p.metHow); f('Notes', p.notes);
    S.events.filter(e => e.people.includes(p.id)).forEach(e => { f('Date', e.title); f('Date', e.note); });
    if (hits.length) res.push({ p, hits, score: hits[0][0] === 'Name' ? 0 : 1 });
  }
  res.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name));
  const docHTML = funcResults(q) + docResults(q);
  if (!res.length) return docHTML ? docHTML.replace(/<p class="subh" style="margin:12px 0 0">People<\/p>$/, '') : `<p class="empty">No one matches “${esc(raw.trim())}”. <button class="link-btn" data-act="new" data-id="">Add someone new</button></p>`;
  return docHTML + res.map(r => {
    const seen = new Set(), lines = [];
    for (const [l, v] of r.hits) { if (l === 'Name' || l === 'Relation' || seen.has(l + v)) continue; seen.add(l + v); lines.push(`<span class="t2 hit">${esc(l)}: ${hl(v, q)}</span>`); if (lines.length >= 2) break; }
    return personRow(r.p, lines.join(''));
  }).join('');
}

/* ---------- people, dates, family ---------- */
function pgPeople(c) {
  const f = c.f || 'all';
  const groups = [...new Set(Object.values(S.people).flatMap(p => p.groups || []))].sort();
  const chip = (id, label) => `<button class="chip" data-act="filter" data-id="${esc(id)}" aria-pressed="${f === id}">${label}</button>`;
  let list = Object.values(S.people);
  if (f.startsWith('g:')) list = list.filter(p => (p.groups || []).includes(f.slice(2)));
  else if (f !== 'all') list = list.filter(p => p.circle === f || (p.also || []).includes(f));
  list.sort((a, b) => (a.id === S.me ? -1 : b.id === S.me ? 1 : a.name.localeCompare(b.name)));
  return bar('People', `<button class="icon-btn" data-act="new" data-id="" aria-label="Add person">${ICON.addPerson}</button>`) +
    `<div class="chips">${chip('all', 'Everyone')}${CIRCLES.map(x => chip(x[0], x[1])).join('')}${groups.map(g => chip('g:' + g, esc(g))).join('')}</div>
    <div class="rows">${!list.length ? `<p class="empty">No one here yet.</p>` : SOCIAL[f] ? (() => {
      // friends/colleagues: each person I know, with the people I know through them tucked underneath
      const shown = new Set(), out = [];
      for (const p of list.filter(p => knownDirectly(p.id))) {
        shown.add(p.id); out.push(personRow(p));
        const g = groupOf(p.id).filter(id => !shown.has(id));
        if (g.length) { g.forEach(id => shown.add(id)); out.push(`<div class="sub"><p class="subh" style="margin:4px 0 0">Through ${esc(p.name)}</p>${g.map(id => personRow(S.people[id])).join('')}</div>`); }
      }
      const rest = list.filter(p => !shown.has(p.id));
      return out.join('') + rest.map(p => personRow(p)).join('');
    })() : list.map(p => personRow(p)).join('')}</div>`;
}
function pgDates(c) {
  const tab = c.tab || 'up';
  const chip = (id, label) => `<button class="chip" data-act="tab" data-id="${id}" aria-pressed="${tab === id}">${label}</button>`;
  const body = tab === 'up'
    ? (() => { const up = upcoming(); return up.length ? up.map(x => dateRow(x)).join('') : `<p class="empty">No yearly dates yet. Add birthdays to people, or add an anniversary.</p>`; })()
    : (() => { const once = S.events.filter(e => !e.yearly && e.on).sort((a, b) => b.on.localeCompare(a.on)); return once.length ? once.map(momentRow).join('') : `<p class="empty">Save one-time moments here, like someone’s first day at work.</p>`; })();
  return bar('Dates', `<button class="icon-btn" data-act="event-new" data-id="" aria-label="Add date">${ICON.addDate}</button>`) +
    `<div class="chips">${chip('up', 'Every year')}${chip('once', 'Moments')}</div><div class="rows">${body}</div>`;
}
const GEN_LABEL = g => ({ 3:['Great-grandparents','கொள்ளு தாத்தா பாட்டி'], 2:['Grandparents','தாத்தா பாட்டி'], 1:['Parents’ generation','பெற்றோர் தலைமுறை'],
  0:['Your generation','உங்கள் தலைமுறை'], '-1':['Children’s generation','பிள்ளைகள்'], '-2':['Grandchildren','பேரப்பிள்ளைகள்'], '-3':['Great-grandchildren','கொள்ளுப் பேரப்பிள்ளைகள்'], '-4':['Great-great-grandchildren','எள்ளுப் பேரப்பிள்ளைகள்'] }[g] || [g > 0 ? 'Elders' : 'Younger generations', '']);
