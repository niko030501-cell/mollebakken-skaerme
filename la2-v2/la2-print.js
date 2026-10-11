// ==================================================================
// LA2 — printvenlig visning (Fase 4).
//
// "Print" åbner en visning der erstatter siden (topbar og editor skjules)
// med et A4-dokument, der følger planens opbygning. Derfra udskrives via
// browserens printdialog — "Gem som PDF" findes dér, ingen biblioteker.
//
// Indholdet bygges kun i DOM'en og fjernes igen ved Tilbage/log ud.
// Ingen template literals, ingen innerHTML med brugerdata.
// ==================================================================
window.LA2Print = (function(){
  'use strict';

  var T = window.LA2Templates;
  var rodNode = null;
  var sideStil = null;
  var aaben = false;
  var naarLukket = null;

  function U(){ return window.LA2Util; }
  function el(tag, props, kids){ return U().el(tag, props, kids); }

  function printRod(){
    if(!rodNode) rodNode = document.getElementById('printRoot');
    return rodNode;
  }

  function lokalDatoTekst(d){
    return d.getDate() + '. ' + ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august',
      'september', 'oktober', 'november', 'december'][d.getMonth()] + ' ' + d.getFullYear();
  }

  // ---------------------------------------------------------------
  // Svar-blokke
  // ---------------------------------------------------------------

  function skrivelinjer(n){
    var wrap = el('div', { class: 'print-linjer' });
    for(var i = 0; i < n; i++) wrap.appendChild(el('div', { class: 'print-linje' }));
    return wrap;
  }

  // v: streng, liste eller tom → udfyldt tekst eller linjer til håndskrift
  function svarBlok(v, antalLinjer){
    if(Array.isArray(v)){
      // lister kan være tekster (ældre planer) eller { id, t }
      var tekster = window.LA2Punkter.tekster(v);
      if(tekster.length){
        var ul = el('ul', { class: 'print-liste' });
        tekster.forEach(function(x){ ul.appendChild(el('li', { text: x })); });
        return ul;
      }
    }else if(typeof v === 'string' && v.trim()){
      return el('p', { class: 'print-tekst', text: v });
    }
    return skrivelinjer(antalLinjer || 3);
  }

  function spoergsmaal(label, v, linjer){
    return el('div', { class: 'print-spm' }, [
      el('div', { class: 'print-spm-tekst', text: label }),
      svarBlok(v, linjer)
    ]);
  }

  // ---------------------------------------------------------------
  // Dokumentets dele
  // ---------------------------------------------------------------

  function standardIndhold(tpl, key, a){
    var wrap = el('div', { class: 'print-krop' });
    tpl.sections.forEach(function(sec){
      var sekt = el('section', { class: 'print-sektion' });
      sekt.appendChild(el('h2', { class: 'print-h2', text: T.tekst(sec.heading, key) || '' }));
      sec.questions.forEach(function(q){
        var label = T.tekst(q.text, key);
        if(!label) return;
        sekt.appendChild(spoergsmaal(label, a[sec.id + '.' + q.id], 3));
      });
      wrap.appendChild(sekt);
    });
    return wrap;
  }

  var NIVEAU_SYMBOL = { groen: '●', gul: '▲', roed: '■' };   // ● ▲ ■ — forskellige former i sort-hvid

  function tryghedIndhold(tpl, key, a){
    var wrap = el('div', { class: 'print-krop' });
    tpl.sections.forEach(function(sec){
      // Farvestribe som eget element (ikke border-left), så rammen er ens hele vejen rundt
      var indhold = el('div', { class: 'print-niveau-indhold' });
      var gemtHl = a[sec.id + '.headline'];
      var overskrift = (typeof gemtHl === 'string' && gemtHl.trim())
        ? gemtHl
        : (T.tekst(sec.headline, key) || T.tekst(sec.heading, key) || '');
      indhold.appendChild(el('h2', { class: 'print-niveau-titel' }, [
        el('span', { class: 'print-niveau-maerke', text: (NIVEAU_SYMBOL[sec.level] || '') + ' ' + sec.levelLabel.toUpperCase() }),
        ' ' + overskrift
      ]));
      sec.questions.forEach(function(q){
        var label = T.tekst(q.text, key);
        if(!label) return;
        indhold.appendChild(spoergsmaal(label, a[sec.id + '.' + q.id], 3));
      });
      wrap.appendChild(el('section', { class: 'print-niveau print-niveau-' + sec.level }, [
        el('div', { class: 'print-niveau-streg', 'aria-hidden': 'true' }),
        indhold
      ]));
    });
    return wrap;
  }

  function laeringIndhold(tpl, key, content){
    var a = (content && content.a) || {};
    var wrap = el('div', { class: 'print-krop' });

    var tabel = el('table', { class: 'print-laering' });
    var hoved = el('tr', null, [el('th', { class: 'print-hjoerne', text: '' })]);
    tpl.columns.forEach(function(c){ hoved.appendChild(el('th', { class: 'print-kolonne', text: c.label })); });
    tabel.appendChild(el('thead', null, [hoved]));

    var krop = el('tbody');
    tpl.rows.forEach(function(row){
      var qs = row.questions.filter(function(q){ return !!T.tekst(q.text, key); });
      if(!qs.length) return;
      var tr = el('tr', null, [el('th', { class: 'print-raekke-titel', text: row.heading })]);
      if(row.perColumn){
        tpl.columns.forEach(function(c){
          var td = el('td', { class: 'print-celle' });
          qs.forEach(function(q){
            td.appendChild(spoergsmaal(T.tekst(q.text, key), a[row.id + '.' + q.id + '.' + c.id], 2));
          });
          tr.appendChild(td);
        });
      }else{
        var td2 = el('td', { class: 'print-celle', colspan: String(tpl.columns.length) });
        qs.forEach(function(q){
          td2.appendChild(spoergsmaal(T.tekst(q.text, key), a[row.id + '.' + q.id], 3));
        });
        tr.appendChild(td2);
      }
      krop.appendChild(tr);
    });
    tabel.appendChild(krop);
    wrap.appendChild(tabel);

    // Kurve
    var curve = tpl.curve;
    var vaerdier = [];
    var gemtKurve = window.LA2Punkter.kurve7(content && content.curve, curve.points.length);
    curve.points.forEach(function(p, i){
      var v = gemtKurve[i];
      vaerdier.push(typeof v === 'number' ? v : null);
    });
    var svg = window.LA2Plans.svgEl('svg', { viewBox: '0 0 600 240', class: 'print-kurve-svg', role: 'img', 'aria-label': curve.title });
    window.LA2Plans.tegnKurve(svg, curve, vaerdier);

    var vTabel = el('table', { class: 'print-kurve-tabel' });
    var r1 = el('tr'); var r2 = el('tr');
    curve.points.forEach(function(p, i){
      r1.appendChild(el('th', { text: p.label }));
      r2.appendChild(el('td', { text: vaerdier[i] === null ? '–' : String(vaerdier[i]) }));
    });
    vTabel.appendChild(r1); vTabel.appendChild(r2);

    wrap.appendChild(el('section', { class: 'print-sektion print-kurve' }, [
      el('h2', { class: 'print-h2', text: curve.title }),
      el('p', { class: 'print-hint', text: curve.hint }),
      svg,
      vTabel
    ]));
    return wrap;
  }

  // ---------------------------------------------------------------
  // Hele dokumentet
  // o: { tpl, key, content, residentName, residentColor, perspektivLabel,
  //      statusTekst, filledWith, episodeTitle, episodeDate, versionTekst, userName }
  // ---------------------------------------------------------------

  function byggDokument(o){
    var tpl = o.tpl;
    var a = (o.content && o.content.a) || {};

    var titel = tpl.title;
    if(tpl.kind === 'laering' && o.episodeTitle) titel += ': ' + o.episodeTitle;

    var tag = el('span', { class: 'print-beboer', text: o.residentName });
    if(/^#[0-9a-fA-F]{3,8}$/.test(o.residentColor || '')) tag.style.background = o.residentColor;

    var meta = [];
    meta.push(el('span', { text: o.perspektivLabel }));
    if(o.statusTekst) meta.push(el('span', { text: o.statusTekst }));
    if(tpl.kind === 'laering' && o.episodeDate){
      meta.push(el('span', { text: 'Episode: ' + lokalDatoTekst(U().lokalDato(o.episodeDate)) }));
    }

    var hoved = el('header', { class: 'print-hoved' }, [
      el('div', { class: 'print-eyebrow', text: 'Møllebakken · LA2 · ' + tpl.fase }),
      el('h1', { class: 'print-h1', text: titel }),
      el('div', { class: 'print-id' }, [tag, el('div', { class: 'print-meta' }, meta)]),
      el('div', { class: 'print-udfyldt' }, [
        el('span', { class: 'print-etiket', text: 'Udfyldt sammen med: ' }),
        el('span', { text: o.filledWith || '' }),
        o.filledWith ? null : el('span', { class: 'print-streg' })
      ])
    ]);

    var krop;
    if(tpl.kind === 'laering') krop = laeringIndhold(tpl, o.key, o.content);
    else if(tpl.kind === 'tryghed') krop = tryghedIndhold(tpl, o.key, a);
    else krop = standardIndhold(tpl, o.key, a);

    var kilde = el('p', { class: 'print-kilde', text: T.kilde.tekst + ' (' + T.kilde.visUrl + ')' });

    var fod = el('div', { class: 'print-fod' }, [
      el('div', null, [
        el('strong', { text: o.residentName }),
        ' · ' + tpl.title + ' · ' + o.perspektivLabel + ' · ' + o.versionTekst
      ]),
      el('div', { text: 'Printet ' + lokalDatoTekst(new Date()) + ' af ' + o.userName }),
      el('div', { class: 'print-fortroligt', text: 'Fortroligt: indeholder personfølsomme oplysninger' })
    ]);

    // Tabel med tfoot gentager sidefoden på hver udskrevet side og
    // reserverer pladsen, så indholdet aldrig løber ind i den.
    var tabel = el('table', { class: 'print-ramme' }, [
      el('tbody', null, [el('tr', null, [el('td', null, [hoved, krop, kilde])])]),
      el('tfoot', null, [el('tr', null, [el('td', null, [fod])])])
    ]);

    return el('article', { class: 'print-dokument print-' + (tpl.kind === 'laering' ? 'liggende' : 'staaende') }, [tabel]);
  }

  // ---------------------------------------------------------------
  // Åbn / luk
  // ---------------------------------------------------------------

  function luk(){
    if(!aaben) return;
    aaben = false;
    document.body.classList.remove('print-mode');
    var r = printRod();
    if(r) while(r.firstChild) r.removeChild(r.firstChild);
    if(sideStil && sideStil.parentNode) sideStil.parentNode.removeChild(sideStil);
    sideStil = null;
    var cb = naarLukket;
    naarLukket = null;
    if(cb) cb();
  }

  // Fælles: viser et færdigbygget A4-dokument i printvisningen
  function visDokument(dokument, liggende, onClose){
    var r = printRod();
    if(!r) return;
    luk();
    naarLukket = onClose || null;

    sideStil = document.createElement('style');
    sideStil.textContent = '@page{size:A4 ' + (liggende ? 'landscape' : 'portrait') + ';margin:12mm 12mm 10mm 12mm;}';
    document.head.appendChild(sideStil);

    var verktoej = el('div', { class: 'print-verktoej' }, [
      el('button', { type: 'button', class: 'knap knap-sekundaer', text: '← Tilbage', onclick: luk }),
      el('span', { class: 'print-verktoej-tekst', text: liggende ? 'Udskrives i liggende A4' : 'Udskrives i stående A4' }),
      el('button', { type: 'button', class: 'knap', text: 'Udskriv / gem som PDF', onclick: function(){ window.print(); } })
    ]);

    while(r.firstChild) r.removeChild(r.firstChild);
    r.appendChild(verktoej);
    r.appendChild(dokument);
    aaben = true;
    document.body.classList.add('print-mode');
    window.scrollTo(0, 0);
  }

  function aabn(o, onClose){
    if(!printRod()) return;
    visDokument(byggDokument(o), o.tpl.kind === 'laering', onClose);
  }

  // Et dokument bygget udenfor (fx Sammenlign)
  function aabnDokument(node, liggende, onClose){
    visDokument(node, !!liggende, onClose);
  }

  return { open: aabn, openNode: aabnDokument, close: luk, isOpen: function(){ return aaben; } };
})();
