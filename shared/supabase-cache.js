// ==================================================================
// Lille cache til skærmenes Supabase-hentninger.
//
// Hvorfor: skærmene står tændt hele døgnet og tegner sig selv igen hvert
// minut. Hvis hver gentegning også henter fra Supabase, bliver det til
// tusindvis af kald om dagen — og hvert kald skriver en log-linje, som
// tæller mod gratis-planens "Log Ingestion"-kvote.
//
// Sådan virker det: cachetHent(nøgle, ms, lav) returnerer det samme svar
// igen, indtil der er gået `ms` millisekunder siden sidste rigtige
// hentning. Skærmen kan derfor stadig gentegne hvert minut (så personale
// dukker op præcis når vagten starter, og 19:30/00:00-skiftene sker til
// tiden) — den spørger bare ikke databasen hver gang.
//
// Nøglen SKAL indeholde de parametre forespørgslen bruger (dato, uge,
// aktivitetsnavn osv.). Så giver en ny dag/uge automatisk en ny nøgle og
// dermed en frisk hentning med det samme.
//
// Fejl caches ikke: ved fejl prøves der igen ved næste kald.
// ==================================================================
(function(){
  var cache = {};

  window.cachetHent = function(nøgle, ms, lav){
    var nu = Date.now();
    var c = cache[nøgle];
    if(c && nu - c.tid < ms) return c.løfte;

    var løfte = Promise.resolve()
      .then(function(){ return lav(); })
      .then(function(svar){
        if(svar && svar.error && cache[nøgle] && cache[nøgle].løfte === løfte) delete cache[nøgle];
        return svar;
      }, function(fejl){
        if(cache[nøgle] && cache[nøgle].løfte === løfte) delete cache[nøgle];
        throw fejl;
      });

    cache[nøgle] = { tid: nu, løfte: løfte };
    return løfte;
  };

  // Gør alle cachede svar forældede (bruges fx hvis man vil tvinge en
  // frisk hentning).
  window.tømHentCache = function(){ cache = {}; };
})();
