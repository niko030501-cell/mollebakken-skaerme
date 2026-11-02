// ==================================================================
// MØDEDAG — fælles sorteringslogik for appen (Admin → Mødedag) og
// beboerskærmen (personaleskaerm-v2). Begge indlæser denne fil, så de
// altid regner ens. Ingen DOM, ingen netværk: kun ren logik.
//
// På en mødedag dækker vikarer gulvet, mens det faste personale er til
// p-møde. Hver person ligger i én af fire bunker:
//   vikar          — på gulvet (almindelig polaroid indtil vagten slutter)
//   kun_til_moede  — slutter senest ved skiftetidspunktet, vises ikke
//   fortsaetter    — starter før og slutter efter skiftetidspunktet; står i
//                    boksen "Kommer efter mødet" indtil skiftet
//   normal         — alle andre (aftenvagt, døgnvagt, nattevagt, leder ...)
//
// Skiftetidspunktet er den seneste sluttid blandt Vikar-bunken.
//
// Automatisk forslag: Workfeed-tagget "Vikar" (kun rolle Medarbejder) giver
// Vikar-bunken; resten sorteres efter reglerne ovenfor (kun rolle
// Medarbejder kan blive "kun til møde"/"fortsætter" automatisk). Døgnvagt
// der starter før skiftet foreslås som "fortsætter". Nattevagt og andre
// funktioner er altid "normal" medmindre brugeren selv flytter dem.
// Rettelser fra appen (tabellen moededag_rettelser) er KUN de personer
// brugeren selv har flyttet; de vinder over det automatiske forslag, og
// alle andre sorteres stadig automatisk — også når skiftetidspunktet
// ændrer sig. En række med bunke "ingen_moededag" betyder "dagen er ikke
// en mødedag" og slår alt fra.
//
// Tidspunkter sammenlignes som Date-værdier; den der kalder bruger
// browserens lokale tid. Rettelser peger på NAVN + DATO (som
// skjult_personale), fordi vagt-id'er i Workfeed-tabellen ikke er stabile.
// ==================================================================
(function(rod){

  var BUNKER = ['vikar', 'kun_til_moede', 'fortsaetter', 'normal'];
  var INGEN_BUNKE = 'ingen_moededag';
  var INGEN_NAVN = '*';

  // bunke (database) → klasse som skærmen bruger
  var KLASSE_AF_BUNKE = { vikar: 'vikar', kun_til_moede: 'skjul', fortsaetter: 'kommer', normal: 'normal' };
  var BUNKE_AF_KLASSE = { vikar: 'vikar', skjul: 'kun_til_moede', kommer: 'fortsaetter', normal: 'normal' };

  // ---- Vagter: samme rolle-navne og midnatssplit-fletning som skærmen ----

  function visningsRolle(raaRolle, tag){
    if(tag === 'Admin') return 'Kontor';
    var tabel = {
      'Daglig leder': 'Leder',
      'Køkkenpersonale': 'Køkken',
      'Pedel': 'Pedel',
      'Vågen nattevagt': 'Nattevagt',
      'Socialfaglig medarbejder': 'Medarbejder',
      'SSA': 'Medicinvagt',
      'Rådighedsvagt': 'Døgnvagt'
    };
    return tabel[raaRolle] || raaRolle;
  }

  // Samler rå rækker til ÉN vagt pr. person og rolle (Workfeeds midnatssplit
  // flettes sammen) og giver hver vagt sin visningsrolle. Identisk med
  // flettVagter() i personaleskaerm-v2/opslagstavle.html.
  function flet(rækker){
    function erNatvagt(r){
      var s = new Date(r.start);
      var e = new Date(r.slut);
      return s.getHours() >= 20 && e.getDate() !== s.getDate();
    }

    var rå = new Map();
    rækker.forEach(function(r){
      var nøgle = r.navn + '|' + r.rolle;
      if(!rå.has(nøgle)) rå.set(nøgle, []);
      rå.get(nøgle).push(r);
    });

    var vagter = [];
    rå.forEach(function(liste){
      liste.sort(function(a, b){ return new Date(a.start) - new Date(b.start); });
      var flettet = [];
      liste.forEach(function(r){
        var sidste = flettet[flettet.length - 1];
        if(sidste && Math.abs(new Date(r.start) - new Date(sidste.slut)) <= 60000){
          if(new Date(r.slut) > new Date(sidste.slut)) sidste.slut = r.slut;
          if(r.tag === 'Admin' || (!sidste.tag && r.tag)) sidste.tag = r.tag;
        } else {
          flettet.push(Object.assign({}, r));
        }
      });
      flettet.forEach(function(v){
        var rolle = visningsRolle(v.rolle, v.tag);
        if(rolle === 'Medarbejder' && erNatvagt(v)) rolle = 'Nattevagt';
        vagter.push(Object.assign({}, v, { rolle: rolle }));
      });
    });
    return vagter;
  }

  // ---- Sortering ----

  function erVikarTag(p){
    return p.tag === 'Vikar' && p.rolle === 'Medarbejder';
  }

  // Rettelser (rækker med navn + bunke) → { ingen: bool, map: Map navn→bunke }
  function læsRettelser(rettelser){
    var ud = { ingen: false, map: new Map() };
    (rettelser || []).forEach(function(r){
      if(r.bunke === INGEN_BUNKE){ ud.ingen = true; return; }
      if(BUNKER.indexOf(r.bunke) !== -1) ud.map.set(r.navn, r.bunke);
    });
    return ud;
  }

  // Automatisk forslag for én vagt, givet skiftetidspunktet (ms).
  function autoKlasse(p, skifteMs){
    if(erVikarTag(p)) return 'vikar';
    // Døgnvagt (Workfeed-rolle Rådighedsvagt) der starter før skiftet står i
    // boksen som lille navn; ved skiftet kommer den op som normalt døgnvagt-
    // kort (skærmen tegner kortet ud fra rollen, ikke ud fra bunken).
    if(p.rolle === 'Døgnvagt'){
      return new Date(p.start).getTime() < skifteMs && new Date(p.slut).getTime() > skifteMs ? 'kommer' : 'normal';
    }
    if(p.rolle !== 'Medarbejder') return 'normal';
    if(new Date(p.slut).getTime() <= skifteMs) return 'skjul';
    if(new Date(p.start).getTime() < skifteMs) return 'kommer';
    return 'normal';
  }

  // alle: flettede vagter (med visningsrolle). dagISO: den viste dag.
  // rettelser: rækker fra moededag_rettelser for netop den dag (valgfri).
  // Returnerer null når dagen ikke er en mødedag (ingen i Vikar-bunken, eller
  // dagen er markeret "ikke en mødedag").
  function find(alle, dagISO, rettelser){
    var r = læsRettelser(rettelser);
    if(r.ingen) return null;

    function erVikar(p){
      return r.map.has(p.navn) ? r.map.get(p.navn) === 'vikar' : erVikarTag(p);
    }
    var vikarVagter = alle.filter(function(p){ return p.dag === dagISO && erVikar(p); });
    if(vikarVagter.length === 0) return null;

    var skifteMs = Math.max.apply(null, vikarVagter.map(function(p){ return new Date(p.slut).getTime(); }));

    return {
      skifteMs: skifteMs,
      // klasse: 'vikar' | 'skjul' | 'kommer' | 'normal' (rettelser vinder)
      klasse: function(p){
        if(p.dag !== dagISO) return 'normal';
        if(r.map.has(p.navn)) return KLASSE_AF_BUNKE[r.map.get(p.navn)];
        return autoKlasse(p, skifteMs);
      },
      // Det automatiske forslag uden hensyn til brugerens egen rettelse af
      // netop denne person (appen viser det som "automatisk").
      forslag: function(p){
        if(p.dag !== dagISO) return 'normal';
        return autoKlasse(p, skifteMs);
      },
      erRettet: function(p){ return r.map.has(p.navn); }
    };
  }

  rod.MoedeDag = {
    BUNKER: BUNKER,
    INGEN_BUNKE: INGEN_BUNKE,
    INGEN_NAVN: INGEN_NAVN,
    KLASSE_AF_BUNKE: KLASSE_AF_BUNKE,
    BUNKE_AF_KLASSE: BUNKE_AF_KLASSE,
    flet: flet,
    find: find,
    erVikarTag: erVikarTag
  };
})(typeof window !== 'undefined' ? window : module.exports);
