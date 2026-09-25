// ==================================================================
// AUTO-GENINDLÆSNING ved ny version (personaleskaerm-v2, personaletavle-v2)
//
// Skærmene står ubemandet og ville ellers køre den gamle kode, indtil
// nogen trykker F5. Hvert 2. minut tjekkes sidens egen HTML + alle filer
// den selv har linket ind fra samme site (CSS/JS). Er indholdet ændret
// siden siden blev åbnet, genindlæses den.
//
// Bevidst selvstændig: ingen afhængighed af resten af siden, og indlæst
// som sit eget <script> først i <head> — så en fejl i sidens øvrige kode
// ikke kan forhindre en rettelse i at nå frem.
//
// Sikkerhedsregler — skærmen må aldrig ende på en fejlside pga. dette:
//  * Genindlæs KUN hvis ALLE filer kunne hentes (res.ok). Nede net / fejl
//    fra GitHub = gør ingenting, behold det der kører.
//  * Den nye version skal ses ENS ved to tjek i træk, før der genindlæses
//    (så en halvfærdig udrulning aldrig bliver indlæst).
//  * Maks. én genindlæsning pr. 10 min (beskytter mod en løkke).
//  * Ikke hvis nogen har rørt skærmen inden for de sidste 2 min.
//
// Bruger cache: 'no-cache' → browseren spørger GitHub "er filen ændret?"
// og får typisk et næsten gratis "304 uændret". GitHub Pages' CDN kan
// selv være op til 10 min bagud, så en ny version når typisk skærmen
// inden for ca. 15 min efter push.
// ==================================================================
(function(){
  var TJEK_INTERVAL = 2 * 60 * 1000;
  var MIN_MELLEM_GENINDLAESNING = 10 * 60 * 1000;
  var ROLIG_EFTER_BERØRING = 2 * 60 * 1000;
  var NØGLE = 'autoReloadSidst:' + location.pathname;

  var basis = null;       // fingeraftryk af den version der kører
  var kandidat = null;    // ny version set ved forrige tjek
  var sidstRørt = 0;

  ['pointerdown', 'keydown', 'touchstart'].forEach(function(t){
    window.addEventListener(t, function(){ sidstRørt = Date.now(); }, { passive: true, capture: true });
  });

  function filer(){
    var urls = [location.href.split('#')[0]];
    var el = document.querySelectorAll('script[src], link[rel="stylesheet"][href]');
    for(var i = 0; i < el.length; i++){
      var u = new URL(el[i].src || el[i].href, location.href);
      if(u.origin === location.origin && urls.indexOf(u.href) === -1) urls.push(u.href);
    }
    return urls;
  }

  // Enkel tekst-hash (djb2) — vi skal kun kunne se OM noget er ændret.
  function hash(tekst){
    var h = 5381;
    for(var i = 0; i < tekst.length; i++) h = ((h << 5) + h + tekst.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + tekst.length;
  }

  function fingeraftryk(){
    return Promise.all(filer().map(function(u){
      return fetch(u, { cache: 'no-cache' }).then(function(res){
        if(!res.ok) throw new Error(u + ' ' + res.status);
        return res.text();
      }).then(function(tekst){
        if(u === location.href.split('#')[0] && tekst.indexOf('</html>') === -1) throw new Error('ufuldstændig HTML');
        return u + '=' + hash(tekst);
      });
    })).then(function(dele){ return dele.join('|'); });
  }

  function sidstGenindlæst(){
    try { return Number(localStorage.getItem(NØGLE)) || 0; } catch(e){ return 0; }
  }

  function genindlæs(){
    try { localStorage.setItem(NØGLE, String(Date.now())); } catch(e){}
    location.reload();
  }

  function tjek(){
    fingeraftryk().then(function(fa){
      if(basis === null){ basis = fa; return; }
      if(fa === basis){ kandidat = null; return; }
      if(fa !== kandidat){ kandidat = fa; return; }   // set første gang — vent på bekræftelse
      if(Date.now() - sidstGenindlæst() < MIN_MELLEM_GENINDLAESNING) return;
      if(Date.now() - sidstRørt < ROLIG_EFTER_BERØRING) return;
      genindlæs();
    }).catch(function(e){
      // Net nede eller fil utilgængelig: behold det der kører, prøv igen senere.
      console.warn('Auto-genindlæsning: springer tjek over', e && e.message);
    });
  }

  // Første fingeraftryk tages lige efter indlæsning = den version der kører.
  window.addEventListener('load', function(){ setTimeout(tjek, 5000); });
  setInterval(tjek, TJEK_INTERVAL);
})();
