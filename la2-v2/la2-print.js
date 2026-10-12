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
  // Dokumentet: toppen og planens krop kommer fra LA2Plans (samme funktioner
  // som på redigeringssiden). Her kommer kun sidefoden og papirets ramme til.
  // ---------------------------------------------------------------

  // Papirplanens format: Tryghedsplanen står, de øvrige ligger
  function erLiggende(tpl){
    return tpl.kind !== 'faser' && tpl.kind !== 'standard';
  }

  function byggDokument(o){
    var tpl = o.tpl;
    var P = window.LA2Plans;

    var top = P.byggPlanTop({
      mode: 'print', tpl: tpl, planType: o.planType, persp: o.persp, titel: o.titel,
      navn: o.residentName, farve: o.residentColor,
      udfyldtLabel: o.udfyldtLabel, fwTekst: o.filledWith,
      episode: tpl.kind === 'laering', episodeTitel: o.episodeTitle, episodeDato: o.episodeDate,
      opdateret: o.updatedAt, versionNr: o.versionNr, reviewDue: o.reviewDue, months: o.months
    });

    var krop = P.byggPlanKrop(tpl, o.key, o.content, 'print');
    // Sidefod: to linjer (side X af Y sættes af @page, se nedenfor)
    var versionNr = o.versionNr ? 'version ' + o.versionNr : o.versionTekst.toLowerCase();
    var fod = el('div', { class: 'print-fod print-fod-2' }, [
      el('div', { class: 'print-fod-linje' }, [
        el('div', null, [el('strong', { text: o.residentName }), ' · ' + o.titel + ' · ' + versionNr]),
        el('div', { text: 'Printet ' + lokalDatoTekst(new Date()) + ' af ' + o.userName }),
        el('div', { class: 'print-fortroligt', text: 'Fortroligt' })
      ]),
      el('div', { class: 'print-fod-linje print-fod-lille' }, [
        el('div', { text: 'Indeholder personfølsomme oplysninger · Opbygning efter LA2 og LA2u, Sopra (' + T.kilde.visUrl + ')' })
      ])
    ]);

    // Gentages øverst på hver side: beboerens navn og planens navn
    var sidehoved = el('div', { class: 'print-sidehoved' }, [
      el('strong', { text: o.residentName }),
      ' · ' + o.titel
    ]);

    // Tabel med tfoot gentager sidefoden på hver udskrevet side og
    // reserverer pladsen, så indholdet aldrig løber ind i den.
    var tabel = el('table', { class: 'print-ramme' }, [
      el('thead', null, [el('tr', null, [el('td', null, [sidehoved])])]),
      el('tbody', null, [el('tr', null, [el('td', null, [top.node, krop])])]),
      el('tfoot', null, [el('tr', null, [el('td', null, [fod])])])
    ]);

    return el('article', { class: 'print-dokument sp-plan print-' + (erLiggende(tpl) ? 'liggende' : 'staaende') }, [tabel]);
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
  function visDokument(dokument, liggende, onClose, valg){
    valg = valg || {};
    var r = printRod();
    if(!r) return;
    luk();
    naarLukket = onClose || null;

    sideStil = document.createElement('style');
    sideStil.textContent = '@page{size:A4 ' + (liggende ? 'landscape' : 'portrait') + ';margin:12mm 12mm 14mm 12mm;' +
      '@bottom-right{content:"Side " counter(page) " af " counter(pages);font-family:Archivo,sans-serif;font-size:9pt;font-weight:700;color:#4a5b58;}}';
    document.head.appendChild(sideStil);

    var verktoej = el('div', { class: 'print-verktoej' }, [
      el('button', { type: 'button', class: 'knap knap-sekundaer', text: valg.tilbageTekst || '← Tilbage', onclick: luk }),
      el('span', { class: 'print-verktoej-tekst', text: liggende ? 'Udskrives i liggende A4' : 'Udskrives i stående A4' }),
      el('button', { type: 'button', class: 'knap', text: 'Udskriv / gem som PDF', onclick: function(){ window.print(); } })
    ]);

    while(r.firstChild) r.removeChild(r.firstChild);
    r.appendChild(verktoej);
    r.appendChild(dokument);
    aaben = true;
    document.body.classList.add('print-mode');
    window.scrollTo(0, 0);
    if(valg.autoPrint) setTimeout(function(){ window.print(); }, 150);
  }

  function aabn(o, onClose, valg){
    if(!printRod()) return;
    visDokument(byggDokument(o), erLiggende(o.tpl), onClose,
      { tilbageTekst: 'Tilbage til redigering', autoPrint: !!(valg && valg.autoPrint) });
  }

  // Et dokument bygget udenfor (fx Sammenlign)
  function aabnDokument(node, liggende, onClose){
    visDokument(node, !!liggende, onClose);
  }

  return { open: aabn, openNode: aabnDokument, close: luk, isOpen: function(){ return aaben; } };
})();
