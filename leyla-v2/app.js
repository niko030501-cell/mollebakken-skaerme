// Leylas visning (leyla-v2) — Del 1: kun at se og trykke.
// Al tekst sættes med textContent / DOM-metoder. Ingen HTML-strenge med data.
// Tid sammenlignes altid med iPad'ens lokale tid.
//
// Sådan hænger det sammen:
//   1. Personalet logger ind én gang (navn + 4-cifret kode, som i træningsappen).
//      Tokenen gemmes på iPad'en. Leyla ser aldrig login.
//   2. Appen henter ALT i ét kald (beboer_pik_forside) hvert minut og gemmer det sidst hentede.
//   3. Hvis nettet er væk, vises det sidst hentede, og der hentes igen når nettet er tilbage.
//   4. Tryk på Ja/Nej/Mere gemmes med tidspunkt (lægges i kø, hvis nettet er væk).

(function(){
'use strict';

var SUPABASE_URL = 'https://lumxvqhlmokspqnazhso.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bXh2cWhsbW9rc3BxbmF6aHNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMzc3NTMsImV4cCI6MjA5OTYxMzc1M30.WvVrbqZWaY1V-6sC4XwoYDOciBULeCxcnxvB7TlAMno';
var BILLEDE_URL = SUPABASE_URL + '/storage/v1/object/public/piktogram-billeder/';

var NOEGLE_TOKEN = 'leyla_token';
var NOEGLE_CACHE = 'leyla_cache';
var NOEGLE_KOE = 'leyla_koe';
var UGEDAGE = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
var KOLONNER = 8;

var sb = null;
try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){ console.error(e); }

var S = { token: null, data: null, offline: false, fuld: null, aktiv: null };
var rod = document.getElementById('rod');

// ---------- Hjælpere ----------

function lav(tag, klasse, tekst){
  var e = document.createElement(tag);
  if(klasse) e.className = klasse;
  if(tekst != null) e.textContent = tekst;
  return e;
}
function lagLaes(n){ try { return localStorage.getItem(n); } catch(e){ return null; } }
function lagSkriv(n, v){
  try { if(v == null) localStorage.removeItem(n); else localStorage.setItem(n, v); } catch(e){ /* ignorer */ }
}
function datoISO(d){
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function minutter(tekst){            // "9:30" -> 570
  var m = /^(\d{1,2})[:.](\d{2})/.exec(String(tekst || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function nuMinutter(){ var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function billedeUrl(sti){ return sti ? BILLEDE_URL + sti : ''; }

async function rpc(navn, args){
  if(!sb) return { fejl: 'ingen_forbindelse' };
  try {
    var res = await sb.rpc(navn, args || {});
    if(res.error){
      var msg = res.error.message || '';
      if(res.error.code === '28000' || msg.indexOf('ikke logget ind') >= 0) return { fejl: 'ikke_logget_ind' };
      if(!res.error.code || res.status === 0 || /fetch|network|load failed/i.test(msg)) return { fejl: 'ingen_forbindelse' };
      return { fejl: 'fejl' };
    }
    return { data: res.data };
  } catch(e){
    return { fejl: 'ingen_forbindelse' };
  }
}

// ---------- Tale (dansk) ----------

function sig(tekst){
  if(!tekst || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(tekst);
    u.lang = 'da-DK';
    var stemmer = window.speechSynthesis.getVoices() || [];
    for(var i = 0; i < stemmer.length; i++){
      if(/^da/i.test(stemmer[i].lang)){ u.voice = stemmer[i]; break; }
    }
    window.speechSynthesis.speak(u);
  } catch(e){ /* tale er en hjælp, ikke et krav */ }
}

// ---------- Data: hent, gem, offline ----------

function gemCache(data){
  lagSkriv(NOEGLE_CACHE, JSON.stringify({ data: data, hentet: Date.now() }));
}
function laesCache(){
  var r = lagLaes(NOEGLE_CACHE);
  if(!r) return null;
  try {
    var d = JSON.parse(r).data;
    // Personalets navne/fotos må ikke blive liggende efter dagen er gået
    if(d && d.dato !== datoISO(new Date())) d.med_dig = [];
    return d;
  } catch(e){ return null; }
}

async function hent(){
  if(!S.token) return;
  var res = await rpc('beboer_pik_forside', { p_token: S.token });
  if(res.fejl === 'ikke_logget_ind'){
    lagSkriv(NOEGLE_TOKEN, null); lagSkriv(NOEGLE_CACHE, null);
    S.token = null; S.data = null;
    visLogin('');
    return;
  }
  if(res.fejl || !res.data){
    S.offline = true;
    if(!S.data) S.data = laesCache();
    tegn();
    return;
  }
  S.offline = false;
  S.data = res.data;
  gemCache(res.data);
  tegn();
  sendKoe();
}

// ---------- Ja / Nej / Mere: registrering (med kø ved manglende net) ----------

function laesKoe(){ try { return JSON.parse(lagLaes(NOEGLE_KOE) || '[]'); } catch(e){ return []; } }

async function sendKoe(){
  var koe = laesKoe();
  if(!koe.length || !S.token) return;
  var rest = [];
  for(var i = 0; i < koe.length; i++){
    var res = await rpc('beboer_pik_registrer', { p_token: S.token, p_type: koe[i].type, p_tidspunkt: koe[i].t });
    if(res.fejl === 'ingen_forbindelse') rest.push(koe[i]);   // prøv igen senere
  }
  lagSkriv(NOEGLE_KOE, rest.length ? JSON.stringify(rest) : null);
}

function registrer(type){
  var koe = laesKoe();
  koe.push({ type: type, t: Date.now() });
  lagSkriv(NOEGLE_KOE, JSON.stringify(koe.slice(-200)));
  sendKoe();
}

// ---------- Ugeplan: hvad er NU, og hvad er BAGEFTER ----------

function punkterForDag(ugedag){
  var liste = [];
  ((S.data && S.data.ugeplan) || []).forEach(function(p){
    var m = minutter(p.tid);
    if(p.ugedag === ugedag && m != null) liste.push({ min: m, tid: p.tid, aktivitet: p.aktivitet });
  });
  liste.sort(function(a, b){ return a.min - b.min; });
  return liste;
}

function nuOgBagefter(){
  var nu = new Date();
  var idag = punkterForDag(UGEDAGE[nu.getDay()]);
  var m = nuMinutter();
  var aktuel = null, naeste = null;
  for(var i = 0; i < idag.length; i++){
    if(idag[i].min <= m) aktuel = idag[i];
    else { naeste = idag[i]; break; }
  }
  if(!aktuel){                         // før dagens første punkt: gårsdagens sidste (fx "I seng")
    var igaar = punkterForDag(UGEDAGE[(nu.getDay() + 6) % 7]);
    if(igaar.length) aktuel = igaar[igaar.length - 1];
  }
  return { nu: aktuel, bagefter: naeste };
}

// Finder billederne til en aktivitet. Intet billede -> tom liste (hellere intet end et forkert).
function billederTilAktivitet(aktivitet){
  var d = S.data;
  var k = d && d.koblinger && d.koblinger[aktivitet];
  if(!k) return [];
  var ider = [];
  if(k.piktogram_id) ider = [k.piktogram_id];
  else if(k.fast_valg_id){
    (d.faste_valg || []).forEach(function(v){ if(v.id === k.fast_valg_id) ider = v.piktogram_ids || []; });
  }
  var ud = [];
  ider.forEach(function(id){
    var b = d.alle_billeder && d.alle_billeder[id];
    if(b && b.sti) ud.push({ navn: b.navn, url: billedeUrl(b.sti), farve: b.farve });
  });
  return ud;
}

function fastValgNavn(aktivitet){
  var d = S.data;
  var k = d && d.koblinger && d.koblinger[aktivitet];
  if(!k || !k.fast_valg_id) return null;
  var navn = null;
  (d.faste_valg || []).forEach(function(v){ if(v.id === k.fast_valg_id) navn = v.navn; });
  return navn;
}

function fastValgIdFor(aktivitet){
  var d = S.data;
  var k = d && d.koblinger && d.koblinger[aktivitet];
  return (k && k.fast_valg_id) || null;
}

function medDigNu(){
  var liste = (S.data && S.data.med_dig) || [];
  var m = nuMinutter();
  for(var i = 0; i < liste.length; i++){
    var a = minutter(liste[i].start), b = minutter(liste[i].slut);
    if(a != null && b != null && a <= m && m < b) return liste[i];
  }
  return null;
}

// ---------- Login (kun personalet ved opsætning) ----------

function visLogin(fejl){
  rod.textContent = '';
  var side = lav('div', 'login');
  var kort = lav('form', 'loginKort');
  kort.appendChild(lav('h1', null, 'Log ind'));
  kort.appendChild(lav('p', null, 'Kun til personalet ved opsætning.'));

  var l1 = lav('label', null, 'Navn'); l1.htmlFor = 'lNavn';
  var navn = lav('input'); navn.id = 'lNavn'; navn.autocomplete = 'off'; navn.autocapitalize = 'words';
  var l2 = lav('label', null, 'Kode (4 cifre)'); l2.htmlFor = 'lKode';
  var kode = lav('input'); kode.id = 'lKode'; kode.type = 'password'; kode.inputMode = 'numeric'; kode.maxLength = 4; kode.autocomplete = 'off';
  var knap = lav('button', 'loginKnap', 'Log ind'); knap.type = 'submit';
  var f = lav('div', 'loginFejl', fejl || '');

  [l1, navn, l2, kode, knap, f].forEach(function(e){ kort.appendChild(e); });
  side.appendChild(kort);
  rod.appendChild(side);

  kort.addEventListener('submit', async function(ev){
    ev.preventDefault();
    knap.disabled = true;
    var res = await rpc('beboer_login', { p_navn: navn.value, p_kode: kode.value });
    knap.disabled = false;
    if(res.fejl){ f.textContent = 'Ingen forbindelse. Prøv igen.'; return; }
    var r = res.data || {};
    if(r.ok){
      S.token = r.token;
      lagSkriv(NOEGLE_TOKEN, r.token);
      start();
    } else if(r.fejl === 'laast'){
      f.textContent = 'For mange forsøg. Vent et kvarter.';
    } else {
      f.textContent = 'Navn eller kode er forkert.';
    }
  });
}

// ---------- Tegn forsiden ----------

function tegn(){
  if(!S.token) return;
  if(!S.data){
    rod.textContent = '';
    rod.appendChild(lav('div', 'login')).appendChild(lav('p', null, 'Henter …'));
    return;
  }
  // Fuld skærm ligger ovenpå og skal ikke tegnes om af en baggrundsopdatering
  var fuldEl = document.getElementById('fuld');
  var valgEl = document.getElementById('valgfuld');

  rod.textContent = '';
  if(S.offline) rod.appendChild(lav('div', 'offline'));
  var hoved = lav('div', 'hoved');
  var venstre = lav('div', 'venstre');
  venstre.appendChild(tegnNu());
  var med = tegnMedDig();
  if(med) venstre.appendChild(med);
  venstre.appendChild(tegnSvar());
  var hoejre = lav('div', 'hoejre'); hoejre.id = 'hoejre';
  hoved.appendChild(venstre);
  hoved.appendChild(hoejre);
  rod.appendChild(hoved);
  tegnGitter(hoejre);
  tilpasGitter();
  if(fuldEl) rod.appendChild(fuldEl);
  if(valgEl) rod.appendChild(valgEl);
}

function billedeEl(url, alt){
  var img = lav('img');
  img.src = url; img.alt = alt || ''; img.draggable = false;
  img.addEventListener('error', function(){ img.style.visibility = 'hidden'; });
  return img;
}

function tegnNu(){
  var v = nuOgBagefter();
  var kort = lav('div', 'nu');
  var top = lav('div', 'nuTop');
  top.appendChild(lav('span', 'nuMaerke', 'NU'));
  if(v.nu) top.appendChild(lav('span', 'nuTid', v.nu.tid));
  kort.appendChild(top);

  var billeder = v.nu ? billederTilAktivitet(v.nu.aktivitet) : [];
  var boks = lav('div', 'nuBillede' + (billeder.length ? '' : ' tom'));
  if(billeder.length) boks.style.setProperty('--k', billeder[0].farve || '#bbb');
  billeder.forEach(function(b){ boks.appendChild(billedeEl(b.url, b.navn)); });
  // Er punktet koblet til et fast valg, åbner et tryk valget i fuld skærm
  var fvId = v.nu ? fastValgIdFor(v.nu.aktivitet) : null;
  if(fvId && billeder.length > 1){
    boks.setAttribute('role', 'button');
    boks.tabIndex = 0;
    boks.classList.add('valgbar');
    boks.addEventListener('click', function(){ aabnFastValg(fvId); });
  }
  kort.appendChild(boks);

  var ord = '';
  if(billeder.length) ord = fastValgNavn(v.nu.aktivitet) || billeder[0].navn;
  kort.appendChild(lav('div', 'nuOrd', ord));

  var bb = v.bagefter ? billederTilAktivitet(v.bagefter.aktivitet) : [];
  var bag = lav('div', 'bagefter' + (bb.length ? '' : ' tom'));
  if(bb.length){
    bag.appendChild(lav('span', 'bagefterTekst', 'Bagefter'));
    var bbBoks = lav('span', 'bagefterBillede');
    bbBoks.style.setProperty('--k', bb[0].farve || '#bbb');
    bbBoks.appendChild(billedeEl(bb[0].url, bb[0].navn));
    bag.appendChild(bbBoks);
    bag.appendChild(lav('span', 'bagefterOrd', fastValgNavn(v.bagefter.aktivitet) || bb[0].navn));
  }
  kort.appendChild(bag);
  return kort;
}

function tegnMedDig(){
  var p = medDigNu();
  if(!p) return null;
  var boks = lav('div', 'meddig');
  if(p.billede){
    var foto = lav('img', 'meddigFoto'); foto.src = p.billede; foto.alt = '';
    foto.addEventListener('error', function(){ foto.replaceWith(lav('div', 'meddigFoto', (p.navn || '?').charAt(0))); });
    boks.appendChild(foto);
  } else {
    boks.appendChild(lav('div', 'meddigFoto', (p.navn || '?').charAt(0)));
  }
  var tekst = lav('div');
  tekst.appendChild(lav('div', 'meddigLabel', 'Med dig nu'));
  tekst.appendChild(lav('div', 'meddigNavn', p.navn));
  boks.appendChild(tekst);
  return boks;
}

// Standardsymboler (statisk SVG, ingen data i strengene)
var SYMBOLER = {
  ja: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 28v26H10V28zM20 30l10-18c4 0 7 3 6 7l-2 9h18c3 0 5 3 4 6l-5 20c-1 2-3 4-6 4H20"/></svg>',
  nej: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 36V10H10v26zM20 34l10 18c4 0 7-3 6-7l-2-9h18c3 0 5-3 4-6L51 10c-1-2-3-4-6-4H20"/></svg>',
  mere: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" aria-hidden="true"><path d="M32 12v40M12 32h40"/></svg>'
};
var ORD = { ja: 'Ja', nej: 'Nej', mere: 'Mere' };

function tegnSvar(){
  var boks = lav('div', 'svar');
  var eget = (S.data && S.data.ja_nej_mere) || {};
  ['ja', 'nej', 'mere'].forEach(function(type){
    var knap = lav('button', 'svarKnap ' + type);
    knap.type = 'button';
    knap.setAttribute('aria-label', ORD[type]);
    var b = eget[type] && S.data.alle_billeder && S.data.alle_billeder[eget[type]];
    if(b && b.sti){
      knap.appendChild(billedeEl(billedeUrl(b.sti), ORD[type]));
    } else {
      var sym = lav('span');
      sym.style.display = 'contents';
      sym.innerHTML = SYMBOLER[type];     // statisk, ikke brugerdata
      knap.appendChild(sym);
    }
    knap.appendChild(lav('span', 'ord', ORD[type]));
    knap.addEventListener('click', function(){ sig(ORD[type]); registrer(type); });
    boks.appendChild(knap);
  });
  return boks;
}

// ---------- Billedgitter, delt i kategorier ----------

function kategorier(){
  return ((S.data && S.data.kategorier) || []).filter(function(k){ return k.piktogrammer && k.piktogrammer.length; });
}

function tegnGitter(beholder){
  kategorier().forEach(function(kat, ki){
    var sek = lav('section', 'kat');
    sek.style.setProperty('--k', kat.farve || '#999');
    var hoved = lav('div', 'katHoved');
    hoved.appendChild(lav('span', 'katPrik'));
    hoved.appendChild(lav('span', 'katNavn', kat.navn));
    sek.appendChild(hoved);
    var gitter = lav('div', 'gitter');
    kat.piktogrammer.forEach(function(p, pi){
      var felt = lav('button', 'felt');
      felt.type = 'button';
      felt.setAttribute('aria-label', p.navn);
      felt.appendChild(billedeEl(billedeUrl(p.sti), p.navn));
      felt.addEventListener('click', function(){ aabnFuld(ki, pi); });
      gitter.appendChild(felt);
    });
    sek.appendChild(gitter);
    beholder.appendChild(sek);
  });
}

// Alle billeder skal være på én skærm: gør felterne mindre indtil det passer.
// Scroll er kun sidste udvej (under 44 px).
function tilpasGitter(){
  var h = document.getElementById('hoejre');
  if(!h) return;
  var kats = kategorier();
  if(!kats.length) return;
  var gap = 10, hovedH = 30, katGap = 14;
  var cs = getComputedStyle(h);
  var B = h.clientWidth - parseFloat(cs.paddingRight || 0);
  var H = h.clientHeight;
  var maks = Math.min(150, Math.floor((B - gap * (KOLONNER - 1)) / KOLONNER));
  var s = maks;
  for(; s > 44; s -= 2){
    // felterne er kvadrater, men bredden er fastlagt af gitteret; vi regner højden ud fra s
    var total = 0;
    kats.forEach(function(k){
      total += hovedH + Math.ceil(k.piktogrammer.length / KOLONNER) * (s + gap) + katGap;
    });
    if(total <= H) break;
  }
  h.style.setProperty('--gap', gap + 'px');
  h.style.setProperty('--hovedh', hovedH + 'px');
  h.style.setProperty('--katgap', katGap + 'px');
  // Gitterets bredde sættes, så 8 kolonner giver felter på netop størrelse s
  var gitterB = s * KOLONNER + gap * (KOLONNER - 1);
  h.querySelectorAll('.gitter').forEach(function(g){ g.style.width = gitterB + 'px'; });
}

// ---------- Fuld skærm ----------

var swipe = null;

function aabnFuld(ki, pi){
  S.fuld = { ki: ki, pi: pi };
  tegnFuld(true);
}

function tegnFuld(tal){
  var gamle = document.getElementById('fuld');
  if(gamle) gamle.remove();
  if(!S.fuld) return;
  var kat = kategorier()[S.fuld.ki];
  if(!kat){ S.fuld = null; return; }
  var p = kat.piktogrammer[S.fuld.pi];

  var el = lav('div', 'fuld'); el.id = 'fuld';
  el.style.setProperty('--k', kat.farve || '#999');
  var b = lav('div', 'fuldBillede');
  b.appendChild(billedeEl(billedeUrl(p.sti), p.navn));
  el.appendChild(b);
  el.appendChild(lav('div', 'fuldOrd', p.navn));
  var prikker = lav('div', 'fuldPrikker');
  if(kat.piktogrammer.length > 1){
    kat.piktogrammer.forEach(function(_, i){ prikker.appendChild(lav('span', 'fuldPrik' + (i === S.fuld.pi ? ' nu' : ''))); });
  }
  el.appendChild(prikker);

  // Tryk lukker. Swipe til siden bladrer i samme kategori.
  el.addEventListener('pointerdown', function(e){ swipe = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', function(e){
    var s0 = swipe; swipe = null;
    if(!s0) return;
    var dx = e.clientX - s0.x, dy = e.clientY - s0.y;
    if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){
      var ny = S.fuld.pi + (dx < 0 ? 1 : -1);
      if(ny >= 0 && ny < kat.piktogrammer.length){ S.fuld.pi = ny; tegnFuld(true); }
    } else {
      S.fuld = null;
      el.remove();
      if(window.speechSynthesis) try { window.speechSynthesis.cancel(); } catch(x){ /* ignorer */ }
    }
  });
  el.addEventListener('pointercancel', function(){ swipe = null; });
  rod.appendChild(el);
  if(tal) sig(p.navn);
}

// ---------- Valg i fuld skærm ----------
// Et valg er ét aktivt valg pr. beboer i databasen. Personalet starter det i admin, eller Leyla åbner
// et fast valg fra Nu-kortet. iPad'en spørger hvert par sekunder, om der er et valg i gang.
// Billederne står side om side og er lige store. Når hun trykker, fremhæves billedet og de andre
// dæmpes, og ordet siges. Fremhævningen bliver stående, til personalet lukker valget i admin.

var valgSidsteStart = null;
var holdTimer = null;

async function hentAktivt(){
  if(!S.token || document.hidden) return;
  var res = await rpc('beboer_pik_aktivt', { p_token: S.token });
  if(res.fejl) return;                      // uden net bliver det der er, som det er
  S.aktiv = res.data || null;
  tegnValg();
}

async function aabnFastValg(id){
  if(!S.token) return;
  var res = await rpc('beboer_pik_valg_aabn', { p_token: S.token, p_fast_valg_id: id });
  if(res.fejl || !res.data) return;
  S.aktiv = res.data;
  tegnValg();
}

function lukValgSkaerm(){
  var e = document.getElementById('valgfuld');
  if(e) e.remove();
  valgSidsteStart = null;
  if(window.speechSynthesis) try { window.speechSynthesis.cancel(); } catch(x){ /* ignorer */ }
}

function tegnValg(){
  var a = S.aktiv;
  if(!a || !a.billeder || a.billeder.length < 2){ lukValgSkaerm(); return; }
  var findes = document.getElementById('valgfuld');
  var nyttValg = valgSidsteStart !== a.startet;
  if(findes && !nyttValg){ opdaterFremhaevning(); return; }

  if(findes) findes.remove();
  valgSidsteStart = a.startet;
  var el = lav('div', 'valgfuld'); el.id = 'valgfuld';
  el.appendChild(lav('div', 'valgSpoergsmaal', a.spoergsmaal));
  var raekke = lav('div', 'valgRaekke');
  a.billeder.forEach(function(b){
    var knap = lav('button', 'valgFelt');
    knap.type = 'button';
    knap.dataset.id = b.id;
    knap.style.setProperty('--k', b.farve || '#bbb');
    var bil = lav('div', 'valgBillede');
    bil.appendChild(billedeEl(billedeUrl(b.sti), b.navn));
    knap.appendChild(bil);
    knap.appendChild(lav('div', 'valgOrd', b.navn));
    knap.addEventListener('click', function(){ trykPaaValg(b); });
    raekke.appendChild(knap);
  });
  el.appendChild(raekke);

  // Nødudgang til personalet: hold nede i et øjeblik. Beboeren kan ikke ramme den ved et uheld.
  var luk = lav('button', 'valgLuk', '✕');
  luk.type = 'button';
  luk.setAttribute('aria-label', 'Luk valget (hold nede)');
  luk.addEventListener('pointerdown', function(){
    holdTimer = setTimeout(async function(){
      await rpc('beboer_pik_valg_luk', { p_token: S.token });
      S.aktiv = null; lukValgSkaerm();
    }, 1500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function(ev){
    luk.addEventListener(ev, function(){ if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; } });
  });
  el.appendChild(luk);
  rod.appendChild(el);
  opdaterFremhaevning();
  sig(a.spoergsmaal);
}

function opdaterFremhaevning(){
  var a = S.aktiv, el = document.getElementById('valgfuld');
  if(!a || !el) return;
  var har = !!a.valgt_id;
  el.classList.toggle('harValgt', har);
  Array.prototype.forEach.call(el.querySelectorAll('.valgFelt'), function(k){
    k.classList.toggle('valgt', har && k.dataset.id === a.valgt_id);
  });
}

async function trykPaaValg(b){
  if(!S.aktiv) return;
  S.aktiv.valgt_id = b.id;                  // fremhæves med det samme, også uden net
  opdaterFremhaevning();
  sig(b.navn);
  var res = await rpc('beboer_pik_valg_tryk', { p_token: S.token, p_piktogram_id: b.id });
  if(!res.fejl && res.data){ S.aktiv = res.data; opdaterFremhaevning(); }
}

// ---------- Start, opdatering ----------

function opdaterNu(){
  // Nu-kortet og "Med dig nu" følger klokken; resten tegnes kun ved ny hentning
  if(!S.token || !S.data) return;
  var venstre = document.querySelector('.venstre');
  if(!venstre) return;
  var nyNu = tegnNu();
  venstre.replaceChild(nyNu, venstre.querySelector('.nu'));
  var gammelMed = venstre.querySelector('.meddig');
  var nyMed = tegnMedDig();
  if(gammelMed && nyMed) venstre.replaceChild(nyMed, gammelMed);
  else if(gammelMed) gammelMed.remove();
  else if(nyMed) venstre.insertBefore(nyMed, venstre.querySelector('.svar'));
}

function start(){
  S.token = S.token || lagLaes(NOEGLE_TOKEN);
  if(!S.token){ visLogin(''); return; }
  S.data = laesCache();       // vis det sidst hentede med det samme
  tegn();
  hent();
  hentAktivt();
}

window.addEventListener('resize', tilpasGitter);
window.addEventListener('orientationchange', function(){ setTimeout(tilpasGitter, 200); });
window.addEventListener('online', hent);
document.addEventListener('visibilitychange', function(){ if(!document.hidden) hent(); });
setInterval(function(){ if(!document.hidden) opdaterNu(); }, 15000);
setInterval(function(){ if(!document.hidden) hent(); }, 60000);
setInterval(hentAktivt, 4000);
if('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = function(){ /* stemmer indlæst */ };

if('serviceWorker' in navigator){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('service-worker.js').catch(function(){}); });
}

start();

})();
