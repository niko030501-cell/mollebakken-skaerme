// ==================================================================
// LA2 — beboerens plansider (Fase 3): formularer, læringsplan med
// kurve, udkast, historik og gendannelse.
//
// Faste regler: ingen template literals, ingen innerHTML med brugerdata,
// browserens lokale tid, intet planindhold i storage eller console.
// Planindhold holdes kun i DOM'en/hukommelsen mens siden vises.
// ==================================================================
window.LA2Plans = (function(){
  'use strict';

  var D = window.LA2Data;
  var T = window.LA2Templates;

  var dirty = false;
  var persp = 'min';             // 'min' | 'tip' | 'fag' — huskes mens siden er åben
  var formKontekst = 'LA2';      // beboerens indefra_form (LA2 | LA2u) for planen, der vises
  // Samme opbygning i to tilstande: 'rediger' (felter, knapper) og 'print' (svar i
  // bobler, skrivelinjer, ingen knapper). Sættes af byggPlanKrop.
  var tilstand = 'rediger';
  function erPrint(){ return tilstand === 'print'; }

  // LA2u (billedstøtte): kontekst for den formular, der bygges lige nu
  var curTpl = null, curA = null, curKey = 'min', curSamler = null;
  var curResidentId = '', curCtx = null;

  function la2uAktiv(){ return curKey === 'min' && formKontekst === 'LA2u' && !!curSamler && !!window.LA2uFelter; }

  function felt_kandidater(nogle, q){
    var dele = String(nogle).split('.');
    var k = [nogle];
    if(dele.length === 3) k.push(dele[0] + '.' + dele[1]);
    if(q && q.id) k.push(q.id);
    k.push(dele[dele.length - 1]);
    return k;
  }

  function billedeFor(nogle, q){
    var b = curTpl && curTpl.billeder;
    if(!b) return null;
    var k = felt_kandidater(nogle, q);
    for(var i = 0; i < k.length; i++){ if(b[k[i]]) return b[k[i]]; }
    return null;
  }

  function erFoelelse(nogle, q){
    var l = curTpl && curTpl.foelelser;
    if(!l) return false;
    var k = felt_kandidater(nogle, q);
    for(var i = 0; i < k.length; i++){ if(l.indexOf(k[i]) !== -1) return true; }
    return false;
  }

  // Giver et felt spørgsmålsbillede, følelser og svarbillede (kun LA2u, Min)
  function pyntFelt(f, q, nogle, readonly, valg){
    if(!la2uAktiv()) return f;
    valg = valg || {};
    return window.LA2uFelter.pynt(f, {
      nogle: nogle,
      billede: valg.billede || billedeFor(nogle, q),
      foelelse: valg.foelelse !== undefined ? valg.foelelse : erFoelelse(nogle, q),
      readonly: readonly, print: erPrint(),
      residentId: curResidentId, a: curA, samler: curSamler,
      udenSpoergsmaal: !!valg.udenSpoergsmaal, svarBillede: valg.svarBillede,
      onAendring: markDirty,
      onSession: function(){ if(curCtx && curCtx.onSessionError) curCtx.onSessionError(); }
    });
  }

  var KURVE_ANSIGT = { 1: 'foelelse_glad', 2: 'foelelse_okay', 3: 'foelelse_urolig', 4: 'foelelse_ked', 5: 'foelelse_vred' };

  function skrivelinjer(n){
    var w = el('div', { class: 'pf-linjer' });
    for(var i = 0; i < n; i++) w.appendChild(el('div', { class: 'pf-linje' }));
    return w;
  }
  var promptedGroups = {};       // læringsplaner der allerede har vist "opdatér planer?"

  function U(){ return window.LA2Util; }
  function el(tag, props, kids){ return U().el(tag, props, kids); }

  // ---------------------------------------------------------------
  // Hjælpere
  // ---------------------------------------------------------------

  // Tre perspektiver: 'min' (borgerens ord, LA2 eller LA2u), 'tip' (personalets
  // tilstræbte indefra-perspektiv, gemt som 'din') og 'fag' (fagprofessionel).
  // Om Min-planen er tekst (LA2) eller billedstøttet (LA2u) afgøres af
  // res.indefra_form; om beboeren også har TIP afgøres af res.bruger_tip.
  function perspFraRow(row){
    if(row && row.perspective === 'fagprofessionel') return 'fag';
    if(row && row.perspective === 'din') return 'tip';
    return 'min';
  }

  function perspNavn(p){
    return p === 'fag' ? 'Fagprofessionel' : (p === 'tip' ? 'TIP' : 'Min');
  }

  function udfyldtLabel(p){
    return p === 'min' ? 'Udfyldt sammen med' : 'Udfyldt af';
  }

  // TIP vises, når beboeren bruger TIP, eller der allerede findes Din-planer
  function visesTip(res, rows){
    return !!(res.bruger_tip || (rows || []).some(function(r){ return r.perspective === 'din'; }));
  }

  function rowFor(rows, p){
    var v = perspectiveValue(p);
    return rows.filter(function(r){ return r.perspective === v; })[0] || null;
  }

  // Kombinationsmærke: LA2, LA2u, LA2 + TIP eller LA2u + TIP
  function variantTekst(res){
    return (res.indefra_form === 'LA2u' ? 'LA2u' : 'LA2') + (res.bruger_tip ? ' + TIP' : '');
  }

  function resNavn(res){ return res.beboere ? res.beboere.navn : ''; }

  // Lars' / Louies
  function genitiv(n){ return /[sxz]$/i.test(n) ? n + "'" : n + 's'; }

  // Hvilken fase-farve en plantype tegnes i (mestring og håb hører til forebyggelse)
  function faseKlasse(planType){
    if(planType === 'tryghed') return 'plan-tryghed';
    if(planType === 'laering') return 'plan-laering';
    return 'plan-trivsel';
  }

  function planTitel(tpl, planType, p, episodeTitel){
    if(planType === 'haab_droem'){
      if(p === 'fag') return 'Håb og drømme for fagprofessionelle';
      return p === 'tip' ? 'Dine håb og drømme (TIP)' : 'Mine håb og drømme';
    }
    if(planType === 'trivselsoeer'){
      return p === 'fag' ? 'Borgerens trivselsøer' : (p === 'tip' ? 'Dine trivselsøer (TIP)' : 'Mine trivselsøer');
    }
    var t;
    if(p === 'fag') t = tpl.title + ' for fagprofessionelle';
    else if(p === 'tip') t = 'Din ' + tpl.title + ' (TIP)';
    else t = 'Min ' + tpl.title;
    if(planType === 'laering' && episodeTitel) t += ': ' + episodeTitel;
    return t;
  }

  function textKey(p){
    return p === 'fag' ? 'fag' : (p === 'tip' ? 'din' : 'min');
  }

  function perspectiveValue(p){
    return p === 'fag' ? 'fagprofessionel' : (p === 'tip' ? 'din' : 'min');
  }

  function nyUuid(){
    if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var h = '0123456789abcdef';
    var s = '';
    for(var i = 0; i < 36; i++){
      if(i === 8 || i === 13 || i === 18 || i === 23) s += '-';
      else if(i === 14) s += '4';
      else s += h.charAt(Math.floor(Math.random() * 16));
    }
    return s;
  }

  function kopi(o){ return JSON.parse(JSON.stringify(o || {})); }

  function lokalIdag(){
    return U().lokalDatoISO(new Date());
  }

  function datoTid(iso){
    var d = new Date(iso);
    var t = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    return U().kortDato(d) + ' ' + d.getFullYear() + ' kl. ' + t;
  }

  function markDirty(){ dirty = true; }

  function tom(node){
    while(node.firstChild) node.removeChild(node.firstChild);
  }

  function statusChip(status, harUdkast){
    var tekst = 'Ingen plan endnu';
    if(status === 'aktiv') tekst = harUdkast ? 'Aktiv · udkast i gang' : 'Aktiv';
    else if(status === 'udkast') tekst = 'Udkast';
    else if(status === 'arkiv') tekst = 'Arkiveret';
    return el('span', { class: 'chip chip-' + (status || 'ingen'), text: tekst });
  }

  function besked(klasse, tekst){
    return el('div', { class: 'besked ' + klasse, role: 'status', text: tekst });
  }

  function kildeFod(){
    return el('p', { class: 'kilde' }, [
      T.kilde.tekst + ' (',
      el('a', { href: T.kilde.url, target: '_blank', rel: 'noopener', text: T.kilde.visUrl }),
      ')'
    ]);
  }

  // ---------------------------------------------------------------
  // Felter
  // ---------------------------------------------------------------

  // Returnerer { node, get }
  function tekstFelt(label, vaerdi, readonly){
    if(erPrint()){
      var tekst = typeof vaerdi === 'string' ? vaerdi.trim() : '';
      return {
        node: el('div', { class: 'felt pf-felt' }, [
          el('span', { class: 'felt-label', text: label }),
          tekst ? el('div', { class: 'pf-boble', text: tekst }) : skrivelinjer(3)
        ]),
        get: function(){ return tekst; }
      };
    }
    var ta = el('textarea', { rows: '3', maxlength: '4000', 'aria-label': label });
    ta.value = typeof vaerdi === 'string' ? vaerdi : '';
    if(readonly) ta.disabled = true;
    var node = el('label', { class: 'felt' }, [el('span', { text: label }), ta]);
    return { node: node, get: function(){ return ta.value.trim(); } };
  }

  function autoHoejde(ta){
    if(!ta.scrollHeight) return;   // skjult (display:none) — måles næste gang
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function listeFelt(label, vaerdi, readonly, skjulLabel){
    var P = window.LA2Punkter;
    if(erPrint()){
      var punkter = P.tilPunkter(vaerdi).filter(function(p){ return p.t.trim().length > 0; });
      var svar;
      if(punkter.length){
        svar = el('div', { class: 'pf-bobler' }, punkter.map(function(p){
          return el('div', { class: 'pf-boble', text: p.t });
        }));
      }else{
        svar = skrivelinjer(2);
      }
      return {
        node: el('div', { class: 'felt liste-felt pf-felt' }, [
          el('span', { class: 'felt-label' + (skjulLabel ? ' sr-kun' : ''), text: label }),
          svar
        ]),
        get: function(){ return punkter; }
      };
    }
    // [{ id, t }] — ældre tekst får id'erne l0, l1, … (skrives ind ved næste gem)
    var items = P.tilPunkter(vaerdi);
    var brugte = {};
    items.forEach(function(p){ brugte[p.id] = true; });
    if(!items.length) items.push({ id: '', t: '' });
    var liste = el('div', { class: 'liste-rækker' });
    var wrap = el('div', { class: 'felt liste-felt' }, [el('span', { class: 'felt-label' + (skjulLabel ? ' sr-kun' : ''), text: label }), liste]);

    function tilfoej(p){
      // Selvudvidende felt, så lange punkter ikke afkortes
      var inp = el('textarea', { rows: '1', maxlength: '500', 'aria-label': label, class: 'liste-punkt' });
      inp.value = p.t || '';
      inp.setAttribute('data-id', p.id || '');   // tomt = nyt punkt, får id når det gemmes
      if(readonly) inp.disabled = true;
      inp.addEventListener('input', function(){ autoHoejde(inp); });
      inp.addEventListener('keydown', function(ev){
        if(ev.key === 'Enter') ev.preventDefault();   // ét punkt = én linje
      });
      setTimeout(function(){ autoHoejde(inp); }, 0);
      var raekke = el('div', { class: 'liste-raekke' }, [inp]);
      if(!readonly){
        raekke.appendChild(el('button', {
          type: 'button', class: 'knap knap-sekundaer knap-lille', 'aria-label': 'Fjern punkt', text: '×',
          onclick: function(){
            liste.removeChild(raekke);
            if(!liste.firstChild) tilfoej({ id: '', t: '' });
            markDirty();
          }
        }));
      }
      liste.appendChild(raekke);
    }
    items.forEach(tilfoej);
    if(!readonly){
      wrap.appendChild(el('button', {
        type: 'button', class: 'knap knap-sekundaer', text: '+ Tilføj punkt',
        onclick: function(){ tilfoej({ id: '', t: '' }); markDirty(); }
      }));
    }
    return {
      node: wrap,
      // Returnerer [{ id, t }] for udfyldte punkter. Eksisterende punkter beholder
      // deres id; nye får et nyt, som huskes på feltet.
      get: function(){
        var out = [];
        liste.querySelectorAll('textarea').forEach(function(inp){
          var v = inp.value.trim();
          if(!v) return;
          var id = inp.getAttribute('data-id');
          if(!id){
            id = P.nytId(brugte);
            brugte[id] = true;
            inp.setAttribute('data-id', id);
          }
          out.push({ id: id, t: v });
        });
        return out;
      }
    };
  }

  function felt(q, label, vaerdi, readonly, nogle){
    var f = q.type === 'list' ? listeFelt(label, vaerdi, readonly) : tekstFelt(label, vaerdi, readonly);
    return nogle ? pyntFelt(f, q, nogle, readonly) : f;
  }

  // ---------------------------------------------------------------
  // Formular: standard-planer og tryghedsplan
  // Returnerer { node, get(): content }
  // ---------------------------------------------------------------

  // Trivselsplanen: tre niveauer (Mistrivsel øverst, Trivsel nederst), barometer
  // i midten og fire kolonner pr. niveau (se plans.trivsel i la2-templates.js).
  function byggTrivselBarometer(tpl, key, content, readonly){
    var a = (content && content.a) || {};
    var wrap = el('div', { class: 'tb' });
    var felter = [];
    var kol = tpl.kolonner;

    function kolHoved(tekst, skjul){
      return el('div', { class: 'tb-hoved-kol', text: tekst || '' });
    }
    // kolonneoverskrifter (kun på bred skærm)
    wrap.appendChild(el('div', { class: 'tb-hoved', 'aria-hidden': 'true' }, [
      kolHoved(T.tekst(kol.tegn, key)),
      kolHoved(''),
      kolHoved(T.tekst(kol.baro, key)),
      kolHoved(T.tekst(kol.strategi, key)),
      kolHoved(T.tekst(kol.tilgang, key))
    ]));

    function graense(tekst){
      return el('div', { class: 'tb-graense' }, [el('span', { text: tekst })]);
    }

    // sections ligger nedefra og op (1 Trivsel … 3 Mistrivsel); vises omvendt
    var niveauer = tpl.sections.map(function(sec, i){ return { sec: sec, nr: i + 1 }; }).reverse();

    niveauer.forEach(function(n, idx){
      var sec = n.sec;
      var kolNode = {};
      var rad = el('section', { class: 'tb-niveau tb-n' + n.nr + ' niveau-' + sec.level, 'aria-label': n.nr + ' ' + sec.levelLabel });

      var tegn = el('div', { class: 'tb-kol tb-tegn' }, [el('div', { class: 'tb-kol-label', text: T.tekst(kol.tegn, key) })]);
      var strategi = el('div', { class: 'tb-kol tb-strategi' }, [el('div', { class: 'tb-kol-label', text: T.tekst(kol.strategi, key) })]);
      var tilgang = el('div', { class: 'tb-kol tb-tilgang' }, [el('div', { class: 'tb-kol-label', text: T.tekst(kol.tilgang, key) })]);
      var felt = el('div', { class: 'tb-kol tb-felt' }, [el('div', { class: 'tb-kol-label', text: T.tekst(kol.baro, key) })]);
      var maal = { gor: tegn, maerker: tegn, strategi: strategi, tilgang: tilgang, baro: felt };

      sec.questions.forEach(function(q){
        var label = T.tekst(q.text, key);
        if(!label) return;
        var nøgle = sec.id + '.' + q.id;
        var f = q.id === 'baro'
          ? pyntFelt(tekstFelt(sec.levelLabel, a[nøgle], readonly), q, nøgle, readonly)
          : felt_(q, label, a[nøgle], readonly, nøgle);
        felter.push({ key: nøgle, get: f.get });
        maal[q.id].appendChild(f.node);
      });

      var niveauAnsigt = (la2uAktiv() && tpl.ansigter) ? window.la2uBillede(tpl.ansigter[sec.id], 72) : null;
      if(niveauAnsigt) niveauAnsigt.setAttribute('aria-hidden', 'true');
      var baro = el('div', { class: 'tb-baro' }, [
        niveauAnsigt ? el('span', { class: 'tb-baro-ansigt' }, [niveauAnsigt]) : null,
        el('span', { class: 'tb-baro-nr', text: String(n.nr) }),
        el('span', { class: 'tb-baro-navn', text: sec.levelLabel })
      ]);

      rad.appendChild(tegn);
      rad.appendChild(baro);
      rad.appendChild(felt);
      rad.appendChild(strategi);
      rad.appendChild(tilgang);
      wrap.appendChild(rad);

      // Grænselinjer: mellem 3 og 2, og mellem 2 og 1
      if(n.nr === 3) wrap.appendChild(graense(tpl.graenser.mistrivsel));
      if(n.nr === 2) wrap.appendChild(graense(tpl.graenser.saarbar));
    });

    return {
      node: wrap,
      get: function(){
        var ud = kopi(content);
        ud.a = ud.a || {};
        felter.forEach(function(f){ ud.a[f.key] = f.get(); });
        return ud;
      }
    };
  }

  function felt_(q, label, vaerdi, readonly, nogle){
    return felt(q, label, vaerdi, readonly, nogle);
  }

  // ---------------------------------------------------------------
  // Tryghedsplan: tre faser i en episode (Optrapning · Kaos · Stabilisering)
  // ---------------------------------------------------------------

  var FASE_FARVE = { optrapning: '#8a6212', kaos: '#9a3632', stabilisering: '#34507a' };
  var FASE_STREG = { optrapning: '1', kaos: '5', stabilisering: '1' };   // fuld · tyk · stiplet

  // Fast illustration af en episodes affektkurve (udfyldes ikke), egen stil.
  function tegnAffektKurve(stoerrelse){
    var W = 760, H = 300;
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, 'class': 'affekt-svg', role: 'img',
      'aria-label': 'Affektkurve: affektniveauet stiger i optrapningsfasen, topper i kaosfasen og falder i stabiliseringsfasen.'
    });
    var x0 = 78, x1 = 300, x2 = 520, x3 = 742;      // fasernes grænser
    var yTop = 24, yBund = 232;

    // kaosfasen: meget lys rød baggrund
    svg.appendChild(svgEl('rect', { x: x1, y: yTop, width: x2 - x1, height: yBund - yTop, fill: '#fbf0ef' }));

    // tærskellinjer (to vandrette, stiplede)
    [[150, 'Tærskel'], [96, 'Tærskel']].forEach(function(l){
      svg.appendChild(svgEl('line', { x1: x0, x2: x3, y1: l[0], y2: l[0], stroke: '#7b8986', 'stroke-width': 2, 'stroke-dasharray': '7 6' }));
    });

    // lodrette skillelinjer mellem faserne
    [x1, x2].forEach(function(x){
      svg.appendChild(svgEl('line', { x1: x, x2: x, y1: yTop, y2: yBund + 14, stroke: '#7b8986', 'stroke-width': 2, 'stroke-dasharray': '7 6' }));
    });

    // akse
    svg.appendChild(svgEl('line', { x1: x0, x2: x0, y1: yTop, y2: yBund, stroke: '#1f2d2a', 'stroke-width': 3 }));
    svg.appendChild(svgEl('line', { x1: x0, x2: x3, y1: yBund, y2: yBund, stroke: '#1f2d2a', 'stroke-width': 3 }));

    // lille barometer ved aksen: tre flade felter (grøn, guld, rød)
    [['#9a3632', yTop, 70], ['#d89b2b', yTop + 70, 70], ['#2f7d4f', yTop + 140, yBund - yTop - 140]].forEach(function(b){
      svg.appendChild(svgEl('rect', { x: 46, y: b[1], width: 18, height: b[2], fill: b[0] }));
    });
    var akse = svgEl('text', { x: 16, y: (yTop + yBund) / 2, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800,
      fill: '#1f2d2a', transform: 'rotate(-90 16 ' + ((yTop + yBund) / 2) + ')' });
    akse.textContent = 'Affektniveau';
    svg.appendChild(akse);

    // kurven: stiger, topper i kaos, falder
    svg.appendChild(svgEl('path', {
      d: 'M ' + x0 + ' 214 C 160 212 230 186 ' + x1 + ' 150 S 410 44 440 44 S 560 120 620 176 S 700 214 ' + x3 + ' 218',
      fill: 'none', stroke: '#1f2d2a', 'stroke-width': 5, 'stroke-linecap': 'round'
    }));

    // fasenavne under kurven med forskellig streg og farve
    [['optrapning', x0, x1, '1 · Optrapning'], ['kaos', x1, x2, '2 · Kaos'], ['stabilisering', x2, x3, '3 · Stabilisering']].forEach(function(f){
      var midt = (f[1] + f[2]) / 2;
      var t = svgEl('text', { x: midt, y: yBund + 40, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: FASE_FARVE[f[0]] });
      t.textContent = f[3];
      svg.appendChild(t);
      var attrs = { x1: f[1] + 14, x2: f[2] - 14, y1: yBund + 54, y2: yBund + 54, stroke: FASE_FARVE[f[0]],
        'stroke-width': f[0] === 'kaos' ? 7 : 4 };
      if(f[0] === 'stabilisering') attrs['stroke-dasharray'] = '10 7';
      svg.appendChild(svgEl('line', attrs));
    });

    return svg;
  }

  function byggTryghedFaser(tpl, key, content, readonly){
    var a = (content && content.a) || {};
    var wrap = el('div', { class: 'tf tf-aktiv-optrapning' + (erPrint() ? ' tf-print' : '') });
    var felter = [];

    // ---- Udløsende årsager ----
    var uq = tpl.udloesende.question;
    var ulabel = T.tekst(uq.text, key) || '';
    var unøgle = tpl.udloesende.id + '.' + uq.id;
    var uf = pyntFelt(tekstFelt(ulabel, a[unøgle], readonly), uq, unøgle, readonly);
    felter.push({ key: unøgle, get: uf.get });
    wrap.appendChild(el('section', { class: 'tf-aarsager' }, [uf.node]));

    // ---- Affektkurve ----
    var kurve = el('figure', { class: 'tf-kurve' }, [tegnAffektKurve()]);
    wrap.appendChild(kurve);

    // ---- Faneknapper (kun på telefon) ----
    var knapper = el('div', { class: 'tf-faner segmenter', role: 'group', 'aria-label': 'Fase' });
    tpl.sections.forEach(function(sec, i){
      var b = el('button', {
        type: 'button', class: 'segment' + (i === 0 ? ' aktiv' : ''),
        'aria-pressed': i === 0 ? 'true' : 'false', text: (i + 1) + ' ' + sec.levelLabel
      });
      b.addEventListener('click', function(){
        tpl.sections.forEach(function(s2){ wrap.classList.remove('tf-aktiv-' + s2.id); });
        wrap.classList.add('tf-aktiv-' + sec.id);
        knapper.querySelectorAll('button').forEach(function(x, j){
          x.className = 'segment' + (j === i ? ' aktiv' : '');
          x.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
      });
      knapper.appendChild(b);
    });
    if(!erPrint()) wrap.appendChild(knapper);

    // ---- Skema: fasernes overskrifter + tre grupper som rækker ----
    var skema = el('div', { class: 'tf-skema' });
    var hoved = el('div', { class: 'tf-raekke tf-hoved', 'aria-hidden': 'true' }, [el('div', { class: 'tf-gruppe-navn' })]);
    tpl.sections.forEach(function(sec, i){
      hoved.appendChild(el('div', { class: 'tf-celle tf-f-' + sec.id + ' tf-fase-hoved' }, [
        el('span', { class: 'tf-form tf-form-' + sec.id, 'aria-hidden': 'true' }),
        el('span', { class: 'tf-fase-nr', text: String(i + 1) }),
        el('span', { class: 'tf-fase-navn', text: sec.langtNavn })
      ]));
    });
    skema.appendChild(hoved);

    tpl.grupper.forEach(function(g){
      var rad = el('section', { class: 'tf-raekke tf-g-' + g.id }, [
        el('h3', { class: 'tf-gruppe-navn' }, [el('span', { text: T.tekst(g.label, key) || '' })])
      ]);
      tpl.sections.forEach(function(sec, i){
        var celle = el('div', { class: 'tf-celle tf-f-' + sec.id }, [
          el('div', { class: 'tf-celle-fase', text: (i + 1) + ' · ' + sec.langtNavn })
        ]);
        g.felter.forEach(function(fid){
          var q = null;
          sec.questions.forEach(function(x){ if(x.id === fid) q = x; });
          if(!q) return;
          var label = T.tekst(q.text, key);
          if(!label) return;
          var nøgle = sec.id + '.' + q.id;
          var f = felt(q, label, a[nøgle], readonly, nøgle);
          felter.push({ key: nøgle, get: f.get });
          celle.appendChild(f.node);
        });
        rad.appendChild(celle);
      });
      skema.appendChild(rad);
    });
    wrap.appendChild(skema);

    return {
      node: wrap,
      get: function(){
        var ud = kopi(content);
        ud.a = ud.a || {};
        felter.forEach(function(f){ ud.a[f.key] = f.get(); });
        return ud;
      }
    };
  }

  // ---------------------------------------------------------------
  // Mestringsplan: tre niveauer oven over hinanden, ansigt ved barometeret og
  // tre kolonner pr. niveau. LA2u-udgaven viser ansigterne store.
  // ---------------------------------------------------------------

  function ikonNode(noegle, px){
    var b = window.la2uBillede ? window.la2uBillede(noegle, px) : null;
    if(b) b.setAttribute('aria-hidden', 'true');
    return b;
  }

  function byggMestring(tpl, key, content, readonly){
    var a = (content && content.a) || {};
    var stor = key === 'min' && formKontekst === 'LA2u';
    var wrap = el('div', { class: 'tb tb-mestring' + (stor ? ' tb-smiley' : '') });
    var felter = [];
    var kol = tpl.kolonner;
    var rakke = ['strategi', 'netvaerk', 'andet'];

    function kolTekst(id){ return T.tekst(kol[id], key) || ''; }

    // kolonneoverskrifter (kun på bred skærm), med små ikoner
    var hoved = el('div', { class: 'tb-hoved', 'aria-hidden': 'true' }, [el('div', { class: 'tb-hoved-kol' })]);
    rakke.forEach(function(id){
      var h = el('div', { class: 'tb-hoved-kol tb-hoved-ikon' });
      var ik = ikonNode(tpl.ikoner[id], 26);
      if(ik) h.appendChild(ik);
      h.appendChild(el('span', { text: kolTekst(id) }));
      hoved.appendChild(h);
    });
    wrap.appendChild(hoved);

    var niveauer = tpl.sections.map(function(sec, i){ return { sec: sec, nr: i + 1 }; }).reverse();

    niveauer.forEach(function(n){
      var sec = n.sec;
      var rad = el('section', { class: 'tb-niveau tb-n' + n.nr + ' niveau-' + sec.level, 'aria-label': n.nr + ' ' + sec.levelLabel });

      var ansigt = ikonNode(tpl.ansigter[sec.id], stor ? 88 : 44);
      var baro = el('div', { class: 'tb-baro' }, [
        ansigt ? el('span', { class: 'tb-baro-ansigt' }, [ansigt]) : null,
        el('span', { class: 'tb-baro-nr', text: String(n.nr) }),
        el('span', { class: 'tb-baro-navn', text: sec.levelLabel })
      ]);
      rad.appendChild(baro);

      sec.questions.forEach(function(q){
        var label = T.tekst(q.text, key);
        if(!label) return;
        var nøgle = sec.id + '.' + q.id;
        // feltets egen label skjules (skærmlæser): kolonnenavnet står i kolonnehovedet
        var f = pyntFelt(listeFelt(label, a[nøgle], readonly, true), q, nøgle, readonly, { udenSpoergsmaal: true });
        felter.push({ key: nøgle, get: f.get });
        var lab = el('div', { class: 'tb-kol-label' });
        var ik = ikonNode(tpl.ikoner[q.id], 20);
        if(ik) lab.appendChild(ik);
        lab.appendChild(el('span', { text: kolTekst(q.id) }));
        rad.appendChild(el('div', { class: 'tb-kol tb-m-' + q.id }, [lab, f.node]));
      });
      wrap.appendChild(rad);
    });

    return {
      node: wrap,
      get: function(){
        var ud = kopi(content);
        ud.a = ud.a || {};
        felter.forEach(function(f){ ud.a[f.key] = f.get(); });
        return ud;
      }
    };
  }

  // ---------------------------------------------------------------
  // Trivselsøer: op til 5 runde øer + refleksion
  // ---------------------------------------------------------------

  function byggOeer(tpl, key, content, readonly){
    var a = (content && content.a) || {};
    var wrap = el('div', { class: 'oe' });
    var felter = [];
    var maks = tpl.maxOeer || 5;

    wrap.appendChild(el('p', { class: 'oe-intro', text: T.tekst(tpl.intro, key) || '' }));

    function nogle(i, felt){ return 'oe' + i + '.' + felt; }

    function harIndhold(i){
      var ks = ['navn', 'hvor', 'hvad', 'hvem', 'hvordan'];
      for(var k = 0; k < ks.length; k++){
        var v = a[nogle(i, ks[k])];
        if(typeof v === 'string' && v.trim()) return true;
      }
      return !!(a[nogle(i, 'kan.trivsel')] || a[nogle(i, 'kan.saarbar')] || a[nogle(i, 'kan.mistrivsel')]);
    }

    var antal = 1;
    for(var i = 1; i <= maks; i++){ if(harIndhold(i)) antal = i; }
    if(erPrint()) antal = maks;      // på papir vises alle øer, så de kan udfyldes i hånden

    var liste = el('div', { class: 'oe-liste' });
    var kort = [];

    function oeKort(i){
      var navnInp = el('input', { type: 'text', maxlength: '80', 'aria-label': T.tekst(tpl.oeNavn, key) + ' ' + i });
      navnInp.value = typeof a[nogle(i, 'navn')] === 'string' ? a[nogle(i, 'navn')] : '';
      if(readonly) navnInp.disabled = true;
      felter.push({ key: nogle(i, 'navn'), get: function(){ return navnInp.value.trim(); } });

      var billedeVaerdi = typeof a[nogle(i, 'billede')] === 'string' ? a[nogle(i, 'billede')] : '';
      felter.push({ key: nogle(i, 'billede'), get: function(){ return billedeVaerdi; } });
      var rund = el('div', { class: 'oe-billede' });
      function tegnOeBillede(){
        while(rund.firstChild) rund.removeChild(rund.firstChild);
        var b = window.LA2uFelter ? window.LA2uFelter.billedeNode(billedeVaerdi, 84) : null;
        if(!b) b = window.la2uBillede('ikon_trivselsoe', 84);
        if(b){ b.setAttribute('aria-hidden', 'true'); rund.appendChild(b); }
      }
      tegnOeBillede();
      var billedeKol = el('div', { class: 'oe-billede-kol' }, [rund]);
      if(!readonly && !erPrint() && window.LA2uFelter){
        billedeKol.appendChild(el('button', {
          type: 'button', class: 'knap knap-sekundaer knap-lille', text: 'Vælg billede',
          onclick: function(){
            window.LA2uFelter.aabnVaelger({
              residentId: curResidentId, nuvaerende: billedeVaerdi,
              onSession: function(){ if(curCtx && curCtx.onSessionError) curCtx.onSessionError(); },
              onVaelg: function(v){ billedeVaerdi = v || ''; tegnOeBillede(); markDirty(); }
            });
          }
        }));
      }

      var node = el('section', { class: 'oe-kort', 'aria-label': 'Trivselsø ' + i }, [
        el('div', { class: 'oe-hoved' }, [
          billedeKol,
          el('div', { class: 'oe-hoved-tekst' }, [
            el('div', { class: 'oe-nr', text: 'Ø ' + i }),
            erPrint()
              ? el('div', { class: 'felt pf-felt' }, [
                  el('span', { class: 'felt-label', text: T.tekst(tpl.oeNavn, key) }),
                  navnInp.value.trim() ? el('div', { class: 'pf-boble', text: navnInp.value.trim() }) : skrivelinjer(1)
                ])
              : el('label', { class: 'felt' }, [el('span', { text: T.tekst(tpl.oeNavn, key) }), navnInp])
          ])
        ])
      ]);

      tpl.oeFelter.forEach(function(f){
        var tf = pyntFelt(tekstFelt(T.tekst(f.label, key), a[nogle(i, f.id)], readonly), { id: f.id }, nogle(i, f.id), readonly, { svarBillede: false });
        felter.push({ key: nogle(i, f.id), get: tf.get });
        node.appendChild(tf.node);
      });

      var besoeg = el('fieldset', { class: 'oe-besoeg' }, [
        el('legend', { text: T.tekst(tpl.besoegSpoergsmaal, key) })
      ]);
      tpl.besoeg.forEach(function(b){
        var cb = el('input', { type: 'checkbox' });
        cb.checked = a[nogle(i, 'kan.' + b.id)] === true;
        if(readonly) cb.disabled = true;
        felter.push({ key: nogle(i, 'kan.' + b.id), get: function(){ return cb.checked; } });
        if(erPrint()){
          besoeg.appendChild(el('div', { class: 'oe-afkryds pf-afkryds' }, [
            el('span', { class: 'pf-boks', 'aria-hidden': 'true', text: cb.checked ? '\u2611' : '\u2610' }),
            el('span', { text: b.label })
          ]));
        }else{
          besoeg.appendChild(el('label', { class: 'oe-afkryds' }, [cb, el('span', { text: b.label })]));
        }
      });
      node.appendChild(besoeg);
      return node;
    }

    for(var j = 1; j <= maks; j++){
      var k = oeKort(j);
      k.hidden = j > antal;
      kort.push(k);
      liste.appendChild(k);
    }
    wrap.appendChild(liste);

    if(!readonly && !erPrint()){
      var tilfoej = el('button', { type: 'button', class: 'knap knap-sekundaer oe-tilfoej', text: '+ Tilføj en trivselsø' });
      function opdaterTilfoej(){ tilfoej.hidden = antal >= maks; }
      tilfoej.addEventListener('click', function(){
        if(antal >= maks) return;
        kort[antal].hidden = false;
        antal++;
        opdaterTilfoej();
        var inp = kort[antal - 1].querySelector('input[type=text]');
        if(inp) inp.focus();
      });
      opdaterTilfoej();
      wrap.appendChild(tilfoej);
    }

    // ---- Refleksion ----
    var r = tpl.refleksion;
    var rf = tekstFelt(T.tekst(r.fri, key) || '', a['refleksion.fri'], readonly);
    felter.push({ key: 'refleksion.fri', get: rf.get });
    var spm = el('ul', { class: 'oe-spoergsmaal' });
    r.spoergsmaal.forEach(function(q){ spm.appendChild(el('li', { text: T.tekst(q, key) || '' })); });
    wrap.appendChild(el('section', { class: 'oe-refleksion' }, [
      el('h3', { class: 'sektion-titel', text: T.tekst(r.overskrift, key) || '' }),
      spm,
      rf.node
    ]));

    return {
      node: wrap,
      get: function(){
        var ud = kopi(content);
        ud.a = ud.a || {};
        felter.forEach(function(f){ ud.a[f.key] = f.get(); });
        return ud;
      }
    };
  }

  function byggStandardForm(tpl, key, content, readonly){
    if(tpl.kind === 'oeer') return byggOeer(tpl, key, content, readonly);
    if(tpl.kind === 'mestring') return byggMestring(tpl, key, content, readonly);
    if(tpl.kind === 'faser') return byggTryghedFaser(tpl, key, content, readonly);
    if(tpl.kind === 'barometer') return byggTrivselBarometer(tpl, key, content, readonly);
    var a = (content && content.a) || {};
    var wrap = el('div', { class: 'plan-form' });
    var felter = [];

    tpl.sections.forEach(function(sec){
      var overskrift = T.tekst(sec.heading, key) || '';
      var cls = 'plan-sektion' + (sec.level ? ' niveau niveau-' + sec.level : '');
      var kroppen = el('section', { class: cls });
      var hoved = el('h3', { class: 'sektion-titel' });
      if(sec.level){
        hoved.appendChild(el('span', { class: 'niveau-maerke', text: sec.levelLabel }));
      }
      hoved.appendChild(document.createTextNode(overskrift));
      kroppen.appendChild(hoved);

      sec.questions.forEach(function(q){
        var label = T.tekst(q.text, key);
        if(!label) return;
        var nøgle = sec.id + '.' + q.id;
        var f = felt(q, label, a[nøgle], readonly, nøgle);
        felter.push({ key: nøgle, get: f.get });
        kroppen.appendChild(f.node);
      });
      wrap.appendChild(kroppen);
    });

    return {
      node: wrap,
      get: function(){
        var ud = kopi(content);
        ud.a = ud.a || {};
        felter.forEach(function(f){ ud.a[f.key] = f.get(); });
        return ud;
      }
    };
  }

  // ---------------------------------------------------------------
  // Kurve (trivsels- og affektkurve): 1-5 på hvert tidspunkt, tegnet som SVG
  // ---------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs){
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    return n;
  }

  // Fuld affektkurve til papir/print: tynde hjælpelinjer for 1-5, alle tidspunkter,
  // episoden som rød stiplet streg og det højeste punkt med rød ring.
  function tegnKurveFuld(svg, curve, vaerdier){
    tom(svg);
    var W = 900, H = 250, pl = 118, pr = 30, pt = 22, pb = 64;
    var n = curve.points.length;
    var lo = curve.min, hi = curve.max;
    var INK = '#1f2d2a', ROED = '#b3413c';

    function x(i){ return pl + i * (W - pl - pr) / (n - 1); }
    function y(v){ return pt + (hi - v) * (H - pt - pb) / (hi - lo); }
    function tekst(txt, attrs){
      var t = svgEl('text', attrs);
      t.textContent = txt;
      return t;
    }

    for(var v = lo; v <= hi; v++){
      svg.appendChild(svgEl('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: '#b5bfba', 'stroke-width': 1 }));
      var navn = String(v) + (v === lo ? ' roligt' : (v === hi ? ' meget slemt' : ''));
      svg.appendChild(tekst(navn, { x: pl - 12, y: y(v) + 5, 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700, fill: '#4a5b58' }));
    }

    var epi = typeof curve.episodeIndex === 'number' ? curve.episodeIndex : Math.floor((n - 1) / 2);
    svg.appendChild(svgEl('line', { x1: x(epi), x2: x(epi), y1: pt - 8, y2: H - pb + 6,
      stroke: ROED, 'stroke-width': 2.5, 'stroke-dasharray': '7 5' }));

    // tidspunkter under kurven
    curve.points.forEach(function(p, i){
      svg.appendChild(svgEl('line', { x1: x(i), x2: x(i), y1: H - pb + 6, y2: H - pb + 14, stroke: '#7b8986', 'stroke-width': 1.5 }));
      var linjer = p.short || [p.label];
      linjer.forEach(function(l, k){
        svg.appendChild(tekst(l, { x: x(i), y: H - pb + 32 + k * 16, 'text-anchor': 'middle', 'font-size': 14,
          'font-weight': i === epi ? 800 : 700, fill: i === epi ? ROED : '#1f2d2a' }));
      });
    });

    var seg = [];
    function flush(){
      if(seg.length > 1){
        svg.appendChild(svgEl('polyline', {
          points: seg.map(function(s){ return x(s) + ',' + y(vaerdier[s]); }).join(' '),
          fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }));
      }
      seg = [];
    }
    curve.points.forEach(function(p, i){
      if(vaerdier[i]) seg.push(i); else flush();
    });
    flush();

    var maxI = -1;
    vaerdier.forEach(function(vv, i){
      if(vv && (maxI === -1 || vv > vaerdier[maxI])) maxI = i;
    });
    curve.points.forEach(function(p, i){
      if(!vaerdier[i]) return;
      svg.appendChild(svgEl('circle', { cx: x(i), cy: y(vaerdier[i]), r: 5, fill: INK }));
    });
    if(maxI !== -1){
      svg.appendChild(svgEl('circle', { cx: x(maxI), cy: y(vaerdier[maxI]), r: 11, fill: 'none', stroke: ROED, 'stroke-width': 3 }));
    }
  }

  function tegnKurve(svg, curve, vaerdier){
    tom(svg);
    var W = 600, H = 190, pl = 22, pr = 22, pt = 26, pb = 42;
    var n = curve.points.length;
    var lo = curve.min, hi = curve.max;
    var BLAA = '#34507a', ROED = '#b3413c';

    function x(i){ return pl + i * (W - pl - pr) / (n - 1); }
    function y(v){ return pt + (hi - v) * (H - pt - pb) / (hi - lo); }

    // Tynd grundlinje
    var gy = H - pb + 12;
    svg.appendChild(svgEl('line', { x1: pl, x2: W - pr, y1: gy, y2: gy, stroke: '#cdd5d0', 'stroke-width': 1.5 }));

    // Kurven (sammenhængende udfyldte punkter)
    var seg = [];
    function flush(){
      if(seg.length > 1){
        svg.appendChild(svgEl('polyline', {
          points: seg.map(function(s){ return x(s) + ',' + y(vaerdier[s]); }).join(' '),
          fill: 'none', stroke: BLAA, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }));
      }
      seg = [];
    }
    curve.points.forEach(function(p, i){
      if(vaerdier[i]) seg.push(i); else flush();
    });
    flush();

    // Højeste punkt
    var maxI = -1;
    vaerdier.forEach(function(v, i){
      if(v && (maxI === -1 || v > vaerdier[maxI])) maxI = i;
    });

    curve.points.forEach(function(p, i){
      if(!vaerdier[i]) return;
      svg.appendChild(svgEl('circle', { cx: x(i), cy: y(vaerdier[i]), r: 4, fill: BLAA }));
    });
    if(maxI !== -1){
      svg.appendChild(svgEl('circle', {
        cx: x(maxI), cy: y(vaerdier[maxI]), r: 9, fill: 'none', stroke: ROED, 'stroke-width': 2.5
      }));
    }

    // Tre labels under kurven
    var epi = typeof curve.episodeIndex === 'number' ? curve.episodeIndex : Math.floor((n - 1) / 2);
    [[curve.points[0].label, pl, 'start'], ['Episoden', x(epi), 'middle'], [curve.points[n - 1].label, W - pr, 'end']].forEach(function(l){
      var tt = svgEl('text', { x: l[1], y: H - 10, 'text-anchor': l[2], 'font-size': 14, 'font-weight': 700, fill: '#5a6b66' });
      tt.textContent = l[0];
      svg.appendChild(tt);
    });
  }

  function byggKurve(curve, gemt, readonly, key){
    var vaerdier = [];
    gemt = window.LA2Punkter.kurve7(gemt, curve.points.length);
    curve.points.forEach(function(p, i){
      var v = gemt[i];
      vaerdier.push(typeof v === 'number' && v >= curve.min && v <= curve.max ? v : null);
    });

    if(erPrint()){
      var psvg = svgEl('svg', { viewBox: '0 0 900 250', class: 'kurve-svg pf-kurve-svg', role: 'img', 'aria-label': curve.title });
      tegnKurveFuld(psvg, curve, vaerdier);
      var tr1 = el('tr'), tr2 = el('tr');
      curve.points.forEach(function(p, i){
        tr1.appendChild(el('th', { text: p.label }));
        tr2.appendChild(el('td', { text: vaerdier[i] === null ? '–' : String(vaerdier[i]) }));
      });
      return {
        node: el('section', { class: 'plan-sektion kurve pf-kurve' }, [
          el('h3', { class: 'sektion-titel', text: curve.title }),
          el('p', { class: 'kurve-hint', text: (curve.hintT && T.tekst(curve.hintT, key)) || curve.hint }),
          psvg,
          el('table', { class: 'pf-kurve-tabel' }, [tr1, tr2])
        ]),
        get: function(){ return vaerdier.slice(); }
      };
    }

    var svg = svgEl('svg', {
      viewBox: '0 0 600 190', class: 'kurve-svg', role: 'img',
      'aria-label': curve.title
    });
    var rækkeNoder = el('div', { class: 'kurve-valg' });

    function opdater(){
      tegnKurve(svg, curve, vaerdier);
      rækkeNoder.querySelectorAll('button[data-i]').forEach(function(b){
        var i = Number(b.getAttribute('data-i'));
        var v = Number(b.getAttribute('data-v'));
        var valgt = vaerdier[i] === v;
        b.className = 'kurve-knap' + (valgt ? ' valgt' : '');
        b.setAttribute('aria-pressed', valgt ? 'true' : 'false');
      });
    }

    curve.points.forEach(function(p, i){
      var knapper = el('div', { class: 'kurve-knapper' });
      for(var v = curve.max; v >= curve.min; v--){
        (function(vv){
          var kn = el('button', {
            type: 'button', 'data-i': String(i), 'data-v': String(vv), text: la2uAktiv() ? null : String(vv),
            disabled: readonly ? true : null,
            'aria-label': p.label + ': ' + vv,
            onclick: function(){
              vaerdier[i] = (vaerdier[i] === vv) ? null : vv;   // tryk igen = fjern
              markDirty();
              opdater();
            }
          });
          if(la2uAktiv()){
            var kf = window.la2uBillede(KURVE_ANSIGT[vv], 30);
            if(kf){ kf.setAttribute('aria-hidden', 'true'); kn.appendChild(kf); }
            kn.appendChild(el('span', { class: 'kurve-tal', text: String(vv) }));
          }
          knapper.appendChild(kn);
        })(v);
      }
      rækkeNoder.appendChild(el('div', { class: 'kurve-kolonne' }, [
        knapper,
        el('div', { class: 'kurve-etiket', text: p.label })
      ]));
    });

    var node = el('section', { class: 'plan-sektion kurve' }, [
      el('h3', { class: 'sektion-titel', text: curve.title }),
      el('p', { class: 'kurve-hint', text: (curve.hintT && T.tekst(curve.hintT, key)) || curve.hint }),
      rækkeNoder,
      svg
    ]);
    opdater();

    return { node: node, get: function(){ return vaerdier.slice(); } };
  }

  // ---------------------------------------------------------------
  // Formular: læringsplan (2 kolonner × 4 rækker + kurve)
  // ---------------------------------------------------------------

  function byggLaeringForm(tpl, key, content, readonly){
    var a = (content && content.a) || {};
    var wrap = el('div', { class: 'plan-form laering-form' });
    var felter = [];

    tpl.rows.forEach(function(row){
      var qs = row.questions.filter(function(q){ return !!T.tekst(q.text, key); });
      if(!qs.length) return;

      var celler = [];
      if(row.perColumn){
        tpl.columns.forEach(function(col){
          var cellInd = [el('div', { class: 'celle-kolonne', text: (col.labelT && T.tekst(col.labelT, key)) || col.label })];
          qs.forEach(function(q){
            var nøgle = row.id + '.' + q.id + '.' + col.id;
            var f = felt(q, T.tekst(q.text, key), a[nøgle], readonly, nøgle);
            felter.push({ key: nøgle, get: f.get });
            cellInd.push(f.node);
          });
          celler.push(el('div', { class: 'laering-celle' }, cellInd));
        });
      }else{
        var enkelt = [];
        qs.forEach(function(q){
          var nøgle = row.id + '.' + q.id;
          var f = felt(q, T.tekst(q.text, key), a[nøgle], readonly, nøgle);
          felter.push({ key: nøgle, get: f.get });
          enkelt.push(f.node);
        });
        celler.push(el('div', { class: 'laering-celle bred' }, enkelt));
      }

      wrap.appendChild(el('section', { class: 'plan-sektion laering-raekke' }, [
        el('h3', { class: 'sektion-titel', text: (row.headingT && T.tekst(row.headingT, key)) || row.heading }),
        el('div', { class: 'laering-celler' + (row.perColumn ? '' : ' en-kolonne') }, celler)
      ]));
    });

    var kurve = byggKurve(tpl.curve, content && content.curve, readonly, key);
    // På papir står kurven øverst i hele bredden, derunder skemaet
    if(erPrint()) wrap.insertBefore(kurve.node, wrap.firstChild);
    else wrap.appendChild(kurve.node);

    return {
      node: wrap,
      get: function(){
        var ud = kopi(content);
        ud.a = ud.a || {};
        felter.forEach(function(f){ ud.a[f.key] = f.get(); });
        ud.curve = kurve.get();
        return ud;
      }
    };
  }

  // Valgfrie undersøgelsesark til TIP (kun Din-planer). Svarene gemmes i
  // content.a under nøglerne tip.ark1 … tip.ark5, så de følger med i historikken.
  function byggTipArk(content, readonly){
    var ark = T.tipArk;
    var a = (content && content.a) || {};
    var felter = [];
    var boks = el('details', { class: 'boks tip-ark' });
    var harIndhold = ark.felter.some(function(f){
      return typeof a[f.key] === 'string' && a[f.key].trim();
    });
    if(erPrint() && !harIndhold) return null;
    if(harIndhold) boks.open = true;
    boks.appendChild(el('summary', { text: ark.titel }));
    boks.appendChild(el('p', { class: 'tip-ark-hjaelp', text: ark.hjaelp }));
    ark.felter.forEach(function(f, i){
      var fl = tekstFelt((i + 1) + '. ' + f.label, a[f.key], readonly);
      felter.push({ key: f.key, get: fl.get });
      boks.appendChild(fl.node);
      if(f.hint) boks.appendChild(el('p', { class: 'tip-ark-hint', text: f.hint }));
    });
    return {
      node: boks,
      get: function(ud){
        ud.a = ud.a || {};
        felter.forEach(function(f){ ud.a[f.key] = f.get(); });
        return ud;
      }
    };
  }

  // Svar fra en plans gamle opbygning (tpl.legacy): vises skrivebeskyttet, så
  // intet går tabt. De ligger stadig i content.a og følger med ved gem.
  function byggLegacy(tpl, key, content){
    if(!tpl.legacy || erPrint()) return null;
    var a = (content && content.a) || {};
    var P = window.LA2Punkter;
    var poster = [];
    tpl.legacy.forEach(function(l){
      var v = a[l.key];
      var tekster = Array.isArray(v) ? P.tekster(v) : ((typeof v === 'string' && v.trim()) ? [v.trim()] : []);
      if(tekster.length) poster.push({ label: T.tekst(l.label, key) || l.key, tekster: tekster });
    });
    if(!poster.length) return null;
    var boks = el('details', { class: 'boks legacy', open: true });
    boks.appendChild(el('summary', { text: 'Fra tidligere version' }));
    boks.appendChild(el('p', { class: 'legacy-hjaelp',
      text: 'Disse svar er fra den gamle opbygning af planen. Flyt det, der stadig passer, over i felterne ovenfor.' }));
    poster.forEach(function(p){
      boks.appendChild(el('div', { class: 'legacy-post' }, [
        el('div', { class: 'legacy-label', text: p.label }),
        el('ul', { class: 'legacy-liste' }, p.tekster.map(function(t){ return el('li', { text: t }); }))
      ]));
    });
    return boks;
  }

  function byggForm(tpl, key, content, readonly){
    var forrige = { tpl: curTpl, a: curA, key: curKey, samler: curSamler };
    var samler = [];
    curTpl = tpl; curA = (content && content.a) || {}; curKey = key; curSamler = samler;
    var f, legacy, ark, la2u;
    try{
      la2u = la2uAktiv();
      f = tpl.kind === 'laering'
        ? byggLaeringForm(tpl, key, content, readonly)
        : byggStandardForm(tpl, key, content, readonly);
      legacy = byggLegacy(tpl, key, content);
      ark = (key === 'din' && T.tipArk) ? byggTipArk(content, readonly) : null;
    }finally{
      curTpl = forrige.tpl; curA = forrige.a; curKey = forrige.key; curSamler = forrige.samler;
    }

    // Billedstøtte (LA2u): billedernes værdier følger med, når planen gemmes
    var baseGet = f.get;
    var node = f.node;
    var get = function(){
      var ud = baseGet();
      if(samler.length){
        ud.a = ud.a || {};
        samler.forEach(function(s){
          var v = s.get();
          if(v) ud.a[s.key] = v; else delete ud.a[s.key];     // tomme billeder gemmes ikke
        });
      }
      return ud;
    };
    if(la2u) node = el('div', { class: 'la2u' }, [node]);

    if(!legacy && !ark) return { node: node, get: get };

    var dele = [node];
    if(ark) dele.push(ark.node);
    if(legacy) dele.push(legacy);
    return {
      node: el('div', { class: 'plan-form-med-ekstra' }, dele),
      get: function(){
        var ud = get();
        return ark ? ark.get(ud) : ud;
      }
    };
  }

  // ---------------------------------------------------------------
  // Perspektivvælger (Min/Din ↔ Fagprofessionel)
  // ---------------------------------------------------------------

  function perspektivVaelger(res, rows, onSkift){
    var navn = resNavn(res);
    function knap(id, tekst, maerke){
      return el('button', {
        type: 'button', class: 'segment' + (persp === id ? ' aktiv' : ''),
        'aria-pressed': persp === id ? 'true' : 'false',
        onclick: function(){
          if(persp === id) return;
          if(dirty && !window.confirm('Du har ændringer, der ikke er gemt. Vil du skifte alligevel?')) return;
          dirty = false;
          persp = id;
          onSkift();
        }
      }, [
        tekst,
        maerke ? el('span', { class: 'segment-maerke', text: maerke }) : null
      ]);
    }
    var knapper = [knap('min', navn ? genitiv(navn) + ' ord' : 'Min', res.indefra_form === 'LA2u' ? 'LA2u' : 'LA2')];
    if(visesTip(res, rows)) knapper.push(knap('tip', 'TIP · tilstræbt'));
    knapper.push(knap('fag', 'Fagprofessionel'));
    return el('div', { class: 'segmenter', role: 'group', 'aria-label': 'Perspektiv' }, knapper);
  }

  // ---------------------------------------------------------------
  // Fælles gem-logik
  // ---------------------------------------------------------------

  function fejlBesked(e){
    if(e && e.code === '23505') return 'Der findes allerede en plan her. Genindlæs siden.';
    if(e && e.message === 'KONFLIKT') return 'En anden har ændret planen, mens du arbejdede. Genindlæs siden, så du ikke overskriver deres rettelser.';
    return 'Kunne ikke gemme. Prøv igen.';
  }

  function kast(e, ctx){
    if(U().erSessionFejl(e)){ ctx.onSessionError(); return; }
    if(!(e && e.message === 'KONFLIKT')) console.error('plan:', U().fejlTekst(e));
  }

  function gemFelter(opts){
    // opts: tpl, ctx, row, content, fw, months, asDraft, title, episode_date, episode_group_id, planType
    var ctx = opts.ctx;
    var res = ctx.resident;
    var navn = ctx.name;
    var p = perspectiveValue(persp);

    if(!opts.row){
      var ny = {
        resident_id: res.resident_id,
        botilbud_id: res.botilbud_id,
        plan_type: opts.planType,
        perspective: p,
        title: opts.title,
        content: opts.content,
        filled_with: opts.fw,
        status: opts.asDraft ? 'udkast' : 'aktiv',
        review_months: opts.months,
        created_by_name: navn,
        updated_by_name: navn
      };
      if(opts.episode_date) ny.episode_date = opts.episode_date;
      if(opts.episode_group_id) ny.episode_group_id = opts.episode_group_id;
      return D.createPlan(ny).then(function(rows){ return rows[0]; });
    }

    var row = opts.row;
    var fields;
    if(opts.asDraft && row.status === 'aktiv'){
      // Den aktive version står uændret; udkastet ligger ved siden af
      var d = kopi(opts.content);
      d.fw = opts.fw;
      fields = { draft_content: d, updated_by_name: navn };
    }else if(opts.asDraft){
      fields = { content: opts.content, filled_with: opts.fw, title: opts.title, updated_by_name: navn };
    }else{
      fields = {
        content: opts.content, draft_content: null, status: 'aktiv',
        filled_with: opts.fw, review_months: opts.months, title: opts.title,
        updated_by_name: navn
      };
    }
    if(opts.episode_date) fields.episode_date = opts.episode_date;

    return D.updatePlan(row.id, fields, row.updated_at).then(function(rows){
      if(!rows.length) throw new Error('KONFLIKT');
      return rows[0];
    });
  }

  // Det der vises i formularen: udkastet hvis der er et, ellers den gemte version
  function effektivt(row){
    if(!row) return { content: {}, fw: '' };
    if(row.draft_content){
      var d = kopi(row.draft_content);
      var fw = typeof d.fw === 'string' ? d.fw : (row.filled_with || '');
      delete d.fw;
      return { content: d, fw: fw, erUdkast: true };
    }
    return { content: row.content || {}, fw: row.filled_with || '' };
  }

  // ---------------------------------------------------------------
  // Planbladets top: fasemærker, beboerens ring, plannavn og faktaboks.
  // Samme funktion i rediger og print (o.mode). I rediger sidder felterne
  // (Udfyldt …, revisionsfrist, titel/dato) som noder i faktaboksen.
  // ---------------------------------------------------------------

  var PLAN_FASE = { trivsel: 'trivsel', mestring: 'trivsel', trivselsoeer: 'trivsel', haab_droem: 'trivsel',
                    tryghed: 'tryghed', laering: 'laering' };

  var PERSP_UNDERTITEL = { min: 'Indefra-perspektiv', tip: 'Tilstræbt indefra-perspektiv (TIP)', fag: 'Udefra-perspektiv' };

  // Mørkere udgave af en #rrggbb-farve (til forbogstavet i beboerens ring)
  function moerkere(hex){
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
    if(!m) return '#1f2d2a';
    var r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4, 6), 16);
    function f(c){ var v = Math.round(c * 0.5); var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + f(r) + f(g) + f(b);
  }

  function datoMedAar(iso){
    var d = U().lokalDato(iso);
    return U().kortDato(d) + ' ' + d.getFullYear();
  }

  function byggPlanTop(o){
    var I = window.LA2Ikoner;
    var fase = PLAN_FASE[o.planType] || 'trivsel';

    var faser = el('div', { class: 'pt-faser', 'aria-label': 'Faser' });
    ['trivsel', 'tryghed', 'laering'].forEach(function(f, i){
      if(i > 0) faser.appendChild(el('span', { class: 'pt-pil', 'aria-hidden': 'true', text: '\u2192' }));
      faser.appendChild(el('span', { class: 'pt-fase pt-f-' + f + (f === fase ? ' aktiv' : '') }, [
        el('span', { class: 'pt-fase-nr', text: String(i + 1) }),
        el('span', { text: I.FASER[f].fase })
      ]));
    });

    var oeverst = el('div', { class: 'pt-oeverst' }, [
      el('div', { class: 'pt-brand' }, [
        el('span', { class: 'pt-lms', text: 'LA2' }),
        el('div', null, [
          el('div', { class: 'pt-brand-navn', text: 'Sammen om trivsel' }),
          el('div', { class: 'pt-brand-sted', text: 'Møllebakken botilbud' })
        ])
      ]),
      faser
    ]);

    var ring = el('span', { class: 'pt-ring', 'aria-hidden': 'true', text: (o.navn || '?').charAt(0).toUpperCase() });
    if(U().erFarve(o.farve)){
      ring.style.borderColor = o.farve;
      ring.style.color = moerkere(o.farve);      // forbogstavet i en mørkere udgave af farven
    }

    var ikonNode = el('span', { class: 'pt-label-ikon pt-f-' + fase });
    ikonNode.appendChild(I.ikon(I.FASER[fase].ikon, { stoerrelse: 20 }));

    var id = el('div', { class: 'pt-id' }, [
      ring,
      el('div', { class: 'pt-id-tekst' }, [
        el('div', { class: 'pt-label pt-f-' + fase }, [ikonNode, el('span', { text: (o.titel || '').replace(/ \(TIP\)$/, ' \u00b7 TIP') })]),
        el('h2', { class: 'pt-navn', text: o.navn || '' }),
        el('div', { class: 'pt-undertitel', text: PERSP_UNDERTITEL[o.persp] || '' })
      ])
    ]);

    var fakta = el('div', { class: 'pt-fakta' });
    function celle(label, node){
      fakta.appendChild(el('div', { class: 'pt-fakta-celle' }, [
        el('div', { class: 'pt-fakta-label', text: label }),
        node
      ]));
    }
    function vaerdi(tekst){
      return el('div', { class: 'pt-fakta-vaerdi', text: tekst });
    }
    function tomLinje(){
      return el('div', { class: 'pt-fakta-vaerdi' }, [el('span', { class: 'pt-fakta-streg' })]);
    }

    if(o.episode){
      celle('Episode', o.titelNode || (o.episodeTitel ? vaerdi(o.episodeTitel) : tomLinje()));
      celle('Dato for episoden', o.datoNode || (o.episodeDato ? vaerdi(datoMedAar(o.episodeDato)) : tomLinje()));
    }
    celle(o.udfyldtLabel, o.fwNode || (o.fwTekst ? vaerdi(o.fwTekst) : tomLinje()));
    if(!o.episode){
      celle('Dato', vaerdi(datoMedAar(o.opdateret || U().lokalDatoISO(new Date()))));
    }
    var versionNode = vaerdi(o.versionNr ? String(o.versionNr) : '\u2013');
    celle('Version', versionNode);

    var revision;
    if(o.monthsNode){
      revision = o.monthsNode;
    }else if(o.reviewDue){
      revision = vaerdi(datoMedAar(o.reviewDue));
    }else{
      var d = new Date();
      d.setMonth(d.getMonth() + (o.months || 3));
      revision = vaerdi(datoMedAar(U().lokalDatoISO(d)));
    }
    celle('Næste revision', revision);

    var node = el('header', { class: 'pt pt-' + (o.mode || 'rediger') }, [oeverst, id]);
    if(o.persp === 'tip'){
      node.appendChild(el('p', { class: 'tip-forklaring',
        text: 'Personalets bedste bud på ' + genitiv(o.navn || '') + ' oplevelse, ud fra iagttagelser af kropssprog, lyde og adfærd.' }));
    }
    node.appendChild(fakta);

    return {
      node: node,
      setVersion: function(nr){ versionNode.textContent = nr ? String(nr) : '\u2013'; }
    };
  }

  // Selve planens krop i den ønskede tilstand ('rediger' | 'print').
  // Print bruger NØJAGTIG de samme bygge-funktioner som rediger.
  function byggPlanKrop(tpl, key, content, mode){
    var forrige = tilstand;
    tilstand = mode === 'print' ? 'print' : 'rediger';
    try{
      var f = byggForm(tpl, key, content, tilstand === 'print');
      return el('div', { class: 'pf-krop' + (tilstand === 'print' ? ' pf' : '') }, [f.node]);
    }finally{
      tilstand = forrige;
    }
  }

  // ---------------------------------------------------------------
  // Editor: viser én plan (række) med formular, felter og knapper
  // ---------------------------------------------------------------

  function visEditor(mål, ctx, o){
    // o: tpl, planType, row, groupInfo({title,date,group}|null), vaelger, onSaved, onHistory, onArchive, onUnarchive
    var res = ctx.resident;
    var key = textKey(persp);
    formKontekst = res.indefra_form === 'LA2u' ? 'LA2u' : 'LA2';
    curResidentId = res.resident_id;
    curCtx = ctx;
    var row = o.row;
    var eff = effektivt(row);
    var arkiveret = row && row.status === 'arkiv';
    var tpl = o.tpl;
    tom(mål);
    mål.className = 'plan-kort ' + faseKlasse(o.planType);
    bredPlan(mål, tpl.kind === 'barometer' || tpl.kind === 'faser' || tpl.kind === 'mestring' || tpl.kind === 'oeer');
    mål.hidden = false;
    dirty = false;

    // ---- Felter, der sidder i planbladets faktaboks ----
    var titelInp = null, datoInp = null;
    if(o.groupInfo){
      titelInp = el('input', { type: 'text', maxlength: '120', 'aria-label': 'Titel på episoden' });
      titelInp.value = o.groupInfo.title || '';
      datoInp = el('input', { type: 'date', 'aria-label': 'Dato for episoden' });
      datoInp.value = o.groupInfo.date || '';
      if(arkiveret){ titelInp.disabled = true; datoInp.disabled = true; }
    }

    var fwInp = el('input', { type: 'text', maxlength: '300',
      placeholder: persp === 'min' ? 'Fx borgeren og kontaktpersonen' : 'Fx navne på dem, der har udfyldt planen',
      'aria-label': udfyldtLabel(persp) });
    fwInp.value = eff.fw;
    if(arkiveret) fwInp.disabled = true;

    var monthsSel = el('select', { 'aria-label': 'Næste revision (revisionsfrist)' }, [
      el('option', { value: '1', text: '1 måned' }),
      el('option', { value: '3', text: '3 måneder' }),
      el('option', { value: '6', text: '6 måneder' })
    ]);
    monthsSel.value = String(row && [1, 3, 6].indexOf(row.review_months) !== -1 ? row.review_months : 3);
    if(arkiveret) monthsSel.disabled = true;

    // ---- Menuer omkring planen (kun rediger): status og perspektiv ----
    mål.appendChild(el('div', { class: 'plan-kontrol' }, [
      statusChip(row ? row.status : null, !!(row && row.draft_content)),
      o.vaelger || null
    ]));

    if(eff.erUdkast){
      mål.appendChild(besked('', 'Du arbejder videre på et udkast. Den gemte, aktive plan er uændret, indtil du trykker Gem.'));
    }
    if(arkiveret){
      mål.appendChild(besked('', 'Planen er arkiveret og kan ikke redigeres. Brug Historik for at se eller gendanne den.'));
    }
    if(!row){
      mål.appendChild(besked('', 'Ikke oprettet endnu. Udfyld og gem for at oprette planen.'));
    }

    // ---- Planbladets top (samme funktion som i print) ----
    var titelTekst = planTitel(tpl, o.planType, persp, '');
    if(o.planType === 'mestring' && persp === 'min') titelTekst = 'Min mestringsplan for ' + resNavn(res);
    var top = byggPlanTop({
      mode: 'rediger', tpl: tpl, planType: o.planType, persp: persp, titel: titelTekst,
      navn: resNavn(res), farve: res.beboere ? res.beboere.farve : '',
      udfyldtLabel: udfyldtLabel(persp), fwNode: fwInp, monthsNode: monthsSel,
      episode: !!o.groupInfo, titelNode: titelInp, datoNode: datoInp,
      opdateret: row ? U().lokalDatoISO(new Date(row.updated_at)) : null,
      versionNr: null, reviewDue: row ? row.review_due : null
    });
    mål.appendChild(top.node);
    if(row) seneste(row.id).then(top.setVersion, function(){ /* versionsnummer er pynt */ });

    // ---- Formular ----
    var form = byggForm(tpl, key, eff.content, !!arkiveret);
    mål.appendChild(form.node);

    var status = el('div', { class: 'besked', role: 'status', hidden: true });
    mål.appendChild(status);

    function visStatus(klasse, tekst){
      status.className = 'besked ' + klasse;
      status.textContent = tekst;
      status.hidden = false;
    }

    var knapper = [];
    function laas(on){ knapper.forEach(function(k){ k.disabled = on; }); }

    function gem(asDraft){
      status.hidden = true;
      var titel = titelInp ? titelInp.value.trim() : tpl.title;
      if(o.groupInfo && !titel){ visStatus('fejl', 'Giv episoden en titel, før du gemmer.'); return; }
      if(o.groupInfo && !datoInp.value){ visStatus('fejl', 'Vælg en dato for episoden, før du gemmer.'); return; }
      laas(true);
      gemFelter({
        tpl: tpl, ctx: ctx, row: row, planType: o.planType,
        content: form.get(), fw: fwInp.value.trim(), months: Number(monthsSel.value),
        asDraft: asDraft, title: titel,
        episode_date: o.groupInfo ? datoInp.value : null,
        episode_group_id: o.groupInfo ? o.groupInfo.group : null
      }).then(function(saved){
        dirty = false;
        o.onSaved(saved, asDraft);
      }).catch(function(e){
        kast(e, ctx);
        laas(false);
        visStatus('fejl', fejlBesked(e));
      });
    }

    // ---- Arkivér / gendan (sekundære handlinger) ----
    var ekstra = el('div', { class: 'plan-ekstra' });
    if(row && !arkiveret){
      var arkivKnap = el('button', { type: 'button', class: 'knap-tekst', text: 'Arkivér', onclick: function(){
        var spoerg = row.status === 'udkast'
          ? 'Arkivér udkastet? Det kan gendannes fra Historik.'
          : 'Arkivér planen? Den kan gendannes fra Historik.';
        if(dirty) spoerg += ' Ændringer, du ikke har gemt, går tabt.';
        if(!window.confirm(spoerg)) return;
        dirty = false;
        laas(true);
        o.onArchive(row).catch(function(e){
          kast(e, ctx);
          laas(false);
          visStatus('fejl', fejlBesked(e));
        });
      } });
      knapper.push(arkivKnap);
      ekstra.appendChild(arkivKnap);
    }
    if(row && arkiveret){
      ekstra.appendChild(el('button', { type: 'button', class: 'knap', text: 'Gendan fra arkiv', onclick: function(){
        o.onUnarchive(row).catch(function(e){
          kast(e, ctx);
          visStatus('fejl', e && e.code === '23505'
            ? 'Der findes allerede en aktiv plan her. Arkivér den først.'
            : fejlBesked(e));
        });
      } }));
    }
    if(ekstra.firstChild) mål.appendChild(ekstra);

    // ---- Bund: kilde til venstre, gem-knapper til højre ----
    var bundKnapper = el('div', { class: 'plan-bund-knapper' });
    if(!arkiveret){
      var udkastKnap = el('button', { type: 'button', class: 'knap knap-lys', text: 'Gem som udkast', onclick: function(){ gem(true); } });
      var gemKnap = el('button', { type: 'button', class: 'knap', text: 'Gem', onclick: function(){ gem(false); } });
      knapper.push(udkastKnap, gemKnap);
      bundKnapper.appendChild(udkastKnap);
      bundKnapper.appendChild(gemKnap);
    }
    mål.appendChild(el('div', { class: 'plan-bund' }, [kildeFod(), bundKnapper]));

    // ---- Handlinger, som siden øverst (Print / Historik) og sidepanelet bruger ----
    var skjulEditor = function(){ mål.hidden = false; };
    function visUdskrift(autoPrint){
      var ugemt = dirty;
      var udskriv = function(nr){
        mål.hidden = true;   // editoren bevares, så ugemte ændringer ikke går tabt
        printPlan(ctx, {
          tpl: tpl, row: row, planType: o.planType, content: form.get(), fw: fwInp.value.trim(),
          months: Number(monthsSel.value),
          titel: titelInp ? titelInp.value.trim() : '', dato: datoInp ? datoInp.value : '',
          versionNr: nr, ugemt: ugemt && !!row, autoPrint: autoPrint, onClose: skjulEditor
        });
      };
      if(row) seneste(row.id).then(udskriv, function(){ udskriv(null); });
      else udskriv(null);
    }
    if(ctx.setHandlinger){
      ctx.setHandlinger({
        row: row,
        print: function(){ visUdskrift(true); },
        visUdskrift: function(){ visUdskrift(false); },
        historik: row ? function(){
          if(dirty && !window.confirm('Du har ændringer, der ikke er gemt. Vil du forlade planen?')) return;
          dirty = false;
          o.onHistory(row);
        } : null
      });
    }

    // Ændringsregistrering for alle inputfelter
    mål.addEventListener('input', markDirty);
    mål.addEventListener('change', markDirty);
  }

  // ---------------------------------------------------------------
  // Historik
  // ---------------------------------------------------------------

  function visHistorik(mål, ctx, row, tpl, tilbage, efterGendan){
    tom(mål);
    dirty = false;
    var key = textKey(perspFraRow(row));
    formKontekst = ctx.resident.indefra_form === 'LA2u' ? 'LA2u' : 'LA2';
    curResidentId = ctx.resident.resident_id;
    curCtx = ctx;

    mål.appendChild(el('div', { class: 'plan-hoved' }, [
      el('h2', { class: 'plan-titel', text: 'Historik · ' + tpl.title }),
      el('button', { type: 'button', class: 'knap knap-sekundaer', text: '← Tilbage til planen', onclick: tilbage })
    ]));

    var indhold = el('div', { class: 'indlaeser', text: 'Henter versioner…' });
    mål.appendChild(indhold);

    D.versions(row.id).then(function(vs){
      tom(indhold);
      indhold.className = 'historik-liste';
      if(!vs.length){ indhold.textContent = 'Ingen versioner endnu.'; return; }
      vs.forEach(function(v){
        var tekst = 'Version ' + v.version_no + ' · ' + datoTid(v.edited_at) + ' · ' + v.edited_by_name;
        var mærker = v.is_draft ? 'Udkast' : (v.status === 'arkiv' ? 'Arkiveret' : 'Aktiv');
        indhold.appendChild(el('div', { class: 'historik-raekke' }, [
          el('div', null, [
            el('div', { class: 'historik-tekst', text: tekst }),
            el('span', { class: 'chip chip-' + (v.is_draft ? 'udkast' : v.status), text: mærker })
          ]),
          el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Se', onclick: function(){ seVersion(v.id); } })
        ]));
      });
    }).catch(function(e){
      kast(e, ctx);
      tom(indhold);
      indhold.className = 'besked fejl';
      indhold.textContent = 'Kunne ikke hente historikken.';
    });

    function seVersion(id){
      tom(mål);
      mål.appendChild(el('div', { class: 'indlaeser', text: 'Henter version…' }));
      D.version(id).then(function(rows){
        var v = rows[0];
        if(!v) throw new Error('Version ikke fundet');
        tom(mål);
        mål.appendChild(el('div', { class: 'plan-hoved' }, [
          el('h2', { class: 'plan-titel', text: tpl.title + ' · version ' + v.version_no }),
          el('button', { type: 'button', class: 'knap knap-sekundaer', text: '← Tilbage til historik', onclick: function(){
            visHistorik(mål, ctx, row, tpl, tilbage, efterGendan);
          } })
        ]));
        mål.appendChild(besked('', 'Gemt ' + datoTid(v.edited_at) + ' af ' + v.edited_by_name + '. Det er en visning — den kan ikke redigeres.'));
        var f = byggForm(tpl, key, v.content, true);
        mål.appendChild(f.node);
        if(v.filled_with) mål.appendChild(el('p', { class: 'meta', text: udfyldtLabel(perspFraRow(row)) + ': ' + v.filled_with }));

        var status = el('div', { class: 'besked', role: 'status', hidden: true });
        mål.appendChild(status);
        var gendan = el('button', { type: 'button', class: 'knap', text: 'Gendan denne version', onclick: function(){
          if(!window.confirm('Gendan version ' + v.version_no + '? Det gemmes som en ny version, og den nuværende version bevares i historikken.')) return;
          gendan.disabled = true;
          // Frisk række, så den optimistiske lås passer
          D.plansForResident(ctx.resident.resident_id, row.plan_type).then(function(rs){
            var frisk = rs.filter(function(r){ return r.id === row.id; })[0];
            if(!frisk) throw new Error('Plan ikke fundet');
            return D.updatePlan(frisk.id, {
              content: v.content, draft_content: null, status: 'aktiv',
              filled_with: v.filled_with || '', updated_by_name: ctx.name
            }, frisk.updated_at);
          }).then(function(rows2){
            if(!rows2.length) throw new Error('KONFLIKT');
            efterGendan(rows2[0]);
          }).catch(function(e){
            kast(e, ctx);
            gendan.disabled = false;
            status.className = 'besked fejl';
            status.textContent = (e && e.code === '23505')
              ? 'Der findes allerede en aktiv plan her. Arkivér den først.'
              : fejlBesked(e);
            status.hidden = false;
          });
        } });
        var printVersion = el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Print denne version', onclick: function(){
          mål.hidden = true;
          printPlan(ctx, {
            tpl: tpl, row: row, content: v.content, fw: v.filled_with || '',
            titel: v.title || '', dato: row.episode_date || '', versionNr: v.version_no, ugemt: false,
            onClose: function(){ mål.hidden = false; }
          });
        } });
        mål.appendChild(el('div', { class: 'handlinger' }, [gendan, printVersion]));
        mål.appendChild(kildeFod());
      }).catch(function(e){
        kast(e, ctx);
        tom(mål);
        mål.appendChild(besked('fejl', 'Kunne ikke hente versionen.'));
      });
    }
  }

  // ---------------------------------------------------------------
  // Standard-faner (Trivsel, Tryghed, Mestring, Håb og drømme)
  // ---------------------------------------------------------------

  function visStandardFane(mål, ctx, tab){
    var tpl = T.plans[tab];
    var res = ctx.resident;
    tom(mål);
    mål.appendChild(el('div', { class: 'indlaeser', text: 'Henter plan…' }));
    if(ctx.setHandlinger) ctx.setHandlinger(null);

    D.plansForResident(res.resident_id, tab).then(function(rows){
      if(persp === 'tip' && !visesTip(res, rows)) persp = 'min';
      var levende = rows.filter(function(r){ return r.status !== 'arkiv'; });
      var arkiv = rows.filter(function(r){ return r.status === 'arkiv'; });
      var row = rowFor(levende, persp);

      tom(mål);
      var vaelger = perspektivVaelger(res, rows, function(){ visStandardFane(mål, ctx, tab); });
      var plads = el('div', { class: 'plan-plads' });
      mål.appendChild(plads);

      function genindlaes(){
        if(ctx.onGemt) ctx.onGemt();
        visStandardFane(mål, ctx, tab);
      }

      visEditor(plads, ctx, {
        tpl: tpl, planType: tab, row: row, groupInfo: null, vaelger: vaelger,
        onSaved: function(saved, asDraft){ genindlaes(); },
        onHistory: function(r){
          visHistorik(plads, ctx, r, tpl, genindlaes, function(){ genindlaes(); });
        },
        onArchive: function(r){
          return D.updatePlan(r.id, { status: 'arkiv', updated_by_name: ctx.name }, r.updated_at).then(function(rs){
            if(!rs.length) throw new Error('KONFLIKT');
            genindlaes();
          });
        },
        onUnarchive: function(r){ return Promise.resolve(); }
      });

      var arkivP = arkiv.filter(function(r){ return r.perspective === perspectiveValue(persp); });
      if(arkivP.length){
        var lst = el('div', { class: 'historik-liste' });
        arkivP.forEach(function(r){
          lst.appendChild(el('div', { class: 'historik-raekke' }, [
            el('div', { class: 'historik-tekst', text: 'Arkiveret ' + datoTid(r.updated_at) + ' · ' + r.updated_by_name }),
            el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Åbn historik', onclick: function(){
              visHistorik(plads, ctx, r, tpl, genindlaes, function(){ genindlaes(); });
            } })
          ]));
        });
        mål.appendChild(el('details', { class: 'boks' }, [
          el('summary', { text: 'Arkiverede planer (' + arkivP.length + ')' }),
          lst
        ]));
      }
    }).catch(function(e){
      kast(e, ctx);
      tom(mål);
      mål.appendChild(besked('fejl', 'Kunne ikke hente planen. Prøv igen om lidt.'));
    });
  }

  // ---------------------------------------------------------------
  // Læring: liste over episoder + "Ny episode"
  // ---------------------------------------------------------------

  function visLaeringListe(mål, ctx, aabenForm){
    var res = ctx.resident;
    tom(mål);
    mål.appendChild(el('div', { class: 'indlaeser', text: 'Henter læringsplaner…' }));
    if(ctx.setHandlinger) ctx.setHandlinger(null);

    D.plansForResident(res.resident_id, 'laering', false).then(function(rows){
      var grupper = {};
      rows.forEach(function(r){
        var g = r.episode_group_id || r.id;
        if(!grupper[g]) grupper[g] = { group: g, rows: [] };
        grupper[g].rows.push(r);
      });
      var liste = Object.keys(grupper).map(function(k){ return grupper[k]; });
      liste.forEach(function(g){
        var f = g.rows[0];
        g.title = f.title; g.date = f.episode_date;
        g.arkiveret = g.rows.every(function(r){ return r.status === 'arkiv'; });
        g.updated = g.rows.reduce(function(a, r){ return a > r.updated_at ? a : r.updated_at; }, '');
      });
      liste.sort(function(a, b){ return (b.date || '').localeCompare(a.date || ''); });

      tom(mål);

      // Ny episode
      var formBoks = el('div', { class: 'boks', hidden: !aabenForm });
      var titelInp = el('input', { type: 'text', maxlength: '120', 'aria-label': 'Titel' });
      var datoInp = el('input', { type: 'date', 'aria-label': 'Dato' });
      datoInp.value = lokalIdag();
      var fejl = el('div', { class: 'besked fejl', role: 'alert', hidden: true });
      var opret = el('button', { type: 'button', class: 'knap', text: 'Opret episode' });
      opret.addEventListener('click', function(){
        var titel = titelInp.value.trim();
        fejl.hidden = true;
        if(!titel || !datoInp.value){
          fejl.textContent = 'Skriv en titel og vælg en dato.';
          fejl.hidden = false;
          return;
        }
        opret.disabled = true;
        var gruppe = nyUuid();
        D.createPlan({
          resident_id: res.resident_id, botilbud_id: res.botilbud_id,
          plan_type: 'laering', perspective: 'min',
          title: titel, episode_date: datoInp.value, episode_group_id: gruppe,
          content: {}, status: 'udkast',
          created_by_name: ctx.name, updated_by_name: ctx.name
        }).then(function(){
          persp = 'min';
          ctx.go('#/beboer/' + res.resident_id + '/laering/' + gruppe);
        }).catch(function(e){
          kast(e, ctx);
          opret.disabled = false;
          fejl.textContent = 'Kunne ikke oprette episoden. Prøv igen.';
          fejl.hidden = false;
        });
      });
      formBoks.appendChild(el('label', { class: 'felt' }, [el('span', { text: 'Titel på episoden' }), titelInp]));
      formBoks.appendChild(el('label', { class: 'felt' }, [el('span', { text: 'Dato' }), datoInp]));
      formBoks.appendChild(fejl);
      formBoks.appendChild(opret);

      var nyKnap = el('button', { type: 'button', class: 'knap', text: '+ Ny episode', onclick: function(){
        formBoks.hidden = !formBoks.hidden;
        if(!formBoks.hidden) titelInp.focus();
      } });

      mål.appendChild(el('div', { class: 'plan-hoved' }, [
        el('h2', { class: 'plan-titel', text: 'Læringsplaner' }),
        nyKnap
      ]));
      mål.appendChild(formBoks);
      if(aabenForm) titelInp.focus();

      if(!liste.length){
        mål.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen læringsplaner endnu. Opret en ny episode, når der har været en voldsom episode.' }));
      }

      liste.forEach(function(g){
        var chips = g.rows.map(function(r){
          var navn = perspNavn(perspFraRow(r));
          var s = r.status === 'aktiv' ? 'aktiv' : (r.status === 'udkast' ? 'udkast' : 'arkiveret');
          return el('span', { class: 'chip chip-' + (r.status) , text: navn + ' · ' + s });
        });
        var dato = g.date ? U().kortDato(U().lokalDato(g.date)) + ' ' + U().lokalDato(g.date).getFullYear() : '';
        mål.appendChild(el('a', {
          class: 'episode-kort' + (g.arkiveret ? ' arkiveret' : ''),
          href: '#/beboer/' + res.resident_id + '/laering/' + g.group
        }, [
          el('div', { class: 'episode-titel', text: g.title || 'Uden titel' }),
          el('div', { class: 'episode-meta', text: dato + (g.arkiveret ? ' · arkiveret' : '') }),
          el('div', { class: 'chips' }, chips)
        ]));
      });
    }).catch(function(e){
      kast(e, ctx);
      tom(mål);
      mål.appendChild(besked('fejl', 'Kunne ikke hente læringsplanerne. Prøv igen om lidt.'));
    });
  }

  // ---------------------------------------------------------------
  // Læring: én episode (to perspektiv-rækker med samme episode_group_id)
  // ---------------------------------------------------------------

  function spoergOpdatering(mål, ctx, groupId){
    if(promptedGroups[groupId]) return false;
    promptedGroups[groupId] = true;
    var res = ctx.resident;
    tom(mål);
    mål.appendChild(besked('ok', 'Læringsplanen er gemt.'));
    mål.appendChild(el('div', { class: 'boks' }, [
      el('h2', { text: 'Opdatér planerne?' }),
      el('p', { text: 'Skal Trivselsplan eller Tryghedsplan opdateres på baggrund af denne læring?' }),
      el('div', { class: 'handlinger' }, [
        el('a', { class: 'knap', href: '#/beboer/' + res.resident_id + '/trivsel', text: 'Åbn Trivselsplan' }),
        el('a', { class: 'knap', href: '#/beboer/' + res.resident_id + '/tryghed', text: 'Åbn Tryghedsplan' }),
        el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Nej tak, tilbage til episoden', onclick: function(){
          visEpisode(mål, ctx, groupId);
        } })
      ])
    ]));
    return true;
  }

  function visEpisode(mål, ctx, groupId){
    var res = ctx.resident;
    var tpl = T.plans.laering;
    tom(mål);
    mål.appendChild(el('div', { class: 'indlaeser', text: 'Henter episode…' }));
    if(ctx.setHandlinger) ctx.setHandlinger(null);

    D.planGroup(groupId).then(function(rows){
      if(!rows.length){
        tom(mål);
        mål.appendChild(besked('fejl', 'Episoden blev ikke fundet.'));
        return;
      }
      if(rows[0].resident_id !== res.resident_id){
        tom(mål);
        mål.appendChild(besked('fejl', 'Episoden hører til en anden beboer.'));
        return;
      }
      if(persp === 'tip' && !visesTip(res, rows)) persp = 'min';
      var row = rowFor(rows, persp);
      var any = rows[0];

      tom(mål);
      mål.appendChild(el('a', { class: 'tilbage', href: '#/beboer/' + res.resident_id + '/laering', text: '← Alle læringsplaner' }));
      var vaelger = perspektivVaelger(res, rows, function(){ visEpisode(mål, ctx, groupId); });
      var plads = el('div', { class: 'plan-plads' });
      mål.appendChild(plads);

      function genindlaes(){
        if(ctx.onGemt) ctx.onGemt();
        visEpisode(mål, ctx, groupId);
      }

      // Hold titel/dato ens på søsterrækken
      function synkSoester(saved){
        var ops = rows.filter(function(andet){
          return andet.id !== saved.id &&
                 (andet.title !== saved.title || andet.episode_date !== saved.episode_date);
        }).map(function(andet){
          return D.updatePlan(andet.id, { title: saved.title, episode_date: saved.episode_date, updated_by_name: ctx.name }, andet.updated_at);
        });
        return Promise.all(ops).then(function(){ return null; });
      }

      visEditor(plads, ctx, {
        tpl: tpl, planType: 'laering', row: row,
        groupInfo: { title: any.title, date: any.episode_date, group: groupId },
        vaelger: vaelger,
        onSaved: function(saved, asDraft){
          synkSoester(saved).catch(function(){ /* søster-sync er bedste bud */ }).then(function(){
            if(!asDraft && spoergOpdatering(mål, ctx, groupId)) return;
            genindlaes();
          });
        },
        onHistory: function(r){
          visHistorik(plads, ctx, r, tpl, genindlaes, function(){ genindlaes(); });
        },
        onArchive: function(r){
          // Hele episoden arkiveres (begge perspektiver)
          var ops = rows.filter(function(x){ return x.status !== 'arkiv'; }).map(function(x){
            return D.updatePlan(x.id, { status: 'arkiv', updated_by_name: ctx.name }, x.updated_at);
          });
          return Promise.all(ops).then(function(rs){
            if(rs.some(function(r2){ return !r2.length; })) throw new Error('KONFLIKT');
            ctx.go('#/beboer/' + res.resident_id + '/laering');
          });
        },
        onUnarchive: function(r){
          var ops = rows.filter(function(x){ return x.status === 'arkiv'; }).map(function(x){
            return D.updatePlan(x.id, { status: 'aktiv', updated_by_name: ctx.name }, x.updated_at);
          });
          return Promise.all(ops).then(function(rs){
            if(rs.some(function(r2){ return !r2.length; })) throw new Error('KONFLIKT');
            genindlaes();
          });
        }
      });
    }).catch(function(e){
      kast(e, ctx);
      tom(mål);
      mål.appendChild(besked('fejl', 'Kunne ikke hente episoden. Prøv igen om lidt.'));
    });
  }

  // ---------------------------------------------------------------
  // Udskrift (selve visningen ligger i la2-print.js)
  // ---------------------------------------------------------------

  function printPlan(ctx, o){
    // o: tpl, row, planType, content, fw, months, onClose, titel, dato, versionNr, ugemt, autoPrint
    var res = ctx.resident;
    var row = o.row;
    formKontekst = res.indefra_form === 'LA2u' ? 'LA2u' : 'LA2';
    curResidentId = res.resident_id;
    var pp = row ? perspFraRow(row) : persp;
    var planType = (row && row.plan_type) || o.planType;
    var statusTekst = '';
    if(row){
      statusTekst = row.status === 'aktiv' ? (row.draft_content ? 'Aktiv · udkast i gang' : 'Aktiv') :
        (row.status === 'udkast' ? 'Udkast' : 'Arkiveret');
    }else{
      statusTekst = 'Ikke gemt endnu';
    }
    var versionTekst = o.versionNr ? 'Version ' + o.versionNr : 'Ikke gemt endnu';
    if(o.ugemt) versionTekst += ' (med ugemte ændringer)';

    var navn = res.beboere ? res.beboere.navn : 'Ukendt';
    var titel = planTitel(o.tpl, planType, pp, '');
    if(planType === 'mestring' && pp === 'min') titel = 'Min mestringsplan for ' + navn;

    window.LA2Print.open({
      tpl: o.tpl,
      planType: planType,
      persp: pp,
      key: textKey(pp),
      content: o.content,
      residentName: navn,
      residentColor: res.beboere ? res.beboere.farve : '',
      titel: titel,
      perspektivLabel: pp === 'fag' ? 'Fagprofessionel' : (pp === 'tip' ? 'Din (TIP)' : 'Min'),
      udfyldtLabel: udfyldtLabel(pp),
      statusTekst: statusTekst,
      filledWith: o.fw,
      episodeTitle: o.titel,
      episodeDate: o.dato,
      versionNr: o.versionNr,
      versionTekst: versionTekst,
      updatedAt: row ? U().lokalDatoISO(new Date(row.updated_at)) : null,
      reviewDue: row ? row.review_due : null,
      months: o.months || (row ? row.review_months : 3),
      userName: ctx.name
    }, o.onClose, { autoPrint: !!o.autoPrint });
  }

  function seneste(rowId){
    return D.versions(rowId).then(function(vs){ return vs.length ? vs[0].version_no : null; });
  }

  // ---------------------------------------------------------------
  // Indgang
  // ---------------------------------------------------------------

  // Brede planer (barometer) får hele bredden; sidepanelet rykker under planen
  function bredPlan(node, bred){
    var grid = node.closest ? node.closest('.beboer-grid') : null;
    if(grid) grid.classList.toggle('beboer-grid-bred', !!bred);
  }

  function renderTab(mål, ctx, tab, groupId){
    dirty = false;
    bredPlan(mål, false);
    if(tab === 'laering'){
      if(groupId === 'ny') visLaeringListe(mål, ctx, true);
      else if(groupId) visEpisode(mål, ctx, groupId);
      else visLaeringListe(mål, ctx, false);
    }else{
      visStandardFane(mål, ctx, tab);
    }
  }

  return {
    svgEl: svgEl,
    tegnKurve: tegnKurve,
    tegnAffektKurve: tegnAffektKurve,
    byggPlanTop: byggPlanTop,
    byggPlanKrop: byggPlanKrop,
    renderTab: renderTab,
    // Bruges af Sammenlign: "Opdatér plan →" åbner den fagprofessionelle plan
    saetPerspektiv: function(v){ persp = (v === 'fag') ? 'fag' : (v === 'tip' ? 'tip' : 'min'); },
    variantTekst: variantTekst,
    isDirty: function(){ return dirty; },
    clearDirty: function(){ dirty = false; }
  };
})();
