// ==================================================================
// LA2 — ikoner og fasedata.
//
// Inline SVG med streg (stroke="currentColor", 2.2, runde ender), 24x24.
// Bygges med DOM-metoder (ingen innerHTML), så de kan indsættes direkte
// med appendChild. Farven styres af den omgivende tekstfarve.
// ==================================================================
window.LA2Ikoner = (function(){
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var STIER = {
    // Bundmenu (mobil)
    overblik: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
    episoder: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
    revision: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    om: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
    plus: ['M12 5v14', 'M5 12h14'],
    // Fase 1 · Forebyggelse: spire (to blade på en stilk)
    spire: [
      'M12 21v-9',
      'M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5z',
      'M12 14.5c0-3.5-2.6-6-6.5-6 0 3.5 2.6 6 6.5 6z'
    ],
    // Fase 2 · Håndtering: skjold
    skjold: [
      'M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z'
    ],
    // Fase 3 · Læring: cirkelpil (to pile i en ring)
    cirkelpil: [
      'M4 12a8 8 0 0 1 14-5.3',
      'M18.5 3v4h-4',
      'M20 12a8 8 0 0 1-14 5.3',
      'M5.5 21v-4h4'
    ]
  };

  // Returnerer et <svg>-element. opts: { stoerrelse: 24, klasse: '', titel: '' }
  function ikon(navn, opts){
    opts = opts || {};
    var stier = STIER[navn];
    var svg = document.createElementNS(NS, 'svg');
    var s = String(opts.stoerrelse || 24);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('focusable', 'false');
    if(opts.klasse) svg.setAttribute('class', opts.klasse);
    if(opts.titel){
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', opts.titel);
    }else{
      svg.setAttribute('aria-hidden', 'true');
    }
    (stier || []).forEach(function(d){
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  // De tre faser — samme farve, ikon og navn overalt.
  // Farverne ligger som CSS-variabler i la2.css (--fase-*).
  var FASER = {
    trivsel: { nr: 1, ikon: 'spire',     fase: 'Forebyggelse', plan: 'Trivselsplan',  planTekst: 'Trivsel',
               farve: 'var(--fase-trivsel)', lys: 'var(--fase-trivsel-lys)' },
    tryghed: { nr: 2, ikon: 'skjold',    fase: 'Håndtering',   plan: 'Tryghedsplan',  planTekst: 'Tryghed',
               farve: 'var(--fase-tryghed)', lys: 'var(--fase-tryghed-lys)' },
    laering: { nr: 3, ikon: 'cirkelpil', fase: 'Læring',       plan: 'Læringsplan',   planTekst: 'Læring',
               farve: 'var(--fase-laering)', lys: 'var(--fase-laering-lys)' }
  };

  return {
    ikon: ikon,
    spire:     function(o){ return ikon('spire', o); },
    skjold:    function(o){ return ikon('skjold', o); },
    cirkelpil: function(o){ return ikon('cirkelpil', o); },
    FASER: FASER,
    // De rå sti-data (bruges til at tegne ikoner inde i større SVG-diagrammer)
    stier: function(navn){ return (STIER[navn] || []).slice(); },
    // Ikon for en plantype; mestring og håb og drømme har ikke en fase
    forPlan: function(planType, o){
      var f = FASER[planType];
      return f ? ikon(f.ikon, o) : null;
    }
  };
})();
