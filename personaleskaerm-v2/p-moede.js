// ==================================================================
// P-MØDE-DAGE — regler for hvem der vises på personaleskærmen.
//
// En dag er en mødedag når mindst én af dagens vagter har tagget "Vikar"
// (tagget bruges kun på p-møde- og kursusdage). Skiftetidspunktet er den
// seneste sluttid blandt dagens vikar-vagter. For fast personale
// (visningsrolle "Medarbejder") gælder:
//   - slutter senest ved skiftet  → "skjul"   (kun til mødet, vises slet ikke)
//   - starter før og slutter efter → "kommer"  (boks "Kommer efter mødet"
//                                               før skiftet, ellers normal)
//   - starter ved/efter skiftet    → "normal"
// Vikarer er "vikar" (almindelige polaroids). Døgnvagt, Nattevagt og andre
// funktioner (leder, pedel, køkken) er altid "normal".
//
// Tidspunkterne sammenlignes som Date-værdier, så browserens lokale tid
// bruges af den der kalder. Ingen DOM og ingen datoer hentes her.
// ==================================================================
(function(rod){

  function erVikar(p){
    return p.tag === 'Vikar' && p.rolle === 'Medarbejder';
  }

  // alle: flettede vagter (med visningsrolle), dagISO: den viste dag.
  // Returnerer null på en almindelig dag.
  function find(alle, dagISO){
    const vikarVagter = alle.filter(function(p){ return erVikar(p) && p.dag === dagISO; });
    if(vikarVagter.length === 0) return null;

    const skifteMs = Math.max.apply(null, vikarVagter.map(function(p){ return new Date(p.slut).getTime(); }));

    return {
      skifteMs: skifteMs,
      klasse: function(p){
        if(p.dag !== dagISO) return 'normal';
        if(erVikar(p)) return 'vikar';
        if(p.rolle !== 'Medarbejder') return 'normal';
        if(new Date(p.slut).getTime() <= skifteMs) return 'skjul';
        if(new Date(p.start).getTime() < skifteMs) return 'kommer';
        return 'normal';
      }
    };
  }

  rod.pMøde = { find: find, erVikar: erVikar };
})(typeof window !== 'undefined' ? window : module.exports);
