// ==================================================================
// "Om LA2" — siden der forklarer LA2 for personalet.
// Teksterne ligger i om-la2.js. Diagrammerne er inline SVG (ingen
// biblioteker) med role="img" og en aria-label.
//
// Regler: ingen template literals, ingen innerHTML med data, DOM-metoder.
// ==================================================================
window.LA2Om = (function(){
  'use strict';

  var I = window.LA2Ikoner;
  var NS = 'http://www.w3.org/2000/svg';

  function U(){ return window.LA2Util; }
  function el(tag, props, kids){ return U().el(tag, props, kids); }

  function svg(tag, attrs, kids){
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function(c){ if(c) n.appendChild(c); });
    return n;
  }

  function svgTekst(x, y, tekst, attrs){
    var t = svg('text', Object.assign({ x: x, y: y, 'text-anchor': 'middle' }, attrs || {}));
    t.textContent = tekst;
    return t;
  }

  // Ikon-stier tegnet inde i et SVG ved given position/størrelse
  function ikonIdiagram(navn, cx, cy, stoerrelse, farve){
    var skala = stoerrelse / 24;
    var g = svg('g', {
      transform: 'translate(' + (cx - stoerrelse / 2) + ' ' + (cy - stoerrelse / 2) + ') scale(' + skala + ')',
      fill: 'none', stroke: farve, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    I.stier(navn).forEach(function(d){ g.appendChild(svg('path', { d: d })); });
    return g;
  }

  function sektion(klasse, overskrift, under, boern){
    var s = el('section', { class: 'om-sektion ' + (klasse || '') }, [
      el('h2', { class: 'om-h2', text: overskrift })
    ]);
    if(under) s.appendChild(el('p', { class: 'om-under', text: under }));
    (boern || []).forEach(function(b){ if(b) s.appendChild(b); });
    return s;
  }

  // ---------------------------------------------------------------
  // 2. Faserne som kredsløb
  // ---------------------------------------------------------------

  var FASE_FARVE = {
    trivsel: { farve: '#2f6b4f', lys: '#dcebe2' },
    tryghed: { farve: '#8a6212', lys: '#f6ead2' },
    laering: { farve: '#34507a', lys: '#e2e8f2' }
  };

  function kredsloeb(T){
    var s = svg('svg', {
      viewBox: '0 0 600 350', class: 'om-svg', role: 'img', 'aria-label': T.faser.diagramBeskrivelse
    });

    // Pilehoved
    s.appendChild(svg('defs', null, [
      svg('marker', { id: 'omPil', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, [
        svg('path', { d: 'M1 1l8 4-8 4z', fill: '#5a6b66' })
      ])
    ]));

    var pos = {
      trivsel: { x: 300, y: 70 },
      tryghed: { x: 485, y: 250 },
      laering: { x: 115, y: 250 }
    };

    // Pile mellem faserne (cirkel: 1 → 2 → 3 → 1)
    [
      'M352 98 Q452 128 470 188',
      'M425 292 Q300 340 175 292',
      'M130 188 Q148 128 248 98'
    ].forEach(function(d){
      s.appendChild(svg('path', { d: d, fill: 'none', stroke: '#5a6b66', 'stroke-width': 3, 'stroke-linecap': 'round', 'marker-end': 'url(#omPil)' }));
    });

    s.appendChild(svgTekst(300, 215, T.faser.cyklus, { 'font-size': 14, 'font-weight': 800, fill: '#8d9a95', 'letter-spacing': '2' }));

    ['trivsel', 'tryghed', 'laering'].forEach(function(t){
      var f = I.FASER[t];
      var p = pos[t];
      var c = FASE_FARVE[t];
      s.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 50, fill: c.lys, stroke: c.farve, 'stroke-width': 3 }));
      s.appendChild(ikonIdiagram(f.ikon, p.x, p.y, 40, c.farve));
      // Label: ved siden af toppen, under de nederste
      var ly = t === 'trivsel' ? p.y + 78 : p.y + 72;
      s.appendChild(svgTekst(p.x, ly, f.nr + ' · ' + f.fase, { 'font-size': 15, 'font-weight': 800, fill: c.farve }));
      s.appendChild(svgTekst(p.x, ly + 18, f.plan, { 'font-size': 13, 'font-weight': 600, fill: '#16211f' }));
    });

    return s;
  }

  function faseKort(T, t){
    var f = I.FASER[t];
    var c = FASE_FARVE[t];
    var ikon = el('span', { class: 'fase-ikon fase-' + t });
    ikon.appendChild(I.ikon(f.ikon, { stoerrelse: 24 }));
    var kort = el('div', { class: 'om-fase-kort fase-' + t }, [
      ikon,
      el('div', { class: 'om-fase-label', text: f.nr + ' · ' + f.fase }),
      el('div', { class: 'om-fase-plan', text: f.plan }),
      el('p', { class: 'om-fase-tekst', text: T.faser[t]['sætning'] })
    ]);
    kort.style.setProperty('--fk', c.farve);
    return kort;
  }

  // ---------------------------------------------------------------
  // 3. Perspektiver
  // ---------------------------------------------------------------

  function perspektivDiagram(T){
    var s = svg('svg', {
      viewBox: '0 0 600 230', class: 'om-svg', role: 'img', 'aria-label': T.perspektiver.diagramBeskrivelse
    });
    s.appendChild(svg('defs', null, [
      svg('marker', { id: 'omPil2', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto' }, [
        svg('path', { d: 'M1 1l8 4-8 4z', fill: '#1e3937' })
      ])
    ]));

    // Person i midten
    s.appendChild(svg('circle', { cx: 300, cy: 78, r: 24, fill: '#e3e8e3', stroke: '#1e3937', 'stroke-width': 3 }));
    s.appendChild(svg('path', { d: 'M248 190 C248 140 352 140 352 190 Z', fill: '#e3e8e3', stroke: '#1e3937', 'stroke-width': 3 }));

    // Indefra: pil fra personens indre og ud
    s.appendChild(svg('path', { d: 'M282 150 Q215 120 140 112', fill: 'none', stroke: '#1e3937', 'stroke-width': 3, 'stroke-linecap': 'round', 'marker-end': 'url(#omPil2)' }));
    s.appendChild(svgTekst(100, 100, 'Indefra', { 'font-size': 15, 'font-weight': 800, fill: '#1e3937' }));
    s.appendChild(svgTekst(100, 120, '"Min"', { 'font-size': 13, fill: '#5a6b66' }));

    // Tilstræbt indefra: stiplet pil fra personalet og ind mod personen
    s.appendChild(svg('path', { d: 'M470 80 Q400 90 340 140', fill: 'none', stroke: '#1e3937', 'stroke-width': 3, 'stroke-dasharray': '7 6', 'stroke-linecap': 'round', 'marker-end': 'url(#omPil2)' }));
    s.appendChild(svgTekst(520, 70, 'Tilstræbt indefra', { 'font-size': 15, 'font-weight': 800, fill: '#1e3937' }));
    s.appendChild(svgTekst(520, 90, '"Din" (TIP)', { 'font-size': 13, fill: '#5a6b66' }));

    // Udefra: pil udefra mod personen
    s.appendChild(svg('path', { d: 'M470 205 Q410 205 358 185', fill: 'none', stroke: '#1e3937', 'stroke-width': 3, 'stroke-linecap': 'round', 'marker-end': 'url(#omPil2)' }));
    s.appendChild(svgTekst(520, 200, 'Udefra', { 'font-size': 15, 'font-weight': 800, fill: '#1e3937' }));
    s.appendChild(svgTekst(520, 220, '"Fagprofessionel"', { 'font-size': 13, fill: '#5a6b66' }));

    return s;
  }

  // ---------------------------------------------------------------
  // Selve siden
  // ---------------------------------------------------------------

  function vis(ctx){
    var T = window.LA2OmTekster;
    var side = el('article', { class: 'om' });

    // 1. Toppen
    var top = el('header', { class: 'om-top' }, [
      el('h1', { class: 'om-h1', text: T.top.overskrift })
    ]);
    T.top.intro.forEach(function(afsnit){ top.appendChild(el('p', { class: 'om-intro', text: afsnit })); });
    side.appendChild(top);

    // 2. Faserne
    var faseRaekke = el('div', { class: 'om-fase-raekke' });
    ['trivsel', 'tryghed', 'laering'].forEach(function(t){ faseRaekke.appendChild(faseKort(T, t)); });
    side.appendChild(sektion('', T.faser.overskrift, T.faser.under, [
      el('div', { class: 'om-diagram' }, [kredsloeb(T)]),
      faseRaekke
    ]));

    // 3. Perspektiver
    var persp = el('div', { class: 'om-persp-raekke' });
    T.perspektiver.kort.forEach(function(k, i){
      persp.appendChild(el('div', { class: 'om-persp-kort' }, [
        el('div', { class: 'om-persp-nr', text: String(i + 1) }),
        el('div', { class: 'om-persp-navn', text: k.navn }),
        el('div', { class: 'om-persp-ord', text: k.ord }),
        el('p', { class: 'om-persp-tekst', text: k.tekst })
      ]));
    });
    side.appendChild(sektion('', T.perspektiver.overskrift, T.perspektiver.under, [
      el('div', { class: 'om-diagram' }, [perspektivDiagram(T)]),
      persp
    ]));

    // 4a. Trivselsplanens tre niveauer
    var niv = el('div', { class: 'om-baro' });
    T.trivselsniveauer.niveauer.forEach(function(n){
      niv.appendChild(el('div', { class: 'om-baro-kol baro-' + n.klasse }, [
        el('div', { class: 'om-baro-hoved' }, [
          el('span', { class: 'baro-nr', text: String(n.nr) }),
          el('div', null, [el('div', { class: 'baro-navn', text: n.navn })])
        ]),
        el('div', { class: 'baro-gruppe-navn', text: T.trivselsniveauer.kolonner[0] }),
        el('div', { class: 'om-boble', text: n.gor }),
        el('div', { class: 'baro-gruppe-navn', text: T.trivselsniveauer.kolonner[1] }),
        el('div', { class: 'om-boble', text: n.strategi }),
        el('div', { class: 'baro-gruppe-navn', text: T.trivselsniveauer.kolonner[2] }),
        el('div', { class: 'om-boble', text: n.tilgang }),
        el('div', { class: 'om-eksempel', text: T.trivselsniveauer.eksempelMaerke })
      ]));
    });
    side.appendChild(sektion('', T.trivselsniveauer.overskrift, T.trivselsniveauer.under, [niv]));

    // 4b. Tryghedsplanens tre faser med en lille affektkurve
    var kurveBoks = el('figure', { class: 'om-diagram' });
    if(window.LA2Plans && window.LA2Plans.tegnAffektKurve){
      kurveBoks.appendChild(window.LA2Plans.tegnAffektKurve());
    }
    var faseKort3 = el('div', { class: 'om-fase3' });
    T.tryghedsfaser.faser.forEach(function(f){
      faseKort3.appendChild(el('div', { class: 'om-fase3-kort om-fase3-' + f.id }, [
        el('div', { class: 'om-fase3-hoved' }, [
          el('span', { class: 'om-fase3-form om-fase3-form-' + f.id, 'aria-hidden': 'true' }),
          el('span', { class: 'om-fase3-nr', text: String(f.nr) }),
          el('span', { class: 'om-fase3-navn', text: f.navn })
        ]),
        el('p', { class: 'om-fase3-tekst', text: f.tekst })
      ]));
    });
    side.appendChild(sektion('', T.tryghedsfaser.overskrift, T.tryghedsfaser.under, [
      kurveBoks,
      faseKort3,
      el('p', { class: 'om-forklaring-tekst', text: T.tryghedsfaser.felter })
    ]));

    // 5. Otte principper
    var gitter = el('div', { class: 'om-principper' });
    T.principper.punkter.forEach(function(p){
      var kort = el('div', { class: 'om-princip' + (p.fase ? ' fase-' + p.fase : '') });
      if(p.fase){
        var f = I.FASER[p.fase];
        var ikon = el('span', { class: 'fase-ikon fase-' + p.fase });
        ikon.appendChild(I.ikon(f.ikon, { stoerrelse: 22 }));
        kort.appendChild(ikon);
      }else{
        kort.appendChild(el('span', { class: 'om-princip-nr', text: String(p.nr) }));
      }
      kort.appendChild(el('div', { class: 'om-princip-tekst' }, [
        el('div', { class: 'om-princip-navn', text: p.nr + '. ' + p.navn }),
        el('p', { class: 'om-princip-sub', text: p.tekst })
      ]));
      gitter.appendChild(kort);
    });
    side.appendChild(sektion('', T.principper.overskrift, '', [gitter]));

    // 6. LA2, LA2u og TIP (beboere hentes fra la2_residents)
    var F = T.former;
    var slots = {
      la2: el('div', { class: 'om-la2u-avatarer' }, [el('span', { class: 'tom-tilstand', text: 'Henter…' })]),
      la2u: el('div', { class: 'om-la2u-avatarer' }, [el('span', { class: 'tom-tilstand', text: 'Henter…' })]),
      tip: el('div', { class: 'om-la2u-avatarer' }, [el('span', { class: 'tom-tilstand', text: 'Henter…' })])
    };
    function formKort(noegle){
      return el('div', { class: 'om-la2u-kort' }, [
        el('span', { class: 'variant-maerke', text: F[noegle].navn }),
        el('p', { text: F[noegle].tekst }),
        slots[noegle]
      ]);
    }
    side.appendChild(sektion('om-la2u', F.overskrift, F.beboereOverskrift, [
      el('div', { class: 'om-former' }, [formKort('la2'), formKort('la2u'), formKort('tip')])
    ]));

    // 7. Sådan bruger vi det
    var trin = el('ol', { class: 'om-trin' });
    T.trin.punkter.forEach(function(p, i){
      var ikon = el('span', { class: 'om-trin-ikon' });
      ikon.appendChild(I.ikon(p.ikon, { stoerrelse: 22 }));
      trin.appendChild(el('li', { class: 'om-trin-post' }, [
        el('span', { class: 'om-trin-nr', text: String(i + 1) }),
        ikon,
        el('span', { class: 'om-trin-tekst', text: p.tekst })
      ]));
    });
    side.appendChild(sektion('', T.trin.overskrift, '', [trin]));

    // 8. Lær mere
    var links = el('div', { class: 'om-links' });
    T.link.punkter.forEach(function(l){
      links.appendChild(el('a', { class: 'om-link', href: l.url, target: '_blank', rel: 'noopener' }, [
        el('span', { class: 'om-link-titel', text: l.titel }),
        el('span', { class: 'om-link-tekst', text: l.tekst }),
        el('span', { class: 'om-link-pil', 'aria-hidden': 'true', text: '↗' })
      ]));
    });
    side.appendChild(sektion('', T.link.overskrift, '', [links]));

    // 9. Nederst
    side.appendChild(el('p', { class: 'om-kilde', text: T.kilde }));

    ctx.visIRod(side);

    // Avatarer: hvem bruger LA2, LA2u og TIP
    window.LA2Data.residents().then(function(rows){
      function fyld(slot, liste){
        while(slot.firstChild) slot.removeChild(slot.firstChild);
        if(!liste.length){
          slot.appendChild(el('span', { class: 'tom-tilstand', text: F.ingen }));
          return;
        }
        liste.forEach(function(r){
          var navn = r.beboere ? r.beboere.navn : 'Ukendt';
          var farve = r.beboere ? r.beboere.farve : '';
          var a = el('span', { class: 'avatar avatar-48', text: navn.charAt(0) });
          a.setAttribute('aria-hidden', 'true');
          a.style.background = U().erFarve(farve) ? farve : '#374151';
          slot.appendChild(el('a', { class: 'om-avatar', href: '#/beboer/' + r.resident_id }, [
            a,
            el('span', { class: 'om-avatar-navn', text: navn })
          ]));
        });
      }
      fyld(slots.la2, rows.filter(function(r){ return r.indefra_form !== 'LA2u'; }));
      fyld(slots.la2u, rows.filter(function(r){ return r.indefra_form === 'LA2u'; }));
      fyld(slots.tip, rows.filter(function(r){ return !!r.bruger_tip; }));
    }).catch(function(e){
      Object.keys(slots).forEach(function(k){
        while(slots[k].firstChild) slots[k].removeChild(slots[k].firstChild);
      });
      if(U().erSessionFejl(e)){ ctx.onSessionError(); return; }
      slots.la2.appendChild(el('span', { class: 'tom-tilstand', text: 'Kunne ikke hente beboerne.' }));
    });

    return { opdater: function(){ return Promise.resolve(); } };
  }

  return { vis: vis };
})();
