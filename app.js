/* AI-initiatievenbank: Supabase-versie.
   Inloggen gaat met een gedeeld wachtwoord: achter elk wachtwoord zit één Supabase-gebruiker met een rol
   (team, jury of beheer). Wie wat mag, regelt de database (zie supabase/schema.sql); deze code laat alleen zien wat iemand mag doen. */

const CRIT = [
  {k:'tijd', label:'Tijdswinst', w:25, color:'--c1', ink:'#ffffff', hint:'Hoeveel tijd bespaart dit, voor de indiener en voor anderen?',
   scale:['Nauwelijks tijdswinst','Minder dan 1 uur per week','1 tot 2 uur per week','2 tot 4 uur per week','Meer dan 4 uur per week']},
  {k:'impact', label:'Impact op team/resultaten', w:25, color:'--c2', ink:'#ffffff', hint:'Verbetert het de kwaliteit, klantbeleving of teamdoelen?',
   scale:['Geen merkbare impact','Klein en lokaal','Merkbaar voor een deel van het team','Duidelijk voor het hele team','Zichtbaar in onze resultaten']},
  {k:'innovatie', label:'Innovatie & creativiteit', w:20, color:'--c3', ink:'#ffffff', hint:'Hoe origineel is de toepassing?',
   scale:['Bestaande aanpak','Kleine variatie op iets bekends','Slimme toepassing','Nieuw voor ons team','Echt vernieuwend']},
  {k:'herbruik', label:"Herbruikbaarheid voor collega's", w:20, color:'--c4', ink:'#004e72', hint:'Kunnen anderen dit overnemen?',
   scale:['Alleen bruikbaar voor de indiener','Voor een paar collega’s','Voor velen, na wat uitleg','Direct bruikbaar voor de meesten','Kant-en-klaar voor iedereen']},
  {k:'eenvoud', label:'Eenvoud van implementatie', w:10, color:'--c5', ink:'#6e0430', hint:'Hoeveel moeite kost het om dit in te voeren?',
   scale:['Complex, veel hulp nodig','Lastig','Gemiddeld','Eenvoudig','Binnen een uur opgezet']},
];
const CATS = ['Schrijven & communicatie','Data & analyse','Automatisering','Klantcontact','Onderzoek & kennis','Planning & organisatie','Overig'];
const STATUS = {idee:'Idee', test:'In test', gebruik:'In gebruik'};
const TEAMS = ['Digital','LSM','Data','Brand','NPD'];

const CFG = window.AIIB_CONFIG || {};
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fmt = n => (Math.round(n * 10) / 10).toLocaleString('nl-NL', {maximumFractionDigits:1});

const gekoppeld = CFG.supabaseUrl && !/JOUW/.test(CFG.supabaseUrl + CFG.supabaseAnonKey) && window.supabase;
const sb = gekoppeld ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;

const S = { ingelogd:false, rol:null, juryNaam:'',
  inits:[], gem:{}, mijn:{}, aantalBeoordelaars:0,
  tab:'list', editing:null, openId:null, draft:null, loaded:false, saving:false, confirmDel:false, lastTeam:'', lastNaam:'' };
const sleutel = naam => (naam || '').trim().toLowerCase();

/* ---------- gegevens ---------- */
async function laad(){
  if (!S.ingelogd) return;
  const vragen = [
    sb.from('initiatieven').select('*').order('aangemaakt', {ascending:false}),
    sb.rpc('scores'),
    sb.rpc('aantal_beoordelaars'),
  ];
  if (S.rol === 'jury') vragen.push(sb.from('beoordelingen').select('*').ilike('jurylid', S.juryNaam.trim()));
  const [a, c, e, d] = await Promise.all(vragen);
  if (a.error) { showBanner('De initiatieven konden niet worden geladen. Herlaad de pagina.'); return; }
  $('#banner').hidden = true;
  S.inits = a.data.map(r => ({ id:r.id, title:r.titel, description:r.beschrijving, team:r.team, tools:r.tools || '',
    category:r.categorie || '', status:r.status, hours:r.uren, link:r.link || '', createdAt:r.aangemaakt, ownerName:r.indiener }));
  S.gem = Object.fromEntries((c.data || []).map(g => [g.initiatief, g]));
  S.mijn = Object.fromEntries(((d && d.data) || []).map(r => [r.initiatief, r]));
  S.aantalBeoordelaars = e.data || 0;
  S.loaded = true;
  render();
}

function stats(init){
  const g = S.gem[init.id];
  const pts = {}; let total = 0;
  CRIT.forEach(c => { pts[c.k] = g ? Number(g[c.k]) / 5 * c.w : 0; total += pts[c.k]; });
  return {n: g ? g.aantal : 0, pts, total};
}
const myRating = id => S.mijn[id] || null;
// "Eigen" initiatief: alleen relevant voor de jury (indienersnaam gelijk aan de naam van het jurylid)
const isMine = init => S.rol === 'jury' && !!S.juryNaam && sleutel(init.ownerName) === sleutel(S.juryNaam);

/* ---------- opbouw statische delen ---------- */
function buildStatic(){
  const lg = $('#legend');
  CRIT.forEach(c => { const s = el('span'); const i = el('i'); i.style.background = `var(${c.color})`; s.append(i, `${c.label} (${c.w})`); lg.append(s); });
  const fc = $('#fCat'); fc.append(new Option('Alle categorieën', ''));
  CATS.forEach(c => fc.append(new Option(c, c)));
  const ic = $('#iCat'); CATS.forEach(c => ic.append(new Option(c, c)));
  const ft = $('#fTeam'); ft.append(new Option('Alle teams', ''));
  TEAMS.forEach(t => { ft.append(new Option(t, t)); $('#iTeam').append(new Option(t, t)); });

  const t = $('#rubricTable');
  const hr = el('tr'); ['criterium','gewicht','1','2','3','4','5'].forEach(h => hr.append(el('th', null, h)));
  const thead = el('thead'); thead.append(hr); t.append(thead);
  const tb = el('tbody');
  CRIT.forEach(c => {
    const tr = el('tr'); const td = el('td','crit'); const i = el('i'); i.style.background = `var(${c.color})`; td.append(i, c.label);
    tr.append(td, el('td','pnt num', c.w + ' pnt'));
    c.scale.forEach((s, ix) => { const d = el('td'); d.append(el('div','pnt num', fmt((ix+1)/5*c.w) + ' pnt'), s); tr.append(d); });
    tb.append(tr);
  });
  const tot = el('tr'); tot.append(el('td','crit','Totaal'), el('td','pnt num','100 pnt')); for (let i=0;i<5;i++) tot.append(el('td')); tb.append(tot);
  t.append(tb);
}

/* ---------- render ---------- */
function render(){
  const enriched = S.inits.map(i => ({...i, st: stats(i)}));
  const reviewed = enriched.filter(i => i.st.n);
  const totalReviews = enriched.reduce((a, i) => a + i.st.n, 0);
  const reviewers = S.aantalBeoordelaars;
  const owners = new Set(S.inits.map(i => sleutel(i.ownerName))).size;
  $('#sCount').textContent = S.loaded ? enriched.length : '–';
  $('#sCountSub').textContent = S.loaded ? `van ${owners} ${owners === 1 ? 'collega' : 'collega’s'}` : ' ';
  $('#sReviews').textContent = S.loaded ? totalReviews : '–';
  $('#sReviewsSub').textContent = S.loaded ? `door ${reviewers} ${reviewers === 1 ? 'beoordelaar' : 'beoordelaars'}` : ' ';
  $('#sAvg').textContent = reviewed.length ? fmt(reviewed.reduce((a, i) => a + i.st.total, 0) / reviewed.length) : '–';
  const top = [...reviewed].sort((a, b) => b.st.total - a.st.total)[0];
  $('#sTop').textContent = top ? fmt(top.st.total) : '–';
  $('#sTopSub').textContent = top ? top.title : 'nog geen beoordelingen';
  $('#stGetal').textContent = enriched.length;
  $('#stLabel').textContent = enriched.length === 1 ? 'idee' : 'ideeën';
  renderTeams(enriched);

  const q = $('#q').value.trim().toLowerCase(), cat = $('#fCat').value, team = $('#fTeam').value, sort = $('#fSort').value;
  let rows = enriched.filter(i => (!cat || i.category === cat) && (!team || i.team === team) &&
    (!q || [i.title, i.description, i.tools].join(' ').toLowerCase().includes(q)));
  const byScore = (a, b) => (b.st.n ? 1 : 0) - (a.st.n ? 1 : 0) || b.st.total - a.st.total || b.st.n - a.st.n;
  if (sort === 'score') rows.sort(byScore);
  if (sort === 'new') rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (sort === 'reviews') rows.sort((a, b) => b.st.n - a.st.n || b.st.total - a.st.total);
  const rankMap = new Map([...enriched].sort(byScore).filter(i => i.st.n).map((i, ix) => [i.id, ix + 1]));

  const list = $('#list'); list.replaceChildren();
  if (!S.loaded) list.append(emptyState('even laden', ''));
  else if (!enriched.length) list.append(emptyState('nog geen initiatieven',
    'Hier verschijnen de AI-initiatieven van het team, gerangschikt op hun gemiddelde score. Dien het eerste in.', true));
  else if (!rows.length) list.append(emptyState('geen resultaten', 'Pas je zoekterm of categorie aan.'));
  else rows.forEach(i => list.append(card(i, rankMap.get(i.id))));

  const todo = enriched.filter(i => !isMine(i) && !myRating(i.id)).sort((a, b) => a.st.n - b.st.n);
  const others = enriched.filter(i => !isMine(i)).length;
  $('#todoCount').textContent = todo.length;
  $('#todoLead').textContent = others ? `Je hebt ${others - todo.length} van ${others} initiatieven van collega's beoordeeld. Initiatieven met de minste beoordelingen staan bovenaan.` : '';
  const tl = $('#todoList'); tl.replaceChildren();
  if (!S.loaded) tl.append(emptyState('even laden', ''));
  else if (!others) tl.append(emptyState('nog niets te beoordelen', 'Zodra collega’s initiatieven indienen, verschijnen ze hier.'));
  else if (!todo.length) tl.append(emptyState('alles beoordeeld', 'Je hebt alle initiatieven van collega’s beoordeeld. Nieuwe inzendingen verschijnen hier vanzelf.'));
  else todo.forEach(i => tl.append(card(i, null)));

  if (S.openId) renderDrawer();
}

function renderTeams(list){
  const count = {}; TEAMS.forEach(t => count[t] = 0);
  list.forEach(i => { if (count[i.team] != null) count[i.team]++; });
  const max = Math.max(...Object.values(count));
  const leaders = max ? TEAMS.filter(t => count[t] === max) : [];
  const kop = $('#tsKop'); kop.replaceChildren();
  const naam = t => el('em', null, t.toLowerCase());
  if (!S.loaded) { kop.textContent = 'even laden'; $('#tsSub').textContent = ' '; }
  else if (!leaders.length) { kop.textContent = 'nog geen inzendingen'; $('#tsSub').textContent = 'Welk team dient als eerste een initiatief in?'; }
  else if (leaders.length === 1) {
    kop.append(naam(leaders[0]), ' gaat aan kop');
    $('#tsSub').textContent = `Team ${leaders[0]} heeft de meeste initiatieven ingediend: ${max}.`;
  } else {
    leaders.forEach((t, ix) => { if (ix) kop.append(ix === leaders.length - 1 ? ' en ' : ', '); kop.append(naam(t)); });
    kop.append(' delen de koppositie');
    $('#tsSub').textContent = `Elk ${max} ${max === 1 ? 'initiatief' : 'initiatieven'} ingediend.`;
  }
  const bt = $('#bkTeam');
  bt.textContent = leaders.length ? leaders.map(t => t.toLowerCase()).join(' & ') : '?';
  bt.classList.toggle('klein', leaders.length > 1);
  $('#bkLabel').textContent = leaders.length > 1 ? 'gedeeld' : leaders.length ? 'team' : 'nog open';
  $('#bkVoet').textContent = leaders.length ? `${max} ${max === 1 ? 'idee' : 'ideeën'}` : 'meeste ideeën';
  $('#bokaal').setAttribute('aria-label', leaders.length ? `Bokaal voor team ${leaders.join(' en ')}: ${max} ingediend` : 'Bokaal voor het team met de meeste inzendingen, nog niet vergeven');

  const box = $('#tsTeams'); box.replaceChildren();
  [...TEAMS].sort((a, b) => count[b] - count[a]).forEach(t => {
    const r = el('div', 'team' + (leaders.includes(t) ? ' leider' : ''));
    const tb = el('div','tb'); const i = el('i'); i.style.width = (max ? count[t] / max * 100 : 0) + '%'; tb.append(i);
    r.append(el('span', null, t), tb, el('span','n num', String(count[t])));
    r.setAttribute('aria-label', `${t}: ${count[t]} ingediend`);
    box.append(r);
  });
}

function emptyState(title, text, cta){
  const d = el('div','leeg'); d.append(el('h3', null, title)); if (text) d.append(el('p', null, text));
  if (cta && S.ingelogd) { const b = el('button','knop','indienen'); b.onclick = () => openForm(null); d.append(b); }
  return d;
}

function initialen(naam){ return (naam || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?'; }
function personNode(naam){
  const w = el('span', 'wie');
  const av = el('span', 'av av-init', initialen(naam)); av.setAttribute('aria-hidden', 'true');
  w.append(av, el('span', null, naam || 'Collega'));
  return w;
}

function bar(st){
  const b = el('div','balk'); b.setAttribute('aria-hidden','true');
  CRIT.forEach(c => { const s = el('span'); s.style.width = st.pts[c.k] + '%'; s.style.background = `var(${c.color})`; b.append(s); });
  return b;
}

function card(i, rank){
  const c = el('button','kaart'); c.type = 'button';
  c.setAttribute('aria-label', `${i.title}, ${i.st.n ? fmt(i.st.total) + ' punten' : 'nog niet beoordeeld'}`);
  const r = el('div', 'rang' + (rank && rank <= 3 ? ' top' : ''), rank ? String(rank) : '–');
  const body = el('div','kbody');
  body.append(el('h3', null, i.title));
  const meta = el('div','meta'); meta.append(personNode(i.ownerName));
  if (i.team) meta.append(el('span','chip team-chip', i.team));
  if (i.category) meta.append(el('span','chip', i.category));
  meta.append(el('span','chip st-' + i.status, STATUS[i.status] || 'Idee'));
  if (i.tools) meta.append(el('span', null, i.tools));
  body.append(meta, el('p','omschr', i.description), bar(i.st));
  const sc = el('div','score');
  sc.append(el('b', i.st.n ? 'num' : 'nieuw', i.st.n ? fmt(i.st.total) : 'nieuw'));
  sc.append(el('small', null, i.st.n ? `${i.st.n} ${i.st.n === 1 ? 'beoordeling' : 'beoordelingen'}` : 'nog geen score'));
  if (isMine(i)) sc.append(el('span','mijn eigen','Jouw initiatief'));
  else if (S.rol === 'jury') sc.append(myRating(i.id) ? el('span','mijn klaar','✓ Beoordeeld') : el('span','mijn open','Nog beoordelen'));
  c.append(r, body, sc);
  c.onclick = () => openDrawer(i.id);
  return c;
}

/* ---------- zijpaneel ---------- */
function openDrawer(id){
  S.openId = id;
  const mine = myRating(id);
  S.draft = {}; CRIT.forEach(c => S.draft[c.k] = mine ? mine[c.k] : 0);
  S.confirmDel = false;
  renderDrawer();
}
function closeDrawer(){ S.openId = null; $('#drawer').hidden = true; $('#drawer').replaceChildren(); }

function renderDrawer(){
  const i = S.inits.find(x => x.id === S.openId);
  const host = $('#drawer');
  if (!i) { closeDrawer(); return; }
  const st = stats(i);
  const keepScroll = host.querySelector('.paneel')?.scrollTop || 0;
  const scrim = el('div','scrim'); scrim.onclick = e => { if (e.target === scrim) closeDrawer(); };
  const p = el('div','paneel'); p.setAttribute('role','dialog'); p.setAttribute('aria-modal','true'); p.setAttribute('aria-label', i.title);

  const head = el('div','pkop'); const ht = el('div'); ht.style.minWidth = '0';
  ht.append(el('div','cat', i.category || 'Initiatief'), el('h2', null, i.title));
  const x = el('button','sluit','×'); x.setAttribute('aria-label','Sluiten'); x.onclick = closeDrawer;
  head.append(ht, x); p.append(head);

  const info = el('div','blok');
  const meta = el('div','meta'); meta.append(personNode(i.ownerName));
  if (i.team) meta.append(el('span','chip team-chip', 'Team ' + i.team));
  meta.append(el('span','chip st-' + i.status, STATUS[i.status] || 'Idee'));
  if (i.createdAt) meta.append(el('span', null, 'Ingediend ' + new Date(i.createdAt).toLocaleDateString('nl-NL', {day:'numeric', month:'long', year:'numeric'})));
  info.append(meta, el('p','volledig', i.description));
  const dl = el('dl','feiten');
  const fact = (k, v) => { dl.append(el('dt', null, k)); const dd = el('dd'); if (v instanceof Node) dd.append(v); else dd.textContent = v; dl.append(dd); };
  if (i.tools) fact('AI-tool(s)', i.tools);
  if (i.hours != null && i.hours !== '') fact('Tijdswinst (indiener)', fmt(i.hours) + ' uur per week');
  if (i.link && /^https?:\/\//i.test(i.link)) { const a = el('a', null, i.link); a.href = i.link; a.target = '_blank'; a.rel = 'noopener'; fact('Link', a); }
  if (dl.children.length) info.append(dl);
  p.append(info);

  const ts = el('div','blok');
  const th = el('div','totaal'); const thl = el('div'); thl.append(el('h3', null, 'teamscore'), el('span','zacht', st.n ? `Gemiddelde van ${st.n} ${st.n === 1 ? 'beoordeling' : 'beoordelingen'}` : 'Nog niet beoordeeld'));
  const tv = el('div'); tv.append(el('b','num', st.n ? fmt(st.total) : '–'), el('span','zacht',' / 100'));
  th.append(thl, tv); ts.append(th);
  const brk = el('div','uitsplits');
  CRIT.forEach(c => {
    brk.append(el('span', null, c.label));
    const m = el('div','mini'); const s = el('span'); s.style.width = (st.pts[c.k] / c.w * 100) + '%'; s.style.background = `var(${c.color})`; m.append(s); brk.append(m);
    brk.append(el('span','w num', `${st.n ? fmt(st.pts[c.k]) : '–'}/${c.w}`));
  });
  ts.append(brk); p.append(ts);

  const rb = el('div','blok');
  if (isMine(i)) {
    rb.append(el('h3', null, 'dit is jouw initiatief'), el('p','zacht','Je eigen initiatief beoordeel je niet.'));
  } else if (S.rol !== 'jury') {
    rb.append(el('h3', null, 'beoordeling volgt'), el('p','zacht','De initiatieven worden beoordeeld door een vaste groep beoordelaars. De teamscore verschijnt hierboven zodra er beoordelingen zijn.'));
  } else {
    const had = myRating(i.id);
    rb.append(el('h3', null, had ? 'jouw beoordeling aanpassen' : 'jouw beoordeling'));
    CRIT.forEach(c => {
      const row = el('div','beoordeel'); row.style.setProperty('--cc', `var(${c.color})`); row.style.setProperty('--ct', c.ink);
      const rh = el('div','rk'); const v = S.draft[c.k];
      rh.append(el('span', null, c.label), el('span','num zacht', v ? `${fmt(v / 5 * c.w)} / ${c.w}` : `– / ${c.w}`));
      const seg = el('div','seg'); seg.setAttribute('role','group'); seg.setAttribute('aria-label', c.label);
      for (let n = 1; n <= 5; n++) {
        const b = el('button', null, String(n)); b.type = 'button'; b.setAttribute('aria-pressed', String(v === n)); b.title = c.scale[n - 1];
        b.onclick = () => { S.draft[c.k] = n; renderDrawer(); };
        seg.append(b);
      }
      row.append(rh, el('span','zacht', c.hint), seg, el('div','niveau', v ? c.scale[v - 1] : 'Kies 1 tot 5'));
      rb.append(row);
    });
    const complete = CRIT.every(c => S.draft[c.k] >= 1);
    const tot = CRIT.reduce((a, c) => a + (S.draft[c.k] || 0) / 5 * c.w, 0);
    const foot = el('div','totaal');
    const fl = el('div'); fl.append(el('b','num', complete ? fmt(tot) : '–'), el('span','zacht',' / 100 jouw totaal'));
    const save = el('button','knop', had ? 'bijwerken' : 'opslaan');
    save.disabled = !complete || S.saving; save.onclick = () => saveRating(i.id);
    foot.append(fl, save); rb.append(foot);
    if (!complete) rb.append(el('span','zacht','Geef op alle vijf criteria een waardering om op te slaan.'));
  }
  p.append(rb);

  if (S.rol === 'beheer') {
    const adm = el('div','balk-filters');
    const ed = el('button','knop blauw','aanpassen'); ed.onclick = () => { closeDrawer(); openForm(i); };
    const del = el('button','knop gevaar', S.confirmDel ? 'zeker weten? klik nogmaals' : 'verwijderen');
    del.onclick = () => { if (!S.confirmDel) { S.confirmDel = true; renderDrawer(); } else deleteInit(i.id); };
    adm.append(ed, del); p.append(adm);
  }

  scrim.append(p);
  host.replaceChildren(scrim); host.hidden = false;
  p.scrollTop = keepScroll;
}

/* ---------- schrijven ---------- */
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
function errMsg(e){
  if (e && (e.code === '42501' || /row-level security/i.test(e.message || ''))) return 'Dit mag je niet opslaan met dit wachtwoord.';
  return 'Opslaan lukte niet. Controleer je verbinding en probeer het opnieuw.';
}

async function saveRating(id){
  if (S.saving || S.rol !== 'jury' || !S.juryNaam) return;
  S.saving = true; renderDrawer();
  const bestaand = myRating(id);
  const rij = { jurylid: bestaand ? bestaand.jurylid : S.juryNaam.trim(), initiatief: id, bijgewerkt: new Date().toISOString() };
  CRIT.forEach(c => rij[c.k] = S.draft[c.k]);
  const { error } = await sb.from('beoordelingen').upsert(rij, { onConflict: 'jurylid,initiatief' });
  S.saving = false;
  if (error) { toast(errMsg(error)); renderDrawer(); return; }
  toast('Beoordeling opgeslagen'); closeDrawer(); laad();
}

async function deleteInit(id){
  const { error } = await sb.from('initiatieven').delete().eq('id', id);
  if (error) { toast(errMsg(error)); return; }
  toast('Initiatief verwijderd'); closeDrawer(); laad();
}

function openForm(init){
  S.editing = init ? init.id : null;
  $('#formTitle').textContent = init ? 'initiatief aanpassen' : 'nieuw initiatief';
  $('#saveInit').textContent = init ? 'opslaan' : 'indienen';
  $('#cancelEdit').hidden = !init;
  $('#iNaam').value = init ? (init.ownerName || '') : (S.lastNaam || '');
  $('#iTitle').value = init ? init.title : '';
  $('#iDesc').value = init ? init.description : '';
  $('#iTeam').value = init && TEAMS.includes(init.team) ? init.team : (S.lastTeam || '');
  $('#iTools').value = init ? (init.tools || '') : '';
  $('#iCat').value = init ? (init.category || CATS[0]) : CATS[0];
  $('#iStatus').value = init ? (init.status || 'idee') : 'idee';
  $('#iHours').value = init && init.hours != null ? init.hours : '';
  $('#iLink').value = init ? (init.link || '') : '';
  $('#formMsg').textContent = '';
  setTab('new');
}

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#formMsg');
  if (!S.ingelogd) { msg.textContent = 'Log eerst in.'; return; }
  const title = $('#iTitle').value.trim(), description = $('#iDesc').value.trim();
  if (!title || !description) { msg.textContent = 'Vul minimaal een titel en een beschrijving in.'; (title ? $('#iDesc') : $('#iTitle')).focus(); return; }
  const indiener = $('#iNaam').value.trim();
  if (!indiener) { msg.textContent = 'Vul je naam in.'; $('#iNaam').focus(); return; }
  const team = $('#iTeam').value;
  if (!TEAMS.includes(team)) { msg.textContent = 'Kies bij welk team je zit.'; $('#iTeam').focus(); return; }
  let link = $('#iLink').value.trim();
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  const h = $('#iHours').value;
  const rij = { indiener, titel: title, beschrijving: description, team, tools: $('#iTools').value.trim(), categorie: $('#iCat').value,
    status: $('#iStatus').value, uren: h === '' ? null : Math.max(0, Math.min(80, Number(h))), link };
  const btn = $('#saveInit'); btn.disabled = true; msg.textContent = '';
  const { error } = S.editing
    ? await sb.from('initiatieven').update(rij).eq('id', S.editing)
    : await sb.from('initiatieven').insert(rij);
  btn.disabled = false;
  if (error) { msg.textContent = errMsg(error); return; }
  toast(S.editing ? 'Wijzigingen opgeslagen' : 'Initiatief ingediend');
  if (!S.editing) {
    S.lastTeam = team; S.lastNaam = indiener;
    try { localStorage.setItem('aiib-team', team); localStorage.setItem('aiib-naam', indiener); } catch (err) {}
  }
  S.editing = null; $('#form').reset(); $('#cancelEdit').hidden = true;
  $('#fSort').value = 'new'; setTab('list'); laad();
});
$('#cancelEdit').onclick = () => { S.editing = null; $('#form').reset(); setTab('list'); };

/* ---------- tabs & filters ---------- */
function setTab(t){
  S.tab = t;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  document.querySelectorAll('.view').forEach(v => { const on = v.id === 'v-' + t; v.hidden = !on; if (on && v.id !== 'v-new') v.style.display = 'flex'; });
  if (t === 'new' && !S.editing) { $('#formTitle').textContent = 'nieuw initiatief'; $('#saveInit').textContent = 'indienen'; $('#cancelEdit').hidden = true; }
  try { localStorage.setItem('aiib-tab', t === 'new' ? 'list' : t); } catch (e) {}
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => { if (b.dataset.tab === 'new') S.editing = null; setTab(b.dataset.tab); });
['#q','#fTeam','#fCat','#fSort'].forEach(s => $(s).addEventListener('input', render));
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('#popup').hidden) closePopup(); else if (S.openId) closeDrawer(); });

$('#exportBtn').onclick = () => {
  const rows = [['Rang','Titel','Indiener','Team','Categorie','Status','AI-tools','Beoordelingen', ...CRIT.map(c => `${c.label} (max ${c.w})`), 'Totaal (max 100)']];
  const list = S.inits.map(i => ({...i, st: stats(i)})).sort((a, b) => (b.st.n ? 1 : 0) - (a.st.n ? 1 : 0) || b.st.total - a.st.total);
  list.forEach((i, ix) => rows.push([i.st.n ? ix + 1 : '', i.title, i.ownerName || '', i.team || '', i.category || '', STATUS[i.status] || '', i.tools || '', i.st.n,
    ...CRIT.map(c => i.st.n ? fmt(i.st.pts[c.k]) : ''), i.st.n ? fmt(i.st.total) : '']));
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const a = el('a'); a.href = url; a.download = 'ai-initiatieven-scores.csv'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ---------- pizzapunt: kat-en-muisspel ----------
   Met de muis is hij niet te pakken; op een touchscreen en met het toetsenbord opent hij de popup. */
function closePopup(){ const p = $('#popup'); p.hidden = true; p.replaceChildren(); $('#pizzaBtn').focus(); }
const pizza = $('#pizzaBtn');
let laatsteAanwijzer = 'mouse';
function pizzaVlucht(mx, my){
  const r = pizza.getBoundingClientRect(), m = 16;
  const maxX = innerWidth - r.width - m, maxY = innerHeight - r.height - m;
  let x, y, poging = 0;
  do {
    x = m + Math.random() * Math.max(0, maxX - m);
    y = m + Math.random() * Math.max(0, maxY - m);
    poging++;
  } while (poging < 30 && Math.hypot(x + r.width / 2 - mx, y + r.height / 2 - my) < Math.min(innerWidth, innerHeight) * .45);
  pizza.style.right = 'auto'; pizza.style.bottom = 'auto';
  pizza.style.left = x + 'px'; pizza.style.top = y + 'px';
}
document.addEventListener('pointermove', e => {
  laatsteAanwijzer = e.pointerType;
  if (e.pointerType !== 'mouse' || !$('#popup').hidden || !$('#slot').hidden) return;
  const r = pizza.getBoundingClientRect();
  const afstand = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  if (afstand < r.width / 2 + 70) pizzaVlucht(e.clientX, e.clientY);
});
pizza.addEventListener('pointerdown', e => { laatsteAanwijzer = e.pointerType; });
addEventListener('resize', () => {
  if (pizza.style.left) { const r = pizza.getBoundingClientRect();
    pizza.style.left = Math.min(r.left, innerWidth - r.width - 16) + 'px'; pizza.style.top = Math.min(r.top, innerHeight - r.height - 16) + 'px'; }
});
pizza.onclick = e => {
  if (e.detail > 0 && laatsteAanwijzer === 'mouse') { pizzaVlucht(e.clientX, e.clientY); return; }
  const host = $('#popup');
  const scrim = el('div','pop-scrim'); scrim.onclick = ev => { if (ev.target === scrim) closePopup(); };
  const pop = el('div','pop'); pop.setAttribute('role','dialog'); pop.setAttribute('aria-modal','true'); pop.setAttribute('aria-label','Geprankt');
  const x = el('button','sluit','×'); x.setAttribute('aria-label','Sluiten'); x.onclick = closePopup;
  const img = el('img'); img.src = 'geprankt.gif'; img.alt = 'Geprankt';
  pop.append(img, x);
  scrim.append(pop); host.replaceChildren(scrim); host.hidden = false; x.focus();
};

/* ---------- inloggen met gedeeld wachtwoord ----------
   Het ingevulde wachtwoord wordt bij Supabase geprobeerd voor elk toegangsadres uit config.js.
   Welke rol daarbij hoort (team, jury, beheer) weet alleen de database. */
function showBanner(t){ const b = $('#banner'); b.textContent = t; b.hidden = false; }
const toegang = CFG.toegang || [];

function toonLogin(fout){
  $('#slotForm').hidden = false; $('#naamForm').hidden = true;
  $('#slotFout').textContent = fout || '';
  $('#slotPw').value = ''; $('#slotPw').focus();
}

$('#slotForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#slotPw').value;
  const fout = $('#slotFout'); fout.textContent = '';
  if (!sb) { fout.textContent = 'De website is nog niet gekoppeld aan de database (config.js).'; return; }
  if (!pw) { fout.textContent = 'Vul het wachtwoord in.'; return; }
  const knop = $('#slotKnop'); knop.disabled = true;
  let gelukt = false, teVaak = false;
  for (const email of toegang) {
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (!error) { gelukt = true; break; }
    if (error.status === 429) { teVaak = true; break; }
  }
  knop.disabled = false;
  if (!gelukt) {
    fout.textContent = teVaak ? 'Te veel pogingen. Wacht een paar minuten en probeer het opnieuw.'
      : 'Dat wachtwoord klopt niet. Let op hoofdletters en cijfers.';
    $('#slotPw').select();
    return;
  }
  naInloggen();
});

$('#naamForm').addEventListener('submit', e => {
  e.preventDefault();
  const naam = $('#naamIn').value.trim();
  if (!naam) { $('#naamFout').textContent = 'Vul je naam in.'; return; }
  S.juryNaam = naam;
  try { localStorage.setItem('aiib-jurynaam', naam); } catch (err) {}
  ontgrendel();
});

let bezigMetInloggen = false;
async function naInloggen(){
  if (bezigMetInloggen || S.ingelogd) return;
  bezigMetInloggen = true;
  const { data: rol, error } = await sb.rpc('mijn_rol');
  bezigMetInloggen = false;
  if (error || !rol) { await sb.auth.signOut(); toonLogin('Dit wachtwoord geeft geen toegang. Vraag de beheerder om hulp.'); return; }
  S.rol = rol;
  if (rol === 'jury') {
    let naam = ''; try { naam = localStorage.getItem('aiib-jurynaam') || ''; } catch (err) {}
    if (!naam) {
      $('#slotForm').hidden = true; $('#naamForm').hidden = false; $('#naamIn').focus();
      return;
    }
    S.juryNaam = naam;
  }
  ontgrendel();
}

function ontgrendel(){
  S.ingelogd = true;
  const app = $('#app'); app.classList.remove('op-slot'); app.inert = false; app.removeAttribute('aria-hidden');
  $('#slot').hidden = true;
  const jury = S.rol === 'jury';
  const chip = $('#rolChip');
  chip.hidden = S.rol === 'team';
  chip.textContent = jury ? 'beoordelaar' : 'beheer';
  $('#rolBalk').hidden = false;
  document.querySelector('.tab[data-tab="todo"]').hidden = !jury;
  if (!jury && S.tab === 'todo') setTab('list');
  $('#exportBtn').hidden = false;
  const m = $('#me'); m.replaceChildren();
  if (jury) {
    const av = el('span', 'av av-init', initialen(S.juryNaam)); av.setAttribute('aria-hidden', 'true');
    m.append(av, el('span', null, S.juryNaam));
  }
  laad();
  if (!ontgrendel.timer) ontgrendel.timer = setInterval(() => { if (document.visibilityState === 'visible') laad(); }, 30000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.ingelogd) laad(); });
$('#rolWissel').onclick = async () => {
  await sb.auth.signOut();
  try { localStorage.removeItem('aiib-tab'); localStorage.removeItem('aiib-jurynaam'); } catch (e) {}
  location.replace(location.pathname);
};

/* ---------- start ---------- */
buildStatic();
try { const t = localStorage.getItem('aiib-tab'); if (t && t !== 'new' && t !== 'todo') setTab(t); } catch (e) {}
try { const t = localStorage.getItem('aiib-team'); if (TEAMS.includes(t)) S.lastTeam = t; } catch (e) {}
try { S.lastNaam = localStorage.getItem('aiib-naam') || ''; } catch (e) {}
render();

(async () => {
  if (!sb) { toonLogin(window.supabase ? 'De website is nog niet gekoppeld aan de database. Vul config.js in (zie LEESMIJ.md).' : 'De verbinding met de database kon niet worden geladen. Herlaad de pagina.'); return; }
  const { data } = await sb.auth.getSession();
  if (data.session) naInloggen(); else toonLogin();
})();
