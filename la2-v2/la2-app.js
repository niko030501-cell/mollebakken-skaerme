// ==================================================================
// LA2 — login, "Hvem er du?", overblik og beboerside (Fase 2).
//
// Faste regler: ingen template literals (kun +), ingen innerHTML med
// brugerdata (DOM-metoder + textContent), browserens lokale tid, polling
// hvert 60. sekund, intet planindhold i storage eller console.
// ==================================================================
(function(){
  'use strict';

  var D = window.LA2Data;

  var LOGIN_EMAIL = 'la2@mollebakken.dk';
  var IDLE_MS = 30 * 60 * 1000;          // auto-logud efter 30 min uden aktivitet
  var POLL_MS = 60 * 1000;
  var ACT_KEY = 'la2-last-activity';     // tidsstempel (ikke indhold) — deles mellem faner
  var NAME_KEY = 'la2-name';             // sessionStorage: kun den aktuelle session

  var rod = document.getElementById('rod');
  var topbar = document.getElementById('topbar');
  var brugerNavn = document.getElementById('brugerNavn');
  var brugerAvatar = document.getElementById('brugerAvatar');
  var topbarPille = document.getElementById('skiftNavnKnap');

  var state = {
    name: '',
    residents: null,
    plans: null,
    pollTimer: null,
    idleTimer: null,
    lastActWrite: 0
  };

  // ---------------------------------------------------------------
  // Små hjælpere
  // ---------------------------------------------------------------

  // el('div', {class:'x', text:'...', onclick:fn}, [børn])
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

  function tomRod(){
    while(rod.firstChild) rod.removeChild(rod.firstChild);
  }

  function visIRod(node){
    tomRod();
    rod.appendChild(node);
    window.scrollTo(0, 0);
  }

  function erFarve(s){
    return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s);
  }

  // Dato som YYYY-MM-DD i BROWSERENS lokale tid
  function lokalDatoISO(d){
    var m = String(d.getMonth() + 1);
    var dag = String(d.getDate());
    if(m.length < 2) m = '0' + m;
    if(dag.length < 2) dag = '0' + dag;
    return d.getFullYear() + '-' + m + '-' + dag;
  }

  // 'YYYY-MM-DD' -> Date ved lokal midnat
  function lokalDato(iso){
    var p = String(iso).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function lokalMidnat(d){
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function dageMellem(fra, til){
    return Math.round((lokalMidnat(til) - lokalMidnat(fra)) / 86400000);
  }

  var MAANEDER_LANG = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august',
    'september', 'oktober', 'november', 'december'];

  var MAANEDER = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];

  function kortDato(d){
    return d.getDate() + '. ' + MAANEDER[d.getMonth()];
  }

  function relativDato(d){
    var diff = dageMellem(d, new Date());
    if(diff === 0) return 'i dag';
    if(diff === 1) return 'i går';
    if(diff > 1 && diff < 7) return diff + ' dage siden';
    return kortDato(d);
  }

  function fejlTekst(e){
    if(e && e.message) return e.message;
    return 'Ukendt fejl';
  }

  function erSessionFejl(e){
    var t = ((e && e.message) || '') + ' ' + ((e && e.code) || '');
    return /jwt|PGRST30|not authenticated|invalid token/i.test(t);
  }

  window.LA2Util = {
    el: el,
    lokalDatoISO: lokalDatoISO,
    lokalDato: lokalDato,
    lokalMidnat: lokalMidnat,
    dageMellem: dageMellem,
    kortDato: kortDato,
    erFarve: erFarve,
    erSessionFejl: erSessionFejl,
    fejlTekst: fejlTekst
  };

  function harUgemt(){
    return !!(window.LA2Plans && window.LA2Plans.isDirty());
  }

  // ---------------------------------------------------------------
  // Aktivitet og automatisk log ud
  // ---------------------------------------------------------------

  function noteAktivitet(tving){
    var nu = Date.now();
    if(!tving && nu - state.lastActWrite < 10000) return;   // højst hvert 10. sek.
    state.lastActWrite = nu;
    try{ localStorage.setItem(ACT_KEY, String(nu)); }catch(e){ /* privat tilstand */ }
  }

  function sidsteAktivitet(){
    try{
      var v = Number(localStorage.getItem(ACT_KEY));
      if(v > 0) return v;
    }catch(e){ /* ignorer */ }
    return state.lastActWrite || Date.now();
  }

  function idleUdloebet(){
    return Date.now() - sidsteAktivitet() > IDLE_MS;
  }

  function startIdleVagt(){
    if(state.idleTimer) return;
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function(t){
      window.addEventListener(t, function(){ noteAktivitet(false); }, { passive: true, capture: true });
    });
    state.idleTimer = setInterval(tjekIdle, 30000);
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) tjekIdle();
    });
  }

  function tjekIdle(){
    if(!state.name && topbar.hidden) return;   // ikke logget ind
    if(idleUdloebet()) logUd('Du blev logget ud efter 30 minutter uden aktivitet.');
  }

  // ---------------------------------------------------------------
  // Log ind / log ud
  // ---------------------------------------------------------------

  function rolleFra(session){
    var u = session && session.user;
    return u && u.app_metadata ? u.app_metadata.la2_role : null;
  }

  function logUd(besked){
    stopPoll();
    if(window.LA2Print) window.LA2Print.close();
    if(window.LA2Plans) window.LA2Plans.clearDirty();
    state.name = '';
    state.residents = null;
    state.plans = null;
    try{ sessionStorage.removeItem(NAME_KEY); }catch(e){ /* ignorer */ }
    try{ localStorage.removeItem(ACT_KEY); }catch(e){ /* ignorer */ }
    topbar.hidden = true;
    return D.signOut().then(function(){
      visLogin(besked || '');
    }, function(){
      visLogin(besked || '');
    });
  }

  // En session-fejl (fx "JWT udløbet" efter at telefonen har sovet) betyder
  // ikke nødvendigvis, at man skal logges ud: prøv først at forny sessionen.
  // Kun hvis fornyelsen afvises, logges der ud. Er det blot nettet, der
  // er nede, sker der ingenting (næste polling prøver igen).
  var sidsteFornyelse = 0;

  function sessionFejl(){
    var nu = Date.now();
    var besked = 'Din session er udløbet — log ind igen.';
    if(nu - sidsteFornyelse < 20000) return logUd(besked);   // undgå løkke
    sidsteFornyelse = nu;
    return D.refresh().then(function(res){
      if(res && res.data && res.data.session){
        noteAktivitet(true);
        route();
        return null;
      }
      if(res && res.error && res.error.name === 'AuthRetryableFetchError') return null;   // netværk
      return logUd(besked);
    }, function(){
      return null;   // netværksfejl: behold sessionen
    });
  }

  function visLogin(besked, erFejl){
    topbar.hidden = true;

    var emailInput = el('input', {
      type: 'email', id: 'loginEmail', autocomplete: 'username',
      inputmode: 'email', required: true, value: LOGIN_EMAIL
    });
    var pwInput = el('input', {
      type: 'password', id: 'loginPw', autocomplete: 'current-password', required: true
    });
    var knap = el('button', { type: 'submit', class: 'knap', text: 'Log ind' });
    var fejlBoks = el('div', { class: 'besked fejl', role: 'alert', hidden: true });
    var infoBoks = besked ? el('div', { class: 'besked' + (erFejl ? ' fejl' : ''), text: besked }) : null;

    var form = el('form', { class: 'centreret', autocomplete: 'on' }, [
      el('div', { class: 'eyebrow', text: 'Møllebakken' }),
      el('h1', { class: 'side-titel', text: 'LA2-planer' }),
      el('p', { class: 'side-under', text: 'Log ind for at se og redigere planerne.' }),
      infoBoks,
      fejlBoks,
      el('label', { class: 'felt' }, [el('span', { text: 'E-mail' }), emailInput]),
      el('label', { class: 'felt' }, [el('span', { text: 'Adgangskode' }), pwInput]),
      knap
    ]);

    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      fejlBoks.hidden = true;
      knap.disabled = true;
      knap.textContent = 'Logger ind…';

      D.signIn(emailInput.value.trim(), pwInput.value).then(function(res){
        pwInput.value = '';
        if(res.error || !res.data || !res.data.session){
          throw new Error('Forkert e-mail eller adgangskode.');
        }
        if(rolleFra(res.data.session) !== 'editor'){
          return D.signOut().then(function(){
            throw new Error('Denne bruger har ikke adgang til LA2-planer.');
          });
        }
        noteAktivitet(true);
        startIdleVagt();
        efterLogin();
      }).catch(function(e){
        fejlBoks.textContent = fejlTekst(e);
        fejlBoks.hidden = false;
        knap.disabled = false;
        knap.textContent = 'Log ind';
      });
    });

    visIRod(form);
    if(emailInput.value) pwInput.focus(); else emailInput.focus();
  }

  function efterLogin(){
    var navn = '';
    try{ navn = sessionStorage.getItem(NAME_KEY) || ''; }catch(e){ /* ignorer */ }
    if(navn){
      state.name = navn;
      visApp();
    }else{
      visHvemErDu(false);
    }
  }

  // ---------------------------------------------------------------
  // Hvem er du?
  // ---------------------------------------------------------------

  function vaelgNavn(navn){
    state.name = navn;
    try{ sessionStorage.setItem(NAME_KEY, navn); }catch(e){ /* ignorer */ }
    visApp();
  }

  function visHvemErDu(kanFortryde){
    topbar.hidden = true;
    var indhold = el('div', { class: 'indlaeser', text: 'Henter navne…' });
    var boks = el('div', { class: 'centreret bred' }, [
      el('div', { class: 'eyebrow', text: 'Møllebakken' }),
      el('h1', { class: 'side-titel', text: 'Hvem er du?' }),
      el('p', { class: 'side-under', text: 'Dit navn bruges i historikken, så man kan se, hvem der har ændret hvad.' }),
      indhold
    ]);
    visIRod(boks);

    D.staff().then(function(rows){
      var gitter = el('div', { class: 'navne-gitter' });
      rows.forEach(function(r){
        gitter.appendChild(el('button', {
          type: 'button', class: 'knap', text: r.navn,
          onclick: function(){ vaelgNavn(r.navn); }
        }));
      });
      if(!rows.length){
        gitter = el('p', { class: 'tom-tilstand', text: 'Ingen navne endnu — tilføj dit nedenfor.' });
      }

      var nytNavn = el('input', {
        type: 'text', placeholder: 'Dit navn', autocomplete: 'off', maxlength: '60',
        'aria-label': 'Nyt navn'
      });
      var tilfoejFejl = el('div', { class: 'besked fejl', role: 'alert', hidden: true });
      var tilfoejKnap = el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Tilføj' });
      tilfoejKnap.addEventListener('click', function(){
        var navn = nytNavn.value.replace(/\s+/g, ' ').trim();
        tilfoejFejl.hidden = true;
        if(!navn){ return; }
        tilfoejKnap.disabled = true;
        D.addStaff(navn).then(function(){
          vaelgNavn(navn);
        }).catch(function(e){
          tilfoejKnap.disabled = false;
          var dublet = e && (e.code === '23505');
          tilfoejFejl.textContent = dublet ? 'Det navn findes allerede i listen.' : 'Kunne ikke tilføje navnet.';
          tilfoejFejl.hidden = false;
          if(!dublet) console.error('addStaff:', fejlTekst(e));
        });
      });

      var tilfoej = el('div', { class: 'tilfoej' }, [
        el('div', { class: 'eyebrow', text: 'Mangler dit navn?' }),
        tilfoejFejl,
        el('div', { class: 'tilfoej-raekke' }, [nytNavn, tilfoejKnap])
      ]);

      var ekstra = [];
      if(kanFortryde){
        ekstra.push(el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Annullér', onclick: function(){
          if(state.name) visApp(); else logUd('');
        } }));
      }

      boks.replaceChild(gitter, indhold);
      boks.appendChild(tilfoej);
      ekstra.forEach(function(k){ boks.appendChild(k); });
    }).catch(function(e){
      if(erSessionFejl(e)) return sessionFejl();
      console.error('staff:', fejlTekst(e));
      var fejl = el('div', { class: 'besked fejl', text: 'Kunne ikke hente navnene. Prøv igen om lidt.' });
      boks.replaceChild(fejl, indhold);
    });
  }

  // ---------------------------------------------------------------
  // App-ramme + routing
  // ---------------------------------------------------------------

  function visApp(){
    topbar.hidden = false;
    brugerNavn.textContent = state.name;
    brugerAvatar.textContent = state.name ? state.name.charAt(0) : '';
    topbarPille.setAttribute('aria-label', 'Du er logget ind som ' + state.name + '. Tryk for at skifte navn.');
    topbarPille.setAttribute('title', 'Du er logget ind som ' + state.name + ' — tryk for at skifte navn');
    route();
  }

  // Marker det aktive menupunkt i topbjælken
  function saetAktivMenu(navn){
    document.querySelectorAll('[data-nav]').forEach(function(a){
      var aktiv = a.getAttribute('data-nav') === navn;
      a.classList.toggle('aktiv', aktiv);
      if(aktiv) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  // Sider i menuen, der endnu ikke er bygget
  function visKommerSnart(titel, menu){
    saetAktivMenu(menu);
    visIRod(el('div', null, [
      el('h1', { class: 'side-titel', text: titel }),
      el('p', { class: 'tom-tilstand', text: 'Kommer snart.' })
    ]));
  }

  var TABS = ['trivsel', 'tryghed', 'laering', 'mestring', 'haab_droem'];
  var aktuelHash = location.hash || '#/';
  var gendanner = false;

  function route(){
    if(!state.name) return;
    if(window.LA2Print) window.LA2Print.close();
    var h = location.hash || '#/';
    var m = h.match(/^#\/beboer\/([0-9a-fA-F-]{36})(?:\/([a-z_]+))?(?:\/([0-9a-fA-F-]{36}|ny))?$/);
    stopPoll();
    document.body.classList.remove('side-overblik');
    // "+" i bundmenuen: direkte til beboeren, hvis man står på en beboerside
    var bmPlus = document.getElementById('bmPlus');
    if(bmPlus) bmPlus.setAttribute('href', m ? '#/beboer/' + m[1] + '/laering/ny' : '#/ny');
    if(m){
      var tab = TABS.indexOf(m[2]) !== -1 ? m[2] : 'trivsel';
      saetAktivMenu('overblik');
      visBeboer(m[1], tab, m[3] || null);
    }else if(h === '#/episoder'){
      saetAktivMenu('episoder');
      startSide(window.LA2Overblik.episoder(sideCtx()));
    }else if(h === '#/revision'){
      saetAktivMenu('revision');
      startSide(window.LA2Overblik.revision(sideCtx()));
    }else if(h === '#/om'){
      visKommerSnart('Om LA2', 'om');
    }else if(h === '#/ny'){
      saetAktivMenu('');
      visVaelgBeboer();
    }else{
      saetAktivMenu('overblik');
      document.body.classList.add('side-overblik');
      startSide(window.LA2Overblik.overblik(sideCtx()));
    }
  }

  function gaaTil(hash){
    if(location.hash === hash) route();
    else location.hash = hash;
  }

  window.addEventListener('hashchange', function(){
    if(gendanner){ gendanner = false; return; }
    if(harUgemt() && location.hash !== aktuelHash){
      if(!window.confirm('Du har ændringer, der ikke er gemt. Vil du forlade siden?')){
        gendanner = true;
        location.hash = aktuelHash;
        return;
      }
      window.LA2Plans.clearDirty();
    }
    aktuelHash = location.hash || '#/';
    route();
  });

  window.addEventListener('beforeunload', function(ev){
    if(harUgemt()){
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  document.getElementById('skiftNavnKnap').addEventListener('click', function(){
    if(harUgemt() && !window.confirm('Du har ændringer, der ikke er gemt. Vil du forlade siden?')) return;
    if(window.LA2Plans) window.LA2Plans.clearDirty();
    visHvemErDu(true);
  });
  document.getElementById('logUdKnap').addEventListener('click', function(){
    var spoerg = harUgemt()
      ? 'Du har ændringer, der ikke er gemt. Vil du logge ud alligevel?'
      : 'Vil du logge ud?';
    if(!window.confirm(spoerg)) return;
    if(window.LA2Plans) window.LA2Plans.clearDirty();
    logUd('Du er logget ud.');
  });

  function stopPoll(){
    if(state.pollTimer){ clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  // ---------------------------------------------------------------
  // Overblik, Episoder og Revision ligger i la2-overblik.js.
  // Her styres kun kontekst og polling (hvert 60. sekund).
  // ---------------------------------------------------------------

  // "+" i bundmenuen uden for en beboerside: vælg hvem episoden er for
  function visVaelgBeboer(){
    var liste = el('div', { class: 'liste' }, [el('div', { class: 'indlaeser', text: 'Henter beboere…' })]);
    visIRod(el('div', null, [
      el('h1', { class: 'side-titel', text: 'Ny episode' }),
      el('p', { class: 'side-under', text: 'Hvem er episoden for?' }),
      liste
    ]));
    D.residents().then(function(rows){
      while(liste.firstChild) liste.removeChild(liste.firstChild);
      rows.forEach(function(r){
        var navn = r.beboere ? r.beboere.navn : 'Ukendt';
        var farve = r.beboere && erFarve(r.beboere.farve) ? r.beboere.farve : '#374151';
        var av = el('span', { class: 'avatar avatar-34', text: navn.charAt(0) });
        av.setAttribute('aria-hidden', 'true');
        av.style.background = farve;
        liste.appendChild(el('a', { class: 'liste-post', href: '#/beboer/' + r.resident_id + '/laering/ny' }, [
          av,
          el('div', { class: 'liste-tekst' }, [el('div', { class: 'liste-titel', text: navn })])
        ]));
      });
    }).catch(function(e){
      if(erSessionFejl(e)) return sessionFejl();
      console.error('vaelg beboer:', fejlTekst(e));
      while(liste.firstChild) liste.removeChild(liste.firstChild);
      liste.appendChild(el('div', { class: 'besked fejl', text: 'Kunne ikke hente beboerne.' }));
    });
  }

  function sideCtx(){
    return {
      name: state.name,
      visIRod: visIRod,
      onSessionError: function(){ sessionFejl(); },
      skiftNavn: function(){ topbarPille.click(); },
      logUd: function(){ document.getElementById('logUdKnap').click(); }
    };
  }

  function startSide(side){
    stopPoll();
    state.pollTimer = setInterval(function(){
      if(!document.hidden) side.opdater();
    }, POLL_MS);
  }

  // ---------------------------------------------------------------
  // Beboerside: header, faseforløb, plan og sidepanel
  // ---------------------------------------------------------------

  var EKSTRA_TABS = [
    { id: 'mestring', label: 'Mestringsplan' },
    { id: 'haab_droem', label: 'Håb og drømme' }
  ];

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgNode(tag, attrs){
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    return n;
  }

  // Lille affektkurve til sidepanelet: Lærings-blå, højeste punkt markeret i rødt
  function miniKurve(vaerdier){
    var W = 140, H = 44, pl = 8, pr = 8, pt = 8, pb = 8;
    var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'mini-kurve', role: 'img',
      'aria-label': 'Affektkurve for episoden' });
    var n = vaerdier.length;
    function x(i){ return n > 1 ? pl + i * (W - pl - pr) / (n - 1) : W / 2; }
    function y(v){ return pt + (5 - Math.max(1, Math.min(5, v))) * (H - pt - pb) / 4; }

    svg.appendChild(svgNode('line', { x1: pl, x2: W - pr, y1: H - pb + 2, y2: H - pb + 2, stroke: '#cdd5d0', 'stroke-width': 1 }));

    var seg = [];
    function flush(){
      if(seg.length > 1){
        svg.appendChild(svgNode('polyline', {
          points: seg.map(function(i){ return x(i).toFixed(1) + ',' + y(vaerdier[i]).toFixed(1); }).join(' '),
          fill: 'none', stroke: '#34507a', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }));
      }
      seg = [];
    }
    var maxI = -1;
    vaerdier.forEach(function(v, i){
      if(typeof v === 'number'){
        seg.push(i);
        if(maxI === -1 || v > vaerdier[maxI]) maxI = i;
      }else{
        flush();
      }
    });
    flush();
    if(maxI !== -1){
      svg.appendChild(svgNode('circle', { cx: x(maxI).toFixed(1), cy: y(vaerdier[maxI]).toFixed(1), r: 4, fill: 'none', stroke: '#b3413c', 'stroke-width': 2 }));
    }
    return svg;
  }

  function visBeboer(residentId, tab, groupId){
    var side = el('div', null, [
      el('a', { class: 'tilbage', href: '#/', text: '← Alle beboere' }),
      el('div', { id: 'beboerIndhold', class: 'indlaeser', text: 'Henter…' })
    ]);
    visIRod(side);

    var i90 = new Date();
    i90.setDate(i90.getDate() - 90);

    Promise.all([
      D.residents(),
      D.screenFeed().catch(function(){ return []; }),
      D.plansForResident(residentId, 'laering', false).catch(function(){ return []; }),
      D.laeringKurver(lokalDatoISO(i90)).catch(function(){ return []; })
    ]).then(function(rs){
      var r = rs[0].filter(function(x){ return x.resident_id === residentId; })[0];
      var mål = document.getElementById('beboerIndhold');
      if(!mål) return;
      if(!r){
        mål.className = 'besked fejl';
        mål.textContent = 'Beboeren blev ikke fundet.';
        return;
      }
      tegnBeboer(mål, r, tab, groupId, { feed: rs[1], laering: rs[2], kurver: rs[3] });
    }).catch(function(e){
      if(erSessionFejl(e)) return sessionFejl();
      console.error('beboer:', fejlTekst(e));
      var mål = document.getElementById('beboerIndhold');
      if(mål){ mål.className = 'besked fejl'; mål.textContent = 'Kunne ikke hente beboeren.'; }
    });
  }

  function tegnBeboer(mål, r, tab, groupId, bs){
    var I = window.LA2Ikoner;
    var navn = r.beboere ? r.beboere.navn : 'Ukendt';
    var farve = r.beboere && erFarve(r.beboere.farve) ? r.beboere.farve : '#374151';
    var rid = r.resident_id;
    var nu = new Date();
    var iDag = lokalMidnat(nu);

    bs.handl = null;
    bs.versionerFor = '';
    bs.versioner = [];

    function planRows(type){
      return bs.feed.filter(function(f){ return f.resident_name === navn && f.plan_type === type; });
    }

    function senesteAf(rows){
      return rows.reduce(function(a, x){
        var t = new Date(x.last_active_at || x.updated_at);
        return t > a ? t : a;
      }, new Date(0));
    }

    // ---- Header ----
    var avatar = el('span', { class: 'avatar avatar-72', text: navn.charAt(0) });
    avatar.setAttribute('aria-hidden', 'true');
    avatar.style.background = farve;

    var metaLinje = el('div', { class: 'beboer-meta' });

    function tegnMeta(){
      while(metaLinje.firstChild) metaLinje.removeChild(metaLinje.firstChild);
      metaLinje.appendChild(el('span', { class: 'variant-maerke', text: r.variant }));
      if((r.contact_persons || '').trim()){
        metaLinje.appendChild(el('span', { text: 'Kontaktperson: ' + r.contact_persons.trim() }));
      }
      var frister = bs.feed
        .filter(function(f){ return f.resident_name === navn && f.plan_type !== 'laering' && f.review_due; })
        .map(function(f){ return f.review_due; }).sort();
      if(frister.length){
        var d = lokalDato(frister[0]);
        metaLinje.appendChild(el('span', { text: 'Næste revision: ' + d.getDate() + '. ' + MAANEDER_LANG[d.getMonth()] }));
      }
    }

    var printKnap = el('button', { type: 'button', class: 'knap knap-lys', text: 'Print', disabled: true });
    var historikKnap = el('button', { type: 'button', class: 'knap knap-lys', text: 'Historik', disabled: true });
    var nyKnap = el('a', { class: 'knap knap-guld', href: '#/beboer/' + rid + '/laering/ny', text: '+ Ny episode' });
    printKnap.addEventListener('click', function(){
      if(bs.handl && bs.handl.print) bs.handl.print();
    });
    historikKnap.addEventListener('click', function(){
      if(bs.handl && bs.handl.historik) bs.handl.historik();
    });

    function opdaterKnapper(){
      printKnap.disabled = !(bs.handl && bs.handl.print);
      historikKnap.disabled = !(bs.handl && bs.handl.historik);
    }

    var hoved = el('header', { class: 'beboer-hoved' }, [
      avatar,
      el('div', { class: 'beboer-hoved-tekst' }, [
        el('h1', { class: 'beboer-navn', text: navn }),
        metaLinje
      ]),
      el('div', { class: 'beboer-handlinger' }, [printKnap, historikKnap, nyKnap])
    ]);

    // ---- Faseforløb ----
    var forloeb = el('nav', { class: 'forloeb', 'aria-label': 'Planer' });

    function tegnForloeb(){
      while(forloeb.firstChild) forloeb.removeChild(forloeb.firstChild);
      var raekke = el('div', { class: 'forloeb-raekke' });

      ['trivsel', 'tryghed', 'laering'].forEach(function(t, i){
        var f = I.FASER[t];
        var aktiv = tab === t;
        var opd;
        if(t === 'laering'){
          var graense = new Date(iDag.getFullYear(), iDag.getMonth(), iDag.getDate() - 30);
          var grupper = {};
          planRows('laering').forEach(function(x){
            if(x.episode_date && lokalDato(x.episode_date) >= graense) grupper[x.episode_group_id || x.plan_id] = true;
          });
          var antal = Object.keys(grupper).length;
          opd = antal > 0 ? antal + (antal === 1 ? ' episode' : ' episoder') + ' de sidste 30 dage'
            : (planRows('laering').length ? 'Ingen de sidste 30 dage' : 'Ingen episoder endnu');
        }else{
          var rows = planRows(t);
          opd = rows.length ? 'Opdateret ' + kortDato(senesteAf(rows)) : 'Ingen plan endnu';
        }

        if(i > 0) raekke.appendChild(el('span', { class: 'forloeb-pil', 'aria-hidden': 'true', text: '→' }));
        var ikon = el('span', { class: 'fase-ikon fase-' + t });
        ikon.appendChild(I.ikon(f.ikon, { stoerrelse: 24 }));
        raekke.appendChild(el('a', {
          class: 'forloeb-kort fase-' + t + (aktiv ? ' aktiv' : ''),
          href: '#/beboer/' + rid + '/' + t,
          'aria-current': aktiv ? 'page' : null
        }, [
          ikon,
          el('div', { class: 'forloeb-tekst' }, [
            el('div', { class: 'forloeb-label', text: f.nr + ' · ' + f.fase }),
            el('div', { class: 'forloeb-plan', text: t === 'laering' ? 'Læringsplaner' : f.plan }),
            el('div', { class: 'forloeb-opd', text: opd })
          ])
        ]));
      });

      forloeb.appendChild(raekke);
      forloeb.appendChild(el('span', { class: 'forloeb-streg', 'aria-hidden': 'true' }));
      var ekstra = el('div', { class: 'forloeb-ekstra' });
      EKSTRA_TABS.forEach(function(e){
        var aktiv = tab === e.id;
        ekstra.appendChild(el('a', {
          class: 'forloeb-lille' + (aktiv ? ' aktiv' : ''),
          href: '#/beboer/' + rid + '/' + e.id,
          text: e.label,
          'aria-current': aktiv ? 'page' : null
        }));
      });
      forloeb.appendChild(ekstra);
    }

    // ---- Sidepanel ----
    var sidepanel = el('aside', { class: 'sidepanel', 'aria-label': 'Overblik for beboeren' });

    function episodeListe(){
      var g = {};
      bs.laering.filter(function(p){ return p.status !== 'arkiv'; }).forEach(function(p){
        var k = p.episode_group_id || p.id;
        if(!g[k]) g[k] = { group: k, titel: p.title, dato: p.episode_date, oprettet: new Date(p.created_at), pers: [] };
        var o = new Date(p.created_at);
        if(o < g[k].oprettet) g[k].oprettet = o;
        g[k].pers.push(p.perspective === 'fagprofessionel' ? 'Fagprofessionel' : (p.perspective === 'din' ? 'Din' : 'Min'));
      });
      return Object.keys(g).map(function(k){ return g[k]; })
        .sort(function(a, b){ return (b.dato || '').localeCompare(a.dato || ''); });
    }

    function kortHoved(titel){
      return el('h2', { class: 'side-kort-titel', text: titel });
    }

    function laeringKort(){
      var liste = episodeListe();
      var kort = el('section', { class: 'side-kort' }, [kortHoved('Seneste læringsplaner')]);

      if(!liste.length){
        kort.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen episoder endnu.' }));
      }else{
        var nyeste = liste[0];
        var dato = nyeste.dato ? lokalDato(nyeste.dato) : null;
        var erNy = (nu - nyeste.oprettet) < 7 * 86400000;
        var kurveRow = bs.kurver.filter(function(k){
          return k.episode_group_id === nyeste.group && Array.isArray(k.curve) &&
            k.curve.some(function(v){ return typeof v === 'number'; });
        })[0];

        var stor = el('a', { class: 'episode-stor', href: '#/beboer/' + rid + '/laering/' + nyeste.group }, [
          el('div', { class: 'episode-stor-top' }, [
            el('span', { class: 'episode-stor-titel', text: nyeste.titel || 'Uden titel' }),
            erNy ? el('span', { class: 'badge badge-ny', text: 'Ny' }) : null
          ]),
          el('div', { class: 'episode-stor-under', text: (dato ? dato.getDate() + '. ' + MAANEDER_LANG[dato.getMonth()] + ' ' + dato.getFullYear() : '') + ' · ' + nyeste.pers.join(', ') })
        ]);
        if(kurveRow){
          stor.appendChild(miniKurve(kurveRow.curve.map(function(v){ return typeof v === 'number' ? v : null; })));
        }
        kort.appendChild(stor);

        liste.slice(1, 4).forEach(function(e){
          var d = e.dato ? lokalDato(e.dato) : null;
          kort.appendChild(el('a', { class: 'episode-lille', href: '#/beboer/' + rid + '/laering/' + e.group }, [
            el('span', { class: 'episode-lille-dato', text: d ? kortDato(d) : '' }),
            el('span', { class: 'episode-lille-titel', text: e.titel || 'Uden titel' }),
            el('span', { class: 'episode-lille-pers', text: e.pers.join(', ') })
          ]));
        });
      }
      kort.appendChild(el('a', { class: 'knap-stiplet', href: '#/beboer/' + rid + '/laering/ny', text: '+ Ny episode' }));
      return kort;
    }

    function revisionKort(){
      var kort = el('section', { class: 'side-kort' }, [kortHoved('Revision')]);
      var typer = ['trivsel', 'tryghed', 'mestring', 'haab_droem'].indexOf(tab) !== -1 ? [tab] : ['trivsel', 'tryghed'];
      var rows = [];
      typer.forEach(function(t){ rows = rows.concat(planRows(t)); });
      rows = rows.filter(function(x){ return x.review_due; });
      if(!rows.length && typer.length === 1){
        ['trivsel', 'tryghed'].forEach(function(t){ rows = rows.concat(planRows(t)); });
        rows = rows.filter(function(x){ return x.review_due; });
      }
      if(!rows.length){
        kort.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen aktiv plan med revisionsfrist endnu.' }));
        return kort;
      }

      var frist = lokalDato(rows.map(function(x){ return x.review_due; }).sort()[0]);
      var start = senesteAf(rows);
      var dage = dageMellem(iDag, frist);   // positiv = i fremtiden
      var samlet = frist.getTime() - lokalMidnat(start).getTime();
      var gaaet = nu.getTime() - lokalMidnat(start).getTime();
      var andel = samlet > 0 ? Math.max(0, Math.min(1, gaaet / samlet)) : 1;

      var klasse = 'bar-ok';
      var tekst;
      if(dage < 0){ klasse = 'bar-over'; tekst = 'Fristen er overskredet for ' + (-dage) + (dage === -1 ? ' dag' : ' dage') + ' siden'; }
      else if(dage === 0){ klasse = 'bar-snart'; tekst = 'Fristen er i dag'; }
      else if(dage <= 14){ klasse = 'bar-snart'; tekst = 'Næste gang om ' + dage + (dage === 1 ? ' dag' : ' dage'); }
      else{ tekst = 'Næste gang om ' + dage + ' dage'; }

      var bar = el('div', { class: 'bar ' + klasse, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
        'aria-valuenow': String(Math.round(andel * 100)), 'aria-label': 'Hvor langt man er inde i revisionsperioden' });
      var fyld = el('div', { class: 'bar-fyld' });
      fyld.style.width = Math.round(andel * 100) + '%';
      bar.appendChild(fyld);

      kort.appendChild(el('div', { class: 'revision-tekst ' + (dage < 0 ? 'revision-over' : ''), text: tekst }));
      kort.appendChild(bar);
      kort.appendChild(el('div', { class: 'revision-under',
        text: 'Frist: ' + frist.getDate() + '. ' + MAANEDER_LANG[frist.getMonth()] + ' · flyttes selv frem, når planen gemmes' }));
      return kort;
    }

    function historikKort(){
      var kort = el('section', { class: 'side-kort' }, [kortHoved('Historik')]);
      var row = bs.handl && bs.handl.row;
      if(!row){
        kort.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen versioner endnu.' }));
        return kort;
      }
      var noegle = row.id + ':' + row.updated_at;
      if(bs.versionerFor !== noegle){
        bs.versionerFor = noegle;
        bs.versioner = [];
        bs.versionerHentet = false;
        D.versions(row.id).then(function(vs){
          if(bs.versionerFor !== noegle) return;
          bs.versioner = vs;
          bs.versionerHentet = true;
          tegnSidepanel();
        }).catch(function(){
          if(bs.versionerFor !== noegle) return;
          bs.versionerHentet = true;   // historikken er et supplement
          tegnSidepanel();
        });
      }
      if(!bs.versioner.length){
        kort.appendChild(el('p', { class: 'tom-tilstand',
          text: bs.versionerHentet ? 'Ingen versioner endnu.' : 'Henter versioner…' }));
      }else{
        bs.versioner.slice(0, 3).forEach(function(v){
          var d = new Date(v.edited_at);
          kort.appendChild(el('div', { class: 'versions-raekke' }, [
            el('span', { class: 'versions-nr', text: 'v' + v.version_no }),
            el('span', { class: 'versions-navn', text: v.edited_by_name }),
            el('span', { class: 'versions-dato', text: kortDato(d) })
          ]));
        });
      }
      if(bs.handl && bs.handl.historik){
        kort.appendChild(el('button', { type: 'button', class: 'knap-tekst', text: 'Se alle', onclick: function(){ bs.handl.historik(); } }));
      }
      return kort;
    }

    function tegnSidepanel(){
      while(sidepanel.firstChild) sidepanel.removeChild(sidepanel.firstChild);
      sidepanel.appendChild(laeringKort());
      sidepanel.appendChild(revisionKort());
      sidepanel.appendChild(historikKort());
    }

    // ---- Plan ----
    var planer = el('div', { class: 'planer' });

    function opdaterOmkring(){
      var i90 = new Date();
      i90.setDate(i90.getDate() - 90);
      Promise.all([
        D.screenFeed(),
        D.plansForResident(rid, 'laering', false),
        D.laeringKurver(lokalDatoISO(i90))
      ]).then(function(rs){
        bs.feed = rs[0];
        bs.laering = rs[1];
        bs.kurver = rs[2];
        tegnMeta();
        tegnForloeb();
        tegnSidepanel();
      }).catch(function(){ /* næste opdatering prøver igen */ });
    }

    // ---- Indstillinger ----
    var variant = el('select', { id: 'variantValg' }, [
      el('option', { value: 'LA2', text: 'LA2 — borgerens eget perspektiv ("Min")' }),
      el('option', { value: 'LA2u', text: 'LA2u — tilstræbt perspektiv ("Din")' })
    ]);
    variant.value = r.variant;

    var kontakt = el('textarea', { id: 'kontaktPersoner', maxlength: '500',
      placeholder: 'Fx navne på kontaktpersoner' });
    kontakt.value = r.contact_persons || '';

    var status = el('div', { class: 'besked', role: 'status', hidden: true });
    var gem = el('button', { type: 'button', class: 'knap', text: 'Gem indstillinger' });
    gem.addEventListener('click', function(){
      gem.disabled = true;
      status.hidden = true;
      D.updateResident(r.id, {
        variant: variant.value,
        contact_persons: kontakt.value.trim()
      }).then(function(rows){
        if(!rows.length) throw new Error('Ikke gemt');
        var variantÆndret = r.variant !== variant.value;
        r.variant = variant.value;
        r.contact_persons = kontakt.value.trim();
        status.className = 'besked ok';
        status.textContent = variantÆndret && harUgemt()
          ? 'Gemt. Gem eller forkast dine ændringer i planen, så skifter teksterne.'
          : 'Gemt.';
        status.hidden = false;
        if(variantÆndret && !harUgemt()) route();
      }).catch(function(e){
        if(erSessionFejl(e)) return sessionFejl();
        console.error('updateResident:', fejlTekst(e));
        status.className = 'besked fejl';
        status.textContent = 'Kunne ikke gemme. Prøv igen.';
        status.hidden = false;
      }).then(function(){
        gem.disabled = false;
      });
    });

    while(mål.firstChild) mål.removeChild(mål.firstChild);
    mål.className = 'beboer-side';
    mål.removeAttribute('id');

    tegnMeta();
    tegnForloeb();
    tegnSidepanel();

    mål.appendChild(hoved);
    mål.appendChild(forloeb);
    mål.appendChild(el('div', { class: 'beboer-grid' }, [planer, sidepanel]));
    mål.appendChild(el('details', { class: 'boks indstillinger' }, [
      el('summary', { text: 'Indstillinger for ' + navn }),
      el('label', { class: 'felt' }, [el('span', { text: 'Variant' }), variant]),
      el('label', { class: 'felt' }, [el('span', { text: 'Kontaktpersoner' }), kontakt]),
      status,
      gem
    ]));

    window.LA2Plans.renderTab(planer, {
      resident: r,
      name: state.name,
      go: gaaTil,
      onSessionError: function(){ sessionFejl(); },
      setHandlinger: function(h){
        bs.handl = h;
        opdaterKnapper();
        tegnSidepanel();
      },
      onGemt: opdaterOmkring
    }, tab, groupId);
  }

  // ---------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------

  function start(){
    D.getSession().then(function(res){
      var session = res && res.data ? res.data.session : null;
      if(!session){ visLogin(''); return; }

      if(rolleFra(session) !== 'editor'){
        return D.signOut().then(function(){
          visLogin('Denne bruger har ikke adgang til LA2-planer.', true);
        });
      }
      if(idleUdloebet()){
        return logUd('Du blev logget ud efter 30 minutter uden aktivitet.');
      }
      noteAktivitet(true);
      startIdleVagt();
      efterLogin();
    }).catch(function(e){
      console.error('start:', fejlTekst(e));
      visLogin('Kunne ikke kontakte serveren. Tjek forbindelsen og prøv igen.', true);
    });
  }

  // Ikoner i bundmenuen (mobil)
  document.querySelectorAll('#bundmenu [data-ikon]').forEach(function(n){
    n.appendChild(window.LA2Ikoner.ikon(n.getAttribute('data-ikon'), { stoerrelse: n.getAttribute('data-ikon') === 'plus' ? 28 : 24 }));
  });

  start();
})();
