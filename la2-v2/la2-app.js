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
      if(erSessionFejl(e)) return logUd('Din session er udløbet — log ind igen.');
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
    topbar.querySelectorAll('[data-nav]').forEach(function(a){
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
    var m = h.match(/^#\/beboer\/([0-9a-fA-F-]{36})(?:\/([a-z_]+))?(?:\/([0-9a-fA-F-]{36}))?$/);
    stopPoll();
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
    }else{
      saetAktivMenu('overblik');
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
    if(harUgemt() && !window.confirm('Du har ændringer, der ikke er gemt. Vil du logge ud alligevel?')) return;
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

  function sideCtx(){
    return {
      name: state.name,
      visIRod: visIRod,
      onSessionError: function(){ logUd('Din session er udløbet — log ind igen.'); }
    };
  }

  function startSide(side){
    stopPoll();
    state.pollTimer = setInterval(function(){
      if(!document.hidden) side.opdater();
    }, POLL_MS);
  }

  // ---------------------------------------------------------------
  // Beboerside: faner + plansider (Fase 3) + indstillinger
  // ---------------------------------------------------------------

  var FANE_LABELS = [
    { id: 'trivsel', label: 'Trivsel' },
    { id: 'tryghed', label: 'Tryghed' },
    { id: 'laering', label: 'Læring' },
    { id: 'mestring', label: 'Mestring' },
    { id: 'haab_droem', label: 'Håb og drømme' }
  ];

  function visBeboer(residentId, tab, groupId){
    var side = el('div', null, [
      el('a', { class: 'tilbage', href: '#/', text: '← Alle beboere' }),
      el('div', { id: 'beboerIndhold', class: 'indlaeser', text: 'Henter…' })
    ]);
    visIRod(side);

    D.residents().then(function(rows){
      var r = rows.filter(function(x){ return x.resident_id === residentId; })[0];
      var mål = document.getElementById('beboerIndhold');
      if(!mål) return;
      if(!r){
        mål.className = 'besked fejl';
        mål.textContent = 'Beboeren blev ikke fundet.';
        return;
      }
      tegnBeboer(mål, r, tab, groupId);
    }).catch(function(e){
      if(erSessionFejl(e)) return logUd('Din session er udløbet — log ind igen.');
      console.error('beboer:', fejlTekst(e));
      var mål = document.getElementById('beboerIndhold');
      if(mål){ mål.className = 'besked fejl'; mål.textContent = 'Kunne ikke hente beboeren.'; }
    });
  }

  function tegnBeboer(mål, r, tab, groupId){
    var navn = r.beboere ? r.beboere.navn : 'Ukendt';
    var farve = r.beboere && erFarve(r.beboere.farve) ? r.beboere.farve : '#374151';
    var tag = el('span', { class: 'beboer-tag stor', text: navn });
    tag.style.background = farve;

    // ---- Faner ----
    var faner = el('nav', { class: 'faner', 'aria-label': 'Planer' });
    FANE_LABELS.forEach(function(f){
      faner.appendChild(el('a', {
        class: 'fane' + (f.id === tab ? ' aktiv' : ''),
        href: '#/beboer/' + r.resident_id + '/' + f.id,
        text: f.label,
        'aria-current': f.id === tab ? 'page' : null
      }));
    });

    var planer = el('div', { class: 'planer' });

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
        if(erSessionFejl(e)) return logUd('Din session er udløbet — log ind igen.');
        console.error('updateResident:', fejlTekst(e));
        status.className = 'besked fejl';
        status.textContent = 'Kunne ikke gemme. Prøv igen.';
        status.hidden = false;
      }).then(function(){
        gem.disabled = false;
      });
    });

    while(mål.firstChild) mål.removeChild(mål.firstChild);
    mål.className = '';
    mål.removeAttribute('id');

    var hoved = [tag, el('span', { class: 'variant-maerke', text: r.variant })];
    mål.appendChild(el('div', { class: 'hoved-raekke' }, hoved));
    if(r.contact_persons){
      mål.appendChild(el('p', { class: 'meta', text: 'Kontaktpersoner: ' + r.contact_persons }));
    }
    mål.appendChild(faner);
    mål.appendChild(planer);
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
      onSessionError: function(){ logUd('Din session er udløbet — log ind igen.'); }
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

  start();
})();
