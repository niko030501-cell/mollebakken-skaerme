// ==================================================================
// LA2 — punkter med fast id og kurver med faste tidspunkter.
//
// Punkter i et listefelt gemmes som { id, t }, så et punkt kan genkendes
// på tværs af versioner (bruges af Sammenlign). Ældre planer gemte ren
// tekst; den læses som punkter med id'erne l0, l1, … (position), som
// skrives ind ved næste gem. Tekstfelter (én streng) forbliver strenge og
// tæller som ét punkt med id "felt" i sammenligningen.
//
// Id'er er kun unikke inden for ét felt i én plan.
//
// Kurven har 7 faste tidspunkter. Ældre kurver med 6 værdier flyttes ét
// tidspunkt frem (første plads tom) — der opfindes aldrig værdier.
// ==================================================================
window.LA2Punkter = (function(){
  'use strict';

  var ALFABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

  // Nyt kort id (fx "p4k9x"), der ikke findes i `brugte` ({id: true})
  function nytId(brugte){
    var id;
    do{
      id = 'p';
      for(var i = 0; i < 5; i++){
        id += ALFABET.charAt(Math.floor(Math.random() * ALFABET.length));
      }
    }while(brugte && brugte[id]);
    return id;
  }

  // Listefelt (liste af tekster eller {id,t}, eller en gammel streng) -> [{ id, t }]
  function tilPunkter(vaerdi){
    var ud = [];
    var brugte = {};
    if(Array.isArray(vaerdi)){
      vaerdi.forEach(function(x, i){
        var t = '';
        var id = '';
        if(typeof x === 'string'){
          t = x;
        }else if(x && typeof x === 'object'){
          t = typeof x.t === 'string' ? x.t : '';
          id = typeof x.id === 'string' ? x.id : '';
        }
        if(!id) id = 'l' + i;
        if(brugte[id]) id = nytId(brugte);
        brugte[id] = true;
        ud.push({ id: id, t: t });
      });
    }else if(typeof vaerdi === 'string' && vaerdi.trim()){
      ud.push({ id: 'l0', t: vaerdi.trim() });
    }
    return ud;
  }

  // Kun teksterne (udfyldte), fx til print
  function tekster(vaerdi){
    return tilPunkter(vaerdi)
      .map(function(p){ return p.t.trim(); })
      .filter(function(t){ return t.length > 0; });
  }

  // Kurve -> præcis `antal` værdier (tal eller null)
  function kurve7(arr, antal){
    var n = antal || 7;
    var a = Array.isArray(arr) ? arr.slice() : [];
    if(a.length === 6) a.unshift(null);          // gammel kurve: 6 -> 7
    while(a.length < n) a.push(null);
    return a.slice(0, n).map(function(v){ return typeof v === 'number' ? v : null; });
  }

  return {
    nytId: nytId,
    tilPunkter: tilPunkter,
    tekster: tekster,
    kurve7: kurve7
  };
})();
