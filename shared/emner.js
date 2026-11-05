// Emner til beskeder — samme nøgler, navne, farver og ikoner i appen og på infoskærmen.
// (Rum-farverne til Rengøring er et helt andet farvesæt og ligger i appen.)
// staerk = flader og streger, lys = tekst på mørk baggrund, moerk = tekst på lys baggrund (kontrast mindst 4,5:1 mod #F6F3EB).
// Ikoner er inline SVG bygget med DOM-metoder (aldrig via innerHTML).

var BESKED_EMNER = [
  { id: 'obs',      navn: 'Obs',                  staerk: '#C2410C', lys: '#FDBA74', moerk: '#7C2D12', ikon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { id: 'medicin',  navn: 'Medicin',              staerk: '#1D4ED8', lys: '#93C5FD', moerk: '#1E3A8A', ikon: 'M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z M8.5 8.5l7 7' },
  { id: 'motion',   navn: 'Motion og ture',       staerk: '#15803D', lys: '#86EFAC', moerk: '#14532D', ikon: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  { id: 'mad',      navn: 'Mad og drikke',        staerk: '#A16207', lys: '#FDE68A', moerk: '#713F12', ikon: 'M7 3v8 M4 3v5a3 3 0 0 0 6 0V3 M7 11v10 M17 3c-2 2-3 4-3 7h3v11' },
  { id: 'struktur', navn: 'Strukturer og mapper', staerk: '#6D28D9', lys: '#C4B5FD', moerk: '#4C1D95', ikon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'aftaler',  navn: 'Aftaler og besøg',     staerk: '#0F766E', lys: '#5EEAD4', moerk: '#115E59', ikon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M3 10h18 M8 3v4 M16 3v4' },
  { id: 'praktisk', navn: 'Praktisk',             staerk: '#334155', lys: '#CBD5E1', moerk: '#1E293B', ikon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z' },
  { id: 'husk',     navn: 'Husk',                 staerk: '#BE185D', lys: '#F9A8D4', moerk: '#9D174D', ikon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { id: 'andet',    navn: 'Andet',                staerk: '#4B5563', lys: '#D1D5DB', moerk: '#374151', ikon: 'M5 12h.01 M12 12h.01 M19 12h.01' }
];

// Ukendt eller manglende emne behandles som 'andet'
function emneFind(id){
  for(var i = 0; i < BESKED_EMNER.length; i++){
    if(BESKED_EMNER[i].id === id) return BESKED_EMNER[i];
  }
  return BESKED_EMNER[BESKED_EMNER.length - 1];
}

// Inline SVG (viewBox 0 0 24 24, fill none, runde ender). farve = stroke-farve.
function emneIkon(id, stoerrelse, farve){
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(stoerrelse));
  svg.setAttribute('height', String(stoerrelse));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', farve);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  var path = document.createElementNS(NS, 'path');
  path.setAttribute('d', emneFind(id).ikon);
  svg.appendChild(path);
  return svg;
}
