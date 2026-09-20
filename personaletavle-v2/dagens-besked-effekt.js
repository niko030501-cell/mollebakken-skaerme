// ============================================================
// DAGENS BESKED — effekt + trigger
// Kræver dagens-besked.js (beskedlisten) og dagens-besked.css.
//
// Vises kl. 09:02 hver dag (09:02:00–09:04:59 hvis siden først indlæses
// senere), én gang pr. dag. Al tidslogik bruger browserens lokale tid.
//
// Test: ?testbesked=1 viser effekten med det samme uden at gemme "vist i dag".
//       ?testbesked=1&dag=5 viser beskeden for dag-nummer 5.
//       I konsollen: DagensBesked.vis() eller DagensBesked.vis(5)
// ============================================================

(function(){

  const STARTTID_MIN   = 9 * 60 + 2;   // 09:02
  const SLUTTID_MIN    = 9 * 60 + 5;   // 09:05 — fra da vises den ikke længere
  const BACKUP_MS      = 15000;
  const LAGRING_NØGLE  = 'dagensBeskedSidstVist';

  const HOLD_MS        = 10000;   // beskeden står stille, efter sidste ord er kommet
  const UDTONING_MS    = 1500;    // skal matche dbUdtoning i dagens-besked.css
  const ORD_START_MS   = 2200;    // første ord (efter sol + "God morgen" + dato)
  const ORD_TRIN_MS    = 280;     // forsinkelse mellem ordene
  const ORD_VARIGHED_MS= 800;     // skal matche .dbOrd i CSS
  const REDUCERET_MS   = 1800;    // reduceret bevægelse: bare fade ind, så hold

  const UGEDAGE   = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
  const MÅNEDER   = ['januar','februar','marts','april','maj','juni','juli','august','september','oktober','november','december'];

  let overlay = null;
  let holdTimer = null;
  let fjernTimer = null;
  let triggerTimer = null;
  let triggerMål = 0;
  let sidstVistDato = null;

  // ---- Hjælpefunktioner ----

  function datoISO(d){
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  }

  function læsGemt(){
    try { return localStorage.getItem(LAGRING_NØGLE); }
    catch(e){ return null; }
  }

  function gem(datoStr){
    try { localStorage.setItem(LAGRING_NØGLE, datoStr); }
    catch(e){ /* localStorage ikke tilgængelig — variablen i hukommelsen dækker resten af sessionen */ }
  }

  function vilHaveReduceretBevægelse(){
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch(e){
      return false;
    }
  }

  function el(tag, klasse, tekst){
    const e = document.createElement(tag);
    if(klasse) e.className = klasse;
    if(tekst !== undefined) e.textContent = tekst;
    return e;
  }

  // ---- Overlay ----

  function fjernOverlay(){
    clearTimeout(holdTimer);
    clearTimeout(fjernTimer);
    holdTimer = null;
    fjernTimer = null;
    document.removeEventListener('keydown', luk);

    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  // Tryk/klik/tast lukker med det samme.
  function luk(){
    fjernOverlay();
  }

  function startUdtoning(){
    if(!overlay) return;
    overlay.classList.add('dbLukker');
    fjernTimer = setTimeout(fjernOverlay, UDTONING_MS + 100);
  }

  function vis(dagOverride){
    if(overlay) return false;

    const beskedTekst = (window.DagensBesked && window.DagensBesked.dagensBesked)
      ? window.DagensBesked.dagensBesked(new Date(), dagOverride)
      : '';
    if(!beskedTekst) return false;

    const nu = new Date();
    const reduceret = vilHaveReduceretBevægelse();

    overlay = el('div', 'dbOverlay');

    overlay.appendChild(el('div', 'dbSol'));

    const top = el('div', 'dbTop');
    top.appendChild(el('div', 'dbHilsen', 'God morgen'));
    top.appendChild(el('div', 'dbDato', UGEDAGE[nu.getDay()] + ' ' + nu.getDate() + '. ' + MÅNEDER[nu.getMonth()]));
    overlay.appendChild(top);

    const midt = el('div', 'dbMidt');
    const besked = el('div', 'dbBesked');
    const ord = beskedTekst.split(/\s+/).filter(function(o){ return o.length > 0; });

    ord.forEach(function(o, i){
      if(i > 0) besked.appendChild(document.createTextNode(' '));
      const span = el('span', 'dbOrd', o);
      span.style.animationDelay = (ORD_START_MS + i * ORD_TRIN_MS) + 'ms';
      besked.appendChild(span);
    });

    midt.appendChild(besked);
    overlay.appendChild(midt);

    overlay.addEventListener('click', luk);
    document.addEventListener('keydown', luk);
    document.body.appendChild(overlay);

    const indeMs = reduceret
      ? REDUCERET_MS
      : ORD_START_MS + Math.max(0, ord.length - 1) * ORD_TRIN_MS + ORD_VARIGHED_MS;
    holdTimer = setTimeout(startUdtoning, indeMs + HOLD_MS);

    return true;
  }

  // ---- Trigger ----

  function tjek(){
    const nu = new Date();
    const minutter = nu.getHours() * 60 + nu.getMinutes();
    if(minutter < STARTTID_MIN || minutter >= SLUTTID_MIN) return;

    const iDag = datoISO(nu);
    if(sidstVistDato === iDag) return;
    if(overlay) return;

    // Gemmes kun når effekten faktisk vises, og før den vises — så et tidligt
    // tryk på skærmen (der lukker den) ikke får den til at dukke op igen.
    if(vis()){
      sidstVistDato = iDag;
      gem(iDag);
    }
  }

  // setTimeout til næste 09:02:00 — sættes op igen hver gang den udløser, så
  // det også virker dagen efter og dagen efter dén.
  function planlægNæste(){
    clearTimeout(triggerTimer);

    const nu = new Date();
    let mål = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), 9, 2, 0, 0);
    if(mål.getTime() <= nu.getTime()){
      mål = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + 1, 9, 2, 0, 0);
    }

    triggerMål = mål.getTime();
    triggerTimer = setTimeout(function(){
      try { tjek(); } catch(e){ console.error('Dagens besked:', e); }
      planlægNæste();
    }, triggerMål - nu.getTime());
  }

  // Backup hvert 15. sekund: TV'et kan være langsomt eller have sovet, og så
  // kan setTimeout være udløst for sent eller helt forsvundet.
  function backupTjek(){
    try {
      tjek();
      if(Date.now() > triggerMål + 5000) planlægNæste();
    } catch(e){
      console.error('Dagens besked:', e);
    }
  }

  // ---- Start ----

  function start(){
    if(window.DagensBesked) window.DagensBesked.vis = function(dag){ return vis(dag); };

    const params = new URLSearchParams(window.location.search);
    if(params.get('testbesked') === '1'){
      const dagParam = params.get('dag');
      const dag = (dagParam !== null && dagParam !== '' && !isNaN(parseInt(dagParam, 10)))
        ? parseInt(dagParam, 10)
        : undefined;
      vis(dag);   // rører hverken sidstVistDato eller localStorage
    }

    sidstVistDato = læsGemt();
    planlægNæste();
    setInterval(backupTjek, BACKUP_MS);
    backupTjek();   // side indlæst mellem 09:02 og 09:05 → vis straks
  }

  try {
    start();
  } catch(e){
    console.error('Dagens besked kunne ikke starte:', e);
  }

})();
