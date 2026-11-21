/* Uravu – data: sample family, storage, kinship engine, dates */
/* ---------- sample family ---------- */
function demo() {
  const s = { me:'me', people:{}, edges:[], events:[], settings:{ lang:'both' } };
  const P = (id, o) => { s.people[id] = blankPerson(id, o); };
  const E = o => s.edges.push(Object.assign({ id: uid() }, o));
  const soon = (days, year) => { const d = new Date(); d.setDate(d.getDate() + days); return `${year}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };

  P('me', { name:'Karthik', tamilName:'கார்த்திக்', gender:'m', dob:'1990-08-14', likes:[{cat:'Drink',val:'Filter coffee'}] });
  P('appa', { name:'Selvam', tamilName:'செல்வம்', gender:'m', dob:soon(5,1960), likes:[{cat:'Food',val:'Kambu koozh with onion'},{cat:'Rasi (zodiac)',val:'Simmam'},{cat:'Music',val:'TMS old songs'}] });
  P('amma', { name:'Lakshmi', tamilName:'லட்சுமி', gender:'f', dob:'1965-03-02', likes:[{cat:'Ice cream',val:'Butterscotch'},{cat:'Flowers',val:'Malli (jasmine)'},{cat:'Rasi (zodiac)',val:'Kanni'},{cat:'Gift ideas',val:'Cotton sarees, temple trips'}] });
  P('periyappa', { name:'Murugan', tamilName:'முருகன்', gender:'m', dob:'1955-11-20', notes:'Lives in Madurai. Call on Pongal.' });
  P('periyamma', { name:'Valli', tamilName:'வள்ளி', gender:'f', likes:[{cat:'Sweets',val:'Adhirasam'}] });
  P('senthil', { name:'Senthil', tamilName:'செந்தில்', gender:'m', dob:'1986-04-09', likes:[{cat:'Hobbies',val:'Cricket, CSK fan'}] });
  P('athai', { name:'Kamala', tamilName:'கமலா', gender:'f', dob:soon(47,1963) });
  P('mama', { name:'Ravi', tamilName:'ரவி', gender:'m' });
  P('mami', { name:'Geetha', tamilName:'கீதா', gender:'f' });
  P('priya', { name:'Priya', gender:'f', relAge:'younger', likes:[{cat:'Ice cream',val:'Chocolate'}] });
  P('wife', { name:'Divya', tamilName:'திவ்யா', gender:'f', dob:soon(19,1992), likes:[{cat:'Ice cream',val:'Alphonso mango'},{cat:'Colour',val:'Peacock blue'},{cat:'Rasi (zodiac)',val:'Rishabam'},{cat:'Dislikes / allergies',val:'Peanuts'}] });
  P('son', { name:'Aadhavan', tamilName:'ஆதவன்', nickname:'Kutty', gender:'m', dob:'2022-01-26', likes:[{cat:'Ice cream',val:'Vanilla cone'},{cat:'Hobbies',val:'Dinosaurs'}] });
  P('akka', { name:'Meena', tamilName:'மீனா', gender:'f', dob:'1987-07-30' });
  P('athimber', { name:'Suresh', gender:'m' });
  P('maamanar', { name:'Rajan', gender:'m', likes:[{cat:'Drink',val:'Sukku coffee'}] });
  P('arjun', { name:'Arjun', gender:'m', circle:'friend', groups:['College gang'], dob:soon(2,1990), metHow:'Same hostel room at PSG College, 2008.', likes:[{cat:'Food',val:'Ambur biryani'},{cat:'Movies',val:'Anything with Vijay Sethupathi'}] });
  P('fatima', { name:'Fatima', gender:'f', circle:'colleague', groups:['Office team'], metHow:'Joined my team at work in 2021.', likes:[{cat:'Drink',val:'Black coffee, no sugar'},{cat:'Food',val:'Vegetarian'}] });
  P('joseph', { name:'Mr. Joseph', gender:'m', circle:'acquaintance', metHow:'Met on the Vaigai Express to Madurai. Retired teacher, runs a library in Dindigul.', notes:'Promised to send him a book on Tamil history.' });

  E({type:'parent',child:'me',parent:'appa'}); E({type:'parent',child:'me',parent:'amma'}); E({type:'spouse',a:'appa',b:'amma'});
  E({type:'sibling',a:'appa',b:'periyappa',elder:'periyappa'}); E({type:'spouse',a:'periyappa',b:'periyamma'});
  E({type:'parent',child:'senthil',parent:'periyappa'}); E({type:'parent',child:'senthil',parent:'periyamma'});
  E({type:'sibling',a:'appa',b:'athai',elder:'appa'});
  E({type:'sibling',a:'amma',b:'mama',elder:'mama'}); E({type:'spouse',a:'mama',b:'mami'});
  E({type:'parent',child:'priya',parent:'mama'}); E({type:'parent',child:'priya',parent:'mami'});
  E({type:'spouse',a:'me',b:'wife'}); E({type:'parent',child:'son',parent:'me'}); E({type:'parent',child:'son',parent:'wife'});
  E({type:'parent',child:'akka',parent:'appa'}); E({type:'parent',child:'akka',parent:'amma'}); E({type:'spouse',a:'akka',b:'athimber'});
  E({type:'parent',child:'wife',parent:'maamanar'});

  s.events = [
    { id:uid(), title:'Our wedding anniversary', type:'anniversary', on:soon(12,2018), yearly:true, people:['me','wife'], remind:7, note:'' },
    { id:uid(), title:'Appa & Amma’s anniversary', type:'anniversary', on:soon(40,1985), yearly:true, people:['appa','amma'], remind:7, note:'' },
    { id:uid(), title:'Aadhavan first called me “Appa”', type:'milestone', on:'2023-02-11', yearly:true, people:['son'], remind:1, note:'At breakfast, holding a dosa.' },
    { id:uid(), title:'Senthil’s first job at TCS', type:'milestone', on:'2008-07-01', yearly:false, people:['senthil'], remind:0, note:'' },
    { id:uid(), title:'College gang reunion in Ooty', type:'other', on:'2019-12-21', yearly:false, people:['arjun','me'], remind:0, note:'' },
  ];
  const ymd = days => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const yAgo = (on, n) => { const [y, m, d] = on.split('-').map(Number); return `${y - n}-${pad(m)}-${pad(d)}`; };
  s.funcs = [{ id: uid(), title:'Housewarming', kind:'Housewarming', on: ymd(34), venue:'New house, Madurai', msg:'', guests: [
    { id: uid(), pid:'appa', invited:true, via:'person', rsvp:'yes', count:2 }, { id: uid(), pid:'periyappa', invited:true, via:'call', rsvp:'yes', count:4 },
    { id: uid(), pid:'athai', invited:true, via:'call' }, { id: uid(), pid:'mama', invited:false, count:1 }, { id: uid(), pid:'arjun', invited:false, count:1 }, { id: uid(), pid:'fatima', invited:false, count:1 } ] }];
  const carTo = ymd(21), tp = ymd(400);
  s.docs = [
    { id: uid(), type:'vehicle_ins', owner:'me', title:'', f:{ vehicle:'TN 59 AB 1234', model:'Maruti Swift' }, remind:30, photos:[], note:'Agent: Ramesh, 98xxxxxx10',
      terms:[ { id: uid(), f:{ insurer:'ICICI Lombard', policyNo:'3001/2345/678', from: yAgo(ymd(22), 1), to: carTo, tpTo: tp, premium:'11850', idv:'420000', ncb:'35' } },
              { id: uid(), f:{ insurer:'Bajaj Allianz', policyNo:'OG-24-1901', from: yAgo(ymd(22), 2), to: yAgo(carTo, 1), premium:'13200', idv:'480000', ncb:'25' } } ] },
    { id: uid(), type:'dl', owner:'me', title:'', f:{ number:'TN5920150001234', classes:'LMV, MCWG', to: ymd(50) }, remind:60, photos:[], terms:[] },
    { id: uid(), type:'term_ins', owner:'appa', title:'', f:{ insurer:'LIC', policyNo:'912345678', cover:'5000000', nominee:'Lakshmi' }, remind:30, photos:[],
      terms:[ { id: uid(), f:{ from: yAgo(ymd(-5), 1), to: ymd(-5), premium:'18400' } } ] },
    { id: uid(), type:'aadhaar', owner:'amma', title:'', f:{ number:'4321' }, photos:[], terms:[] },
  ];
  return s;
}

/* ---------- storage ---------- */
function normalize() {
  for (const id in S.people) S.people[id] = blankPerson(id, S.people[id]);
  S.settings = S.settings || { lang:'both' }; S.edges = S.edges || []; S.events = S.events || []; S.blocked = S.blocked || []; S.docs = S.docs || []; S.funcs = S.funcs || []; S.given = S.given || [];
  fixCircles(); const changed = linkSiblingParents() | linkSpouseKids() | inferGenders(); kc = {};
  return changed;
}
function load() {
  if (cloudConfigured()) { S = cloudEmpty(); return; }   // online only: the data comes from the account after sign-in
  try {
    const r = localStorage.getItem(KEY);
    if (r) { S = JSON.parse(r); if (S && S.people && S.people[S.me]) { if (normalize()) save(true); return; } }
  } catch (e) {}
  S = demo(); save(true);
}
let dataVer = 0;   // goes up on every save, so the page under an open sheet knows to redraw
function save(quiet) {
  kc = {}; dataVer++;
  if (cloudConfigured()) { cloudSaved(); return; }   // online only: straight to the account, nothing kept on this device
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { if (!quiet) toast('Couldn’t save. Try a smaller photo.'); }
  if (!quiet) askPersist();   // ask the browser not to clear this data
}

/* ---------- kinship engine ---------- */
function ageCmp(y, x) { // is y elder ('e') or younger ('y') than x?
  for (const e of S.edges) if (e.type === 'sibling' && e.elder && ((e.a === x && e.b === y) || (e.a === y && e.b === x))) return e.elder === y ? 'e' : 'y';
  const py = S.people[y], px = S.people[x];
  if (py.dob && px.dob && py.dob !== px.dob) return py.dob < px.dob ? 'e' : 'y';
  if (x === S.me && py.relAge) return py.relAge === 'elder' ? 'e' : 'y';
  if (y === S.me && px.relAge) return px.relAge === 'elder' ? 'y' : 'e';
  return '?';
}
function gTok(p, kind) {
  const g = p.gender;
  if (kind === 'parent') return g === 'm' ? 'F' : g === 'f' ? 'M' : 'P';
  if (kind === 'child') return g === 'm' ? 'S' : g === 'f' ? 'D' : 'C';
  return g === 'm' ? 'H' : g === 'f' ? 'W' : 'X';
}
function sibTok(x, y) { const g = S.people[y].gender; return ageCmp(y, x) + (g === 'm' ? 'B' : g === 'f' ? 'Z' : 'G'); }
function neighbors(x) {
  const out = [];
  for (const e of S.edges) {
    if (e.type === 'parent') { if (e.child === x) out.push([e.parent, 'parent']); else if (e.parent === x) out.push([e.child, 'child']); }
    else if (e.type === 'spouse') { if (e.a === x) out.push([e.b, 'spouse']); else if (e.b === x) out.push([e.a, 'spouse']); }
    else if (e.type === 'sibling') { if (e.a === x) out.push([e.b, 'sibling']); else if (e.b === x) out.push([e.a, 'sibling']); }
  }
  return out.filter(([id]) => S.people[id]);
}
// The shortest way to describe someone, counted in relation words: parent → child is one word
// (brother/sister), and a saved brother/sister link costs a little more than going through the parents.
// So with half-brothers saved as brothers, Appa’s other wife is still Chithi, not “Anna’s Amma”.
function pathTo(target) {
  const me = ego();
  if (target === me) return { nodes:[me], kinds:[] };
  const key = (n, up) => n + (up ? '^' : ''), dist = { [key(me, false)]: 0 }, prev = {}, done = new Set(), open = [[me, false]];
  let end = null;
  while (open.length) {
    let bi = 0; open.forEach((s, i) => { if (dist[key(...s)] < dist[key(...open[bi])]) bi = i; });
    const [x, up] = open.splice(bi, 1)[0], kx = key(x, up);
    if (done.has(kx)) continue; done.add(kx);
    if (x === target) { end = kx; break; }
    for (const [y, k] of neighbors(x)) {
      const cost = k === 'child' && up ? 0.01 : k === 'sibling' ? 1.01 : 1, ky = key(y, k === 'parent');
      if (y === me || done.has(ky) || dist[kx] + cost >= (dist[ky] ?? Infinity)) continue;
      dist[ky] = dist[kx] + cost; prev[ky] = [kx, x, k]; open.push([y, k === 'parent']);
    }
  }
  if (!end) return null;
  const nodes = [target], kinds = [];
  for (let c = end; prev[c]; c = prev[c][0]) { kinds.unshift(prev[c][2]); nodes.unshift(prev[c][1]); }
  return { nodes, kinds };
}
function tokens(path) {
  const { nodes, kinds } = path, t = [], ids = [];
  for (let i = 0; i < kinds.length; i++) {
    const from = nodes[i], to = nodes[i+1], k = kinds[i];
    if (k === 'parent' && kinds[i+1] === 'child') { t.push(sibTok(from, nodes[i+2])); ids.push(nodes[i+2]); i++; continue; }
    t.push(k === 'sibling' ? sibTok(from, to) : gTok(S.people[to], k)); ids.push(to);
  }
  t.ids = ids;
  return t;
}
const t3 = (ta, tl, en) => [ta, tl, en];
const PERIYAPPA = t3('பெரியப்பா','Periyappa','Uncle'), CHITHAPPA = t3('சித்தப்பா','Chithappa','Uncle');
const PERIYAMMA = t3('பெரியம்மா','Periyamma','Aunt'), CHITHI = t3('சித்தி','Chithi','Aunt');
const THATHA = t3('தாத்தா','Thatha','Grandfather'), PAATI = t3('பாட்டி','Paati','Grandmother');
const MAAMANAR = t3('மாமனார்','Maamanar','Father-in-law'), MAAMIYAR = t3('மாமியார்','Maamiyar','Mother-in-law');
const TERMS = {
  'F':t3('அப்பா','Appa','Father'), 'M':t3('அம்மா','Amma','Mother'),
  'F.F':THATHA, 'M.F':THATHA, 'F.M':PAATI, 'M.M':PAATI,
  'H':t3('கணவர்','Kanavar','Husband'), 'W':t3('மனைவி','Manaivi','Wife'), 'X':t3('கணவர் / மனைவி','Kanavar / Manaivi','Spouse'),
  'S':t3('மகன்','Magan','Son'), 'D':t3('மகள்','Magal','Daughter'),
  'S.S':t3('பேரன்','Peran','Grandson'), 'D.S':t3('பேரன்','Peran','Grandson'),
  'S.D':t3('பேத்தி','Pethi','Granddaughter'), 'D.D':t3('பேத்தி','Pethi','Granddaughter'),
  'S.W':t3('மருமகள்','Marumagal','Daughter-in-law'), 'D.H':t3('மருமகன்','Marumagan','Son-in-law'),
  'eB':t3('அண்ணா','Anna','Brother'), 'yB':t3('தம்பி','Thambi','Brother'), '?B':t3('அண்ணா / தம்பி','Anna / Thambi','Brother'),
  'eZ':t3('அக்கா','Akka','Sister'), 'yZ':t3('தங்கை','Thangai','Sister'), '?Z':t3('அக்கா / தங்கை','Akka / Thangai','Sister'),
  'F.eB':PERIYAPPA, 'F.yB':CHITHAPPA, 'F.?B':t3('பெரியப்பா / சித்தப்பா','Periyappa / Chithappa','Uncle'),
  'F.eB.W':PERIYAMMA, 'F.yB.W':CHITHI, 'F.?B.W':t3('பெரியம்மா / சித்தி','Periyamma / Chithi','Aunt'),
  'F.xZ':t3('அத்தை','Athai','Aunt'), 'F.xZ.H':t3('மாமா','Mama','Uncle'),
  'M.xB':t3('மாமா','Mama','Uncle'), 'M.xB.W':t3('மாமி','Mami','Aunt'),
  'M.eZ':PERIYAMMA, 'M.yZ':CHITHI, 'M.?Z':t3('பெரியம்மா / சித்தி','Periyamma / Chithi','Aunt'),
  'M.eZ.H':PERIYAPPA, 'M.yZ.H':CHITHAPPA, 'M.?Z.H':t3('பெரியப்பா / சித்தப்பா','Periyappa / Chithappa','Uncle'),
  'eB.W':t3('அண்ணி','Anni','Sister-in-law'), 'yB.W':t3('தம்பி மனைவி','Thambi Manaivi','Sister-in-law'),
  '?B.W':t3('அண்ணி','Anni','Sister-in-law'),
  'eZ.H':t3('மாமா','Mama','Brother-in-law'),
  'yZ.H':sg => sg === 'f' ? t3('தங்கை கணவர்','Thangai Kanavar','Brother-in-law') : t3('மச்சான்','Machan','Brother-in-law'),
  '?Z.H':t3('மாமா / மச்சான்','Mama / Machan','Brother-in-law'),
  'H.F':MAAMANAR, 'W.F':MAAMANAR, 'H.M':MAAMIYAR, 'W.M':MAAMIYAR,
  'W.xB':t3('மச்சான்','Machan','Brother-in-law'), 'W.xZ':t3('மச்சினி','Machini','Sister-in-law'),
  'H.yB':t3('கொழுந்தன்','Kozhundhan','Brother-in-law'), 'H.?B':t3('கொழுந்தன்','Kozhundhan','Brother-in-law'),
  'H.eB':t3('மச்சாண்டார்','Machandar','Brother-in-law'),
  'H.xZ':t3('நாத்தனார்','Nathanar','Sister-in-law'),
};
function special(tk, sg, p) {
  const sib = /^[ey?][BZG]$/;
  const isP = t => t === 'F' || t === 'M', isC = t => t === 'S' || t === 'D', isSp = t => t === 'H' || t === 'W';
  // father’s other wife / mother’s other husband: elder than your own mother/father is Periyamma/Periyappa, younger is Chithi/Chithappa
  if (tk.length === 2 && ((tk[0] === 'F' && tk[1] === 'W') || (tk[0] === 'M' && tk[1] === 'H'))) {
    const mum = tk[1] === 'W', own = S.edges.find(e => e.type === 'parent' && e.child === ego() && S.people[e.parent] && S.people[e.parent].gender === (mum ? 'f' : 'm'));
    const age = p && own ? ageCmp(p.id, own.parent) : '?', en = mum ? 'Step-mother' : 'Step-father';
    const [eT, yT] = mum ? [PERIYAMMA, CHITHI] : [PERIYAPPA, CHITHAPPA];
    return age === 'e' ? t3(eT[0], eT[1], en) : age === 'y' ? t3(yT[0], yT[1], en) : t3(`${eT[0]} / ${yT[0]}`, `${eT[1]} / ${yT[1]}`, en);
  }
  // a grandfather’s other wife is still Paati; a grandmother’s other husband is still Thatha
  if (tk.length === 3 && isP(tk[0]) && ((tk[1] === 'F' && tk[2] === 'W') || (tk[1] === 'M' && tk[2] === 'H')))
    return tk[2] === 'W' ? t3(PAATI[0], PAATI[1], 'Step-grandmother') : t3(THATHA[0], THATHA[1], 'Step-grandfather');
  // great-grandchildren
  if (tk.length === 3 && tk.every(isC)) return tk[2] === 'S' ? t3('கொள்ளுப் பேரன்','Kollu Peran','Great-grandson') : t3('கொள்ளுப் பேத்தி','Kollu Pethi','Great-granddaughter');
  // a grandparent’s brother or sister
  if (tk.length === 3 && isP(tk[0]) && isP(tk[1]) && sib.test(tk[2])) return tk[2].endsWith('B') ? t3('தாத்தா','Thatha','Grand-uncle') : t3('பாட்டி','Paati','Grand-aunt');
  // a brother’s or sister’s grandchild
  if (tk.length === 3 && sib.test(tk[0]) && isC(tk[1]) && isC(tk[2])) return tk[2] === 'S' ? t3('பேரன்','Peran','Grand-nephew') : t3('பேத்தி','Pethi','Grand-niece');
  // husband’s / wife’s nephews and nieces: the same word the husband or wife uses
  if (tk.length === 3 && isSp(tk[0]) && sib.test(tk[1]) && isC(tk[2])) return special([tk[1], tk[2]], tk[0] === 'H' ? 'm' : 'f', p);
  // co-brother and co-sister
  if (tk.length === 3 && tk[0] === 'W' && /Z$/.test(tk[1]) && tk[2] === 'H') return t3('சகலை','Sagalai','Co-brother');
  if (tk.length === 3 && tk[0] === 'H' && /B$/.test(tk[1]) && tk[2] === 'W') return t3('ஓரகத்தி','Oragathi','Co-sister');
  // the parents of your son-in-law or daughter-in-law
  if (tk.length === 3 && isC(tk[0]) && isSp(tk[1]) && isP(tk[2])) return t3('சம்பந்தி','Sambandhi','Co-parent-in-law');
  // great-grandparents
  if (tk.length === 3 && tk.every(x => x === 'F' || x === 'M'))
    return tk[2] === 'F' ? t3('கொள்ளுத் தாத்தா','Kollu Thatha','Great-grandfather') : t3('கொள்ளுப் பாட்டி','Kollu Paati','Great-grandmother');
  // sibling's child
  if (tk.length === 2 && sib.test(tk[0]) && /^[SD]$/.test(tk[1])) {
    const male = tk[1] === 'S';
    const same = (tk[0].endsWith('B') && sg === 'm') || (tk[0].endsWith('Z') && sg === 'f');
    if (same) return male ? t3('மகன்','Magan','Nephew') : t3('மகள்','Magal','Niece');
    return male ? t3('மருமகன்','Marumagan','Nephew') : t3('மருமகள்','Marumagal','Niece');
  }
  // spouse's grandparents
  if (tk.length === 3 && /^[HW]$/.test(tk[0]) && /^[FM]$/.test(tk[1]) && /^[FM]$/.test(tk[2]))
    return tk[2] === 'F' ? t3('தாத்தா','Thatha','Grandfather-in-law') : t3('பாட்டி','Paati','Grandmother-in-law');
  // sibling's child's spouse
  if (tk.length === 3 && sib.test(tk[0]) && /^[SD]$/.test(tk[1]) && /^[HW]$/.test(tk[2]))
    return tk[2] === 'H' ? t3('மருமகன்','Marumagan','Niece’s husband') : t3('மருமகள்','Marumagal','Nephew’s wife');
  // cousins
  if (tk.length === 3 && /^[FM]$/.test(tk[0]) && sib.test(tk[1]) && /^[SD]$/.test(tk[2])) {
    const parallel = (tk[0] === 'F' && tk[1].endsWith('B')) || (tk[0] === 'M' && tk[1].endsWith('Z'));
    const age = p ? ageCmp(p.id, ego()) : '?', male = tk[2] === 'S';
    if (parallel) {
      if (male) return age === 'e' ? t3('அண்ணா','Anna','Cousin') : age === 'y' ? t3('தம்பி','Thambi','Cousin') : t3('அண்ணா / தம்பி','Anna / Thambi','Cousin');
      return age === 'e' ? t3('அக்கா','Akka','Cousin') : age === 'y' ? t3('தங்கை','Thangai','Cousin') : t3('அக்கா / தங்கை','Akka / Thangai','Cousin');
    }
    const side = tk[1].endsWith('B') ? ['மாமா','Mama'] : ['அத்தை','Athai'];
    if (male) return sg === 'f' ? t3('அத்தான்','Athan','Cousin') : t3('மச்சான்','Machan','Cousin');
    return t3(side[0] + ' மகள்', side[1] + ' Magal','Cousin');
  }
  return null;
}
function lookupTerm(tk, sg, p) {
  const key = tk.join('.'), kx = key.replace(/[ey?]([BZ])/g, 'x$1');
  let v = TERMS[key] || TERMS[kx];
  if (typeof v === 'function') v = v(sg);
  return v || special(tk, sg, p) || null;
}
const tokGender = t => /[BFSH]$/.test(t) ? 'm' : /[ZMDW]$/.test(t) ? 'f' : '';
// A parallel cousin (Periyappa’s / Chithappa’s / Periyamma’s / Chithi’s child) counts as a brother or sister,
// so their wife is Anni, their children are Magan / Marumagan, and so on.
function normTk(tk) {
  if (!tk.ids) return tk;
  let t = tk.slice(), ids = tk.ids.slice(), changed = true;
  while (changed && t.length > 3) {
    changed = false;
    for (let i = 0; i + 2 < t.length; i++) {
      if (!/^[FM]$/.test(t[i]) || !/^[ey?][BZ]$/.test(t[i + 1]) || !/^[SD]$/.test(t[i + 2])) continue;
      const parallel = (t[i] === 'F' && t[i + 1].endsWith('B')) || (t[i] === 'M' && t[i + 1].endsWith('Z'));
      if (!parallel) continue;
      const cid = ids[i + 2], ref = i === 0 ? ego() : ids[i - 1];      // whose cousin this is
      t.splice(i, 3, ageCmp(cid, ref) + (t[i + 2] === 'S' ? 'B' : 'Z')); ids.splice(i, 3, cid);
      changed = true; break;
    }
  }
  t.ids = ids;
  return t;
}
function resolve(tk, p) {
  const sg = S.people[ego()].gender;
  tk = normTk(tk);
  let v = lookupTerm(tk, sg, p);
  // No single Tamil word: name them through the nearest relative who has one,
  // e.g. Anni’s father → “அண்ணி அப்பா”, Anni’s grandfather → “அண்ணி தாத்தா”
  if (!v) for (let i = tk.length - 1; i >= 1; i--) {
    const a = lookupTerm(tk.slice(0, i), sg, tk.ids ? S.people[tk.ids[i - 1]] : null), b = lookupTerm(tk.slice(i), tokGender(tk[i - 1]), p);
    if (a && b) { const one = s => s.split(' / ')[0]; v = t3(`${one(a[0])} ${b[0]}`, `${one(a[1])} ${b[1]}`, `${one(a[1])}’s ${b[2].toLowerCase()}`); break; }
  }
  if (!v) v = t3('உறவினர்','Uravinar','Relative');
  return { ta:v[0], tl:v[1], en:v[2] };
}
const WORDS = { F:'father', M:'mother', P:'parent', S:'son', D:'daughter', C:'child', H:'husband', W:'wife', X:'spouse',
  eB:'elder brother', yB:'younger brother', '?B':'brother', eZ:'elder sister', yZ:'younger sister', '?Z':'sister',
  eG:'elder sibling', yG:'younger sibling', '?G':'sibling' };
const describe = tk => (ego() === S.me ? 'Your ' : S.people[ego()].name + '’s ') + tk.map(x => WORDS[x] || x).join('’s ');
const genOf = tk => tk.reduce((g, x) => g + ('FMP'.includes(x) ? 1 : 'SDC'.includes(x) ? -1 : 0), 0);
function circleTerm(p) {
  if (p.circle === 'friend') return p.gender === 'f' ? { ta:'தோழி', tl:'Thozhi', en:'Friend' } : { ta:'நண்பர்', tl:'Nanbar', en:'Friend' };
  if (p.circle === 'colleague') return { ta:'சக ஊழியர்', tl:'Saga Oozhiyar', en:'Colleague' };
  if (p.circle === 'acquaintance') return { ta:'அறிமுகமானவர்', tl:'Arimugamanavar', en:'Someone you met' };
  return { ta:'உறவினர்', tl:'Uravinar', en:'Relative', desc:'Not linked to your family yet' };
}
// For people outside my family (e.g. a friend's wife): describe them through the first person
// I added from their group, so Arjun's wife shows as "Arjun's wife" instead of "Relative".
// Friend / colleague / met links between two saved people (e.g. Rajesh’s friend)
const socialEdges = x => S.edges.filter(e => e.type === 'social' && (e.a === x || e.b === x)).map(e => [e.a === x ? e.b : e.a, e.kind]).filter(([y]) => S.people[y]);
// true when this person was saved as someone else’s friend/colleague (not known to me directly)
const addedVia = id => S.edges.some(e => e.type === 'social' && e.b === id);
const allLinks = x => [...neighbors(x), ...socialEdges(x)];
function anchorOf(id) {
  const seen = new Set([id]), q = [id];
  while (q.length) { const x = q.shift(); for (const [y] of allLinks(x)) if (!seen.has(y)) { seen.add(y); q.push(y); } }
  const order = Object.keys(S.people);
  return [...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}
// When someone has a child saved with only one parent, and that parent has a husband/wife,
// the husband/wife is that child’s other parent. Returns true if anything was added.
// "child|parent" pairs the user removed; the app never re-adds these on its own
// everyone a person is (or was) married to – there can be more than one
const spousesOf = id => S.edges.filter(e => e.type === 'spouse' && (e.a === id || e.b === id)).map(e => e.a === id ? e.b : e.a).filter(o => S.people[o]);
const isBlocked = (c, p) => (S.blocked || []).includes(c + '|' + p);
const unblock = (c, p) => { S.blocked = (S.blocked || []).filter(k => k !== c + '|' + p); };
// Brothers and sisters share parents: if one has a parent saved and the other doesn’t, link it.
// Skips a parent you removed yourself, and never gives anyone two fathers or two mothers.
function linkSiblingParents(g) {
  let added = false, again = true;
  while (again) {
    again = false;
    for (const e of S.edges.filter(x => x.type === 'sibling')) {
      for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) {
        const px = S.edges.filter(p => p.type === 'parent' && p.child === x).map(p => p.parent);
        const py = S.edges.filter(p => p.type === 'parent' && p.child === y).map(p => p.parent);
        for (const p of px) {
          if (py.includes(p) || p === y || isBlocked(y, p) || !S.people[p] || !S.people[y]) continue;
          const g0 = S.people[p].gender;
          if (py.length >= 2 || py.some(q => S.people[q] && S.people[q].gender === g0)) continue;
          // half-brothers and sisters: if the parent already saved has more than one husband/wife, don’t guess the other one
          if (py.some(q => spousesOf(q).length > 1) || px.some(q => q !== p && spousesOf(q).length > 1)) continue;
          S.edges.push(Object.assign({ id: uid(), type:'parent', child:y, parent:p }, g ? { g, auto: true } : {}));
          py.push(p); added = again = true;
        }
      }
    }
  }
  return added;
}
function linkSpouseKids(g) {
  let added = false;
  for (const sp of S.edges.filter(e => e.type === 'spouse')) {
    for (const [p, q] of [[sp.a, sp.b], [sp.b, sp.a]]) {
      // someone married more than once: we can’t tell which husband/wife is the child’s other parent
      if (spousesOf(p).length !== 1) continue;
      for (const e of S.edges.filter(e => e.type === 'parent' && e.parent === p)) {
        const ps = S.edges.filter(x => x.type === 'parent' && x.child === e.child);
        if (ps.length === 1 && e.child !== q && !isBlocked(e.child, q) && S.people[q] && S.people[p] && S.people[q].gender !== S.people[p].gender) { S.edges.push(Object.assign({ id: uid(), type:'parent', child:e.child, parent:q }, g ? { g, auto: true } : {})); added = true; }
      }
    }
  }
  return added;
}
// A husband/wife pair where only one gender is saved: the other is the opposite.
function inferGenders() {
  let changed = false;
  for (const e of S.edges.filter(e => e.type === 'spouse')) {
    const a = S.people[e.a], b = S.people[e.b]; if (!a || !b) continue;
    if (a.gender && !b.gender) { b.gender = a.gender === 'm' ? 'f' : 'm'; changed = true; }
    else if (b.gender && !a.gender) { a.gender = b.gender === 'm' ? 'f' : 'm'; changed = true; }
  }
  return changed;
}
function fixCircles() {
  for (const p of Object.values(S.people)) {
    if (p.id === S.me || p.circle !== 'family' || pathTo(p.id)) continue;
    const a = anchorOf(p.id);
    if (a !== p.id && S.people[a].circle !== 'family') p.circle = S.people[a].circle;
  }
}
function kin(id) {
  const p = S.people[id];
  if (id === ego()) return { ta:'நான்', tl:'Naan', en: id === S.me ? 'You' : 'Self', desc: id === S.me ? 'This is you' : 'Seeing the family as ' + p.name, gen:0, family:true, tk:[] };
  const path = pathTo(id);
  let r;
  const sp = path ? null : socialPath(ego(), id);
  if (!path && sp && sp.nodes.length > 2) {
    const t = connTerm(sp.nodes, sp.kinds);
    const via = sp.nodes.slice(1, -1).map(n => n === S.me ? 'you' : S.people[n].name).join(', ');
    r = { ta:t.ta, tl:t.tl, en:t.en, desc:`Connected through ${via}`, family:false, tk:[], anchor:true };
  }
  else if (!path) {
    r = circleTerm(p);
    const more = (p.also || []).filter(k => k !== p.circle && SOCIAL[k]).map(k => socialWord(k, id));
    if (more.length) r = Object.assign({}, r, { ta: [r.ta, ...more.map(w => w[0])].join(' / '), tl: [r.tl, ...more.map(w => w[1])].join(' / '), en: [r.en, ...more.map(w => w[2])].join(' & ') });
    r.family = false; r.tk = [];
  }
  else { const tk = tokens(path); r = resolve(tk, p); r.desc = describe(tk); r.gen = genOf(tk); r.family = true; r.tk = tk; }
  if (p.callAs && ego() === S.me) r.custom = p.callAs;
  return r;
}
const kinOf = id => { const key = ego() + '|' + id; return kc[key] || (kc[key] = kin(id)); };

/* ---------- dates ---------- */
function today() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function nextOcc(on) {
  const [y, m, d] = on.split('-').map(Number), t = today();
  let n = new Date(t.getFullYear(), m-1, d);
  if (n < t) n = new Date(t.getFullYear()+1, m-1, d);
  return { date:n, days:Math.round((n - t) / 864e5), years:n.getFullYear() - y };
}
function allDates() {
  const list = [];
  for (const p of Object.values(S.people)) if (p.dead && p.dod)
    list.push({ kind:'memorial', title:`${p.name}’s remembrance day`, on:p.dod, yearly:true, people:[p.id], remind:3 });
  for (const p of Object.values(S.people)) if (p.dob && !p.dead)
    list.push({ kind:'birthday', title: p.id === S.me ? 'Your birthday' : `${p.name}’s birthday`, on:p.dob, yearly:true, people:[p.id], remind:7 });
  for (const e of S.events) list.push(Object.assign({ kind:e.type }, e));
  return list;
}
const upcoming = () => allDates().filter(x => x.yearly && x.on).map(x => Object.assign({}, x, nextOcc(x.on))).sort((a, b) => a.days - b.days);
const fmtDate = on => { if (!on) return ''; const [y, m, d] = on.split('-').map(Number); return `${d} ${MONTHS[m-1]} ${y}`; };
const lifeTxt = p => 'Passed away' + (p.dod ? ' on ' + fmtDate(p.dod) : '') + (p.dob ? ', born ' + fmtDate(p.dob) : '');
const whenTxt = d => d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`;
const isSoon = x => x.days <= Math.max(x.remind ?? 3, 1);
function extraTxt(x) {
  if (!(x.years > 0)) return '';
  return x.kind === 'birthday' ? `Turns ${x.years}` : x.kind === 'anniversary' ? `${x.years} years` : `${x.years} year${x.years === 1 ? '' : 's'} ago`;
}
// field: on the person page, tapping a birthday / remembrance day changes that date in place
function dateRow(x, label, field) {
  const names = x.kind === 'birthday' || x.kind === 'memorial' ? '' : x.people.map(id => S.people[id]?.name).filter(Boolean).join(', ');
  return `<button class="r ${isSoon(x) ? 'soon' : ''}" data-act="${field ? 'qf-open' : x.id ? 'event-edit' : 'person'}" data-id="${esc(field || x.id || x.people[0])}">
    <span class="cal"><b>${x.date.getDate()}</b><small>${MONTHS[x.date.getMonth()]}</small></span>
    <span class="tx"><span class="t1">${esc(label || x.title)}</span><span class="t2">${esc([extraTxt(x), names].filter(Boolean).join(', '))}</span></span>
    <span class="when">${whenTxt(x.days)}</span></button>`;
}
function momentRow(e) {
  const y = today().getFullYear() - Number(e.on.slice(0, 4));
  return `<button class="r" data-act="event-edit" data-id="${esc(e.id)}">
    <span class="cal"><b>${Number(e.on.slice(8))}</b><small>${MONTHS[Number(e.on.slice(5, 7)) - 1]} ${e.on.slice(2, 4)}</small></span>
    <span class="tx"><span class="t1">${esc(e.title)}</span><span class="t2">${esc(e.people.map(id => S.people[id]?.name).filter(Boolean).join(', '))}</span></span>
    <span class="when">${y <= 0 ? 'This year' : y + (y === 1 ? ' year ago' : ' years ago')}</span></button>`;
}
function upCard(x) {
  const ps = x.people.map(id => S.people[id]).filter(Boolean);
  const nm = x.kind === 'birthday' ? (ps[0]?.id === S.me ? 'You' : ps[0]?.name) : ps.map(p => p.name).join(' & ');
  const what = x.kind === 'birthday' ? (x.years > 0 ? `Turns ${x.years} 🎂` : 'Birthday 🎂') : x.kind === 'memorial' ? 'Remembrance day' + (x.years > 0 ? `, ${x.years} year${x.years === 1 ? '' : 's'}` : '') : x.title;
  return `<button class="up ${isSoon(x) ? 'soon' : ''}" data-act="${x.id ? 'event-edit' : 'person'}" data-id="${esc(x.id || x.people[0])}">
    <span class="avs">${ps.slice(0, 2).map(p => avatar(p)).join('')}</span>
    <span class="when">${whenTxt(x.days)}</span><span class="nm">${esc(nm)}</span><span class="what">${esc(what)}</span></button>`;
}

