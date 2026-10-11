// ==================================================================
// LA2-fane på infoskærmen.
//
// Viser ALDRIG planernes indhold — kun at noget er sket, eller at noget
// skal gøres. Data kommer fra la2_screen_feed() (metadata). Alt opdateres
// automatisk (polling hvert 60. sekund); personalet gør ikke noget ekstra.
//
// Selvstændig og fejlisoleret: egen Supabase-klient med EGEN storageKey
// (tavlens øvrige anon-klient berøres ikke), alt kører i try/catch og kan
// aldrig stoppe resten af tavlen. Intet planindhold gemmes eller logges.
//
// Regler: ingen template literals, ingen innerHTML med data, lokal tid,
// polling i stedet for realtime. Touch/mus: tryk på en linje viser den
// fulde dato (trykflader min. 48 px), så fanen virker uændret på en
// senere touchskærm.
// ==================================================================
(function(){
  'use strict';

  var POLL_MS = 60 * 1000;
  var SIDE_MS = 10 * 1000;        // automatisk sideskift ved lange lister
  var NYT_DAGE = 7;
  var REVIDER_DAGE = 14;
  var FRISK_TIMER = 24;           // nu-block på hændelser fra de sidste 24 timer
  var LOGIN_EMAIL = 'infoskaerm@mollebakken.dk';

  var PLAN_NAVN = {
    trivsel: 'Trivselsplanen',
    tryghed: 'Tryghedsplanen',
    laering: 'Læringsplanen',
    mestring: 'Mestringsplanen',
    haab_droem: 'Håb og drømme-planen'
  };

  var UGEDAGE = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  var MAANEDER = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august',
    'september', 'oktober', 'november', 'december'];

  var client = null;
  var state = {
    status: 'start',       // start | ok | login | fejl
    rows: null,
    visLogin: false,
    pollTimer: null,
    sideTimer: null,
    henter: false,
    lister: {}             // { nyt: {sider:[[fra,til],...], side:0}, revider: {...} }
  };

  // ---------------------------------------------------------------
  // Hjælpere
  // ---------------------------------------------------------------

  function el(tag, props, kids){
    var n = document.createElement(tag);
    if(props){
      Object.keys(props).forEach(function(k){
        var v = props[k];
        if(v === null || v === undefined || v === false) return;
        if(k === 'class') n.className = v;
        else if(k === 'text') n.textContent = v;
        else if(k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function(c){
      if(c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function tom(n){ while(n.firstChild) n.removeChild(n.firstChild); }

  function erFarve(s){ return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s); }

  function lokalMidnat(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function dageMellem(fra, til){
    return Math.round((lokalMidnat(til) - lokalMidnat(fra)) / 86400000);
  }

  // 'YYYY-MM-DD' -> Date ved lokal midnat
  function lokalDato(iso){
    var p = String(iso).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function kortDato(d){ return d.getDate() + '. ' + MAANEDER[d.getMonth()]; }

  function klokkeslaet(d){
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function fuldDato(d){
    return UGEDAGE[d.getDay()] + ' ' + d.getDate() + '. ' + MAANEDER[d.getMonth()] + ' ' + d.getFullYear() + ' kl. ' + klokkeslaet(d);
  }

  // Venlig relativ tid: "for 2 timer siden", "i går", "mandag"
  function relativ(d, nu){
    var min = Math.floor((nu - d) / 60000);
    var dage = dageMellem(d, nu);
    if(min < 1) return 'lige nu';
    if(min < 60) return 'for ' + min + ' min. siden';
    if(dage === 0){
      var t = Math.floor(min / 60);
      return 'for ' + t + (t === 1 ? ' time' : ' timer') + ' siden';
    }
    if(dage === 1) return 'i går';
    if(dage >= 2 && dage <= 6) return UGEDAGE[d.getDay()];
    return kortDato(d);
  }

  function dagTekst(n){ return n + (n === 1 ? ' dag' : ' dage'); }

  function beboerTag(navn, farve){
    var tag = el('span', { class: 'la2Tag', text: navn });
    if(erFarve(farve)) tag.style.background = farve;
    return tag;
  }

  // ---------------------------------------------------------------
  // Supabase (egen klient, egen session)
  // ---------------------------------------------------------------

  function hentKlient(){
    if(client) return client;
    if(!window.supabase || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') return null;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storageKey: 'la2-screen-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    return client;
  }

  function erAdgangsfejl(e){
    var t = ((e && e.message) || '') + ' ' + ((e && e.code) || '') + ' ' + ((e && e.status) || '');
    return /jwt|42501|401|403|not authenticated|ingen adgang|permission/i.test(t);
  }

  function hentFeed(){
    if(state.henter) return Promise.resolve();
    var c = hentKlient();
    if(!c){ state.status = 'fejl'; tegn(); return Promise.resolve(); }
    state.henter = true;

    return c.auth.getSession().then(function(res){
      var session = res && res.data ? res.data.session : null;
      if(!session){ state.status = 'login'; state.rows = null; return null; }
      return c.rpc('la2_screen_feed').then(function(r){
        if(r.error){
          if(erAdgangsfejl(r.error)){ state.status = 'login'; state.rows = null; return null; }
          throw r.error;
        }
        state.rows = r.data || [];
        state.status = 'ok';
        return null;
      });
    }).catch(function(e){
      // Net nede o.l.: behold sidst kendte data, prøv igen næste gang
      console.warn('LA2-fane: kunne ikke hente (' + ((e && e.message) || 'ukendt') + ')');
      if(state.status !== 'ok') state.status = 'fejl';
    }).then(function(){
      state.henter = false;
      tegn();
    });
  }

  // ---------------------------------------------------------------
  // Afledte lister
  // ---------------------------------------------------------------

  function aktivTid(r){
    return new Date(r.last_active_at || r.updated_at);
  }

  function byggNyt(rows, nu){
    var graense = new Date(nu.getTime() - NYT_DAGE * 86400000);
    var grupper = {};

    rows.forEach(function(r){
      var tid = aktivTid(r);
      if(tid < graense) return;
      // Samme episode (borger + fagprofessionel) samles til én linje;
      // andre planer pr. beboer og plantype
      var nøgle = r.plan_type === 'laering' && r.episode_group_id
        ? 'e:' + r.episode_group_id
        : 'p:' + r.resident_name + ':' + r.plan_type;
      var g = grupper[nøgle];
      if(!g || tid > g.tid){
        grupper[nøgle] = { r: r, tid: tid, ny: false };
        g = grupper[nøgle];
      }
      // "Ny" hvis planen er oprettet inden for perioden
      if(new Date(r.created_at) >= graense) g.ny = true;
    });

    var linjer = Object.keys(grupper).map(function(k){ return grupper[k]; });
    linjer.sort(function(a, b){ return b.tid - a.tid; });

    return linjer.map(function(g){
      var r = g.r;
      var min = Math.floor((nu - g.tid) / 60000);
      var frisk = (nu - g.tid) < FRISK_TIMER * 3600000;
      var før, efter;
      if(r.plan_type === 'laering' && g.ny){
        før = 'Ny læringsplan for';
        efter = '(' + relativ(g.tid, nu) + ')';
      }else if(min < 60){
        før = (PLAN_NAVN[r.plan_type] || 'Planen') + ' for';
        efter = 'er lige blevet opdateret';
      }else{
        før = (PLAN_NAVN[r.plan_type] || 'Planen') + ' for';
        var af = r.last_active_by ? ' af ' + r.last_active_by : '';
        efter = (g.ny ? 'er oprettet' : 'er opdateret') + af + ' (' + relativ(g.tid, nu) + ')';
      }
      return {
        før: før, efter: efter, navn: r.resident_name, farve: r.resident_color,
        nu: frisk,
        detalje: 'Gemt ' + fuldDato(g.tid) + (r.last_active_by ? ' af ' + r.last_active_by : '')
      };
    });
  }

  function byggRevider(rows, nu){
    var i_dag = lokalMidnat(nu);
    var grupper = {};

    rows.forEach(function(r){
      if(r.plan_type === 'laering' || !r.review_due) return;   // læringsplaner revideres ikke
      var dage = dageMellem(i_dag, lokalDato(r.review_due));    // negativ = overskredet
      if(dage > REVIDER_DAGE) return;
      var nøgle = r.resident_name + ':' + r.plan_type;
      var g = grupper[nøgle];
      if(!g || dage < g.dage) grupper[nøgle] = { r: r, dage: dage };
    });

    var linjer = Object.keys(grupper).map(function(k){ return grupper[k]; });
    linjer.sort(function(a, b){ return a.dage - b.dage; });   // mest overskredne først

    return linjer.map(function(g){
      var r = g.r;
      var frist = lokalDato(r.review_due);
      var efter;
      if(g.dage < 0) efter = 'skal revurderes · frist overskredet for ' + dagTekst(-g.dage) + ' siden';
      else if(g.dage === 0) efter = 'skal revurderes i dag';
      else efter = 'skal revurderes inden ' + kortDato(frist) + ' (om ' + dagTekst(g.dage) + ')';
      return {
        før: (PLAN_NAVN[r.plan_type] || 'Planen') + ' for',
        efter: efter, navn: r.resident_name, farve: r.resident_color,
        nu: g.dage < 0,
        detalje: 'Revisionsfrist: ' + UGEDAGE[frist.getDay()] + ' ' + frist.getDate() + '. ' + MAANEDER[frist.getMonth()] + ' ' + frist.getFullYear()
      };
    });
  }

  // ---------------------------------------------------------------
  // Tegning
  // ---------------------------------------------------------------

  function linjeNode(l){
    var detalje = el('div', { class: 'la2Detalje', text: l.detalje, hidden: true });
    var knap = el('button', {
      type: 'button',
      class: 'la2Linje' + (l.nu ? ' la2Nu' : ''),
      'aria-expanded': 'false'
    }, [
      el('span', { class: 'la2LinjeTekst' }, [
        l.før + ' ',
        beboerTag(l.navn, l.farve),
        ' ' + l.efter
      ])
    ]);
    knap.addEventListener('click', function(){
      var aaben = detalje.hidden;
      detalje.hidden = !aaben;
      knap.setAttribute('aria-expanded', aaben ? 'true' : 'false');
      // Trykket = nogen læser; giv listen en frisk visningstid
      nulstilSideTimer();
    });
    return el('div', { class: 'la2Punkt' }, [knap, detalje]);
  }

  function listeKolonne(id, titel, linjer, tomTekst){
    var liste = el('div', { class: 'la2Liste', id: 'la2Liste_' + id });
    var pager = el('button', { type: 'button', class: 'la2Pager', hidden: true });
    pager.addEventListener('click', function(){ naesteSide(id, true); });

    if(!linjer.length){
      liste.appendChild(el('div', { class: 'la2Rolig', text: tomTekst }));
    }else{
      linjer.forEach(function(l){ liste.appendChild(linjeNode(l)); });
    }

    return {
      node: el('section', { class: 'la2Kolonne' }, [
        el('h2', { class: 'la2Overskrift', text: titel }),
        liste,
        pager
      ]),
      liste: liste,
      pager: pager,
      antal: linjer.length
    };
  }

  function loginFormular(){
    var email = el('input', { type: 'email', value: LOGIN_EMAIL, 'aria-label': 'E-mail', autocomplete: 'off' });
    var pw = el('input', { type: 'password', 'aria-label': 'Adgangskode', autocomplete: 'off' });
    var fejl = el('div', { class: 'la2LoginFejl', hidden: true, role: 'alert' });
    var knap = el('button', { type: 'submit', class: 'la2Knap', text: 'Log ind' });
    var form = el('form', { class: 'la2Login' }, [
      el('div', { class: 'la2LoginTitel', text: 'Log ind (opsætning af skærmen)' }),
      el('label', null, [el('span', { text: 'E-mail' }), email]),
      el('label', null, [el('span', { text: 'Adgangskode' }), pw]),
      fejl, knap
    ]);
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      fejl.hidden = true;
      knap.disabled = true;
      var c = hentKlient();
      if(!c){ fejl.textContent = 'Kan ikke logge ind lige nu.'; fejl.hidden = false; knap.disabled = false; return; }
      c.auth.signInWithPassword({ email: email.value.trim(), password: pw.value }).then(function(res){
        pw.value = '';
        if(res.error || !res.data || !res.data.session) throw new Error('Forkert');
        state.visLogin = false;
        state.status = 'start';
        return hentFeed();
      }).catch(function(){
        fejl.textContent = 'Login mislykkedes.';
        fejl.hidden = false;
        knap.disabled = false;
      });
    });
    return form;
  }

  function tegn(){
    var rod = document.getElementById('la2Indhold');
    if(!rod) return;
    try{
      tom(rod);
      stopSideTimer();

      if(state.visLogin){
        rod.appendChild(loginFormular());
        return;
      }

      if(state.status === 'login' || state.status === 'fejl' || (state.status === 'start' && !state.rows)){
        var tekst = state.status === 'start' ? 'Henter LA2…'
          : (state.status === 'fejl' ? 'LA2 kan ikke hentes lige nu – prøver igen om lidt'
          : 'LA2 kræver login – kontakt Nikolaj');
        var boks = el('div', { class: 'la2Besked' }, [el('div', { class: 'la2BeskedTekst', text: tekst })]);
        if(state.status === 'login'){
          boks.appendChild(el('button', { type: 'button', class: 'la2Knap la2KnapSvag', text: 'Log ind (opsætning)', onclick: function(){
            state.visLogin = true;
            tegn();
          } }));
        }
        rod.appendChild(boks);
        return;
      }

      var nu = new Date();
      var rows = state.rows || [];
      var nyt = listeKolonne('nyt', 'Nyt i LA2', byggNyt(rows, nu), 'Intet nyt i LA2 de sidste 7 dage');
      var revider = listeKolonne('revider', 'Husk at revurdere', byggRevider(rows, nu), 'Alle LA2-planer er opdaterede ✓');

      rod.appendChild(el('div', { class: 'la2Kolonner' }, [nyt.node, revider.node]));

      // Måling kræver at fanen er synlig (display:none giver højde 0)
      sideInddel('nyt', nyt);
      sideInddel('revider', revider);
      startSideTimer();
    }catch(e){
      console.warn('LA2-fane: tegning fejlede (' + ((e && e.message) || 'ukendt') + ')');
    }
  }

  // ---------------------------------------------------------------
  // Sideinddeling (lange lister skifter side automatisk)
  // ---------------------------------------------------------------

  var kolonner = {};

  function sideInddel(id, kol){
    kolonner[id] = kol;
    var liste = kol.liste;
    var punkter = [].slice.call(liste.querySelectorAll('.la2Punkt'));
    var gammel = state.lister[id] ? state.lister[id].side : 0;
    state.lister[id] = { sider: [], side: gammel };
    if(!punkter.length) return;

    var plads = liste.clientHeight;
    if(!plads){ state.lister[id].sider = [[0, punkter.length]]; visSide(id); return; }

    // Alt vises midlertidigt, så højderne kan måles
    var sider = [];
    var start = 0, sum = 0;
    punkter.forEach(function(p, i){
      var h = p.offsetHeight;
      if(sum + h > plads && i > start){
        sider.push([start, i]);
        start = i;
        sum = 0;
      }
      sum += h;
    });
    sider.push([start, punkter.length]);
    state.lister[id].sider = sider;
    if(state.lister[id].side >= sider.length) state.lister[id].side = 0;
    visSide(id);
  }

  function visSide(id){
    var kol = kolonner[id];
    var info = state.lister[id];
    if(!kol || !info) return;
    var punkter = [].slice.call(kol.liste.querySelectorAll('.la2Punkt'));
    var sider = info.sider;
    var s = sider[info.side] || [0, punkter.length];
    punkter.forEach(function(p, i){ p.hidden = !(i >= s[0] && i < s[1]); });
    if(sider.length > 1){
      kol.pager.hidden = false;
      kol.pager.textContent = 'Side ' + (info.side + 1) + ' af ' + sider.length + ' · tryk for næste';
    }else{
      kol.pager.hidden = true;
    }
  }

  function naesteSide(id, manuelt){
    var info = state.lister[id];
    if(!info || info.sider.length < 2) return;
    info.side = (info.side + 1) % info.sider.length;
    visSide(id);
    if(manuelt) nulstilSideTimer();
  }

  function startSideTimer(){
    stopSideTimer();
    state.sideTimer = setInterval(function(){
      // Står en detalje åben, bladres der ikke videre under læseren
      if(document.querySelector('#la2Indhold .la2Detalje:not([hidden])')) return;
      naesteSide('nyt', false);
      naesteSide('revider', false);
    }, SIDE_MS);
  }

  function stopSideTimer(){
    if(state.sideTimer){ clearInterval(state.sideTimer); state.sideTimer = null; }
  }

  function nulstilSideTimer(){
    if(state.sideTimer) startSideTimer();
  }

  // ---------------------------------------------------------------
  // Indgang
  // ---------------------------------------------------------------

  function vis(){
    try{
      // Direkte link til opsætning: personaletavle-v2/#la2-login
      if(location.hash === '#la2-login') state.visLogin = true;
      tegn();            // genmåler nu fanen er synlig
      hentFeed();
    }catch(e){
      console.warn('LA2-fane: vis fejlede');
    }
  }

  function start(){
    if(state.pollTimer) return;
    state.pollTimer = setInterval(function(){
      try{ hentFeed(); }catch(e){ /* fanen må aldrig vælte tavlen */ }
    }, POLL_MS);
    try{ hentFeed(); }catch(e){ /* ignorer */ }
  }

  window.LA2Fane = { vis: vis };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
