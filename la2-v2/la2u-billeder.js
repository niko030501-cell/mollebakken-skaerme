// ==================================================================
// LA2 — eget billedsæt til LA2u og Mestringsplanen.
//
// Enkle SVG-billeder i vores egen stil: tykke, runde streger, få detaljer,
// store flader. De efterligner IKKE Sopras LA2u-grafik (Maren Grosen).
//
// ALLE steder henter billeder gennem én funktion, la2uBillede(nøgle, størrelse).
// Får vi lov til at bruge Sopras billeder, skal kun denne fil ændres
// (BILLEDER, GRUPPER og billede()). Resten af koden kender kun nøglerne.
//
// Ingen innerHTML: SVG bygges med DOM-metoder. Hvert billede har en dansk tekst
// (aria-label) og er tegnet i en 100 × 100 ramme; vises i 48, 96 eller 160 px.
// ==================================================================
window.LA2Billeder = (function(){
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var STREG = '#1f2d2a';
  var HVID = '#ffffff';
  var GROEN = '#d9eddf', GROEN_S = '#2f7d4f';
  var GUL = '#fbf0cf', GUL_S = '#8a6212';
  var ROED = '#f6dcd9', ROED_S = '#9a3632';
  var BLAA = '#e2e8f2', BLAA_S = '#34507a';

  function s(tag, attrs){
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    return n;
  }
  function cirkel(g, cx, cy, r, fyld, streg){
    g.appendChild(s('circle', { cx: cx, cy: cy, r: r, fill: fyld || 'none', stroke: streg || STREG, 'stroke-width': 5 }));
  }
  function plet(g, cx, cy, r, fyld){
    g.appendChild(s('circle', { cx: cx, cy: cy, r: r, fill: fyld || STREG }));
  }
  function rekt(g, x, y, w, h, fyld, rx){
    g.appendChild(s('rect', { x: x, y: y, width: w, height: h, rx: rx || 0, fill: fyld || 'none', stroke: STREG, 'stroke-width': 5, 'stroke-linejoin': 'round' }));
  }
  function sti(g, d, fyld, streg, bredde){
    g.appendChild(s('path', { d: d, fill: fyld || 'none', stroke: streg || STREG, 'stroke-width': bredde || 5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  function linje(g, x1, y1, x2, y2, streg, bredde){
    g.appendChild(s('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: streg || STREG, 'stroke-width': bredde || 5, 'stroke-linecap': 'round' }));
  }

  // ---- ansigter ----
  function ansigt(g, fyld, streg, mund, ekstra){
    cirkel(g, 50, 50, 42, fyld, streg);
    g.appendChild(s('circle', { cx: 50, cy: 50, r: 42, fill: 'none' }));
    if(ekstra !== 'lukkede' && ekstra !== 'store'){
      plet(g, 36, 42, 5.5);
      plet(g, 64, 42, 5.5);
    }
    if(mund) sti(g, mund, 'none', STREG, 6);
  }

  function person(g, x, skala, fyld){
    var tr = 'translate(' + x + ' ' + (92 - 88 * skala) + ') scale(' + skala + ')';
    var gr = s('g', { transform: tr });
    gr.appendChild(s('circle', { cx: 50, cy: 34, r: 17, fill: fyld, stroke: STREG, 'stroke-width': 6 }));
    gr.appendChild(s('path', { d: 'M18 88 C18 62 82 62 82 88 Z', fill: fyld, stroke: STREG, 'stroke-width': 6, 'stroke-linejoin': 'round' }));
    g.appendChild(gr);
  }

  function hjerte(g, cx, cy, skala){
    var gr = s('g', { transform: 'translate(' + (cx - 50 * skala) + ' ' + (cy - 38 * skala) + ') scale(' + skala + ')' });
    gr.appendChild(s('path', { d: 'M50 30 C44 18 28 24 34 38 C38 46 50 52 50 52 C50 52 62 46 66 38 C72 24 56 18 50 30 Z',
      fill: '#d86a5f', stroke: STREG, 'stroke-width': 5, 'stroke-linejoin': 'round' }));
    g.appendChild(gr);
  }

  var BILLEDER = {
    // ---------- følelser ----------
    foelelse_glad:   { tekst: 'Glad',        tegn: function(g){ ansigt(g, GROEN, GROEN_S, 'M30 60 Q50 80 70 60'); } },
    foelelse_okay:   { tekst: 'Okay',        tegn: function(g){ ansigt(g, GUL, GUL_S, 'M32 66 L68 66'); } },
    foelelse_urolig: { tekst: 'Urolig',      tegn: function(g){
      ansigt(g, GUL, GUL_S, 'M30 68 Q38 60 46 68 T62 68 T72 64');
      sti(g, 'M82 26 Q88 34 82 40 Q76 34 82 26 Z', BLAA, BLAA_S, 4); } },
    foelelse_ked:    { tekst: 'Ked af det',  tegn: function(g){ ansigt(g, ROED, ROED_S, 'M32 72 Q50 52 68 72'); } },
    foelelse_vred:   { tekst: 'Vred',        tegn: function(g){
      ansigt(g, ROED, ROED_S, 'M34 72 Q50 60 66 72');
      linje(g, 26, 30, 44, 38, STREG, 6); linje(g, 74, 30, 56, 38, STREG, 6); } },
    foelelse_traet:  { tekst: 'Træt',        tegn: function(g){
      ansigt(g, BLAA, BLAA_S, null, 'lukkede');
      sti(g, 'M28 46 Q36 52 44 46', 'none', STREG, 6); sti(g, 'M56 46 Q64 52 72 46', 'none', STREG, 6);
      cirkel(g, 50, 70, 7, HVID, STREG); } },
    foelelse_bange:  { tekst: 'Bange',       tegn: function(g){
      ansigt(g, BLAA, BLAA_S, null, 'store');
      cirkel(g, 36, 42, 9, HVID, STREG); plet(g, 36, 42, 3.5);
      cirkel(g, 64, 42, 9, HVID, STREG); plet(g, 64, 42, 3.5);
      cirkel(g, 50, 70, 6, HVID, STREG); } },

    // ---------- personer ----------
    person_mig:      { tekst: 'Mig',         tegn: function(g){ person(g, 0, 1, BLAA); } },
    person_personale:{ tekst: 'Personale',   tegn: function(g){
      person(g, 0, 0.95, BLAA); rekt(g, 56, 58, 28, 32, HVID, 4);
      linje(g, 62, 68, 78, 68, STREG, 4); linje(g, 62, 78, 78, 78, STREG, 4); } },
    person_familie:  { tekst: 'Familie',     tegn: function(g){
      person(g, -4, 0.62, BLAA); person(g, 24, 0.62, GUL); person(g, 50, 0.5, GROEN); } },
    person_ven:      { tekst: 'Ven',         tegn: function(g){
      person(g, -8, 0.78, BLAA); person(g, 30, 0.78, GUL); hjerte(g, 50, 16, 0.5); } },
    person_flere:    { tekst: 'Flere personer', tegn: function(g){
      person(g, -12, 0.8, BLAA); person(g, 30, 0.8, GUL); } },

    // ---------- hverdag ----------
    aktivitet_musik: { tekst: 'Musik',       tegn: function(g){
      linje(g, 47, 66, 47, 26, STREG, 5); linje(g, 74, 60, 74, 22, STREG, 5); linje(g, 47, 26, 74, 22, STREG, 8);
      g.appendChild(s('ellipse', { cx: 36, cy: 68, rx: 12, ry: 9, fill: STREG }));
      g.appendChild(s('ellipse', { cx: 63, cy: 62, rx: 12, ry: 9, fill: STREG })); } },
    aktivitet_gaatur:{ tekst: 'Gå en tur',   tegn: function(g){
      cirkel(g, 58, 22, 9, GUL, STREG); linje(g, 56, 33, 48, 60, STREG, 6);
      linje(g, 56, 40, 72, 52, STREG, 5); linje(g, 56, 40, 40, 48, STREG, 5);
      linje(g, 48, 60, 62, 80, STREG, 6); linje(g, 48, 60, 38, 82, STREG, 6); linje(g, 8, 90, 92, 90, GROEN_S, 5); } },
    aktivitet_mad:   { tekst: 'Mad',         tegn: function(g){
      cirkel(g, 50, 52, 28, HVID, STREG); cirkel(g, 50, 52, 14, GUL, STREG);
      linje(g, 10, 22, 10, 84, STREG, 5); linje(g, 90, 22, 90, 84, STREG, 5); linje(g, 90, 22, 84, 40, STREG, 5); } },
    aktivitet_kaffe: { tekst: 'Kaffe eller te', tegn: function(g){
      sti(g, 'M22 46 H70 V66 Q70 86 46 86 Q22 86 22 66 Z', HVID, STREG, 5);
      sti(g, 'M70 52 Q90 52 90 64 Q90 76 68 74', 'none', STREG, 5);
      sti(g, 'M36 36 Q30 28 38 20', 'none', STREG, 4); sti(g, 'M52 36 Q46 28 54 20', 'none', STREG, 4); } },
    aktivitet_tv:    { tekst: 'Tv',          tegn: function(g){
      rekt(g, 12, 26, 76, 48, BLAA, 8); rekt(g, 20, 34, 60, 32, HVID, 4);
      linje(g, 34, 74, 30, 88, STREG, 5); linje(g, 66, 74, 70, 88, STREG, 5);
      linje(g, 50, 26, 38, 10, STREG, 4); linje(g, 50, 26, 62, 10, STREG, 4); } },
    aktivitet_sove:  { tekst: 'Sove',        tegn: function(g){
      rekt(g, 10, 56, 80, 18, BLAA, 4); rekt(g, 10, 38, 10, 36, BLAA_S, 3);
      g.appendChild(s('ellipse', { cx: 34, cy: 52, rx: 13, ry: 7, fill: HVID, stroke: STREG, 'stroke-width': 5 }));
      linje(g, 16, 74, 16, 86, STREG, 5); linje(g, 84, 74, 84, 86, STREG, 5);
      sti(g, 'M60 14 H78 L60 32 H78', 'none', STREG, 5); } },
    aktivitet_bad:   { tekst: 'Bad',         tegn: function(g){
      sti(g, 'M10 50 H90 V60 Q90 82 68 82 H32 Q10 82 10 60 Z', BLAA, STREG, 5);
      cirkel(g, 30, 36, 7, HVID, STREG); cirkel(g, 48, 28, 6, HVID, STREG); cirkel(g, 64, 38, 8, HVID, STREG);
      linje(g, 28, 82, 24, 92, STREG, 5); linje(g, 72, 82, 76, 92, STREG, 5); } },
    aktivitet_telefon:{ tekst: 'Telefon',    tegn: function(g){
      rekt(g, 30, 10, 40, 80, HVID, 10); rekt(g, 36, 20, 28, 50, BLAA, 3); cirkel(g, 50, 80, 4, STREG, STREG); } },
    aktivitet_bil:   { tekst: 'Bil',         tegn: function(g){
      sti(g, 'M8 64 L16 44 Q20 38 30 38 H70 Q80 38 84 44 L92 64 V74 H8 Z', GUL, STREG, 5);
      rekt(g, 24, 44, 22, 14, BLAA, 3); rekt(g, 54, 44, 22, 14, BLAA, 3);
      cirkel(g, 28, 76, 10, STREG, STREG); cirkel(g, 72, 76, 10, STREG, STREG);
      plet(g, 28, 76, 4, HVID); plet(g, 72, 76, 4, HVID); } },
    aktivitet_arbejde:{ tekst: 'Arbejde',    tegn: function(g){
      sti(g, 'M38 38 V28 Q38 20 46 20 H54 Q62 20 62 28 V38', 'none', STREG, 5);
      rekt(g, 12, 38, 76, 46, GUL, 8); linje(g, 12, 58, 88, 58, STREG, 5); rekt(g, 43, 53, 14, 12, HVID, 3); } },

    // ---------- steder ----------
    sted_mit_vaerelse:{ tekst: 'Mit værelse', tegn: function(g){
      rekt(g, 26, 10, 48, 80, BLAA, 4); rekt(g, 34, 20, 32, 26, HVID, 3); cirkel(g, 62, 58, 4, STREG, STREG);
      linje(g, 14, 90, 86, 90, STREG, 5); } },
    sted_faellesrum: { tekst: 'Fællesrum',   tegn: function(g){
      rekt(g, 18, 30, 64, 34, GUL, 12); rekt(g, 8, 50, 84, 26, BLAA, 10);
      linje(g, 20, 76, 20, 88, STREG, 5); linje(g, 80, 76, 80, 88, STREG, 5); } },
    sted_ude:        { tekst: 'Udenfor',     tegn: function(g){
      rekt(g, 44, 54, 12, 34, '#c9a66b', 2); cirkel(g, 50, 38, 26, GROEN, GROEN_S);
      cirkel(g, 84, 16, 9, GUL, GUL_S); linje(g, 8, 90, 92, 90, GROEN_S, 5); } },
    sted_hjemme_hos_familie:{ tekst: 'Hjemme hos familien', tegn: function(g){
      sti(g, 'M8 50 L50 14 L92 50 Z', ROED, STREG, 5); rekt(g, 20, 50, 60, 38, HVID, 2);
      rekt(g, 43, 62, 14, 26, BLAA, 2); hjerte(g, 50, 36, 0.4); } },

    // ---------- hjælp og støtte ----------
    hjaelp_hjaelp:   { tekst: 'Hjælp',       tegn: function(g){
      cirkel(g, 50, 50, 36, HVID, STREG); cirkel(g, 50, 50, 14, GUL, STREG);
      [[50, 12, 50, 36], [50, 64, 50, 88], [12, 50, 36, 50], [64, 50, 88, 50]].forEach(function(l){
        linje(g, l[0], l[1], l[2], l[3], ROED_S, 10);
      }); } },
    hjaelp_tal_stille:{ tekst: 'Tal stille', tegn: function(g){
      sti(g, 'M12 20 H88 V62 H50 L34 80 V62 H12 Z', HVID, STREG, 5);
      plet(g, 32, 41, 4.5); plet(g, 50, 41, 4.5); plet(g, 68, 41, 4.5); } },
    hjaelp_ro_og_plads:{ tekst: 'Ro og plads', tegn: function(g){
      cirkel(g, 50, 50, 14, BLAA, STREG);
      [[50, 6, 50, 26], [50, 74, 50, 94], [6, 50, 26, 50], [74, 50, 94, 50]].forEach(function(l){
        linje(g, l[0], l[1], l[2], l[3], STREG, 6);
      }); } },
    hjaelp_vaer_hos_mig:{ tekst: 'Vær hos mig', tegn: function(g){
      person(g, -4, 0.8, BLAA); person(g, 34, 0.8, GUL); hjerte(g, 50, 18, 0.5); } },
    hjaelp_sig_det_i_god_tid:{ tekst: 'Sig det i god tid', tegn: function(g){
      cirkel(g, 36, 60, 28, HVID, STREG); linje(g, 36, 60, 36, 42, STREG, 5); linje(g, 36, 60, 50, 68, STREG, 5);
      sti(g, 'M56 8 H92 V34 H76 L68 44 V34 H56 Z', GUL, STREG, 4); } },

    // ---------- signaler ----------
    signal_stop:     { tekst: 'Stop',        tegn: function(g){
      sti(g, 'M34 8 H66 L92 34 V66 L66 92 H34 L8 66 V34 Z', ROED_S, STREG, 5);
      rekt(g, 26, 42, 48, 16, HVID, 4); } },
    signal_pause:    { tekst: 'Pause',       tegn: function(g){
      cirkel(g, 50, 50, 40, BLAA, STREG); rekt(g, 33, 30, 13, 40, STREG, 3); rekt(g, 54, 30, 13, 40, STREG, 3); } },
    signal_ja:       { tekst: 'Ja',          tegn: function(g){
      cirkel(g, 50, 50, 40, GROEN, GROEN_S); sti(g, 'M28 52 L44 68 L72 34', 'none', GROEN_S, 10); } },
    signal_nej:      { tekst: 'Nej',         tegn: function(g){
      cirkel(g, 50, 50, 40, ROED, ROED_S); sti(g, 'M33 33 L67 67', 'none', ROED_S, 10); sti(g, 'M67 33 L33 67', 'none', ROED_S, 10); } },

    // ---------- øer (bruges i Trivselsøer) ----------
    ikon_trivselsoe: { tekst: 'Trivselsø', tegn: function(g){
      sti(g, 'M8 62 Q30 52 50 62 T92 62', 'none', BLAA_S, 6);
      sti(g, 'M8 78 Q30 68 50 78 T92 78', 'none', BLAA_S, 6);
      sti(g, 'M22 58 Q50 14 78 58 Z', GROEN, GROEN_S, 6);
      cirkel(g, 78, 22, 9, GUL, GUL_S); } }
  };

  // Grupper til billedvælgeren ("Vælg billede")
  var GRUPPER = [
    { navn: 'Følelser', noegler: ['foelelse_glad', 'foelelse_okay', 'foelelse_urolig', 'foelelse_ked', 'foelelse_vred', 'foelelse_traet', 'foelelse_bange'] },
    { navn: 'Personer', noegler: ['person_mig', 'person_personale', 'person_familie', 'person_ven', 'person_flere'] },
    { navn: 'Hverdag', noegler: ['aktivitet_musik', 'aktivitet_gaatur', 'aktivitet_mad', 'aktivitet_kaffe', 'aktivitet_tv',
                                 'aktivitet_sove', 'aktivitet_bad', 'aktivitet_telefon', 'aktivitet_bil', 'aktivitet_arbejde'] },
    { navn: 'Steder', noegler: ['sted_mit_vaerelse', 'sted_faellesrum', 'sted_ude', 'sted_hjemme_hos_familie', 'ikon_trivselsoe'] },
    { navn: 'Hjælp og støtte', noegler: ['hjaelp_hjaelp', 'hjaelp_tal_stille', 'hjaelp_ro_og_plads', 'hjaelp_vaer_hos_mig', 'hjaelp_sig_det_i_god_tid'] },
    { navn: 'Signaler', noegler: ['signal_stop', 'signal_pause', 'signal_ja', 'signal_nej'] }
  ];

  var FOELELSER = ['foelelse_glad', 'foelelse_okay', 'foelelse_urolig', 'foelelse_ked', 'foelelse_vred', 'foelelse_traet', 'foelelse_bange'];

  // Returnerer et SVG-element, eller null hvis nøglen ikke findes
  function billede(noegle, stoerrelse, titel){
    var b = BILLEDER[noegle];
    if(!b) return null;
    var px = stoerrelse || 48;
    var svg = s('svg', { viewBox: '0 0 100 100', width: px, height: px, role: 'img', focusable: 'false',
      'aria-label': titel || b.tekst, 'class': 'la2u-billede' });
    b.tegn(svg);
    return svg;
  }

  function tekst(noegle){
    return BILLEDER[noegle] ? BILLEDER[noegle].tekst : '';
  }

  function noegler(){
    return Object.keys(BILLEDER);
  }

  function grupper(){
    return GRUPPER.map(function(g){ return { navn: g.navn, noegler: g.noegler.slice() }; });
  }

  return { billede: billede, tekst: tekst, noegler: noegler, grupper: grupper, foelelser: function(){ return FOELELSER.slice(); } };
})();

// Eneste indgang, som resten af koden bruger
window.la2uBillede = function(noegle, stoerrelse, titel){
  return window.LA2Billeder.billede(noegle, stoerrelse, titel);
};
