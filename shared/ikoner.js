// ==================================================================
// Møllebakken — fælles ikonsæt (linjeikoner, 24×24, currentColor)
//
// Ikonerne er hentet fra Tabler Icons 3.34.0 (outline) — MIT-licens:
//   Copyright (c) 2020-2024 Paweł Kuna
//   Permission is hereby granted, free of charge, to any person obtaining a
//   copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to
//   the following conditions: The above copyright notice and this permission
//   notice shall be included in all copies or substantial portions of the
//   Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
//   https://github.com/tabler/tabler-icons/blob/main/LICENSE
//
// Ét sted at rette: et ikon ændres kun her og slår igennem overalt.
// Ikonerne tegnes med currentColor, så de følger tekstfarven (også i
// nu-block, hvor tekst og ikon vendes om sammen).
//
// Brug (DOM-metoder — aldrig en HTML-streng):
//   knap.appendChild(moelleIkon('forside'));
//   knap.appendChild(moelleIkon('luk', { stoerrelse: 32, klasse: 'ikonStor' }));
//
// Bemærk: shared/icons.js (moelleIkonTjek m.fl.) er en ældre, separat fil
// som tavlen og skærmen bruger — den er urørt. Klassen hedder derfor 'mikon'
// (ikke 'moelle-ikon', som tokens.css sætter til 14 px og ville overstyre størrelsen).
// ==================================================================

const MOELLE_IKONER = {
  forside: [["path",{"d":"M5 12l-2 0l9 -9l9 9l-2 0"}],["path",{"d":"M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"}],["path",{"d":"M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"}]],   // tabler: home
  opgaver: [["path",{"d":"M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"}],["path",{"d":"M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"}],["path",{"d":"M9 12l.01 0"}],["path",{"d":"M13 12l2 0"}],["path",{"d":"M9 16l.01 0"}],["path",{"d":"M13 16l2 0"}]],   // tabler: clipboard-list
  mad: [["path",{"d":"M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12zm0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3"}]],   // tabler: tools-kitchen-2
  med: [["path",{"d":"M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"}],["path",{"d":"M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"}],["path",{"d":"M16 3.13a4 4 0 0 1 0 7.75"}],["path",{"d":"M21 21v-2a4 4 0 0 0 -3 -3.85"}]],   // tabler: users
  rengoering: [["path",{"d":"M3 21v-4a4 4 0 1 1 4 4h-4"}],["path",{"d":"M21 3a16 16 0 0 0 -12.8 10.2"}],["path",{"d":"M21 3a16 16 0 0 1 -10.2 12.8"}],["path",{"d":"M10.6 9a9 9 0 0 1 4.4 4.4"}]],   // tabler: brush
  la2: [["path",{"d":"M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"}],["path",{"d":"M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"}],["path",{"d":"M3 6l0 13"}],["path",{"d":"M12 6l0 13"}],["path",{"d":"M21 6l0 13"}]],   // tabler: book
  p104: [["path",{"d":"M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"}],["path",{"d":"M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"}],["path",{"d":"M9.7 17l4.6 0"}]],   // tabler: bulb
  pmoede: [["path",{"d":"M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10"}],["path",{"d":"M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2"}]],   // tabler: messages
  skaerm: [["path",{"d":"M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"}],["path",{"d":"M16 3l-4 4l-4 -4"}]],   // tabler: device-tv
  mere: [["path",{"d":"M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}],["path",{"d":"M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}],["path",{"d":"M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}]],   // tabler: dots
  besked: [["path",{"d":"M8 9h8"}],["path",{"d":"M8 13h6"}],["path",{"d":"M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"}]],   // tabler: message
  vedhaeftning: [["path",{"d":"M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5"}]],   // tabler: paperclip
  plus: [["path",{"d":"M12 5l0 14"}],["path",{"d":"M5 12l14 0"}]],   // tabler: plus
  tilbage: [["path",{"d":"M5 12l14 0"}],["path",{"d":"M5 12l6 6"}],["path",{"d":"M5 12l6 -6"}]],   // tabler: arrow-left
  luk: [["path",{"d":"M18 6l-12 12"}],["path",{"d":"M6 6l12 12"}]],   // tabler: x
  rediger: [["path",{"d":"M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"}],["path",{"d":"M13.5 6.5l4 4"}]],   // tabler: pencil
  slet: [["path",{"d":"M4 7l16 0"}],["path",{"d":"M10 11l0 6"}],["path",{"d":"M14 11l0 6"}],["path",{"d":"M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"}],["path",{"d":"M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"}]],   // tabler: trash
  advarsel: [["path",{"d":"M12 9v4"}],["path",{"d":"M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"}],["path",{"d":"M12 16h.01"}]],   // tabler: alert-triangle
  kalender: [["path",{"d":"M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"}],["path",{"d":"M16 3v4"}],["path",{"d":"M8 3v4"}],["path",{"d":"M4 11h16"}],["path",{"d":"M11 15h1"}],["path",{"d":"M12 15v3"}]],   // tabler: calendar
  ur: [["path",{"d":"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"}],["path",{"d":"M12 7v5l3 3"}]],   // tabler: clock
  check: [["path",{"d":"M5 12l5 5l10 -10"}]],   // tabler: check
  mappe: [["path",{"d":"M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"}]],   // tabler: folder
  kamera: [["path",{"d":"M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"}],["path",{"d":"M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}]],   // tabler: camera
  forbudt: [["path",{"d":"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}],["path",{"d":"M5.7 5.7l12.6 12.6"}]],   // tabler: ban
  maane: [["path",{"d":"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"}]],   // tabler: moon
  noegle: [["path",{"d":"M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z"}],["path",{"d":"M15 9h.01"}]],   // tabler: key
  journal: [["path",{"d":"M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18"}],["path",{"d":"M13 8l2 0"}],["path",{"d":"M13 12l2 0"}]],   // tabler: notebook
  farver: [["path",{"d":"M7 2m0 5a5 5 0 0 1 5 -5h0a5 5 0 0 1 5 5v10a5 5 0 0 1 -5 5h0a5 5 0 0 1 -5 -5z"}],["path",{"d":"M12 7m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}],["path",{"d":"M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}],["path",{"d":"M12 17m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}]],   // tabler: traffic-lights
  aktivitet: [["path",{"d":"M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}],["path",{"d":"M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"}],["path",{"d":"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}]],   // tabler: target
  liste: [["path",{"d":"M9 6l11 0"}],["path",{"d":"M9 12l11 0"}],["path",{"d":"M9 18l11 0"}],["path",{"d":"M5 6l0 .01"}],["path",{"d":"M5 12l0 .01"}],["path",{"d":"M5 18l0 .01"}]],   // tabler: list
};

const MOELLE_SVG_NS = 'http://www.w3.org/2000/svg';

// Returnerer et <svg>-element. Ukendt navn giver et tomt (men stadig
// korrekt dimensioneret) ikon, så et stavefejl aldrig vælter en side.
function moelleIkon(navn, valg){
  valg = valg || {};
  const stoerrelse = valg.stoerrelse || 24;

  const svg = document.createElementNS(MOELLE_SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(stoerrelse));
  svg.setAttribute('height', String(stoerrelse));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(valg.streg || 1.75));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'mikon' + (valg.klasse ? ' ' + valg.klasse : ''));

  const dele = MOELLE_IKONER[navn];
  if(!dele){
    if(window.console) console.warn('Ukendt ikon:', navn);
    return svg;
  }
  dele.forEach(function(del){
    const el = document.createElementNS(MOELLE_SVG_NS, del[0]);
    Object.keys(del[1]).forEach(function(a){ el.setAttribute(a, del[1][a]); });
    svg.appendChild(el);
  });
  return svg;
}
