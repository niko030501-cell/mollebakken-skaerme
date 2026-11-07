// ==================================================================
// Kostplan — fælles ikonliste til mad (egne enkle linjeikoner, 24 x 24).
// Bruges af mollebakken-app-v2 (personalet vælger ikon) og beboer-v2
// (beboeren ser ikonet). Ikonet gemmes i databasen som NAVNET (fx 'chips').
// Tilføj et ikon her, så findes det begge steder.
//
// Rækkefølgen er rækkefølgen i vælgeren; de første KOST_IKON_FAST vises
// altid, resten ligger bag knappen "Flere".
// ==================================================================

const KOST_IKON_FAST = 8;

const KOST_IKONER = [
  { navn: 'morgenmad',     label: 'Kop',        stier: ['M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z', 'M16 10h1.5a2.5 2.5 0 0 1 0 5H16', 'M8 3v2', 'M12 3v2'] },
  { navn: 'brunch',        label: 'Æg',         stier: ['M12 4C8 4 4 7 4 12c0 4 3 8 8 8s8-3 8-7c0-4-4-9-8-9z', 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0'] },
  { navn: 'frokost',       label: 'Sandwich',   stier: ['M4 11a8 5 0 0 1 16 0z', 'M3 14h18', 'M5 17h14c0 2-2 3-4 3H9c-2 0-4-1-4-3z'] },
  { navn: 'aftensmad',     label: 'Tallerken',  stier: ['M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', 'M2.5 4v5a1.5 1.5 0 0 0 3 0V4', 'M4 10v10', 'M21 20V4c-1.5 1-2.5 3-2.5 6H21'] },
  { navn: 'mellemmaaltid', label: 'Æble',       stier: ['M12 7C10 5.500 6 6 6 11c0 4 2 9 4 9 1 0 1-.8 2-.8s1 .8 2 .8c2 0 4-5 4-9 0-5-4-5.500-6-4z', 'M12 7c0-2 1-3 3-4'] },
  { navn: 'slik',          label: 'Slik',       stier: ['M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'M8.500 9.500L4 7v10l4.500-2.500', 'M15.500 9.500L20 7v10l-4.500-2.500'] },
  { navn: 'chips',         label: 'Chips',      stier: ['M6 4h12l-1 16H7z', 'M6.500 8h11', 'M12 13m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0'] },
  { navn: 'dip',           label: 'Dip',        stier: ['M7 8h10v12H7z', 'M6 5h12v3H6z', 'M9 13h6'] },
  { navn: 'kage',          label: 'Kage',       stier: ['M4 20h16', 'M5 20v-6h14v6', 'M5 14c0-2 2-3 3.500-3 1 0 1.500-1 3.500-1s2.500 1 3.500 1c1.500 0 3.500 1 3.500 3', 'M12 10V6', 'M12 4v.5'] },
  { navn: 'groentsag',     label: 'Gulerod',    stier: ['M18 6a3 3 0 0 0-4.200.200L5 17.500 3.500 21 7 19.500 17.800 10.200A3 3 0 0 0 18 6z', 'M17 7l3-4', 'M19 9l3-1'] },
  { navn: 'glas',          label: 'Glas',       stier: ['M7 4h10l-1.200 16H8.200z', 'M7.400 9h9.200'] },
  { navn: 'vand',          label: 'Vand',       stier: ['M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z'] },
  { navn: 'juice',         label: 'Juice',      stier: ['M8 8h8l-1 12H9z', 'M12 8V3l3-1'] },
  { navn: 'pizza',         label: 'Pizza',      stier: ['M12 21L4 6c5-3 11-3 16 0z', 'M10.500 12h.01', 'M13.500 15h.01', 'M12 9h.01'] },
  { navn: 'is',            label: 'Is',         stier: ['M7 11a5 5 0 0 1 10 0z', 'M7 11l5 10 5-10'] },
  { navn: 'suppe',         label: 'Suppe',      stier: ['M3 12h18c0 4.500-4 8-9 8s-9-3.500-9-8z', 'M9 4c-1 1.300 1 2 0 3.500', 'M13 4c-1 1.300 1 2 0 3.500', 'M17 4c-1 1.300 1 2 0 3.500'] },
  { navn: 'skaal',         label: 'Skål',       stier: ['M3 11h18c0 5-4 9-9 9s-9-4-9-9z', 'M8 11c0-3 2-5 4-5s4 2 4 5'] },
  { navn: 'fisk',          label: 'Fisk',       stier: ['M3 12c3-4.500 8-5 12-3l5-3v12l-5-3c-4 2-9 1.500-12-3z', 'M7.500 11h.01'] },
  { navn: 'brod',          label: 'Brød',       stier: ['M5 10a3 3 0 0 1 1-5.500C8 3 10 3 12 3s4 0 6 1.500A3 3 0 0 1 19 10v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z'] },
  { navn: 'tilskud',       label: 'Tablet',     stier: ['M10.500 20.500a4.950 4.950 0 0 1-7-7l10-10a4.950 4.950 0 0 1 7 7z', 'M8.500 8.500l7 7'] },
  { navn: 'gave',          label: 'Gave',       stier: ['M5 14v6h14v-6', 'M3 10h18v4H3z', 'M12 10v10', 'M12 10c-2 0-4-1-4-3s2-3 4 0c2-3 4-1 4 0s-2 3-4 3z'] },
  { navn: 'stjerne',       label: 'Stjerne',    stier: ['M12 3l2.600 5.600 6.100.700-4.500 4.200 1.200 6L12 16.500 6.600 19.500l1.200-6L3.300 9.300l6.100-.700z'] },
  { navn: 'hjerte',        label: 'Hjerte',     stier: ['M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.500A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11z'] }
];

const KOST_IKON_NAVNE = KOST_IKONER.map(function(i){ return i.navn; });

function kostIkonFind(navn){
  for(let i = 0; i < KOST_IKONER.length; i++){
    if(KOST_IKONER[i].navn === navn) return KOST_IKONER[i];
  }
  return null;
}

// Returnerer et <svg>-element (DOM-metoder). Ukendt navn giver et tomt ikon.
function kostIkon(navn, stoerrelse, streg){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(stoerrelse || 24));
  svg.setAttribute('height', String(stoerrelse || 24));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(streg || 1.8));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const ikon = kostIkonFind(navn);
  if(!ikon) return svg;
  ikon.stier.forEach(function(d){
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}
