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
  var persp = 'borger';          // 'borger' | 'fag' — huskes mens siden er åben
  var promptedGroups = {};       // læringsplaner der allerede har vist "opdatér planer?"

  function U(){ return window.LA2Util; }
  function el(tag, props, kids){ return U().el(tag, props, kids); }

  // ---------------------------------------------------------------
  // Hjælpere
  // ---------------------------------------------------------------

  function borgerKey(variant){ return variant === 'LA2u' ? 'din' : 'min'; }
  function borgerLabel(variant){ return variant === 'LA2u' ? 'Din' : 'Min'; }

  function resNavn(res){ return res.beboere ? res.beboere.navn : ''; }

  // Lars' / Louies
  function genitiv(n){ return /[sxz]$/i.test(n) ? n + "'" : n + 's'; }

  // Hvilken fase-farve en plantype tegnes i (mestring og håb hører til forebyggelse)
  function faseKlasse(planType){
    if(planType === 'tryghed') return 'plan-tryghed';
    if(planType === 'laering') return 'plan-laering';
    return 'plan-trivsel';
  }

  function planTitel(tpl, planType, key, erFag, episodeTitel){
    if(planType === 'haab_droem'){
      if(erFag) return 'Håb og drømme (fagprofessionel)';
      return (key === 'din' ? 'Dine' : 'Mine') + ' håb og drømme';
    }
    var t = erFag ? tpl.title + ' (fagprofessionel)' : (key === 'din' ? 'Din ' : 'Min ') + tpl.title;
    if(planType === 'laering' && episodeTitel) t += ': ' + episodeTitel;
    return t;
  }

  function textKey(variant, p){
    return p === 'fag' ? 'fag' : borgerKey(variant);
  }

  function perspectiveValue(variant, p){
    return p === 'fag' ? 'fagprofessionel' : borgerKey(variant);
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
    var items = Array.isArray(vaerdi) ? vaerdi.slice()
      : (typeof vaerdi === 'string' && vaerdi.trim() ? [vaerdi.trim()] : []);   // ældre planer gemte tekst
    if(!items.length) items.push('');
    var liste = el('div', { class: 'liste-rækker' });
    var wrap = el('div', { class: 'felt liste-felt' }, [el('span', { class: 'felt-label' + (skjulLabel ? ' sr-kun' : ''), text: label }), liste]);

    function tilfoej(v){
      // Selvudvidende felt, så lange punkter ikke afkortes
      var inp = el('textarea', { rows: '1', maxlength: '500', 'aria-label': label, class: 'liste-punkt' });
      inp.value = v || '';
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
            if(!liste.firstChild) tilfoej('');
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
        onclick: function(){ tilfoej(''); markDirty(); }
      }));
    }
    return {
      node: wrap,
      get: function(){
        var out = [];
        liste.querySelectorAll('textarea').forEach(function(i){
          var v = i.value.trim();
          if(v) out.push(v);
        });
        return out;
      }
    };
  }

  function felt(q, label, vaerdi, readonly){
    return q.type === 'list' ? listeFelt(label, vaerdi, readonly) : tekstFelt(label, vaerdi, readonly);
  }

  // ---------------------------------------------------------------
  // Formular: standard-planer og tryghedsplan
  // Returnerer { node, get(): content }
  // ---------------------------------------------------------------

  // Tryghedsplanen som barometer: tre kolonner (1 Grøn, 2 Gul, 3 Rød)
  function byggBarometer(tpl, key, content, readonly){
    var a = (content && content.a) || {};
    var wrap = el('div', { class: 'barometer' });
    var felter = [];

    tpl.sections.forEach(function(sec, i){
      var standard = T.tekst(sec.headline, key) || '';
      var gemt = a[sec.id + '.headline'];
      var hl = el('textarea', {
        rows: '1', class: 'baro-overskrift', maxlength: '80',
        'aria-label': 'Overskrift for niveau ' + (i + 1) + ', ' + sec.levelLabel
      });
      hl.value = (typeof gemt === 'string' && gemt.trim()) ? gemt : standard;
      if(readonly) hl.disabled = true;
      hl.addEventListener('input', function(){ autoHoejde(hl); });
      hl.addEventListener('keydown', function(ev){
        if(ev.key === 'Enter') ev.preventDefault();
      });
      setTimeout(function(){ autoHoejde(hl); }, 0);
      // Gem kun en rettet overskrift; standardteksten følger perspektiv og variant
      felter.push({ key: sec.id + '.headline', get: function(){
        var v = hl.value.trim();
        return v === standard ? '' : v;
      } });

      var kol = el('section', { class: 'baro-kol baro-' + sec.level });
      kol.appendChild(el('div', { class: 'baro-hoved' }, [
        el('span', { class: 'baro-nr', text: String(i + 1) }),
        el('div', { class: 'baro-hoved-tekst' }, [
          el('div', { class: 'baro-navn', text: sec.levelLabel }),
          hl
        ])
      ]));

      sec.questions.forEach(function(q){
        var label = T.tekst(q.text, key);
        if(!label) return;
        var nøgle = sec.id + '.' + q.id;
        var f = listeFelt(label, a[nøgle], readonly, true);
        felter.push({ key: nøgle, get: f.get });
        kol.appendChild(el('div', { class: 'baro-gruppe' }, [
          el('div', { class: 'baro-gruppe-navn', text: q.gruppe || '' }),
          el('div', { class: 'baro-hint', text: label }),
          f.node
        ]));
      });
      wrap.appendChild(kol);
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

  function byggStandardForm(tpl, key, content, readonly){
    if(tpl.kind === 'tryghed') return byggBarometer(tpl, key, content, readonly);
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
        var f = felt(q, label, a[nøgle], readonly);
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
    [['Dagene før', pl, 'start'], ['Episoden', W / 2, 'middle'], ['Efter', W - pr, 'end']].forEach(function(l){
      var tt = svgEl('text', { x: l[1], y: H - 10, 'text-anchor': l[2], 'font-size': 14, 'font-weight': 700, fill: '#5a6b66' });
      tt.textContent = l[0];
      svg.appendChild(tt);
    });
  }

  function byggKurve(curve, gemt, readonly){
    var vaerdier = [];
    curve.points.forEach(function(p, i){
      var v = gemt && gemt[i];
      vaerdier.push(typeof v === 'number' && v >= curve.min && v <= curve.max ? v : null);
    });

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
          knapper.appendChild(el('button', {
            type: 'button', 'data-i': String(i), 'data-v': String(vv), text: String(vv),
            disabled: readonly ? true : null,
            'aria-label': p.label + ': ' + vv,
            onclick: function(){
              vaerdier[i] = (vaerdier[i] === vv) ? null : vv;   // tryk igen = fjern
              markDirty();
              opdater();
            }
          }));
        })(v);
      }
      rækkeNoder.appendChild(el('div', { class: 'kurve-kolonne' }, [
        knapper,
        el('div', { class: 'kurve-etiket', text: p.label })
      ]));
    });

    var node = el('section', { class: 'plan-sektion kurve' }, [
      el('h3', { class: 'sektion-titel', text: curve.title }),
      el('p', { class: 'kurve-hint', text: curve.hint }),
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
          var cellInd = [el('div', { class: 'celle-kolonne', text: col.label })];
          qs.forEach(function(q){
            var nøgle = row.id + '.' + q.id + '.' + col.id;
            var f = felt(q, T.tekst(q.text, key), a[nøgle], readonly);
            felter.push({ key: nøgle, get: f.get });
            cellInd.push(f.node);
          });
          celler.push(el('div', { class: 'laering-celle' }, cellInd));
        });
      }else{
        var enkelt = [];
        qs.forEach(function(q){
          var nøgle = row.id + '.' + q.id;
          var f = felt(q, T.tekst(q.text, key), a[nøgle], readonly);
          felter.push({ key: nøgle, get: f.get });
          enkelt.push(f.node);
        });
        celler.push(el('div', { class: 'laering-celle bred' }, enkelt));
      }

      wrap.appendChild(el('section', { class: 'plan-sektion laering-raekke' }, [
        el('h3', { class: 'sektion-titel', text: row.heading }),
        el('div', { class: 'laering-celler' + (row.perColumn ? '' : ' en-kolonne') }, celler)
      ]));
    });

    var kurve = byggKurve(tpl.curve, content && content.curve, readonly);
    wrap.appendChild(kurve.node);

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

  function byggForm(tpl, key, content, readonly){
    if(tpl.kind === 'laering') return byggLaeringForm(tpl, key, content, readonly);
    return byggStandardForm(tpl, key, content, readonly);
  }

  // ---------------------------------------------------------------
  // Perspektivvælger (Min/Din ↔ Fagprofessionel)
  // ---------------------------------------------------------------

  function perspektivVaelger(variant, onSkift, navn){
    function knap(id, tekst){
      return el('button', {
        type: 'button', class: 'segment' + (persp === id ? ' aktiv' : ''), text: tekst,
        'aria-pressed': persp === id ? 'true' : 'false',
        onclick: function(){
          if(persp === id) return;
          if(dirty && !window.confirm('Du har ændringer, der ikke er gemt. Vil du skifte alligevel?')) return;
          dirty = false;
          persp = id;
          onSkift();
        }
      });
    }
    var borgerTekst = navn ? genitiv(navn) + ' ord' : borgerLabel(variant);
    return el('div', { class: 'segmenter', role: 'group', 'aria-label': 'Perspektiv' }, [
      knap('borger', borgerTekst),
      knap('fag', 'Fagprofessionel')
    ]);
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
    var p = perspectiveValue(res.variant, persp);

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
  // Editor: viser én plan (række) med formular, felter og knapper
  // ---------------------------------------------------------------

  function visEditor(mål, ctx, o){
    // o: tpl, planType, row, groupInfo({title,date,group}|null), vaelger, onSaved, onHistory, onArchive, onUnarchive
    var res = ctx.resident;
    var key = textKey(res.variant, persp);
    var row = o.row;
    var eff = effektivt(row);
    var arkiveret = row && row.status === 'arkiv';
    var tpl = o.tpl;
    var erFag = persp === 'fag';

    tom(mål);
    mål.className = 'plan-kort ' + faseKlasse(o.planType);
    mål.hidden = false;
    dirty = false;

    // ---- Hoved: titel, status, meta og perspektivvælger ----
    var metaP = el('p', { class: 'plan-meta' });
    function skrivMeta(versionNr){
      var dele = [];
      if(row){
        if(eff.fw) dele.push('Udfyldt sammen med ' + eff.fw);
        var d = new Date(row.updated_at);
        dele.push(U().kortDato(d) + ' ' + d.getFullYear());
        if(versionNr) dele.push('version ' + versionNr);
      }else{
        dele.push('Ikke oprettet endnu. Udfyld og gem for at oprette planen.');
      }
      metaP.textContent = dele.join(' · ');
    }
    skrivMeta(null);
    if(row) seneste(row.id).then(skrivMeta, function(){ /* versionsnummer er pynt */ });

    var titelTekst = planTitel(tpl, o.planType, key, erFag, o.groupInfo ? o.groupInfo.title : '');
    mål.appendChild(el('div', { class: 'plan-kort-hoved' }, [
      el('div', { class: 'plan-kort-titelboks' }, [
        el('div', { class: 'plan-kort-linje' }, [
          el('h2', { class: 'plan-titel', text: titelTekst }),
          statusChip(row ? row.status : null, !!(row && row.draft_content))
        ]),
        metaP
      ]),
      o.vaelger || null
    ]));

    if(eff.erUdkast){
      mål.appendChild(besked('', 'Du arbejder videre på et udkast. Den gemte, aktive plan er uændret, indtil du trykker Gem.'));
    }
    if(arkiveret){
      mål.appendChild(besked('', 'Planen er arkiveret og kan ikke redigeres. Brug Historik for at se eller gendanne den.'));
    }

    // ---- Titel/dato (kun læringsplan) ----
    var titelInp = null, datoInp = null;
    if(o.groupInfo){
      titelInp = el('input', { type: 'text', maxlength: '120', 'aria-label': 'Titel' });
      titelInp.value = o.groupInfo.title || '';
      datoInp = el('input', { type: 'date', 'aria-label': 'Dato for episoden' });
      datoInp.value = o.groupInfo.date || '';
      if(arkiveret){ titelInp.disabled = true; datoInp.disabled = true; }
      mål.appendChild(el('div', { class: 'plan-felter' }, [
        el('label', { class: 'felt' }, [el('span', { text: 'Titel på episoden' }), titelInp]),
        el('label', { class: 'felt' }, [el('span', { text: 'Dato' }), datoInp])
      ]));
    }

    // ---- Formular ----
    var form = byggForm(tpl, key, eff.content, !!arkiveret);
    mål.appendChild(form.node);

    var fwInp = el('input', { type: 'text', maxlength: '300', placeholder: 'Fx borgeren og kontaktpersonen', 'aria-label': 'Udfyldt sammen med' });
    fwInp.value = eff.fw;
    if(arkiveret) fwInp.disabled = true;

    var monthsSel = el('select', { 'aria-label': 'Revisionsfrist' }, [
      el('option', { value: '1', text: '1 måned' }),
      el('option', { value: '3', text: '3 måneder' }),
      el('option', { value: '6', text: '6 måneder' })
    ]);
    monthsSel.value = String(row && [1, 3, 6].indexOf(row.review_months) !== -1 ? row.review_months : 3);
    if(arkiveret) monthsSel.disabled = true;

    mål.appendChild(el('div', { class: 'plan-felter' }, [
      el('label', { class: 'felt' }, [el('span', { text: 'Udfyldt sammen med' }), fwInp]),
      el('label', { class: 'felt' }, [el('span', { text: 'Revideres senest efter' }), monthsSel])
    ]));

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
    if(ctx.setHandlinger){
      ctx.setHandlinger({
        row: row,
        print: function(){
          var ugemt = dirty;
          var udskriv = function(nr){
            mål.hidden = true;   // editoren bevares, så ugemte ændringer ikke går tabt
            printPlan(ctx, {
              tpl: tpl, row: row, content: form.get(), fw: fwInp.value.trim(),
              titel: titelInp ? titelInp.value.trim() : '', dato: datoInp ? datoInp.value : '',
              versionNr: nr, ugemt: ugemt && !!row, onClose: skjulEditor
            });
          };
          if(row) seneste(row.id).then(udskriv, function(){ udskriv(null); });
          else udskriv(null);
        },
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
    var key = textKey(ctx.resident.variant, row.perspective === 'fagprofessionel' ? 'fag' : 'borger');

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
        if(v.filled_with) mål.appendChild(el('p', { class: 'meta', text: 'Udfyldt sammen med: ' + v.filled_with }));

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
      var levende = rows.filter(function(r){ return r.status !== 'arkiv'; });
      var arkiv = rows.filter(function(r){ return r.status === 'arkiv'; });
      var row = null;
      if(persp === 'fag'){
        row = levende.filter(function(r){ return r.perspective === 'fagprofessionel'; })[0] || null;
      }else{
        row = levende.filter(function(r){ return r.perspective !== 'fagprofessionel'; })[0] || null;
      }

      tom(mål);
      var vaelger = perspektivVaelger(res.variant, function(){ visStandardFane(mål, ctx, tab); }, resNavn(res));
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

      var arkivP = arkiv.filter(function(r){
        return persp === 'fag' ? r.perspective === 'fagprofessionel' : r.perspective !== 'fagprofessionel';
      });
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
          plan_type: 'laering', perspective: borgerKey(res.variant),
          title: titel, episode_date: datoInp.value, episode_group_id: gruppe,
          content: {}, status: 'udkast',
          created_by_name: ctx.name, updated_by_name: ctx.name
        }).then(function(){
          persp = 'borger';
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
          var navn = r.perspective === 'fagprofessionel' ? 'Fagprofessionel' : borgerLabel(res.variant);
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
      var borgerRow = rows.filter(function(r){ return r.perspective !== 'fagprofessionel'; })[0] || null;
      var fagRow = rows.filter(function(r){ return r.perspective === 'fagprofessionel'; })[0] || null;
      var row = persp === 'fag' ? fagRow : borgerRow;
      var any = rows[0];

      tom(mål);
      mål.appendChild(el('a', { class: 'tilbage', href: '#/beboer/' + res.resident_id + '/laering', text: '← Alle læringsplaner' }));
      var vaelger = perspektivVaelger(res.variant, function(){ visEpisode(mål, ctx, groupId); }, resNavn(res));
      var plads = el('div', { class: 'plan-plads' });
      mål.appendChild(plads);

      function genindlaes(){
        if(ctx.onGemt) ctx.onGemt();
        visEpisode(mål, ctx, groupId);
      }

      // Hold titel/dato ens på søsterrækken
      function synkSoester(saved){
        var andet = (saved.perspective === 'fagprofessionel') ? borgerRow : fagRow;
        if(!andet) return Promise.resolve();
        if(andet.title === saved.title && andet.episode_date === saved.episode_date) return Promise.resolve();
        return D.updatePlan(andet.id, { title: saved.title, episode_date: saved.episode_date, updated_by_name: ctx.name }, andet.updated_at)
          .then(function(){ return null; });
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
    // o: tpl, row, content, fw, onClose, titel, dato, versionNr
    var res = ctx.resident;
    var row = o.row;
    var erFag = row ? row.perspective === 'fagprofessionel' : persp === 'fag';
    var statusTekst = '';
    if(row){
      statusTekst = row.status === 'aktiv' ? (row.draft_content ? 'Aktiv · udkast i gang' : 'Aktiv') :
        (row.status === 'udkast' ? 'Udkast' : 'Arkiveret');
    }else{
      statusTekst = 'Ikke gemt endnu';
    }
    var versionTekst = o.versionNr ? 'Version ' + o.versionNr : 'Ikke gemt endnu';
    if(o.ugemt) versionTekst += ' (med ugemte ændringer)';

    window.LA2Print.open({
      tpl: o.tpl,
      key: erFag ? 'fag' : textKey(res.variant, 'borger'),
      content: o.content,
      residentName: res.beboere ? res.beboere.navn : 'Ukendt',
      residentColor: res.beboere ? res.beboere.farve : '',
      perspektivLabel: erFag ? 'Fagprofessionel' : borgerLabel(res.variant),
      statusTekst: statusTekst,
      filledWith: o.fw,
      episodeTitle: o.titel,
      episodeDate: o.dato,
      versionTekst: versionTekst,
      userName: ctx.name
    }, o.onClose);
  }

  function seneste(rowId){
    return D.versions(rowId).then(function(vs){ return vs.length ? vs[0].version_no : null; });
  }

  // ---------------------------------------------------------------
  // Indgang
  // ---------------------------------------------------------------

  function renderTab(mål, ctx, tab, groupId){
    dirty = false;
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
    renderTab: renderTab,
    isDirty: function(){ return dirty; },
    clearDirty: function(){ dirty = false; }
  };
})();
