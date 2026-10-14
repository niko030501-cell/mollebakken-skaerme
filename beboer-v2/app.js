// Beboerapp (beboer-v2) — fase 3: login og hjem.
// Al tekst sættes med textContent / DOM-metoder. Ingen HTML-strenge med data.
// Tid sammenlignes altid med browserens lokale tid. Opdatering via polling (60 sek.).

(function(){
'use strict';

var SUPABASE_URL = 'https://lumxvqhlmokspqnazhso.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bXh2cWhsbW9rc3BxbmF6aHNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMzc3NTMsImV4cCI6MjA5OTYxMzc1M30.WvVrbqZWaY1V-6sC4XwoYDOciBULeCxcnxvB7TlAMno';

var NOEGLE_TOKEN = 'bv2_token';
var NOEGLE_CACHE = 'bv2_cache';
var NOEGLE_KOE = 'bv2_koe';
var UGEDAGE = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
var UGEDAGE_ORDEN = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'];
var DAGE_KORT = { Mandag:'Man', Tirsdag:'Tir', Onsdag:'Ons', Torsdag:'Tor', Fredag:'Fre', Lørdag:'Lør', Søndag:'Søn' };
var MAANEDER = ['januar','februar','marts','april','maj','juni','juli','august','september','oktober','november','december'];

var sb = null;
try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){ console.error(e); }

var S = {
  token: null, navn: '', tema: 'standard',
  fane: 'hjem',
  programmer: [], dagsplan: [], vagter: [], skjulte: [], traeninger: [],
  madplan: {}, visMad: false,
  offline: false, indlaest: false, flow: null,
  fejl: '', loginBusy: false
};
var pollTimer = null;
var rod = document.getElementById('rod');

// ---------- Hjælpere ----------

function lav(tag, klasse, tekst){
  var e = document.createElement(tag);
  if(klasse) e.className = klasse;
  if(tekst != null) e.textContent = tekst;
  return e;
}

function lagLaes(noegle){
  try { return localStorage.getItem(noegle); } catch(e){ return null; }
}
function lagSkriv(noegle, v){
  try { if(v == null) localStorage.removeItem(noegle); else localStorage.setItem(noegle, v); } catch(e){ /* ignorer */ }
}

function datoISO(d){
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function datoTekst(d){
  return UGEDAGE[d.getDay()].toLowerCase() + ' den ' + d.getDate() + '. ' + MAANEDER[d.getMonth()];
}

function hilsen(d){
  var t = d.getHours();
  if(t >= 5 && t < 10) return 'God morgen';
  if(t >= 10 && t < 12) return 'God formiddag';
  if(t >= 12 && t < 17) return 'God eftermiddag';
  if(t >= 17 && t < 22) return 'God aften';
  return 'God nat';
}

// "9:30" eller "09:30" -> minutter efter midnat (null hvis ukendt format)
function tidTilMinutter(tid){
  var m = /^(\d{1,2})[:.](\d{2})/.exec(String(tid || '').trim());
  if(!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function tidVisning(tid){
  var min = tidTilMinutter(tid);
  if(min == null) return String(tid || '');
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

function svgIkon(stier, bredde, viewBox){
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', viewBox || '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(bredde || 2));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  stier.forEach(function(d){
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}

var IKONER = {
  hjem: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  traening: ['M6 7v10', 'M18 7v10', 'M3 10v4', 'M21 10v4', 'M6 12h12'],
  statistik: ['M5 20V10', 'M12 20V4', 'M19 20v-7'],
  mere: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  bestik: ['M5 3v5a2 2 0 0 0 4 0V3', 'M7 10v11', 'M17 21V3c-2 1.5-3 4-3 7s1 4 3 4'],
  tilbage: ['M15 5l-7 7 7 7'],
  frem: ['M9 5l7 7-7 7']
};

// ---------- Temaer ----------
// Et tema skifter kun farver (CSS-variabler i app.css), fonte, ikoner og tekster.
// Indholdet er det samme. Alle ikoner er egne simple SVG'er.

var NOEGLE_TEMA_AFVENTER = 'bv2_tema_afventer';

var TEMAER = {
  standard: {
    navn: 'Standard', beskrivelse: 'Lyst og roligt',
    farver: ['#F4F2EE', '#1B1B1F', '#C9F27B'], statuslinje: '#1B1B1F',
    t: {
      dagensTraening: 'Dagens træning',
      start: 'Start træning',
      taeller: function(i, n){ return 'Øvelse ' + i + ' af ' + n; },
      saetFaerdig: 'Sæt færdig',
      pause: 'Hvil',
      faerdig: function(navn){ return 'Flot klaret, ' + navn + '!'; },
      medaljer: 'Medaljer',
      uger: 'Træninger pr. uge'
    },
    medaljer: {
      m10: { ikon: 'medalje' }, m25: { ikon: 'medalje' }, m50: { ikon: 'pokal' }, u3: { ikon: 'flamme' }
    }
  },
  zombie: {
    navn: 'Zombie', beskrivelse: 'Mørkt og spændende',
    farver: ['#0E0F0C', '#8BE04E', '#E5383B'], statuslinje: '#0E0F0C',
    t: {
      dagensTraening: 'Overlev træningen!',
      start: 'Start træning',
      taeller: function(i, n){ return 'Zombiebølge ' + i + '/' + n; },
      saetFaerdig: 'Zombie besejret!',
      pause: 'Gem dig!',
      faerdig: function(navn){ return 'Du overlevede, ' + navn + '!'; },
      medaljer: 'Medaljer',
      uger: 'Træninger pr. uge'
    },
    medaljer: {
      m10: { navn: 'Katana', ikon: 'katana' },
      m25: { navn: 'Kirsebærblomst', ikon: 'blomst' },
      m50: { navn: 'Samurai-hjelm', ikon: 'hjelm' },
      u3:  { navn: 'Torii', ikon: 'torii' }
    }
  },
  bowling: {
    navn: 'Bowling', beskrivelse: 'Kegler og kugler',
    farver: ['#F7EBD3', '#1C2541', '#2EC4B6'], statuslinje: '#1C2541',
    t: {
      dagensTraening: 'Dagens bane',
      start: 'Start træning',
      taeller: function(i, n){ return 'Frame ' + i + ' af ' + n; },
      saetFaerdig: 'Vælt keglerne!',
      pause: 'Hent kuglen',
      faerdig: function(navn){ return 'Perfekt spil, ' + navn + '!'; },
      medaljer: 'Pokaler',
      uger: 'Scorekort',
      strike: 'STRIKE!'
    },
    medaljer: {
      m10: { navn: 'Guldkugle', ikon: 'kugle' },
      m25: { navn: 'Turkey', ikon: 'turkey' },
      m50: { navn: 'Perfect game', ikon: 'stjerne' },
      u3:  { navn: 'Strike-stime', ikon: 'flamme' }
    }
  }
};

function tema(){
  return TEMAER[S.tema] || TEMAER.standard;
}

function anvendTema(){
  var navn = TEMAER[S.tema] ? S.tema : 'standard';
  document.documentElement.setAttribute('data-tema', navn);
  var meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', TEMAER[navn].statuslinje);
}

// ---------- Rolle- og navnehjælp (kopieret fra personaleskaerm-v2, ændres ikke dér) ----------

var ROLLE_TABEL = {
  'Daglig leder': 'Leder', 'Køkkenpersonale': 'Køkken', 'Pedel': 'Pedel',
  'Vågen nattevagt': 'Nattevagt', 'Socialfaglig medarbejder': 'Medarbejder',
  'SSA': 'Medicinvagt', 'Rådighedsvagt': 'Døgnvagt'
};

function visningsRolle(raa, tag){
  if(tag === 'Admin') return 'Kontor';
  return ROLLE_TABEL[raa] || raa;
}

function renspNavn(navn){
  return (navn || '').replace(/^(?:(?:Pedel|Vikar|Nat)[:\s]+)+/i, '').trim();
}

function fornavn(navn){
  var renset = renspNavn(navn);
  return renset.split(' ')[0] || renset;
}

function initial(navn){
  var r = renspNavn(navn);
  return r ? r.charAt(0).toUpperCase() : '?';
}

function skStartAfDag(iso){
  var d = iso.split('-');
  return new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]));
}

// Samme regel som findSkjulning() i personaleskaerm-v2.
function findSkjulning(skjulte, navn, visteDagISO, nu){
  var visteStart = skStartAfDag(visteDagISO);
  var foer = new Date(visteStart);
  foer.setDate(foer.getDate() - 1);
  var foerISO = datoISO(foer);
  for(var i = 0; i < skjulte.length; i++){
    var s = skjulte[i];
    if(s.navn !== navn) continue;
    if(new Date(s.udloeber) <= nu) continue;
    if(s.dag === visteDagISO) return s;
    if(s.dag === foerISO && nu >= visteStart) return s;
  }
  return null;
}

// Hvem er på arbejde LIGE NU: flet rå rækker (Workfeeds midnatssplit), behold
// vagter hvor start <= nu < slut, fjern skjulte, én post pr. person.
function paaArbejdeNu(raekker, skjulte, nu){
  var grupper = {};
  raekker.forEach(function(r){
    var k = r.navn + '|' + r.rolle;
    if(!grupper[k]) grupper[k] = [];
    grupper[k].push(r);
  });
  var vagter = [];
  Object.keys(grupper).forEach(function(k){
    var liste = grupper[k].slice().sort(function(a, b){ return new Date(a.start) - new Date(b.start); });
    var flettet = [];
    liste.forEach(function(r){
      var sidste = flettet[flettet.length - 1];
      if(sidste && Math.abs(new Date(r.start) - new Date(sidste.slut)) <= 60000){
        if(new Date(r.slut) > new Date(sidste.slut)) sidste.slut = r.slut;
        if(r.tag === 'Admin' || (!sidste.tag && r.tag)) sidste.tag = r.tag;
      } else {
        flettet.push({ navn: r.navn, rolle: r.rolle, start: r.start, slut: r.slut, billede: r.billede, tag: r.tag, dag: r.dag });
      }
    });
    flettet.forEach(function(v){ vagter.push(v); });
  });

  var idag = datoISO(nu);
  var set = {};
  var ud = [];
  vagter.forEach(function(v){
    if(!(new Date(v.start) <= nu && nu < new Date(v.slut))) return;
    if(findSkjulning(skjulte, v.navn, idag, nu)) return;
    var s = new Date(v.start), e = new Date(v.slut);
    var rolle = visningsRolle(v.rolle, v.tag);
    if(rolle === 'Medarbejder' && s.getHours() >= 20 && e.getDate() !== s.getDate()) rolle = 'Nattevagt';
    var noegle = renspNavn(v.navn);
    if(set[noegle]) return;
    set[noegle] = true;
    ud.push({ navn: fornavn(v.navn), fuldNavn: noegle, rolle: rolle, billede: v.billede });
  });
  var prio = { 'Medarbejder': 0, 'Døgnvagt': 0, 'Nattevagt': 1 };
  ud.sort(function(a, b){
    var pa = prio[a.rolle] != null ? prio[a.rolle] : 2;
    var pb = prio[b.rolle] != null ? prio[b.rolle] : 2;
    return pa - pb || a.navn.localeCompare(b.navn, 'da');
  });
  return ud;
}

// ---------- Netværk ----------

async function rpc(navn, args){
  if(!sb) return { fejl: 'ingen_forbindelse' };
  try {
    var res = await sb.rpc(navn, args || {});
    if(res.error){
      var msg = res.error.message || '';
      if(res.error.code === '28000' || msg.indexOf('ikke logget ind') >= 0) return { fejl: 'ikke_logget_ind' };
      // supabase-js returnerer netværksfejl som {error} uden kode (ikke som exception)
      if(!res.error.code || res.status === 0 || /fetch|network|load failed/i.test(msg)) return { fejl: 'ingen_forbindelse' };
      return { fejl: 'fejl' };
    }
    return { data: res.data };
  } catch(e){
    return { fejl: 'ingen_forbindelse' };
  }
}

function logUdLokalt(besked){
  S.token = null;
  S.navn = '';
  S.programmer = [];
  S.dagsplan = [];
  S.vagter = [];
  S.traeninger = [];
  S.madplan = {};
  S.visMad = false;
  S.fejl = besked || '';
  lagSkriv(NOEGLE_TOKEN, null);
  lagSkriv(NOEGLE_CACHE, null);
  lagSkriv(NOEGLE_KOE, null);
  lagSkriv(NOEGLE_TEMA_AFVENTER, null);
  stopFlow();
  stopPoll();
  tegn();
}

async function logind(navn, kode){
  if(S.loginBusy) return;
  S.loginBusy = true;
  S.fejl = '';
  tegn();
  var res = await rpc('beboer_login', { p_navn: navn, p_kode: kode });
  S.loginBusy = false;
  if(res.fejl || !res.data){
    S.fejl = 'Der er ikke forbindelse. Prøv igen om lidt.';
    tegn();
    return;
  }
  var d = res.data;
  if(!d.ok){
    S.fejl = d.fejl === 'laast'
      ? 'Du har prøvet for mange gange. Vent 15 minutter.'
      : 'Navn eller kode er forkert. Prøv igen.';
    tegn();
    return;
  }
  S.token = d.token;
  S.navn = d.navn;
  S.tema = d.tema || 'standard';
  lagSkriv(NOEGLE_TEMA_AFVENTER, null);
  lagSkriv(NOEGLE_TOKEN, d.token);
  S.fane = 'hjem';
  S.indlaest = false;
  tegn();
  hentAlt();
  startPoll();
}

async function logud(){
  if(S.token) await rpc('beboer_logud', { p_token: S.token });
  logUdLokalt('');
}

async function hentAlt(){
  if(!S.token) return;
  var nu = new Date();
  var iGaar = new Date(nu); iGaar.setDate(iGaar.getDate() - 1);
  var iMorgen = new Date(nu); iMorgen.setDate(iMorgen.getDate() + 1);

  var madUgeNoegler = madUgerAtHente(nu);

  var svar;
  try {
    svar = await Promise.all([
      rpc('beboer_hent_programmer', { p_token: S.token }),
      rpc('beboer_min_dag', { p_token: S.token }),
      sb.from('personaleskaerm_vagter').select('navn,rolle,start,slut,billede,tag,dag')
        .in('dag', [datoISO(iGaar), datoISO(nu), datoISO(iMorgen)]).order('start'),
      sb.from('skjult_personale').select('navn,dag,udloeber').gt('udloeber', nu.toISOString()),
      rpc('beboer_traeninger', { p_token: S.token }),
      Promise.all(madUgeNoegler.map(function(iso){
        return rpc('beboer_madplan', { p_token: S.token, p_uge_start: iso });
      }))
    ]);
  } catch(e){
    S.offline = true;
    S.indlaest = true;
    if(!S.flow) tegn();
    return;
  }
  if(!S.token) return;

  var prog = svar[0], dag = svar[1];
  if(prog.fejl === 'ikke_logget_ind' || dag.fejl === 'ikke_logget_ind'){
    logUdLokalt('Du er logget ud. Log ind igen.');
    return;
  }
  if(prog.fejl || dag.fejl){
    S.offline = true;
  } else {
    S.offline = false;
    S.programmer = prog.data || [];
    S.dagsplan = dag.data || [];
    // Personale: fejler hentningen, beholdes det senest kendte. Skjulte: fejl => ingen skjules (som skærmen).
    if(!svar[2].error) S.vagter = svar[2].data || [];
    S.skjulte = svar[3].error ? [] : (svar[3].data || []);
    // Statistik: fejler hentningen, beholdes de senest kendte træninger.
    if(!svar[4].fejl) S.traeninger = svar[4].data || [];
    // Madplan: kun de uger vi har brug for. Fejler en uge, beholdes den senest kendte.
    var nyMad = {};
    madUgeNoegler.forEach(function(iso, i){
      var r = svar[5][i];
      if(r && !r.fejl){
        var perDag = {};
        (r.data || []).forEach(function(p){
          if(p && typeof p.dag === 'string' && typeof p.ret === 'string' && p.ret.trim()) perDag[p.dag] = p.ret.trim();
        });
        nyMad[iso] = perDag;
      } else if(S.madplan[iso]){
        nyMad[iso] = S.madplan[iso];
      }
    });
    S.madplan = nyMad;
    lagSkriv(NOEGLE_CACHE, JSON.stringify({
      navn: S.navn, tema: S.tema, programmer: S.programmer, dagsplan: S.dagsplan, traeninger: S.traeninger,
      madplan: S.madplan
    }));
  }
  S.indlaest = true;
  // Under en træning tegnes skærmen ikke om (billede og nedtælling må ikke nulstilles)
  if(!S.flow) tegn();
  if(!S.offline){ flushKoe(); sendAfventendeTema(); }
}

function startPoll(){
  stopPoll();
  pollTimer = setInterval(function(){
    if(document.hidden) return;
    hentAlt();
  }, 60000);
}
function stopPoll(){
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
}

document.addEventListener('visibilitychange', function(){
  if(!document.hidden && S.token) hentAlt();
});

// ---------- Tegning ----------

function tegn(){
  // Bevar fokus og tekst i login-felterne, hvis de findes
  rod.textContent = '';
  if(!S.token){ S.tema = 'standard'; anvendTema(); tegnLogin(); return; }
  anvendTema();
  if(S.flow){ tegnFlow(); return; }
  var side = lav('div', 'side');
  if(S.offline){
    side.appendChild(lav('div', 'offline', 'Ingen forbindelse. Du ser det, der sidst blev hentet.'));
  }
  if(S.visMad) tegnMadUge(side);
  else if(S.fane === 'hjem') tegnHjem(side);
  else if(S.fane === 'traening') tegnTraening(side);
  else if(S.fane === 'statistik') tegnStatistik(side);
  else tegnMere(side);
  rod.appendChild(side);
  rod.appendChild(bundmenu());
}

function tegnLogin(){
  var boks = lav('div', 'login');
  boks.appendChild(lav('h1', null, 'Hej!'));
  boks.appendChild(lav('p', null, 'Skriv dit fornavn og din kode på 4 tal.'));

  var form = lav('form');
  form.setAttribute('autocomplete', 'off');

  var navnFelt = lav('label', 'felt');
  navnFelt.appendChild(lav('span', null, 'Fornavn'));
  var navnInput = document.createElement('input');
  navnInput.type = 'text';
  navnInput.id = 'loginNavn';
  navnInput.autocomplete = 'given-name';
  navnInput.autocapitalize = 'words';
  navnInput.required = true;
  navnFelt.appendChild(navnInput);
  form.appendChild(navnFelt);

  var kodeFelt = lav('label', 'felt');
  kodeFelt.appendChild(lav('span', null, 'Kode (4 tal)'));
  var kodeInput = document.createElement('input');
  kodeInput.type = 'password';
  kodeInput.id = 'loginKode';
  kodeInput.className = 'kode';
  kodeInput.inputMode = 'numeric';
  kodeInput.pattern = '[0-9]{4}';
  kodeInput.maxLength = 4;
  kodeInput.autocomplete = 'off';
  kodeInput.required = true;
  kodeFelt.appendChild(kodeInput);
  form.appendChild(kodeFelt);

  if(S.fejl){
    var f = lav('p', 'fejl', S.fejl);
    f.setAttribute('role', 'alert');
    form.appendChild(f);
  }

  var knap = lav('button', 'knap accent', S.loginBusy ? 'Vent lidt …' : 'Gå ind');
  knap.type = 'submit';
  knap.disabled = S.loginBusy;
  form.appendChild(knap);

  form.addEventListener('submit', function(e){
    e.preventDefault();
    logind(navnInput.value.trim(), kodeInput.value.trim());
  });

  boks.appendChild(form);
  rod.appendChild(boks);
  if(!S.loginBusy) navnInput.focus();
}

function bundmenu(){
  var nav = lav('nav', 'bund');
  nav.setAttribute('aria-label', 'Hovedmenu');
  var inder = lav('div', 'inder');
  [['hjem', 'Hjem'], ['traening', 'Træning'], ['statistik', 'Statistik'], ['mere', 'Mere']].forEach(function(p){
    var k = lav('button', S.fane === p[0] ? 'aktiv' : '');
    k.type = 'button';
    if(S.fane === p[0]) k.setAttribute('aria-current', 'page');
    k.appendChild(svgIkon(IKONER[p[0]], p[0] === 'mere' ? 3 : 2));
    k.appendChild(lav('span', null, p[1]));
    k.addEventListener('click', function(){ S.fane = p[0]; S.visMad = false; tegn(); window.scrollTo(0, 0); });
    inder.appendChild(k);
  });
  nav.appendChild(inder);
  return nav;
}

function idagsProgrammer(nu){
  var dag = UGEDAGE[nu.getDay()];
  return S.programmer.filter(function(p){ return (p.dage || []).indexOf(dag) >= 0; });
}

function tegnHjem(side){
  var nu = new Date();

  var hoved = lav('header', 'hoved');
  hoved.appendChild(lav('h1', null, 'Hej ' + S.navn));
  hoved.appendChild(lav('div', 'dato', datoTekst(nu)));
  side.appendChild(hoved);

  if(!S.indlaest){
    side.appendChild(lav('p', 'tom', 'Henter …'));
    return;
  }

  // --- Dagens træning ---
  var tr = lav('section', 'sektion');
  tr.appendChild(lav('h2', null, tema().t.dagensTraening));
  var idag = idagsProgrammer(nu);
  if(idag.length === 0){
    var tom = lav('div', 'kort');
    tom.appendChild(lav('p', 'tom', 'Ingen træning i dag. Slap af.'));
    tr.appendChild(tom);
  } else {
    idag.forEach(function(p){
      var k = lav('div', 'kort traeningKort');
      k.appendChild(lav('h3', null, p.navn));
      var antal = (p.ovelser || []).length;
      k.appendChild(lav('div', 'meta', antal + (antal === 1 ? ' øvelse' : ' øvelser')));
      var start = lav('button', 'knap accent', tema().t.start);
      start.type = 'button';
      start.addEventListener('click', function(){ startFlow(p); });
      k.appendChild(start);
      tr.appendChild(k);
    });
  }
  side.appendChild(tr);

  // --- Dagens mad (hele kortet er en knap til ugens mad) ---
  var madSektion = lav('section', 'sektion');
  var uger = madUger(nu);
  var dagensRet = (S.madplan[uger.kal] || {})[UGEDAGE[nu.getDay()]] || '';
  var madKort = lav('button', 'kort madKort');
  madKort.type = 'button';
  madKort.setAttribute('aria-label', 'Dagens mad. Tryk for at se ugens mad.');
  var madIkon = lav('span', 'madIkon');
  madIkon.appendChild(svgIkon(IKONER.bestik, 2));
  madKort.appendChild(madIkon);
  var madTekst = lav('span', 'madTekst');
  madTekst.appendChild(lav('span', 'madLabel', 'Dagens mad'));
  madTekst.appendChild(lav('span', 'madRet' + (dagensRet ? '' : ' madTom'),
    dagensRet || 'Madplanen er ikke klar endnu'));
  var madMere = lav('span', 'madMere');
  madMere.appendChild(lav('span', null, 'Se ugens mad'));
  madMere.appendChild(svgIkon(IKONER.frem, 3));
  madTekst.appendChild(madMere);
  madKort.appendChild(madTekst);
  madKort.addEventListener('click', function(){ S.visMad = true; tegn(); window.scrollTo(0, 0); });
  madSektion.appendChild(madKort);
  side.appendChild(madSektion);

  // --- På arbejde nu ---
  var pa = lav('section', 'sektion');
  pa.appendChild(lav('h2', null, 'På arbejde nu'));
  var folk = paaArbejdeNu(S.vagter, S.skjulte, nu);
  var paKort = lav('div', 'kort');
  if(folk.length === 0){
    paKort.appendChild(lav('p', 'tom', 'Ingen oplysninger lige nu.'));
  } else {
    var gitter = lav('div', 'personer');
    folk.forEach(function(p){
      var c = lav('div', 'person');
      var foto = lav('div', 'foto');
      if(p.billede){
        var img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', function(){
          foto.textContent = initial(p.navn);
        });
        img.src = p.billede;
        foto.appendChild(img);
      } else {
        foto.textContent = initial(p.navn);
      }
      c.appendChild(foto);
      c.appendChild(lav('div', 'navn', p.navn));
      c.appendChild(lav('div', 'rolle', p.rolle));
      gitter.appendChild(c);
    });
    paKort.appendChild(gitter);
  }
  pa.appendChild(paKort);
  side.appendChild(pa);

  // --- Min dag ---
  var md = lav('section', 'sektion');
  md.appendChild(lav('h2', null, 'Min dag'));
  var dagNavn = UGEDAGE[nu.getDay()];
  var raekker = S.dagsplan
    .filter(function(r){ return r.ugedag === dagNavn; })
    .map(function(r){ return { tid: r.tid, min: tidTilMinutter(r.tid), aktivitet: r.aktivitet }; })
    .sort(function(a, b){
      if(a.min == null) return 1;
      if(b.min == null) return -1;
      return a.min - b.min;
    });
  if(raekker.length === 0){
    var tomDag = lav('div', 'kort');
    tomDag.appendChild(lav('p', 'tom', 'Der er ingen planer for i dag.'));
    md.appendChild(tomDag);
  } else {
    var nuMin = nu.getHours() * 60 + nu.getMinutes();
    var nuIndex = -1;
    raekker.forEach(function(r, i){ if(r.min != null && r.min <= nuMin) nuIndex = i; });
    var liste = lav('ul', 'dagsliste');
    raekker.forEach(function(r, i){
      var li = lav('li', 'dagsrække' + (i === nuIndex ? ' nu' : (i < nuIndex ? ' forbi' : '')));
      li.appendChild(lav('span', 'tid', tidVisning(r.tid)));
      var tekst = lav('span', 'aktivitet', r.aktivitet);
      if(i === nuIndex){
        var m = lav('span', 'nuMaerke', 'Nu');
        tekst.appendChild(m);
        li.setAttribute('aria-current', 'true');
      }
      li.appendChild(tekst);
      liste.appendChild(li);
    });
    md.appendChild(liste);
  }
  side.appendChild(md);
}

// ---------- Madplan ----------
// Ugen går mandag til søndag i enhedens lokale tid. "kal" er den kalenderuge vi er i
// (dagens ret). "vis" er den uge personalet arbejder i: efter søndag kl. 20 regnes
// næste uge som "denne uge" (samme regel som personaleskærmen og personaleappen).

function madUger(nu){
  var kal = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  kal.setDate(kal.getDate() - ((kal.getDay() + 6) % 7));
  var vis = new Date(kal);
  if(nu.getDay() === 0 && nu.getHours() >= 20) vis.setDate(vis.getDate() + 7);
  return { kal: datoISO(kal), vis: datoISO(vis) };
}

function madUgerAtHente(nu){
  var u = madUger(nu);
  return u.kal === u.vis ? [u.kal] : [u.kal, u.vis];
}

function tegnMadUge(side){
  var nu = new Date();
  var uger = madUger(nu);
  var perDag = S.madplan[uger.vis] || {};

  var tilbage = lav('button', 'knap lys madTilbage');
  tilbage.type = 'button';
  tilbage.appendChild(svgIkon(IKONER.tilbage, 3));
  tilbage.appendChild(lav('span', null, 'Tilbage'));
  tilbage.addEventListener('click', function(){ S.visMad = false; tegn(); window.scrollTo(0, 0); });
  side.appendChild(tilbage);

  var hoved = lav('header', 'hoved');
  hoved.appendChild(lav('h1', null, 'Ugens mad'));
  hoved.appendChild(lav('div', 'dato', 'Uge fra mandag den ' + lokalDato(uger.vis).getDate() + '. ' +
    MAANEDER[lokalDato(uger.vis).getMonth()]));
  side.appendChild(hoved);

  var liste = lav('ul', 'dagsliste');
  UGEDAGE_ORDEN.forEach(function(dag){
    var erIdag = uger.vis === uger.kal && dag === UGEDAGE[nu.getDay()];
    var ret = perDag[dag] || '';
    var li = lav('li', 'dagsrække madRække' + (erIdag ? ' nu' : ''));
    li.appendChild(lav('span', 'tid madDag', dag));
    var tekst = lav('span', 'madRetTekst' + (ret ? '' : ' madTom'), ret || 'Ikke klar endnu');
    if(erIdag){
      tekst.appendChild(lav('span', 'nuMaerke', 'I dag'));
      li.setAttribute('aria-current', 'date');
    }
    li.appendChild(tekst);
    liste.appendChild(li);
  });
  side.appendChild(liste);
}

function tegnTraening(side){
  var hoved = lav('header', 'hoved');
  hoved.appendChild(lav('h1', null, 'Træning'));
  side.appendChild(hoved);

  if(S.programmer.length === 0){
    var tom = lav('div', 'kort');
    tom.appendChild(lav('p', 'tom', 'Du har ikke noget program endnu.'));
    side.appendChild(tom);
    return;
  }
  var idagNavn = UGEDAGE[new Date().getDay()];
  S.programmer.forEach(function(p){
    var k = lav('div', 'kort traeningKort');
    k.appendChild(lav('h3', null, p.navn));
    var chips = lav('div', 'dagechips');
    UGEDAGE_ORDEN.forEach(function(d){
      if((p.dage || []).indexOf(d) < 0) return;
      chips.appendChild(lav('span', 'dagechip' + (d === idagNavn ? ' idag' : ''), DAGE_KORT[d]));
    });
    k.appendChild(chips);
    var ul = lav('ul', 'ovelsesliste');
    (p.ovelser || []).forEach(function(o){
      var li = lav('li');
      li.appendChild(lav('span', null, o.navn));
      li.appendChild(lav('span', null, o.saet + ' × ' + o.gentagelser));
      ul.appendChild(li);
    });
    k.appendChild(ul);
    var go = lav('button', 'knap accent', tema().t.start);
    go.type = 'button';
    go.addEventListener('click', function(){ startFlow(p); });
    k.appendChild(go);
    side.appendChild(k);
  });
}

// ---------- Statistik og medaljer ----------
// En "træning" = en dag + et program med mindst ét færdigt sæt (én række i
// S.traeninger). Uger går fra mandag til søndag i enhedens lokale tid.

var MEDALJER = [
  { id: 'm10',  type: 'total',  graense: 10, titel: '10 træninger', ikon: 'medalje' },
  { id: 'm25',  type: 'total',  graense: 25, titel: '25 træninger', ikon: 'medalje' },
  { id: 'm50',  type: 'total',  graense: 50, titel: '50 træninger', ikon: 'pokal' },
  { id: 'u3',   type: 'streak', graense: 3,  titel: '3 uger i træk', ikon: 'flamme' }
];

function cirkelSti(cx, cy, r){
  return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0';
}

// En bowling-kegle i et 24 × 24 felt, centreret om cx
function kegleSti(cx){
  return [
    'M' + (cx - 1.4) + ' 8C' + (cx - 3) + ' 12 ' + (cx - 3.2) + ' 15 ' + (cx - 2.4) + ' 19H' + (cx + 2.4) +
      'C' + (cx + 3.2) + ' 15 ' + (cx + 3) + ' 12 ' + (cx + 1.4) + ' 8z',
    cirkelSti(cx, 5, 1.6)
  ];
}

var MEDALJE_STIER = {
  medalje: ['M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M8.5 13.5L7 21l5-3 5 3-1.5-7.5'],
  pokal:   ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5v1a3 3 0 0 0 3 3', 'M16 6h3v1a3 3 0 0 1-3 3', 'M12 13v4', 'M8 20h8'],
  flamme:  ['M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z'],
  // Zombie/Japan
  katana:  ['M21 3L9.5 14.5', 'M7.5 12.5l4 4', 'M9.5 14.5L4 20', 'M3 21l1.5-1.5'],
  blomst:  [cirkelSti(12, 7, 2.6), cirkelSti(16.76, 10.45, 2.6), cirkelSti(14.94, 16.05, 2.6),
            cirkelSti(9.06, 16.05, 2.6), cirkelSti(7.24, 10.45, 2.6), cirkelSti(12, 12, 1)],
  hjelm:   ['M5 14a7 7 0 0 1 14 0', 'M3 14h18', 'M4 14l-1 5h18l-1-5', 'M12 7V3', 'M9 5L7 3', 'M15 5l2-2'],
  torii:   ['M3 6h18', 'M5 9.5h14', 'M7 6v14', 'M17 6v14', 'M12 9.5V13'],
  // Bowling
  kugle:   [cirkelSti(12, 12, 8), 'M9 9h.01', 'M13 8h.01', 'M12 12h.01'],
  turkey:  kegleSti(5).concat(kegleSti(12), kegleSti(19)),
  stjerne: ['M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z']
};

// "2026-10-13" -> lokal dato kl. 12 (undgår sommertids-fejl)
function lokalDato(iso){
  var d = iso.split('-');
  return new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]), 12, 0, 0);
}

function ugeStart(d){
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // mandag
  return x;
}

function plusDage(d, n){
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

function isoUgenr(d){
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dag);
  var aarStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - aarStart) / 86400000 + 1) / 7);
}

function beregnStatistik(nu){
  var dageMedTraening = {};
  var ugeAntal = {};
  var total = 0;
  var maaned = 0;
  (S.traeninger || []).forEach(function(r){
    var d = lokalDato(r.lokal_dato);
    total++;
    dageMedTraening[r.lokal_dato] = true;
    var uge = datoISO(ugeStart(d));
    ugeAntal[uge] = (ugeAntal[uge] || 0) + 1;
    if(d.getFullYear() === nu.getFullYear() && d.getMonth() === nu.getMonth()) maaned++;
  });

  var dennUge = ugeStart(nu);

  // Længste og nuværende stime af uger med mindst én træning
  var ugenoegler = Object.keys(ugeAntal).sort();
  var laengste = 0, run = 0, forrige = null;
  ugenoegler.forEach(function(k){
    var d = lokalDato(k);
    if(forrige && datoISO(plusDage(forrige, 7)) === k) run++; else run = 1;
    if(run > laengste) laengste = run;
    forrige = d;
  });
  // Nuværende stime: tæl bagud fra denne uge (eller sidste uge, hvis denne uge endnu er tom).
  var nuvaerende = 0;
  var tjek = dennUge;
  if(!ugeAntal[datoISO(tjek)]) tjek = plusDage(tjek, -7);
  while(ugeAntal[datoISO(tjek)]){
    nuvaerende++;
    tjek = plusDage(tjek, -7);
  }

  var uger = [];
  for(var i = 4; i >= 0; i--){
    var ws = plusDage(dennUge, -7 * i);
    uger.push({ start: ws, antal: ugeAntal[datoISO(ws)] || 0, nr: isoUgenr(ws), denne: i === 0 });
  }

  var dage = [];
  for(var j = 0; j < 7; j++){
    var dd = plusDage(dennUge, j);
    dage.push({ dato: dd, med: !!dageMedTraening[datoISO(dd)], idag: datoISO(dd) === datoISO(nu) });
  }

  return { total: total, maaned: maaned, nuvaerende: nuvaerende, laengste: laengste, uger: uger, dage: dage };
}

function medaljeVaerdi(m, st){
  return m.type === 'total' ? st.total : st.laengste;
}

function tegnStatistik(side){
  var nu = new Date();
  var st = beregnStatistik(nu);

  var hoved = lav('header', 'hoved');
  hoved.appendChild(lav('h1', null, 'Statistik'));
  side.appendChild(hoved);

  // --- To store tal ---
  var tal = lav('div', 'statTal');
  [[st.maaned, st.maaned === 1 ? 'træning denne måned' : 'træninger denne måned'],
   [st.nuvaerende, st.nuvaerende === 1 ? 'uge i træk' : 'uger i træk']].forEach(function(p){
    var k = lav('div', 'kort statKort');
    k.appendChild(lav('div', 'statStor', String(p[0])));
    k.appendChild(lav('div', 'statLabel', p[1]));
    tal.appendChild(k);
  });
  side.appendChild(tal);

  // --- Denne uge ---
  var uge = lav('section', 'sektion');
  uge.appendChild(lav('h2', null, 'Denne uge'));
  var raekke = lav('div', 'ugeDage');
  st.dage.forEach(function(d){
    var navn = UGEDAGE[d.dato.getDay()];
    var c = lav('div', 'ugeDag' + (d.med ? ' med' : '') + (d.idag ? ' idag' : ''));
    c.setAttribute('aria-label', navn + (d.med ? ': du har trænet' : ': ingen træning'));
    c.appendChild(lav('div', 'ugeDagNavn', DAGE_KORT[navn]));
    c.appendChild(lav('div', 'ugeDagMaerke', d.med ? '✓' : ''));
    raekke.appendChild(c);
  });
  uge.appendChild(raekke);
  side.appendChild(uge);

  // --- Søjlegraf: seneste 5 uger ---
  var graf = lav('section', 'sektion');
  graf.appendChild(lav('h2', null, tema().t.uger));
  var maks = 1;
  st.uger.forEach(function(u){ if(u.antal > maks) maks = u.antal; });
  var gKort = lav('div', 'kort');
  var beskrivelse = 'Træninger pr. uge: ' + st.uger.map(function(u){ return 'uge ' + u.nr + ': ' + u.antal; }).join(', ');
  if(S.tema === 'bowling'){
    // Scorekort: én ramme pr. uge — øverst ugen, i midten træninger, nederst samlet
    var kort = lav('div', 'scorekort');
    kort.setAttribute('role', 'img');
    kort.setAttribute('aria-label', beskrivelse);
    var sum = 0;
    st.uger.forEach(function(u){
      sum += u.antal;
      var ramme = lav('div', 'skRamme' + (u.denne ? ' denne' : ''));
      ramme.appendChild(lav('div', 'skUge', u.denne ? 'Nu' : 'Uge ' + u.nr));
      ramme.appendChild(lav('div', 'skKast', String(u.antal)));
      ramme.appendChild(lav('div', 'skSum', String(sum)));
      kort.appendChild(ramme);
    });
    gKort.appendChild(kort);
    gKort.appendChild(lav('div', 'meta skForklaring', 'Stort tal: træninger i ugen. Lille tal: samlet score.'));
  } else {
    var soejler = lav('div', 'soejler');
    soejler.setAttribute('role', 'img');
    soejler.setAttribute('aria-label', beskrivelse);
    st.uger.forEach(function(u){
      var kol = lav('div', 'soejle' + (u.denne ? ' denne' : ''));
      kol.appendChild(lav('div', 'soejleTal', String(u.antal)));
      var plads = lav('div', 'soejlePlads');
      var bar = lav('div', 'soejleBar');
      bar.style.height = (u.antal === 0 ? 4 : Math.max(8, Math.round(u.antal / maks * 100))) + '%';
      plads.appendChild(bar);
      kol.appendChild(plads);
      kol.appendChild(lav('div', 'soejleLabel', u.denne ? 'Nu' : 'Uge ' + u.nr));
      soejler.appendChild(kol);
    });
    gKort.appendChild(soejler);
  }
  graf.appendChild(gKort);
  side.appendChild(graf);

  // --- Medaljer ---
  var med = lav('section', 'sektion');
  med.appendChild(lav('h2', null, tema().t.medaljer));
  var gitter = lav('div', 'medaljer');
  MEDALJER.forEach(function(m){
    var v = medaljeVaerdi(m, st);
    var optjent = v >= m.graense;
    var tm = tema().medaljer[m.id] || {};
    var k = lav('div', 'medalje' + (optjent ? ' optjent' : ' ikkeOptjent'));
    var ikon = lav('div', 'medaljeIkon');
    ikon.appendChild(svgIkon(MEDALJE_STIER[tm.ikon || m.ikon], 1.8));
    k.appendChild(ikon);
    k.appendChild(lav('div', 'medaljeTitel', tm.navn || m.titel));
    if(tm.navn) k.appendChild(lav('div', 'medaljeKrit', m.titel));
    k.appendChild(lav('div', 'medaljeStatus', optjent ? 'Optjent!' : Math.min(v, m.graense) + ' af ' + m.graense));
    gitter.appendChild(k);
  });
  med.appendChild(gitter);
  side.appendChild(med);
}

function tegnMere(side){
  var hoved = lav('header', 'hoved');
  hoved.appendChild(lav('h1', null, 'Mere'));
  side.appendChild(hoved);

  // --- Ugens mad ---
  var madKnap = lav('button', 'knap lys madMereKnap');
  madKnap.type = 'button';
  madKnap.appendChild(svgIkon(IKONER.bestik, 2));
  madKnap.appendChild(lav('span', null, 'Ugens mad'));
  madKnap.addEventListener('click', function(){ S.visMad = true; tegn(); window.scrollTo(0, 0); });
  side.appendChild(madKnap);

  // --- Tema ---
  var tk = lav('div', 'kort');
  tk.appendChild(lav('h2', 'temaTitel', 'Vælg tema'));
  var gruppe = lav('div', 'temaGruppe');
  gruppe.setAttribute('role', 'radiogroup');
  gruppe.setAttribute('aria-label', 'Tema');
  ['standard', 'zombie', 'bowling'].forEach(function(id){
    var t = TEMAER[id];
    var valgt = S.tema === id;
    var kn = lav('button', 'temaKnap' + (valgt ? ' valgt' : ''));
    kn.type = 'button';
    kn.setAttribute('role', 'radio');
    kn.setAttribute('aria-checked', valgt ? 'true' : 'false');
    var farver = lav('span', 'temaFarver');
    farver.setAttribute('aria-hidden', 'true');
    t.farver.forEach(function(f){
      var p = lav('span', 'temaPrik');
      p.style.background = f;
      farver.appendChild(p);
    });
    kn.appendChild(farver);
    var tekst = lav('span', 'temaTekst');
    tekst.appendChild(lav('span', 'temaNavn', t.navn));
    tekst.appendChild(lav('span', 'temaBeskr', t.beskrivelse));
    kn.appendChild(tekst);
    if(valgt) kn.appendChild(lav('span', 'temaValgt', 'Valgt'));
    kn.addEventListener('click', function(){ vaelgTema(id); });
    gruppe.appendChild(kn);
  });
  tk.appendChild(gruppe);
  side.appendChild(tk);

  var k = lav('div', 'kort');
  k.appendChild(lav('p', null, 'Du er logget ind som ' + S.navn + '.'));
  var ud = lav('button', 'knap lys', 'Log ud');
  ud.type = 'button';
  ud.addEventListener('click', logud);
  k.appendChild(ud);
  side.appendChild(k);
}

function opdaterCacheTema(){
  try {
    var c = JSON.parse(lagLaes(NOEGLE_CACHE) || 'null');
    if(c){ c.tema = S.tema; lagSkriv(NOEGLE_CACHE, JSON.stringify(c)); }
  } catch(e){ /* ignorer */ }
}

// Gemmer valget lokalt med det samme og sender det til serveren. Kan det ikke
// sendes (offline), forsøges igen ved næste hentning.
async function vaelgTema(id){
  if(!TEMAER[id] || S.tema === id) return;
  S.tema = id;
  lagSkriv(NOEGLE_TEMA_AFVENTER, id);
  opdaterCacheTema();
  tegn();
  var res = await rpc('beboer_saet_tema', { p_token: S.token, p_tema: id });
  if(!res.fejl && lagLaes(NOEGLE_TEMA_AFVENTER) === id) lagSkriv(NOEGLE_TEMA_AFVENTER, null);
}

async function sendAfventendeTema(){
  var p = lagLaes(NOEGLE_TEMA_AFVENTER);
  if(!p || !TEMAER[p] || !S.token) return;
  var res = await rpc('beboer_saet_tema', { p_token: S.token, p_tema: p });
  if(!res.fejl && lagLaes(NOEGLE_TEMA_AFVENTER) === p) lagSkriv(NOEGLE_TEMA_AFVENTER, null);
}

// ---------- Træningsflow ----------
// Én øvelse ad gangen. Hvert færdigt sæt gemmes (beboer_log_saet). Kan det ikke
// sendes, ligger det i en lokal kø og forsøges igen, når der er forbindelse.

var flowTimer = null;     // nedtælling i pausen
var frameTimer = null;    // skifter mellem øvelsens to billeder
var wakeLock = null;
var taler = false;

function stopFlowTimere(){
  if(flowTimer){ clearInterval(flowTimer); flowTimer = null; }
  if(frameTimer){ clearInterval(frameTimer); frameTimer = null; }
  if(taler && window.speechSynthesis){
    try { window.speechSynthesis.cancel(); } catch(e){ /* ignorer */ }
  }
  taler = false;
}

function holdSkaermVaagen(){
  try {
    if(navigator.wakeLock && navigator.wakeLock.request){
      navigator.wakeLock.request('screen').then(function(l){ wakeLock = l; }).catch(function(){ /* ignorer */ });
    }
  } catch(e){ /* ignorer */ }
}

function slipSkaermLaas(){
  try { if(wakeLock){ wakeLock.release(); wakeLock = null; } } catch(e){ /* ignorer */ }
}

function stopFlow(){
  stopFlowTimere();
  slipSkaermLaas();
  S.flow = null;
}

function startFlow(program){
  if(!program || !program.ovelser || program.ovelser.length === 0) return;
  stopFlow();
  S.flow = { program: program, ex: 0, saet: 1, fase: 'oevelse', udfoert: 0, pauseSlut: 0, pauseTotal: 0, naeste: null, stopper: false, optaget: false };
  holdSkaermVaagen();
  tegn();
  window.scrollTo(0, 0);
}

// ---- Kø til sæt der ikke kunne sendes ----

var koeBusy = false;

function laesKoe(){
  try { return JSON.parse(lagLaes(NOEGLE_KOE) || '[]') || []; } catch(e){ return []; }
}
function skrivKoe(k){
  lagSkriv(NOEGLE_KOE, k.length > 0 ? JSON.stringify(k) : null);
}

// 'ok' | 'koe' (prøv igen senere) | 'fejl' (afvist af serveren)
async function sendSaet(post){
  var res = await rpc('beboer_log_saet', {
    p_token: S.token, p_program_id: post.program_id, p_ovelse_id: post.ovelse_id,
    p_saet_nr: post.saet_nr, p_lokal_dato: post.lokal_dato
  });
  if(res.fejl === 'ingen_forbindelse' || res.fejl === 'ikke_logget_ind') return 'koe';
  if(res.fejl) return 'fejl';
  return 'ok';
}

async function gemSaet(post){
  var r = await sendSaet(post);
  if(r === 'ok') return;
  post.forsog = (post.forsog || 0) + (r === 'fejl' ? 1 : 0);
  if(post.forsog >= 3) return;   // serveren afviser det gang på gang — opgiv
  var k = laesKoe();
  k.push(post);
  skrivKoe(k);
}

async function flushKoe(){
  if(koeBusy || !S.token) return;
  var k = laesKoe();
  if(k.length === 0) return;
  koeBusy = true;
  var rest = [];
  for(var i = 0; i < k.length; i++){
    var r = await sendSaet(k[i]);
    if(r === 'ok') continue;
    k[i].forsog = (k[i].forsog || 0) + (r === 'fejl' ? 1 : 0);
    if(k[i].forsog < 3) rest.push(k[i]);
  }
  skrivKoe(rest);
  koeBusy = false;
}

// ---- Tegning ----

function samletSaet(program){
  return (program.ovelser || []).reduce(function(sum, o){ return sum + o.saet; }, 0);
}

function flowTop(side){
  var F = S.flow;
  var n = F.program.ovelser.length;
  var top = lav('div', 'flowTop');
  var rk = lav('div', 'flowRække');
  rk.appendChild(lav('div', 'flowTaeller', tema().t.taeller(F.ex + 1, n)));
  var stop = lav('button', 'stopKnap', 'Stop');
  stop.type = 'button';
  stop.addEventListener('click', function(){ F.stopper = true; tegn(); });
  rk.appendChild(stop);
  top.appendChild(rk);

  var total = samletSaet(F.program);
  var pct = total > 0 ? Math.round(F.udfoert / total * 100) : 0;
  var bj = lav('div', 'bjaelke');
  bj.setAttribute('role', 'progressbar');
  bj.setAttribute('aria-valuemin', '0');
  bj.setAttribute('aria-valuemax', '100');
  bj.setAttribute('aria-valuenow', String(pct));
  bj.setAttribute('aria-label', 'Fremskridt');
  var fyld = lav('div', 'bjaelkeFyld');
  fyld.style.width = pct + '%';
  bj.appendChild(fyld);
  top.appendChild(bj);
  side.appendChild(top);
}

// Fuld URL (billede uploadet af personalet) bruges direkte. En relativ sti
// (de oprindelige øvelsesbilleder i repoet) får ../ foran.
function ovelseBilledeUrl(sti){
  if(!sti) return null;
  return /^https?:\/\//i.test(sti) ? sti : '../' + sti;
}

function visPladsholder(boks){
  boks.textContent = '';
  boks.classList.add('udenBillede');
  boks.appendChild(svgIkon(IKONER.traening, 1.6));
}

function oevelseBillede(ov){
  var boks = lav('div', 'flowBillede');
  var kilder = [];
  if(ov.gif_sti) kilder.push(ovelseBilledeUrl(ov.gif_sti));
  else {
    if(ov.billede_sti) kilder.push(ovelseBilledeUrl(ov.billede_sti));
    if(ov.billede2_sti) kilder.push(ovelseBilledeUrl(ov.billede2_sti));
  }
  if(kilder.length === 0){
    visPladsholder(boks);
    return boks;
  }
  var img = document.createElement('img');
  img.alt = ov.navn;
  // Billeder fra et andet domæne hentes med CORS, så service workeren kan gemme dem til offline brug
  if(/^https?:\/\//i.test(kilder[0])) img.crossOrigin = 'anonymous';
  // Kan billedet ikke hentes (offline første gang, slettet fil), vises pladsholderen i stedet
  img.addEventListener('error', function(){
    if(frameTimer){ clearInterval(frameTimer); frameTimer = null; }
    visPladsholder(boks);
  });
  img.src = kilder[0];
  boks.appendChild(img);
  var reduceret = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(kilder.length > 1 && !reduceret){
    var i = 0;
    frameTimer = setInterval(function(){
      i = (i + 1) % kilder.length;
      img.src = kilder[i];
    }, 1200);
  }
  return boks;
}

function saetTekst(ov){
  return ov.saet + (ov.saet === 1 ? ' sæt' : ' sæt') + ' × ' + ov.gentagelser + (ov.gentagelser === 1 ? ' gentagelse' : ' gentagelser');
}

function laesHoejt(tekst, knap){
  if(!window.speechSynthesis) return;
  if(taler){
    window.speechSynthesis.cancel();
    taler = false;
    knap.textContent = 'Læs højt';
    return;
  }
  var u = new SpeechSynthesisUtterance(tekst);
  u.lang = 'da-DK';
  u.rate = 0.9;
  var stemmer = window.speechSynthesis.getVoices() || [];
  for(var i = 0; i < stemmer.length; i++){
    if(stemmer[i].lang && stemmer[i].lang.toLowerCase().indexOf('da') === 0){ u.voice = stemmer[i]; break; }
  }
  var slut = function(){ taler = false; knap.textContent = 'Læs højt'; };
  u.onend = slut;
  u.onerror = slut;
  taler = true;
  knap.textContent = 'Stop oplæsning';
  window.speechSynthesis.speak(u);
}

function tegnFlow(){
  stopFlowTimere();
  var F = S.flow;
  var side = lav('div', 'flow side');
  if(F.stopper) tegnFlowStop(side);
  else if(F.fase === 'faerdig') tegnFlowFaerdig(side);
  else if(F.fase === 'pause') tegnFlowPause(side);
  else tegnFlowOevelse(side);
  rod.appendChild(side);
}

function tegnFlowOevelse(side){
  var F = S.flow;
  var ov = F.program.ovelser[F.ex];
  flowTop(side);
  side.appendChild(oevelseBillede(ov));
  side.appendChild(lav('h1', 'flowTitel', ov.navn));
  side.appendChild(lav('div', 'flowMaal', saetTekst(ov)));
  side.appendChild(lav('div', 'flowSaetTekst', 'Sæt ' + F.saet + ' af ' + ov.saet));

  var cirkler = lav('div', 'saetCirkler');
  cirkler.setAttribute('aria-hidden', 'true');
  for(var i = 1; i <= ov.saet; i++){
    var c = lav('span', 'saetCirkel' + (i < F.saet ? ' faerdig' : (i === F.saet ? ' nu' : '')));
    if(i < F.saet) c.textContent = '✓';
    cirkler.appendChild(c);
  }
  side.appendChild(cirkler);

  // Bowling: gentagelserne vises som kegler (højst 10), der vælter, når sættet er færdigt
  if(S.tema === 'bowling'){
    var antalKegler = Math.max(1, Math.min(ov.gentagelser, 10));
    var kegler = lav('div', 'kegler');
    kegler.setAttribute('aria-hidden', 'true');
    for(var k = 0; k < antalKegler; k++){
      var kegle = lav('span', 'kegle');
      kegle.style.setProperty('--i', String(k));
      kegle.appendChild(svgIkon(kegleSti(12), 1.2, '8 2.5 8 17.5'));
      kegler.appendChild(kegle);
    }
    side.appendChild(kegler);
    var strike = lav('div', 'strike', tema().t.strike);
    strike.hidden = true;
    strike.setAttribute('role', 'status');
    side.appendChild(strike);
  }

  if(ov.beskrivelse) side.appendChild(lav('p', 'flowBeskr', ov.beskrivelse));

  if(window.speechSynthesis){
    var hoej = lav('button', 'knap lys', 'Læs højt');
    hoej.type = 'button';
    var tekst = ov.navn + '. ' + saetTekst(ov) + '. ' + (ov.beskrivelse || '');
    hoej.addEventListener('click', function(){ laesHoejt(tekst, hoej); });
    side.appendChild(hoej);
  }

  var faerdig = lav('button', 'knap accent flowStor', tema().t.saetFaerdig);
  faerdig.type = 'button';
  faerdig.addEventListener('click', saetFaerdig);
  side.appendChild(faerdig);
}

function saetFaerdig(){
  var F = S.flow;
  if(!F || F.optaget) return;
  if(S.tema === 'bowling' && F.fase === 'oevelse'){
    // Keglerne vælter og "STRIKE!" vises et kort øjeblik, så registreres sættet
    F.optaget = true;
    var rk = document.querySelector('.kegler');
    if(rk) rk.classList.add('vaelt');
    var st = document.querySelector('.strike');
    if(st) st.hidden = false;
    var reduceret = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(registrerSaet, reduceret ? 400 : 1100);
    return;
  }
  registrerSaet();
}

function registrerSaet(){
  var F = S.flow;
  if(!F || F.fase !== 'oevelse') return;
  F.optaget = true;
  var ov = F.program.ovelser[F.ex];
  gemSaet({
    program_id: F.program.id, ovelse_id: ov.ovelse_id, saet_nr: F.saet,
    lokal_dato: datoISO(new Date())   // enhedens lokale dato
  });
  F.udfoert++;

  var sidsteSaet = F.saet >= ov.saet;
  var sidsteOevelse = F.ex >= F.program.ovelser.length - 1;
  if(sidsteSaet && sidsteOevelse){
    F.fase = 'faerdig';
  } else {
    F.naeste = sidsteSaet ? { ex: F.ex + 1, saet: 1 } : { ex: F.ex, saet: F.saet + 1 };
    var pause = ov.pause_sek || 0;
    if(pause > 0){
      F.fase = 'pause';
      F.pauseTotal = pause;
      F.pauseSlut = Date.now() + pause * 1000;
    } else {
      F.ex = F.naeste.ex;
      F.saet = F.naeste.saet;
      F.fase = 'oevelse';
    }
  }
  F.optaget = false;
  tegn();
  window.scrollTo(0, 0);
}

function afslutPause(){
  var F = S.flow;
  if(!F || F.fase !== 'pause') return;
  F.ex = F.naeste.ex;
  F.saet = F.naeste.saet;
  F.fase = 'oevelse';
  try { if(navigator.vibrate) navigator.vibrate(200); } catch(e){ /* ignorer */ }
  tegn();
  window.scrollTo(0, 0);
}

function tegnFlowPause(side){
  var F = S.flow;
  var nu = F.program.ovelser[F.naeste.ex];
  flowTop(side);
  side.appendChild(lav('h1', 'flowTitel', tema().t.pause));
  var tal = lav('div', 'pauseTal', String(Math.max(0, Math.ceil((F.pauseSlut - Date.now()) / 1000))));
  tal.setAttribute('role', 'timer');
  tal.setAttribute('aria-live', 'off');
  side.appendChild(tal);
  side.appendChild(lav('div', 'flowMaal', 'sekunder'));

  var naeste = lav('div', 'kort');
  naeste.appendChild(lav('div', 'meta', F.naeste.ex !== F.ex ? 'Næste øvelse' : 'Næste sæt'));
  naeste.appendChild(lav('div', 'flowNaeste', nu.navn + ' – sæt ' + F.naeste.saet + ' af ' + nu.saet));
  side.appendChild(naeste);

  var spring = lav('button', 'knap lys', 'Spring over');
  spring.type = 'button';
  spring.addEventListener('click', afslutPause);
  side.appendChild(spring);

  flowTimer = setInterval(function(){
    var rest = Math.ceil((F.pauseSlut - Date.now()) / 1000);
    if(rest <= 0){ afslutPause(); return; }
    tal.textContent = String(rest);
  }, 250);
}

function tegnFlowFaerdig(side){
  var F = S.flow;
  var ud = lav('div', 'flowFaerdig');
  ud.appendChild(lav('div', 'flowStjerne', '★'));
  ud.appendChild(lav('h1', 'flowTitel', tema().t.faerdig(S.navn)));
  ud.appendChild(lav('p', 'flowBeskr', 'Du er færdig med ' + F.program.navn + '.'));
  var n = F.program.ovelser.length;
  var kort = lav('div', 'kort');
  kort.appendChild(lav('div', 'flowMaal', n + (n === 1 ? ' øvelse' : ' øvelser') + ' · ' + F.udfoert + (F.udfoert === 1 ? ' sæt' : ' sæt')));
  ud.appendChild(kort);
  var hjem = lav('button', 'knap accent flowStor', 'Tilbage til forsiden');
  hjem.type = 'button';
  hjem.addEventListener('click', function(){
    stopFlow();
    S.fane = 'hjem';
    tegn();
    window.scrollTo(0, 0);
    hentAlt();
  });
  ud.appendChild(hjem);
  side.appendChild(ud);
}

function tegnFlowStop(side){
  var F = S.flow;
  side.appendChild(lav('h1', 'flowTitel', 'Vil du stoppe?'));
  side.appendChild(lav('p', 'flowBeskr', 'Det du har lavet, er gemt.'));
  var fortsaet = lav('button', 'knap accent flowStor', 'Fortsæt træningen');
  fortsaet.type = 'button';
  fortsaet.addEventListener('click', function(){ F.stopper = false; tegn(); });
  side.appendChild(fortsaet);
  var stop = lav('button', 'knap lys', 'Ja, stop');
  stop.type = 'button';
  stop.style.marginTop = '14px';
  stop.addEventListener('click', function(){
    stopFlow();
    S.fane = 'hjem';
    tegn();
    window.scrollTo(0, 0);
    hentAlt();
  });
  side.appendChild(stop);
}

// ---------- Start ----------

function start(){
  S.token = lagLaes(NOEGLE_TOKEN);
  if(!S.token){ tegn(); return; }

  // Vis straks det sidst kendte (offline-visning), tjek derefter sessionen.
  var cache = null;
  try { cache = JSON.parse(lagLaes(NOEGLE_CACHE) || 'null'); } catch(e){ cache = null; }
  if(cache){
    S.navn = cache.navn || '';
    S.tema = cache.tema || 'standard';
    S.programmer = cache.programmer || [];
    S.dagsplan = cache.dagsplan || [];
    S.traeninger = cache.traeninger || [];
    S.madplan = cache.madplan || {};
  }

  rpc('beboer_session_tjek', { p_token: S.token }).then(function(res){
    if(res.fejl === 'ingen_forbindelse' || res.fejl === 'fejl'){
      if(cache){ S.offline = true; S.indlaest = true; tegn(); }
      else { S.token = null; S.fejl = 'Der er ikke forbindelse. Prøv igen om lidt.'; tegn(); }
      startPoll();
      return;
    }
    if(res.fejl || !res.data || !res.data.ok){
      logUdLokalt('Du er logget ud. Log ind igen.');
      return;
    }
    S.navn = res.data.navn;
    // Et valg der endnu ikke nåede serveren, vinder over serverens gamle værdi
    var afventer = lagLaes(NOEGLE_TEMA_AFVENTER);
    S.tema = (afventer && TEMAER[afventer]) ? afventer : (res.data.tema || 'standard');
    tegn();
    hentAlt();
    flushKoe();
    startPoll();
  });
  if(cache){ S.indlaest = true; tegn(); }
}

if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('service-worker.js').catch(function(e){ console.error('SW:', e); });
  });
}

start();

})();
