// ==================================================================
// LA2 — Overblik, Episoder og Revision.
//
// Regler: ingen template literals, ingen innerHTML med data, browserens
// lokale tid, polling styres af la2-app.js (hvert 60. sekund). Intet
// planindhold gemmes eller logges. Til kurverne hentes KUN kurve-tallene
// (content->curve), og de bruges kun til at tegne sparklinen.
//
// Hver vis*()-funktion tegner siden og returnerer { opdater }, som kaldes
// af pollingen.
// ==================================================================
window.LA2Overblik = (function(){
  'use strict';

  var D = window.LA2Data;
  var I = window.LA2Ikoner;

  var REVIDER_DAGE = 14;

  var UGEDAGE = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  var MAANEDER = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august',
    'september', 'oktober', 'november', 'december'];
  var TAL = ['nul', 'én', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti'];

  var FASE_RAEKKER = ['trivsel', 'tryghed', 'laering'];

  function U(){ return window.LA2Util; }
  function el(tag, props, kids){ return U().el(tag, props, kids); }

  // ---------------------------------------------------------------
  // Hjælpere
  // ---------------------------------------------------------------

  function nu(){ return new Date(); }

  function dageTil(isoDato, iDag){
    return U().dageMellem(iDag, U().lokalDato(isoDato));   // positiv = i fremtiden
  }

  function kortDato(d){ return d.getDate() + '. ' + MAANEDER[d.getMonth()].slice(0, 3) + (d.getMonth() === 4 ? '' : '.'); }

  function langDato(d){ return d.getDate() + '. ' + MAANEDER[d.getMonth()]; }

  function hilsen(d){
    var t = d.getHours();
    if(t < 12) return 'God morgen';
    if(t < 18) return 'God eftermiddag';
    return 'God aften';
  }

  function stort(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

  function tal(n){ return n >= 0 && n <= 10 ? TAL[n] : String(n); }

  function erFarve(s){ return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s); }

  function avatar(navn, farve, stoerrelse){
    var a = el('span', { class: 'avatar avatar-' + stoerrelse, text: navn ? navn.charAt(0) : '' });
    a.setAttribute('aria-hidden', 'true');
    a.style.background = erFarve(farve) ? farve : '#374151';
    return a;
  }

  function badge(type, tekst){
    return el('span', { class: 'badge badge-' + type, text: tekst });
  }

  function faseIkon(planType, stoerrelse){
    var f = I.FASER[planType];
    var boks = el('span', { class: 'fase-ikon fase-' + planType });
    boks.appendChild(I.ikon(f.ikon, { stoerrelse: stoerrelse || 20 }));
    return boks;
  }

  // ---------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------

  function hentAlt(){
    var i90 = new Date();
    i90.setDate(i90.getDate() - 90);
    return Promise.all([
      D.residents(),
      D.screenFeed(),
      D.plansMeta(),
      D.laeringKurver(U().lokalDatoISO(i90))
    ]).then(function(r){
      return { residents: r[0], feed: r[1], meta: r[2], kurver: r[3] };
    });
  }

  // Samler alt pr. beboer og de tal der vises øverst
  function byg(data, tidspunkt){
    var iDag = new Date(tidspunkt.getFullYear(), tidspunkt.getMonth(), tidspunkt.getDate());
    var graense24 = new Date(tidspunkt.getTime() - 24 * 3600000);
    var graense7 = new Date(tidspunkt.getTime() - 7 * 86400000);
    var graense30 = new Date(iDag.getFullYear(), iDag.getMonth(), iDag.getDate() - 30);

    var model = { beboere: [], skalRevurderes: 0, nyeLaering: 0, aktive: 0 };
    var nyeGrupper = {};
    var aktiveGrupper = {};
    var revNoegler = {};
    var aktivNoegler = {};

    data.residents.forEach(function(r){
      var navn = r.beboere ? r.beboere.navn : 'Ukendt';
      var farve = r.beboere ? r.beboere.farve : '';
      var rid = r.resident_id;
      var feed = data.feed.filter(function(f){ return f.resident_name === navn; });
      var udkast = data.meta.filter(function(p){ return p.resident_id === rid && p.status === 'udkast'; });
      var b = { r: r, navn: navn, farve: farve, rid: rid, rader: {}, kurve: [] };

      // Trivsel + Tryghed
      ['trivsel', 'tryghed'].forEach(function(type){
        var rows = feed.filter(function(f){ return f.plan_type === type; });
        var rad;
        if(rows.length){
          var frist = rows.map(function(x){ return x.review_due; }).filter(Boolean).sort()[0];
          var sidst = rows.reduce(function(a, x){
            var t = new Date(x.last_active_at || x.updated_at);
            return t > a ? t : a;
          }, new Date(0));
          var dage = frist ? dageTil(frist, iDag) : null;
          rad = { type: type, aktiv: true, frist: frist, dage: dage, sidst: sidst };
          if(dage !== null && dage < 0){
            rad.badge = badge('over', 'Frist overskredet');
            rad.tilstand = 'over';
          }else if(dage !== null && dage <= REVIDER_DAGE){
            rad.badge = badge('snart', dage === 0 ? 'I dag' : 'Om ' + dage + (dage === 1 ? ' dag' : ' dage'));
            rad.tilstand = 'snart';
          }else if(sidst >= graense24){
            rad.badge = badge('ny', U().dageMellem(sidst, tidspunkt) === 0 ? 'Opdateret i dag' : 'Opdateret i går');
            rad.tilstand = 'ny';
          }else{
            rad.badge = badge('ok', 'Opdateret ' + kortDato(sidst));
            rad.tilstand = 'ok';
          }
          aktivNoegler[navn + ':' + type] = true;
          if(dage !== null && dage <= REVIDER_DAGE) revNoegler[navn + ':' + type] = true;
        }else if(udkast.some(function(p){ return p.plan_type === type; })){
          rad = { type: type, aktiv: false, badge: badge('ingen', 'Kun udkast'), tilstand: 'ingen' };
        }else{
          rad = { type: type, aktiv: false, badge: badge('ingen', 'Ingen'), tilstand: 'ingen' };
        }
        b.rader[type] = rad;
      });

      // Læring
      var lrows = feed.filter(function(f){ return f.plan_type === 'laering'; });
      var grupper = {};
      lrows.forEach(function(f){
        var g = f.episode_group_id || f.plan_id;
        var e = grupper[g];
        var oprettet = new Date(f.created_at);
        if(!e) e = grupper[g] = { dato: f.episode_date, oprettet: oprettet };
        if(oprettet < e.oprettet) e.oprettet = oprettet;
        aktiveGrupper[g] = true;
        if(oprettet >= graense7) nyeGrupper[g] = true;
      });
      var liste = Object.keys(grupper).map(function(k){ return grupper[k]; });
      var seneste30 = liste.filter(function(e){ return e.dato && U().lokalDato(e.dato) >= graense30; }).length;
      var nyeste = liste.reduce(function(a, e){ return !a || e.oprettet > a.oprettet ? e : a; }, null);
      var lrad;
      if(nyeste && nyeste.oprettet >= graense24){
        lrad = { type: 'laering', aktiv: true, tilstand: 'ny',
                 badge: badge('ny', U().dageMellem(nyeste.oprettet, tidspunkt) === 0 ? 'Ny i dag' : 'Ny i går') };
      }else if(seneste30 > 0){
        lrad = { type: 'laering', aktiv: true, tilstand: 'ok', badge: badge('ok', seneste30 + ' · seneste 30 dage') };
      }else{
        lrad = { type: 'laering', aktiv: false, tilstand: 'ingen',
                 badge: badge('ingen', udkast.some(function(p){ return p.plan_type === 'laering'; }) ? 'Kun udkast' : 'Ingen') };
      }
      b.rader.laering = lrad;
      b.antal30 = seneste30;

      // Sparkline-data: højeste kurveværdi pr. episode (90 dage)
      var pr = {};
      data.kurver.filter(function(k){ return k.resident_id === rid; }).forEach(function(k){
        if(!Array.isArray(k.curve) || !k.episode_date) return;
        var vaerdier = k.curve.filter(function(v){ return typeof v === 'number'; });
        if(!vaerdier.length) return;
        var hoj = Math.max.apply(null, vaerdier);
        var g = k.episode_group_id || k.episode_date;
        if(!pr[g] || hoj > pr[g].v) pr[g] = { dato: k.episode_date, v: hoj };
      });
      b.kurve = Object.keys(pr).map(function(k){ return pr[k]; })
        .sort(function(x, y){ return x.dato < y.dato ? -1 : 1; });

      model.beboere.push(b);
    });

    model.skalRevurderes = Object.keys(revNoegler).length;
    model.nyeLaering = Object.keys(nyeGrupper).length;
    model.aktive = Object.keys(aktivNoegler).length + Object.keys(aktiveGrupper).length;
    return model;
  }

  function sammenfatning(m){
    if(m.aktive === 0) return 'Der er endnu ingen aktive planer.';
    if(m.skalRevurderes === 0) return 'Alle planer er opdaterede.';
    var n = m.skalRevurderes;
    var s = stort(tal(n)) + (n === 1 ? ' plan venter' : ' planer venter') + ' på at blive revurderet.';
    if(n < m.aktive) s += ' Resten er opdateret.';
    return s;
  }

  // ---------------------------------------------------------------
  // Sparkline (SVG, i beboerens farve)
  // ---------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs){
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    return n;
  }

  function sparkline(punkter, farve, tidspunkt){
    var W = 150, H = 40, pl = 4, pr = 4, pt = 5, pb = 5;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sparkline', role: 'img',
      'aria-label': 'Affekt i episoder de sidste 90 dage' });
    var stroke = erFarve(farve) ? farve : '#374151';

    svg.appendChild(svgEl('line', { x1: pl, x2: W - pr, y1: H - pb, y2: H - pb, stroke: '#cdd5d0', 'stroke-width': 1 }));

    var start = new Date(tidspunkt.getFullYear(), tidspunkt.getMonth(), tidspunkt.getDate() - 90).getTime();
    var slut = new Date(tidspunkt.getFullYear(), tidspunkt.getMonth(), tidspunkt.getDate()).getTime();
    function x(p){
      var t = U().lokalDato(p.dato).getTime();
      var f = (t - start) / (slut - start);
      if(f < 0) f = 0;
      if(f > 1) f = 1;
      return pl + f * (W - pl - pr);
    }
    function y(p){
      var v = Math.max(1, Math.min(5, p.v));
      return pt + (5 - v) * (H - pt - pb) / 4;
    }

    if(punkter.length > 1){
      svg.appendChild(svgEl('polyline', {
        points: punkter.map(function(p){ return x(p).toFixed(1) + ',' + y(p).toFixed(1); }).join(' '),
        fill: 'none', stroke: stroke, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }
    punkter.forEach(function(p){
      svg.appendChild(svgEl('circle', { cx: x(p).toFixed(1), cy: y(p).toFixed(1), r: 3, fill: stroke }));
    });
    return svg;
  }

  // ---------------------------------------------------------------
  // Overblik
  // ---------------------------------------------------------------

  function statFelt(klasse, tal_, label){
    return el('div', { class: 'stat ' + klasse }, [
      el('div', { class: 'stat-tal', text: String(tal_) }),
      el('div', { class: 'stat-label', text: label })
    ]);
  }

  function faseLinje(){
    var rod = el('div', { class: 'faselinje', role: 'group', 'aria-label': 'De tre faser' });
    rod.appendChild(el('span', { class: 'faselinje-label', text: 'De tre faser' }));
    ['trivsel', 'tryghed', 'laering'].forEach(function(t, i){
      var f = I.FASER[t];
      if(i > 0) rod.appendChild(el('span', { class: 'faselinje-pil', 'aria-hidden': 'true', text: '→' }));
      rod.appendChild(el('span', { class: 'faselinje-fase fase-' + t }, [
        faseIkon(t, 18),
        el('span', { class: 'faselinje-tekst' }, [
          el('strong', { text: f.fase }),
          ' · ' + f.plan
        ])
      ]));
    });
    return rod;
  }

  function beboerKort(b, tidspunkt){
    var kontakt = (b.r.contact_persons || '').trim();

    var hoved = el('div', { class: 'kort-top' }, [
      avatar(b.navn, b.farve, 48),
      el('div', { class: 'kort-navne' }, [
        el('div', { class: 'kort-navn', text: b.navn }),
        kontakt ? el('div', { class: 'kort-kontakt', text: 'Kontakt: ' + kontakt }) : null
      ]),
      el('span', { class: 'variant-maerke', text: (b.r.indefra_form === 'LA2u' ? 'LA2u' : 'LA2') + (b.r.bruger_tip ? ' + TIP' : '') })
    ]);

    var raekker = el('div', { class: 'fase-raekker' });
    FASE_RAEKKER.forEach(function(t){
      var f = I.FASER[t];
      var rad = b.rader[t];
      raekker.appendChild(el('div', { class: 'fase-raekke' }, [
        faseIkon(t, 20),
        el('span', { class: 'fase-raekke-navn', text: f.planTekst }),
        rad.badge
      ]));
    });

    var bund = el('div', { class: 'kort-bund' });
    var kurveBoks = el('div', { class: 'kurve-boks' });
    if(b.kurve.length){
      kurveBoks.appendChild(sparkline(b.kurve, b.farve, tidspunkt));
      kurveBoks.appendChild(el('div', { class: 'kurve-tekst', text: 'Affekt i episoder (90 dage)' }));
    }else{
      kurveBoks.appendChild(el('div', { class: 'kurve-tekst kurve-tom', text: 'Ingen episoder de sidste 90 dage' }));
    }
    bund.appendChild(kurveBoks);
    bund.appendChild(el('span', { class: 'aabn', text: 'Åbn →' }));

    return el('a', { class: 'beboer-kort', href: '#/beboer/' + b.rid }, [hoved, raekker, bund]);
  }

  // ---------------------------------------------------------------
  // Mobil: hero, "Kræver opmærksomhed" og beboerliste
  // ---------------------------------------------------------------

  var KORT_BOKS = { trivsel: 'T', tryghed: 'Tr', laering: 'L' };
  var KORT_NAVN = { trivsel: 'Trivsel', tryghed: 'Tryghed', laering: 'Læring' };
  var BESTEMT = { trivsel: 'Trivselsplanen', tryghed: 'Tryghedsplanen' };

  function mobilOverblik(m, t, ctx){
    var wrap = el('div', { class: 'overblik-mobil' });

    // ---- Hero (mørkegrøn flade med afrundede hjørner forneden) ----
    var avatarKnap = el('button', {
      type: 'button', class: 'hero-avatar', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      'aria-label': 'Dig: ' + ctx.name + '. Åbn menu'
    }, [el('span', { class: 'avatar avatar-guld avatar-48', text: ctx.name ? ctx.name.charAt(0) : '' })]);

    var menu = el('div', { class: 'bruger-menu', hidden: true, role: 'menu' }, [
      el('button', { type: 'button', role: 'menuitem', class: 'bruger-menu-knap', text: 'Skift navn',
        onclick: function(){ menu.hidden = true; ctx.skiftNavn(); } }),
      el('button', { type: 'button', role: 'menuitem', class: 'bruger-menu-knap', text: 'Log ud',
        onclick: function(){ menu.hidden = true; ctx.logUd(); } })
    ]);
    avatarKnap.addEventListener('click', function(){
      menu.hidden = !menu.hidden;
      avatarKnap.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });

    wrap.appendChild(el('header', { class: 'mobil-hero' }, [
      el('div', { class: 'mobil-hero-top' }, [
        el('div', { class: 'mobil-brand' }, [
          el('span', { class: 'brand-maerke', 'aria-hidden': 'true', text: 'LA2' }),
          el('span', { class: 'brand-titel', text: 'Sammen om trivsel' })
        ]),
        el('div', { class: 'mobil-bruger' }, [avatarKnap, menu])
      ]),
      el('div', { class: 'mobil-dato', text: UGEDAGE[t.getDay()] + ' ' + langDato(t) }),
      el('h1', { class: 'mobil-hej', text: 'Hej ' + ctx.name })
    ]));

    // ---- Kræver opmærksomhed (ligger halvt ovenpå hero) ----
    var poster = [];
    m.beboere.forEach(function(b){
      ['trivsel', 'tryghed'].forEach(function(type){
        var rad = b.rader[type];
        if(rad && rad.aktiv && (rad.tilstand === 'over' || rad.tilstand === 'snart')){
          poster.push({ b: b, type: type, rad: rad });
        }
      });
    });
    poster.sort(function(a, c){ return a.rad.dage - c.rad.dage; });   // mest overskredne først

    var opm = el('section', { class: 'opm-kort', 'aria-label': 'Kræver opmærksomhed' }, [
      el('h2', { class: 'opm-titel', text: 'Kræver opmærksomhed' })
    ]);
    if(!poster.length){
      opm.appendChild(el('p', { class: 'opm-tom', text: 'Alle planer er opdaterede ✓' }));
    }else{
      poster.forEach(function(p){
        var over = p.rad.tilstand === 'over';
        var tag = el('span', { class: 'la2-tag', text: p.b.navn });
        if(erFarve(p.b.farve)) tag.style.background = p.b.farve;
        var dage = p.rad.dage;
        var tekst = BESTEMT[p.type] + ' skal revurderes';
        if(!over) tekst += dage === 0 ? ' i dag' : ' om ' + dage + (dage === 1 ? ' dag' : ' dage');
        opm.appendChild(el('a', {
          class: 'opm-post ' + (over ? 'opm-over' : 'opm-snart'),
          href: '#/beboer/' + p.b.rid + '/' + p.type
        }, [
          tag,
          el('span', { class: 'opm-tekst', text: tekst }),
          over ? el('span', { class: 'opm-flag', text: 'Over' }) : null
        ]));
      });
    }
    wrap.appendChild(opm);

    // ---- Beboerliste ----
    var sektion = el('section', { class: 'mobil-beboere' }, [
      el('h2', { class: 'mobil-beboere-titel', text: 'Beboere' }),
      el('p', { class: 'mobil-forklaring', text: 'T = Trivsel · Tr = Tryghed · L = Læring' })
    ]);
    if(!m.beboere.length){
      sektion.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen beboere er sat op til LA2 endnu.' }));
    }
    m.beboere.forEach(function(b){
      var under = [(b.r.indefra_form === 'LA2u' ? 'LA2u' : 'LA2') + (b.r.bruger_tip ? ' + TIP' : '')];
      if(b.rader.laering.tilstand === 'ny') under.push('ny læringsplan');
      else if(b.rader.trivsel.tilstand === 'ny' || b.rader.tryghed.tilstand === 'ny') under.push('opdateret i dag');

      var firkanter = el('span', { class: 'status-firkanter' });
      ['trivsel', 'tryghed', 'laering'].forEach(function(type){
        var rad = b.rader[type];
        var tekst = rad.badge ? rad.badge.textContent : '';
        firkanter.appendChild(el('span', {
          class: 'status-firkant status-' + rad.tilstand,
          text: KORT_BOKS[type],
          title: KORT_NAVN[type] + ': ' + tekst,
          'aria-label': KORT_NAVN[type] + ': ' + tekst
        }));
      });

      sektion.appendChild(el('a', { class: 'mobil-beboer', href: '#/beboer/' + b.rid }, [
        avatar(b.navn, b.farve, 34),
        el('span', { class: 'mobil-beboer-tekst' }, [
          el('span', { class: 'mobil-beboer-navn', text: b.navn }),
          el('span', { class: 'mobil-beboer-under', text: under.join(' · ') })
        ]),
        firkanter,
        el('span', { class: 'mobil-pil', 'aria-hidden': 'true', text: '›' })
      ]));
    });
    wrap.appendChild(sektion);

    return wrap;
  }

  function overblik(ctx){
    var maal = el('div', { id: 'overblikIndhold', class: 'indlaeser', text: 'Henter planer…' });
    ctx.visIRod(el('div', { class: 'overblik' }, [maal]));

    function tegn(data){
      var t = nu();
      var m = byg(data, t);

      var d = t;
      var datoLabel = UGEDAGE[d.getDay()] + ' ' + langDato(d);

      var venstre = el('div', { class: 'velkomst-tekst' }, [
        el('div', { class: 'eyebrow', text: datoLabel }),
        el('h1', { class: 'velkomst-titel', text: hilsen(d) + ', ' + ctx.name }),
        el('p', { class: 'velkomst-under', text: sammenfatning(m) })
      ]);

      var stat = el('div', { class: 'stat-raekke' }, [
        statFelt(m.skalRevurderes > 0 ? 'stat-nu' : 'stat-ro', m.skalRevurderes, 'Skal revurderes'),
        statFelt('stat-laering', m.nyeLaering, 'Nye læringsplaner'),
        statFelt('stat-trivsel', m.aktive, 'Aktive planer')
      ]);

      var gitter = el('div', { class: 'kort-gitter' });
      if(!m.beboere.length){
        gitter = el('p', { class: 'tom-tilstand', text: 'Ingen beboere er sat op til LA2 endnu.' });
      }else{
        m.beboere.forEach(function(b){ gitter.appendChild(beboerKort(b, t)); });
      }

      var rod = document.getElementById('overblikIndhold');
      if(!rod) return;
      while(rod.firstChild) rod.removeChild(rod.firstChild);
      rod.className = '';
      // PC/tablet og mobil tegnes begge; CSS viser den rigtige (under 760 px = mobil)
      rod.appendChild(el('div', { class: 'overblik-desktop' }, [
        el('section', { class: 'velkomst' }, [venstre, stat]),
        faseLinje(),
        gitter
      ]));
      rod.appendChild(mobilOverblik(m, t, ctx));
    }

    function opdater(){
      return hentAlt().then(tegn).catch(function(e){
        if(U().erSessionFejl(e)){ ctx.onSessionError(); return; }
        console.error('overblik:', U().fejlTekst(e));
        var rod = document.getElementById('overblikIndhold');
        if(rod && rod.className === 'indlaeser'){
          rod.className = 'besked fejl';
          rod.textContent = 'Kunne ikke hente planerne. Prøver igen om et øjeblik.';
        }
      });
    }

    opdater();
    return { opdater: opdater };
  }

  // ---------------------------------------------------------------
  // Episoder: alle læringsplaner på tværs af beboere, nyeste først
  // ---------------------------------------------------------------

  function episoder(ctx){
    var maal = el('div', { id: 'episodeIndhold', class: 'indlaeser', text: 'Henter episoder…' });
    ctx.visIRod(el('div', null, [
      el('h1', { class: 'side-titel', text: 'Episoder' }),
      el('p', { class: 'side-under', text: 'Alle læringsplaner, nyeste episode først.' }),
      maal
    ]));

    function tegn(data){
      var t = nu();
      var iDag = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      var farver = {};
      var navne = {};
      data.residents.forEach(function(r){
        farver[r.resident_id] = r.beboere ? r.beboere.farve : '';
        navne[r.resident_id] = r.beboere ? r.beboere.navn : 'Ukendt';
      });

      var grupper = {};
      data.meta.filter(function(p){ return p.plan_type === 'laering'; }).forEach(function(p){
        var g = p.episode_group_id || p.id;
        if(!grupper[g]) grupper[g] = { rid: p.resident_id, titel: p.title, dato: p.episode_date, group: g, rows: [] };
        grupper[g].rows.push(p);
      });
      var liste = Object.keys(grupper).map(function(k){ return grupper[k]; });
      liste.sort(function(a, b){ return (b.dato || '').localeCompare(a.dato || ''); });

      var rod = document.getElementById('episodeIndhold');
      if(!rod) return;
      while(rod.firstChild) rod.removeChild(rod.firstChild);
      rod.className = '';

      if(!liste.length){
        rod.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen episoder endnu.' }));
        return;
      }

      var ul = el('div', { class: 'liste' });
      liste.forEach(function(g){
        var dato = g.dato ? U().lokalDato(g.dato) : null;
        var nyligt = g.rows.some(function(p){ return new Date(p.created_at) >= new Date(t.getTime() - 24 * 3600000); });
        var aktiv = g.rows.some(function(p){ return p.status === 'aktiv'; });
        var chips = g.rows.map(function(p){
          var navn = p.perspective === 'fagprofessionel' ? 'Fagprofessionel' : (p.perspective === 'din' ? 'TIP' : 'Min');
          return el('span', { class: 'chip chip-' + p.status, text: navn + ' · ' + (p.status === 'aktiv' ? 'aktiv' : 'udkast') });
        });
        var alder = dato ? U().dageMellem(dato, iDag) : -1;
        var alderTekst = alder === 0 ? 'i dag' : (alder === 1 ? 'i går' : alder + ' dage siden');
        var undertekst = dato
          ? stort(UGEDAGE[dato.getDay()]) + ' ' + langDato(dato) + ' ' + dato.getFullYear() +
            (alder >= 0 ? ' · ' + alderTekst : '')
          : '';
        ul.appendChild(el('a', { class: 'liste-post', href: '#/beboer/' + g.rid + '/laering/' + g.group }, [
          avatar(navne[g.rid], farver[g.rid], 34),
          el('div', { class: 'liste-tekst' }, [
            el('div', { class: 'liste-titel', text: g.titel || 'Uden titel' }),
            el('div', { class: 'liste-under', text: (navne[g.rid] || '') + ' · ' + undertekst })
          ]),
          el('div', { class: 'liste-hoejre' }, [
            nyligt ? badge('ny', 'Ny') : null,
            aktiv ? null : badge('ingen', 'Kun udkast'),
            el('div', { class: 'chips' }, chips)
          ])
        ]));
      });
      rod.appendChild(ul);
    }

    function opdater(){
      return Promise.all([D.residents(), D.plansMeta()]).then(function(r){
        tegn({ residents: r[0], meta: r[1] });
      }).catch(function(e){
        if(U().erSessionFejl(e)){ ctx.onSessionError(); return; }
        console.error('episoder:', U().fejlTekst(e));
        var rod = document.getElementById('episodeIndhold');
        if(rod && rod.className === 'indlaeser'){
          rod.className = 'besked fejl';
          rod.textContent = 'Kunne ikke hente episoderne. Prøver igen om et øjeblik.';
        }
      });
    }

    opdater();
    return { opdater: opdater };
  }

  // ---------------------------------------------------------------
  // Revision: alle planer med frist, mest overskredne først
  // ---------------------------------------------------------------

  var TAB_FOR = { trivsel: 'trivsel', tryghed: 'tryghed', mestring: 'mestring', trivselsoeer: 'trivselsoeer', haab_droem: 'haab_droem' };
  var PLAN_TEKST = { trivsel: 'Trivselsplan', tryghed: 'Tryghedsplan', mestring: 'Mestringsplan', trivselsoeer: 'Trivselsøer', haab_droem: 'Håb og drømme' };

  function revision(ctx){
    var maal = el('div', { id: 'revisionIndhold', class: 'indlaeser', text: 'Henter planer…' });
    ctx.visIRod(el('div', null, [
      el('h1', { class: 'side-titel', text: 'Revision' }),
      el('p', { class: 'side-under', text: 'Alle planer sorteret efter revisionsfrist. Fristen flytter sig selv, når planen gemmes.' }),
      maal
    ]));

    function tegn(data){
      var t = nu();
      var iDag = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      var res = {};
      data.residents.forEach(function(r){ res[r.beboere ? r.beboere.navn : ''] = r; });

      var grupper = {};
      data.feed.forEach(function(f){
        if(f.plan_type === 'laering' || !f.review_due) return;
        var k = f.resident_name + ':' + f.plan_type;
        var g = grupper[k];
        if(!g || f.review_due < g.frist) grupper[k] = { f: f, frist: f.review_due };
      });
      var liste = Object.keys(grupper).map(function(k){ return grupper[k]; });
      liste.sort(function(a, b){ return a.frist < b.frist ? -1 : (a.frist > b.frist ? 1 : 0); });

      var rod = document.getElementById('revisionIndhold');
      if(!rod) return;
      while(rod.firstChild) rod.removeChild(rod.firstChild);
      rod.className = '';

      if(!liste.length){
        rod.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen aktive planer med revisionsfrist endnu.' }));
        return;
      }

      var ul = el('div', { class: 'liste' });
      liste.forEach(function(g){
        var f = g.f;
        var r = res[f.resident_name];
        var dage = dageTil(g.frist, iDag);
        var frist = U().lokalDato(g.frist);
        var b;
        if(dage < 0) b = badge('over', 'Frist overskredet · ' + (-dage) + (dage === -1 ? ' dag' : ' dage'));
        else if(dage <= REVIDER_DAGE) b = badge('snart', dage === 0 ? 'I dag' : 'Om ' + dage + (dage === 1 ? ' dag' : ' dage'));
        else b = badge('ok', 'Om ' + dage + ' dage');

        var ikon = I.FASER[f.plan_type] ? faseIkon(f.plan_type, 20) : null;
        var raekke = el('a', {
          class: 'liste-post',
          href: r ? '#/beboer/' + r.resident_id + '/' + (TAB_FOR[f.plan_type] || 'trivsel') : '#/'
        }, [
          avatar(f.resident_name, f.resident_color, 34),
          el('div', { class: 'liste-tekst' }, [
            el('div', { class: 'liste-titel' }, [
              ikon,
              el('span', { text: (PLAN_TEKST[f.plan_type] || 'Plan') + ' · ' + f.resident_name })
            ]),
            el('div', { class: 'liste-under', text: 'Frist ' + UGEDAGE[frist.getDay()] + ' ' + langDato(frist) + ' ' + frist.getFullYear() })
          ]),
          el('div', { class: 'liste-hoejre' }, [b])
        ]);
        ul.appendChild(raekke);
      });
      rod.appendChild(ul);
    }

    function opdater(){
      return Promise.all([D.residents(), D.screenFeed()]).then(function(r){
        tegn({ residents: r[0], feed: r[1] });
      }).catch(function(e){
        if(U().erSessionFejl(e)){ ctx.onSessionError(); return; }
        console.error('revision:', U().fejlTekst(e));
        var rod = document.getElementById('revisionIndhold');
        if(rod && rod.className === 'indlaeser'){
          rod.className = 'besked fejl';
          rod.textContent = 'Kunne ikke hente planerne. Prøver igen om et øjeblik.';
        }
      });
    }

    opdater();
    return { opdater: opdater };
  }

  return { overblik: overblik, episoder: episoder, revision: revision };
})();
