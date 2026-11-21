/* Uravu – basics: shared state, helpers, icons */
/* ---------- basics ---------- */
const KEY = 'uravu.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => 'x' + Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let S, ui = { stack: [{ p: 'home' }], q: '' }, kc = {}, pendingPhoto = null, pendingLinks = [], pendingRemove = new Set(), pendingClicked = new Set();
let EGO = null; const ego = () => EGO || S.me;
const cur = () => ui.stack[ui.stack.length - 1];

const CIRCLES = [
  ['family', 'Family', 'குடும்பம்'],
  ['friend', 'Friends', 'நண்பர்கள்'],
  ['colleague', 'Colleagues', 'சக ஊழியர்கள்'],
  ['acquaintance', 'People I met', 'சந்தித்தவர்கள்'],
];
const CATS = [['Ice cream','🍨'],['Food','🍛'],['Sweets','🍬'],['Drink','☕'],['Colour','🎨'],['Flowers','🌼'],
  ['Rasi (zodiac)','🔮'],['Nakshatra (star)','✨'],['Movies','🎬'],['Music','🎵'],['Hobbies','🎯'],['Gift ideas','🎁'],['Dislikes / allergies','⚠️']];
const QUICK_CATS = ['Ice cream','Food','Drink','Sweets','Gift ideas','Rasi (zodiac)','Nakshatra (star)'];
// Fixed lists: pick instead of typing. [Tamil, transliteration, English]
const RASI = [['மேஷம்','Mesham','Aries'],['ரிஷபம்','Rishabam','Taurus'],['மிதுனம்','Mithunam','Gemini'],['கடகம்','Kadagam','Cancer'],
  ['சிம்மம்','Simmam','Leo'],['கன்னி','Kanni','Virgo'],['துலாம்','Thulam','Libra'],['விருச்சிகம்','Viruchigam','Scorpio'],
  ['தனுசு','Dhanusu','Sagittarius'],['மகரம்','Magaram','Capricorn'],['கும்பம்','Kumbam','Aquarius'],['மீனம்','Meenam','Pisces']];
const NAKSHATRA = [['அஸ்வினி','Ashwini'],['பரணி','Bharani'],['கார்த்திகை','Karthigai'],['ரோகிணி','Rohini'],['மிருகசீரிடம்','Mirugasirisham'],
  ['திருவாதிரை','Thiruvathirai'],['புனர்பூசம்','Punarpoosam'],['பூசம்','Poosam'],['ஆயில்யம்','Ayilyam'],['மகம்','Magam'],['பூரம்','Pooram'],
  ['உத்திரம்','Uthiram'],['அஸ்தம்','Hastham'],['சித்திரை','Chithirai'],['சுவாதி','Swathi'],['விசாகம்','Visakam'],['அனுஷம்','Anusham'],
  ['கேட்டை','Kettai'],['மூலம்','Moolam'],['பூராடம்','Pooradam'],['உத்திராடம்','Uthiradam'],['திருவோணம்','Thiruvonam'],
  ['அவிட்டம்','Avittam'],['சதயம்','Sathayam'],['பூரட்டாதி','Poorattathi'],['உத்திரட்டாதி','Uthirattathi'],['ரேவதி','Revathi']];
const PICK_LISTS = { 'rasi (zodiac)': RASI, 'nakshatra (star)': NAKSHATRA };
const pickList = cat => PICK_LISTS[String(cat || '').trim().toLowerCase()] || null;
// The "what they like" box: for Rasi / Nakshatra a type-to-search list, otherwise a plain text box
const pickValue = ([ta, tl]) => `${tl} (${ta})`;
function pickFind(cat, val) {
  const list = pickList(cat); if (!list || !val) return null;
  const v = val.trim().toLowerCase();
  return list.find(o => pickValue(o).toLowerCase() === v || o[1].toLowerCase() === v || o[0] === val.trim() || v.startsWith(o[1].toLowerCase() + ' ')) || null;
}
function pickMatches(cat, q) {
  const list = pickList(cat), v = q.trim().toLowerCase();
  if (!v || pickFind(cat, q)) return list;
  return list.filter(([ta, tl, en]) => ta.includes(q.trim()) || tl.toLowerCase().includes(v) || (en || '').toLowerCase().includes(v));
}
function valueField(cat, val) {
  const list = pickList(cat);
  if (!list) return `<input class="lv" value="${esc(val)}" placeholder="What they like" aria-label="What they like">`;
  const hit = pickFind(cat, val), shown = hit ? pickValue(hit) : (val || '');
  return `<div class="pickwrap"><input class="lv" data-pick="${esc(String(cat).trim().toLowerCase())}" value="${esc(shown)}" placeholder="Type to search, e.g. ${list === RASI ? 'Simmam or சிம்' : 'Rohini or ரோ'}" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="Choose ${esc(cat)}"><div class="pickdd" role="listbox" hidden></div></div>`;
}
function showPick(inp) {
  const dd = inp.nextElementSibling, m = pickMatches(inp.dataset.pick, inp.value);
  dd.innerHTML = m.length ? m.map(o => `<button type="button" class="pko" role="option" data-v="${esc(pickValue(o))}"><span class="ta">${esc(o[0])}</span> ${esc(o[1])}${o[2] ? ` <span class="muted">${esc(o[2])}</span>` : ''}</button>`).join('')
    : `<p class="muted" style="margin:6px 10px;font-size:.88rem">No match. What you typed will be saved as it is.</p>`;
  dd.hidden = false; inp.setAttribute('aria-expanded', 'true');
}
function hidePick(inp) { const dd = inp.nextElementSibling; if (dd) dd.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
// Fill in the full name when what was typed matches exactly one item. Returns false if it matches several.
function resolvePick(inp) {
  if (!inp || !inp.dataset || !inp.dataset.pick || !inp.value.trim()) return true;
  const hit = pickFind(inp.dataset.pick, inp.value); if (hit) { inp.value = pickValue(hit); return true; }
  const m = pickMatches(inp.dataset.pick, inp.value);
  if (m.length === 1) { inp.value = pickValue(m[0]); return true; }
  return m.length === 0;
}
document.addEventListener('focusin', e => { if (e.target.dataset && e.target.dataset.pick) showPick(e.target); });
document.addEventListener('focusout', e => { const t = e.target; if (t.dataset && t.dataset.pick) setTimeout(() => { if (document.activeElement !== t) { resolvePick(t); hidePick(t); } }, 150); });
document.addEventListener('pointerdown', e => { const o = e.target.closest && e.target.closest('.pko'); if (o) e.preventDefault(); });
document.addEventListener('click', e => {
  const o = e.target.closest && e.target.closest('.pko'); if (!o) return;
  const inp = o.closest('.pickwrap').querySelector('input'); inp.value = o.dataset.v; hidePick(inp); inp.blur();
});
function swapValueField(lc) {
  const lv = lc.parentElement.querySelector('.lv'); if (!lv) return;
  const want = pickList(lc.value), isPick = !!lv.dataset.pick;
  if (!want && !isPick) return;
  if (isPick && want && lv.dataset.pick === lc.value.trim().toLowerCase()) return;
  (isPick ? lv.closest('.pickwrap') : lv).outerHTML = valueField(lc.value, lv.value);
}
const catIcon = c => (CATS.find(x => x[0].toLowerCase() === String(c).toLowerCase()) || [0, '•'])[1];

function blankPerson(id, o) {
  return Object.assign({ id, name:'', tamilName:'', nickname:'', gender:'', dob:'', circle:'family', groups:[],
    metHow:'', notes:'', likes:[], callAs:'', relAge:'', photo:'', phone:'', also:[], dead:false, dod:'' }, o);
}

/* ---------- icons ---------- */
const sv = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  back: sv('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  addPerson: sv('<circle cx="10" cy="8" r="4"/><path d="M3 20c0-3.9 3.1-6.5 7-6.5 1.5 0 2.9.4 4 1.1M19 14v6M16 17h6"/>'),
  addDate: sv('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'),
  tree: sv('<circle cx="12" cy="5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><path d="M12 7.5V12M5.5 16v-2.5A1.5 1.5 0 0 1 7 12h10a1.5 1.5 0 0 1 1.5 1.5V16"/>'),
  cake: sv('<path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0M12 12V8M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5z"/>'),
  more: sv('<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  phone: sv('<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  chat: sv('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.1z"/>'),
  camera: sv('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  home: sv('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  target: sv('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  expand: sv('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: sv('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  download: sv('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  spark: sv('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  swap: sv('<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>'),
  people: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2"/><circle cx="17.2" cy="9" r="2.7"/><path d="M16.4 14c3 0 5.1 2.3 5.1 5.4"/>'),
  gift: sv('<rect x="3" y="8.5" width="18" height="4.5" rx="1"/><path d="M5 13v8h14v-8M12 8.5V21M12 8.5c-1.8-3.8-6-4.2-6-1.7 0 1.2 1.5 1.7 6 1.7zM12 8.5c1.8-3.8 6-4.2 6-1.7 0 1.2-1.5 1.7-6 1.7z"/>'),
  doc: sv('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
  rupee: sv('<path d="M7 4h10M7 8.5h10M8 4c5.5 0 5.5 9 0 9h-1l8 8"/>'),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  open: sv('<circle cx="12" cy="12" r="9"/><path d="M10.5 8l4 4-4 4"/>'),
  cloud: sv('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.75 4.75 0 0 1-.5 9.5z"/>'),
  install: sv('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10 18.5h4"/>'),
};

