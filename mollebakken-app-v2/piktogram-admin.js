// ==================================================================
// PIKTOGRAMMER — admin til beboerens iPad (leyla-v2)
// ==================================================================
// Del 2: fanen Billeder (billeder, kategorier) og kobling til ugeplanen.
// Fanerne I dag, Valg og Noter kommer i næste dele.
//
// Al adgang går gennem personale_pik_*-funktionerne (shared/piktogram-admin-schema.sql)
// og bruger samme personale-login som Træning (token gemt i trToken).
// Alt tekst sættes med textContent / DOM-metoder (ingen HTML-strenge med brugerinput).
//
// Alt er pr. beboer: skift PK_BEBOER_ID/PK_BEBOER_NAVN, hvis siden senere flyttes under Beboer.

const PK_BEBOER_ID = '0bd80a40-4dd9-4567-bc5b-b0f510620aea';   // beboere.id for Leyla
const PK_BEBOER_NAVN = 'Leyla';
const PK_BILLEDE_URL = SUPABASE_URL + '/storage/v1/object/public/piktogram-billeder/';
const PK_FARVER = ['#5FA090', '#5B7FA6', '#6B6EA6', '#9B72B0', '#C15C6B', '#C97B4A', '#D4A03C', '#7C8C5C', '#8C6A5B', '#6B7B86'];
const PK_MAKS_PX = 500;

let pk = { fane: 'billeder', visning: 'billeder', data: null, valg: null, noter: null, soeg: '', fejl: '', traekId: null };

// ---------- Hjælpere ----------

function pkEl(tag, klasse, tekst){
  const e = document.createElement(tag);
  if(klasse) e.className = klasse;
  if(tekst != null) e.textContent = tekst;
  return e;
}

function pkKnap(tekst, klasse, handler){
  const k = pkEl('button', 'pkKnap ' + (klasse || ''), tekst);
  k.type = 'button';
  if(handler) k.addEventListener('click', handler);
  return k;
}

function pkUrl(sti){ return sti ? PK_BILLEDE_URL + sti : ''; }

function pkBilledeEl(sti, alt){
  const img = document.createElement('img');
  img.src = pkUrl(sti);
  img.alt = alt || '';
  img.loading = 'lazy';
  img.draggable = false;
  return img;
}

function pkToast(tekst){
  if(typeof visToast === 'function') visToast(tekst); else console.log(tekst);
}

// Kalder en personale_pik_*-funktion. Returnerer {data} eller {fejl}.
async function pkKald(navn, args){
  if(!sb) return { fejl: 'Ingen forbindelse til databasen.' };
  const res = await sb.rpc(navn, Object.assign({ p_token: trToken, p_beboer_id: PK_BEBOER_ID }, args || {}));
  if(res.error){
    const msg = res.error.message || '';
    if(res.error.code === '28000' || msg.indexOf('ikke logget ind') >= 0){
      trGemToken(null);
      pk.data = null;
      pk.fejl = 'Du er logget ud. Log ind igen med personalekoden.';
      pkTegn();
      return { fejl: pk.fejl };
    }
    return { fejl: 'Noget gik galt. Prøv igen.' };
  }
  return { data: res.data };
}

// Navneforslag ud fra filnavn: "toilet.png" -> "Toilet", "vaske_haender-2.jpg" -> "Vaske haender 2"
function pkNavnFraFil(filnavn){
  let n = String(filnavn || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if(!n) return '';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// Skalerer et billede ned til maks 500 px og gemmer som jpeg (hvid baggrund bag gennemsigtighed).
function pkSkaler(fil){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fil);
    const img = new Image();
    img.onload = () => {
      const skala = Math.min(1, PK_MAKS_PX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * skala));
      c.height = Math.max(1, Math.round(img.height * skala));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Billedet kunne ikke behandles.')), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Filen er ikke et billede, der kan åbnes.')); };
    img.src = url;
  });
}

// Uploader et skaleret billede via edge-funktionen piktogram-billede. Returnerer stien i bucket'en.
async function pkUpload(blob){
  const start = await sb.functions.invoke('piktogram-billede', { body: { action: 'upload', token: trToken } });
  if(start.error){
    const status = start.error.context && start.error.context.status;
    if(status === 401){ trGemToken(null); throw new Error('Du er logget ud. Log ind igen.'); }
    throw new Error('Kunne ikke starte upload.');
  }
  const d = start.data;
  if(!d || !d.token || !d.sti) throw new Error('Kunne ikke starte upload.');
  const op = await sb.storage.from('piktogram-billeder').uploadToSignedUrl(d.sti, d.token, blob, { contentType: 'image/jpeg' });
  if(op.error) throw new Error('Billedet kunne ikke uploades.');
  return d.sti;
}

// Best effort: fjerner en uploadet fil, som ingen billeder bruger (serveren tjekker).
async function pkSletFil(sti){
  if(!sti || !trToken) return;
  try { await sb.functions.invoke('piktogram-billede', { body: { action: 'slet', token: trToken, sti } }); }
  catch(e){ console.error('Kunne ikke slette fil:', e); }
}

// ---------- Dialoger ----------

// Lægger en dialog ovenpå siden. bygIndhold(boks, luk) fylder den. Returnerer luk-funktionen.
function pkDialog(titel, bygIndhold, bred){
  const overlay = pkEl('div', 'pkOverlay');
  const boks = pkEl('div', 'pkDialog' + (bred ? ' bred' : ''));
  boks.setAttribute('role', 'dialog');
  boks.setAttribute('aria-modal', 'true');
  boks.appendChild(pkEl('h3', null, titel));
  const luk = () => { overlay.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if(e.key === 'Escape') luk(); };
  document.addEventListener('keydown', esc);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) luk(); });
  bygIndhold(boks, luk);
  overlay.appendChild(boks);
  document.body.appendChild(overlay);
  return luk;
}

// Bekræftelse før noget slettes. Returnerer et løfte med true/false.
function pkBekraeft(titel, tekst, knapTekst){
  return new Promise(resolve => {
    let afgjort = false;
    const afslut = (v) => { if(!afgjort){ afgjort = true; resolve(v); } };
    const luk = pkDialog(titel, (boks, lukDialog) => {
      boks.appendChild(pkEl('p', null, tekst));
      const rk = pkEl('div', 'pkKnapRække');
      rk.appendChild(pkKnap('Annuller', '', () => { afslut(false); lukDialog(); }));
      const hoejre = pkEl('div', 'hoejre');
      hoejre.appendChild(pkKnap(knapTekst || 'Slet', 'fare', () => { afslut(true); lukDialog(); }));
      rk.appendChild(hoejre);
      boks.appendChild(rk);
    });
    // Luk med Escape/klik udenfor tæller som "nej"
    const iv = setInterval(() => { if(!document.querySelector('.pkOverlay')){ clearInterval(iv); afslut(false); } }, 200);
    void luk;
  });
}

function pkFeltRække(label, felt, id){
  const r = pkEl('div', 'pkFeltRække');
  const l = pkEl('label', null, label);
  if(id){ l.setAttribute('for', id); felt.id = id; }
  r.appendChild(l);
  r.appendChild(felt);
  return r;
}

function pkKategoriVaelger(valgtId){
  const sel = document.createElement('select');
  pk.data.kategorier.forEach(k => {
    const o = document.createElement('option');
    o.value = k.id; o.textContent = k.navn;
    if(k.id === valgtId) o.selected = true;
    sel.appendChild(o);
  });
  return sel;
}

// ---------- Hent og tegn ----------

function pkVis(){
  if(!trLaesToken()){ trToken = null; pkTegn(); return; }
  trToken = trLaesToken();
  pkHent();
}

async function pkHent(){
  const res = await pkKald('personale_pik_hent');
  if(res.fejl){ if(trToken){ pk.fejl = res.fejl; pkTegn(); } return; }
  pk.fejl = '';
  pk.data = res.data;
  const v = await pkKald('personale_pik_valg_hent');
  pk.valg = v.data || {};
  pk.noter = null;
  pkTegn();
}

async function pkLogind(){
  const felt = document.getElementById('pkKode');
  const kode = felt ? felt.value : '';
  if(!kode){ pk.fejl = 'Skriv personalekoden.'; pkTegn(); return; }
  const res = await sb.rpc('personale_login', { p_kode: kode });
  if(res.error){ pk.fejl = 'Kunne ikke logge ind. Prøv igen.'; pkTegn(); return; }
  const d = res.data || {};
  if(!d.ok){
    pk.fejl = d.fejl === 'laast' ? 'For mange forsøg. Vent 15 minutter og prøv igen.' : 'Forkert kode.';
    pkTegn();
    return;
  }
  trGemToken(d.token);
  pk.fejl = '';
  pkHent();
}

function pkTegn(){
  const rod = document.getElementById('pkRod');
  if(!rod) return;
  const scrollY = window.scrollY;
  rod.textContent = '';

  const hoved = pkEl('header', 'sidehoved');
  const titelDiv = pkEl('div');
  titelDiv.appendChild(pkEl('h2', 'sidehovedTitel', 'Piktogrammer'));
  titelDiv.appendChild(pkEl('p', 'sidehovedSub', 'Billeder og ugeplan til ' + PK_BEBOER_NAVN));
  hoved.appendChild(titelDiv);
  if(trToken && pk.data) hoved.appendChild(pkKnap('Se som ' + PK_BEBOER_NAVN, 'primaer', pkSeSom));
  rod.appendChild(hoved);

  if(!trToken){
    const kort = pkEl('div', 'kort');
    kort.appendChild(pkEl('h3', null, 'Personalekode'));
    kort.appendChild(pkEl('p', null, 'Skriv koden for at styre billederne. Det er den samme kode som under Træning.'));
    const r = pkEl('div', 'pkEkstra');
    const input = document.createElement('input');
    input.type = 'password'; input.id = 'pkKode'; input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Personalekode');
    input.addEventListener('keydown', e => { if(e.key === 'Enter') pkLogind(); });
    r.appendChild(input);
    r.appendChild(pkKnap('Log ind', 'primaer', pkLogind));
    kort.appendChild(r);
    if(pk.fejl) kort.appendChild(pkEl('div', 'pkFejl', pk.fejl));
    rod.appendChild(kort);
    return;
  }

  if(!pk.data){
    rod.appendChild(pkEl('div', pk.fejl ? 'pkFejl' : 'loading', pk.fejl || 'Henter …'));
    return;
  }

  const faner = pkEl('div', 'pkFaner');
  [['billeder', 'Billeder'], ['idag', 'I dag'], ['valg', 'Valg'], ['noter', 'Noter']].forEach(([id, navn]) => {
    const f = pkEl('button', 'pkFane' + (pk.fane === id ? ' aktiv' : ''), navn);
    f.type = 'button';
    f.addEventListener('click', () => { pk.fane = id; pkTegn(); });
    faner.appendChild(f);
  });
  rod.appendChild(faner);

  if(pk.fane === 'billeder') pkTegnBilleder(rod);
  else if(pk.fane === 'idag') pkTegnIdag(rod);
  else if(pk.fane === 'valg') pkTegnValg(rod);
  else if(pk.fane === 'noter') pkTegnNoter(rod);

  window.scrollTo(0, scrollY);
}

// ---------- Fanen Billeder ----------

function pkAntalManglerBillede(){
  return pk.data.aktiviteter.filter(a => !a.piktogram_id && !a.fast_valg_id).length;
}

function pkTegnBilleder(rod){
  const mangler = pkAntalManglerBillede();
  const v = pkEl('div', 'pkVaelger');
  const b1 = pkEl('button', pk.visning === 'billeder' ? 'aktiv' : '', 'Alle billeder');
  const b2 = pkEl('button', pk.visning === 'ugeplan' ? 'aktiv' : '',
    'Ugeplanens aktiviteter' + (mangler ? ' (' + mangler + ' mangler billede)' : ''));
  b1.type = b2.type = 'button';
  b1.addEventListener('click', () => { pk.visning = 'billeder'; pkTegn(); });
  b2.addEventListener('click', () => { pk.visning = 'ugeplan'; pkTegn(); });
  v.appendChild(b1); v.appendChild(b2);
  rod.appendChild(v);

  if(pk.visning === 'ugeplan') pkTegnUgeplan(rod); else pkTegnAlleBilleder(rod);
}

function pkTegnAlleBilleder(rod){
  const d = pk.data;
  const vises = d.piktogrammer.filter(p => p.vises && p.sti).length;
  const udenFil = d.piktogrammer.filter(p => !p.sti).length;

  const vt = pkEl('div', 'pkVaerktoej');
  const tael = pkEl('div', 'pkTael', vises + ' af ' + d.piktogrammer.length + ' billeder vises for ' + PK_BEBOER_NAVN);
  if(udenFil) tael.appendChild(pkEl('small', null, udenFil + ' billeder mangler billedfil og vises ikke. Tryk på dem for at vælge et billede.'));
  vt.appendChild(tael);

  const soeg = document.createElement('input');
  soeg.type = 'search'; soeg.className = 'pkSoeg'; soeg.placeholder = 'Søg i billeder';
  soeg.setAttribute('aria-label', 'Søg i billeder');
  soeg.value = pk.soeg;
  soeg.addEventListener('input', () => {
    pk.soeg = soeg.value;
    const pos = soeg.selectionStart;
    pkTegn();
    const ny = document.querySelector('#piktogram .pkSoeg');
    if(ny){ ny.focus(); try { ny.setSelectionRange(pos, pos); } catch(e){ /* ignorer */ } }
  });
  vt.appendChild(soeg);

  const fil = document.createElement('input');
  fil.type = 'file'; fil.accept = 'image/*'; fil.multiple = true; fil.hidden = true;
  fil.addEventListener('change', () => { if(fil.files && fil.files.length) pkTilfoej(Array.from(fil.files)); fil.value = ''; });
  vt.appendChild(fil);
  vt.appendChild(pkKnap('+ Tilføj', 'primaer', () => {
    if(!d.kategorier.length){ pkToast('Opret først en kategori.'); return; }
    fil.click();
  }));
  vt.appendChild(pkKnap('Ny kategori', '', () => pkRedigerKategori(null)));
  rod.appendChild(vt);

  if(!d.kategorier.length){
    rod.appendChild(pkEl('div', 'pkInfo', 'Der er ingen kategorier endnu. Tryk "Ny kategori" for at begynde.'));
    return;
  }

  const q = pk.soeg.trim().toLowerCase();
  let vist = 0;
  d.kategorier.forEach((k, ki) => {
    const alle = d.piktogrammer.filter(p => p.kategori_id === k.id);
    const liste = q ? alle.filter(p => p.navn.toLowerCase().indexOf(q) >= 0) : alle;
    if(q && !liste.length) return;
    vist++;

    const sek = pkEl('section', 'pkKat');
    const h = pkEl('div', 'pkKatHoved');
    const prik = pkEl('span', 'pkPrik'); prik.style.background = k.farve;
    h.appendChild(prik);
    const navn = pkEl('div', 'pkKatNavn', k.navn);
    navn.appendChild(pkEl('small', null, alle.length + ' billeder'));
    h.appendChild(navn);
    h.appendChild(pkKnap('Rediger', '', () => pkRedigerKategori(k)));
    sek.appendChild(h);

    const g = pkEl('div', 'pkGitter');
    if(!liste.length) g.appendChild(pkEl('div', 'pkInfo', 'Ingen billeder i denne kategori endnu.'));
    liste.forEach(p => g.appendChild(pkFelt(p, k, !q)));
    sek.appendChild(g);
    void ki;
    rod.appendChild(sek);
  });
  if(q && !vist) rod.appendChild(pkEl('div', 'pkInfo', 'Ingen billeder passer til "' + pk.soeg + '".'));
}

function pkFelt(p, k, kanTraekkes){
  const f = pkEl('div', 'pkFelt' + (p.vises ? '' : ' skjult'));
  f.tabIndex = 0;
  f.setAttribute('role', 'button');
  f.setAttribute('aria-label', 'Ret ' + p.navn);
  f.style.setProperty('--k', k.farve);
  const bil = pkEl('div', 'pkBillede' + (p.sti ? '' : ' mangler'));
  if(p.sti) bil.appendChild(pkBilledeEl(p.sti, p.navn)); else bil.textContent = 'Mangler billede';
  f.appendChild(bil);
  f.appendChild(pkEl('div', 'pkNavn', p.navn));

  const bund = pkEl('div', 'pkFeltBund');
  bund.appendChild(pkEl('span', null, p.vises ? 'Vises' : 'Skjult'));
  const sw = pkEl('button', 'pkSwitch');
  sw.type = 'button';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-pressed', String(p.vises));
  sw.setAttribute('aria-label', 'Vises for ' + PK_BEBOER_NAVN + ': ' + p.navn);
  sw.addEventListener('click', async (e) => {
    e.stopPropagation();
    p.vises = !p.vises;                  // vises med det samme; rulles tilbage ved fejl
    pkTegn();
    const res = await pkKald('personale_pik_ret', { p_id: p.id, p_navn: null, p_kategori_id: null, p_billede_path: null, p_vises: p.vises });
    if(res.fejl){ p.vises = !p.vises; pkTegn(); pkToast(res.fejl); }
  });
  bund.appendChild(sw);
  f.appendChild(bund);

  f.addEventListener('click', () => pkRedigerBillede(p));
  f.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); pkRedigerBillede(p); } });

  // Træk for at ændre rækkefølge (inden for kategorien). Pilene i redigeringsdialogen virker overalt.
  if(kanTraekkes){
    f.draggable = true;
    f.addEventListener('dragstart', e => { pk.traekId = p.id; f.classList.add('traekkes'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', p.id); } catch(x){ /* ignorer */ } });
    f.addEventListener('dragend', () => { pk.traekId = null; f.classList.remove('traekkes'); });
    f.addEventListener('dragover', e => { if(pk.traekId) e.preventDefault(); });
    f.addEventListener('drop', e => { e.preventDefault(); pkFlytFoer(pk.traekId, p.id); });
  }
  return f;
}

async function pkFlytFoer(traekId, malId){
  if(!traekId || traekId === malId) return;
  const d = pk.data;
  const fra = d.piktogrammer.find(x => x.id === traekId);
  const til = d.piktogrammer.find(x => x.id === malId);
  if(!fra || !til || fra.kategori_id !== til.kategori_id) return;
  const ider = d.piktogrammer.filter(x => x.kategori_id === fra.kategori_id).map(x => x.id).filter(i => i !== traekId);
  ider.splice(ider.indexOf(malId), 0, traekId);
  await pkGemRaekkefoelge('piktogrammer', ider);
}

async function pkGemRaekkefoelge(hvad, ider){
  const res = await pkKald('personale_pik_raekkefoelge', { p_hvad: hvad, p_ider: ider });
  if(res.fejl){ pkToast(res.fejl); return false; }
  await pkHent();
  return true;
}

// ---------- Tilføj mange billeder ----------

function pkTilfoej(filer){
  const d = pk.data;
  const rader = filer.map((f, i) => ({
    nr: i, fil: f, navn: pkNavnFraFil(f.name), kategori_id: d.kategorier[0].id,
    sti: null, preview: URL.createObjectURL(f), status: 'Klargør …', fejl: false, fjernet: false
  }));
  let gemmer = false;

  pkDialog('Tilføj billeder', (boks, luk) => {
    boks.appendChild(pkEl('p', null, 'Ret navn og vælg kategori, før du gemmer. Billederne skaleres ned og gemmes.'));
    const liste = pkEl('div');
    boks.appendChild(liste);
    const fejl = pkEl('div', 'pkFejl');
    boks.appendChild(fejl);
    const rk = pkEl('div', 'pkKnapRække');
    const annuller = pkKnap('Annuller', '', async () => {
      luk();
      rader.forEach(r => URL.revokeObjectURL(r.preview));
      for(const r of rader){ if(r.sti) await pkSletFil(r.sti); }
    });
    const gem = pkKnap('Gem', 'primaer');
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(gem);
    rk.appendChild(annuller); rk.appendChild(hoejre);
    boks.appendChild(rk);

    function opdaterGem(){
      const aktive = rader.filter(r => !r.fjernet);
      const klar = aktive.length > 0 && aktive.every(r => r.sti && r.navn.trim());
      gem.disabled = !klar || gemmer;
      gem.textContent = aktive.length === 1 ? 'Gem 1 billede' : 'Gem ' + aktive.length + ' billeder';
    }

    function tegnRaekker(){
      liste.textContent = '';
      rader.filter(r => !r.fjernet).forEach(r => {
        const rk2 = pkEl('div', 'pkTilfoejRække');
        const img = document.createElement('img'); img.src = r.preview; img.alt = '';
        rk2.appendChild(img);
        const navn = document.createElement('input');
        navn.type = 'text'; navn.value = r.navn; navn.maxLength = 60; navn.setAttribute('aria-label', 'Navn');
        navn.addEventListener('input', () => { r.navn = navn.value; opdaterGem(); });
        rk2.appendChild(navn);
        const sel = pkKategoriVaelger(r.kategori_id);
        sel.setAttribute('aria-label', 'Kategori');
        sel.addEventListener('change', () => { r.kategori_id = sel.value; });
        rk2.appendChild(sel);
        rk2.appendChild(pkEl('span', 'pkStatus', r.fejl ? 'Fejlede' : (r.sti ? 'Klar' : r.status)));
        const fjern = pkKnap('✕', '', async () => { r.fjernet = true; if(r.sti) await pkSletFil(r.sti); tegnRaekker(); opdaterGem(); });
        fjern.setAttribute('aria-label', 'Fjern');
        rk2.appendChild(fjern);
        liste.appendChild(rk2);
      });
      opdaterGem();
    }
    tegnRaekker();

    gem.addEventListener('click', async () => {
      gemmer = true; opdaterGem();
      const res = await pkKald('personale_pik_tilfoej', {
        p_liste: rader.filter(r => !r.fjernet).map(r => ({ navn: r.navn.trim(), kategori_id: r.kategori_id, billede_path: r.sti }))
      });
      gemmer = false;
      if(res.fejl){ fejl.textContent = res.fejl; opdaterGem(); return; }
      luk();
      rader.forEach(r => URL.revokeObjectURL(r.preview));
      pkToast(res.data + (res.data === 1 ? ' billede tilføjet' : ' billeder tilføjet'));
      pkHent();
    });

    // Skalér og upload ét ad gangen, så en lille iPad ikke går i knæ
    (async () => {
      for(const r of rader){
        if(r.fjernet) continue;
        try {
          r.status = 'Skalerer …'; tegnRaekker();
          const blob = await pkSkaler(r.fil);
          r.status = 'Uploader …'; tegnRaekker();
          r.sti = await pkUpload(blob);
          if(r.fjernet){ await pkSletFil(r.sti); r.sti = null; }
        } catch(e){
          r.fejl = true; r.status = 'Fejlede';
          fejl.textContent = e.message || 'Et billede kunne ikke uploades. Fjern det og prøv igen.';
        }
        tegnRaekker();
      }
    })();
  }, true);
}

// ---------- Ret et billede ----------

function pkRedigerBillede(p){
  const d = pk.data;
  let nySti = null, nyPreview = null;

  pkDialog('Ret billede', (boks, luk) => {
    const visning = pkEl('div', 'pkStortBillede');
    function tegnBillede(){
      visning.textContent = '';
      const sti = nySti || p.sti;
      if(nyPreview) { const i = document.createElement('img'); i.src = nyPreview; i.alt = ''; visning.appendChild(i); }
      else if(sti) visning.appendChild(pkBilledeEl(sti, p.navn));
      else visning.appendChild(pkEl('div', 'pkInfo', 'Der er endnu intet billede. Tryk "Skift billede".'));
    }
    tegnBillede();
    boks.appendChild(visning);

    const fil = document.createElement('input');
    fil.type = 'file'; fil.accept = 'image/*'; fil.hidden = true;
    const status = pkEl('div', 'pkFejl');
    fil.addEventListener('change', async () => {
      if(!fil.files || !fil.files[0]) return;
      status.textContent = '';
      try {
        const blob = await pkSkaler(fil.files[0]);
        if(nySti) await pkSletFil(nySti);
        nySti = await pkUpload(blob);
        if(nyPreview) URL.revokeObjectURL(nyPreview);
        nyPreview = URL.createObjectURL(blob);
        tegnBillede();
        gem.disabled = false;
      } catch(e){ status.textContent = e.message || 'Billedet kunne ikke uploades.'; }
      fil.value = '';
    });
    boks.appendChild(fil);
    const skift = pkKnap('Skift billede', '', () => fil.click());
    boks.appendChild(pkEl('div', 'pkFeltRække')).appendChild(skift);

    const navn = document.createElement('input');
    navn.type = 'text'; navn.value = p.navn; navn.maxLength = 60;
    boks.appendChild(pkFeltRække('Navn', navn, 'pkRetNavn'));

    const sel = pkKategoriVaelger(p.kategori_id);
    boks.appendChild(pkFeltRække('Kategori', sel, 'pkRetKat'));

    // Rækkefølge inden for kategorien (alternativ til at trække)
    const raek = pkEl('div', 'pkFeltRække');
    raek.appendChild(pkEl('label', null, 'Placering i kategorien'));
    const pile = pkEl('div', 'pkEkstra');
    ['← Tidligere', 'Senere →'].forEach((tekst, retning) => {
      const b = pkEl('button', null, tekst); b.type = 'button';
      b.addEventListener('click', async () => {
        const ider = d.piktogrammer.filter(x => x.kategori_id === p.kategori_id).map(x => x.id);
        const i = ider.indexOf(p.id), j = retning === 0 ? i - 1 : i + 1;
        if(i < 0 || j < 0 || j >= ider.length) return;
        [ider[i], ider[j]] = [ider[j], ider[i]];
        await pkGemRaekkefoelge('piktogrammer', ider);
        const frisk = pk.data.piktogrammer.find(x => x.id === p.id);
        if(frisk) p = frisk;
      });
      pile.appendChild(b);
    });
    raek.appendChild(pile);
    boks.appendChild(raek);

    const fejl = pkEl('div', 'pkFejl');
    boks.appendChild(fejl);

    const rk = pkEl('div', 'pkKnapRække');
    rk.appendChild(pkKnap('Slet', 'fare', async () => {
      const ja = await pkBekraeft('Slet billede?',
        '"' + p.navn + '" fjernes fra billedlisten, fra ugeplanens koblinger og fra faste valg. Det kan ikke fortrydes her.', 'Ja, slet');
      if(!ja) return;
      const res = await pkKald('personale_pik_slet', { p_id: p.id });
      if(res.fejl){ fejl.textContent = res.fejl; return; }
      if(nySti) await pkSletFil(nySti);
      luk(); pkToast('Billedet er slettet'); pkHent();
    }));
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', async () => { if(nySti) await pkSletFil(nySti); luk(); }));
    const gem = pkKnap('Gem', 'primaer');
    gem.disabled = true;
    const maybeAktiver = () => { gem.disabled = false; };
    navn.addEventListener('input', maybeAktiver);
    sel.addEventListener('change', maybeAktiver);
    gem.addEventListener('click', async () => {
      if(!navn.value.trim()){ fejl.textContent = 'Giv billedet et navn.'; return; }
      const res = await pkKald('personale_pik_ret', {
        p_id: p.id, p_navn: navn.value.trim(),
        p_kategori_id: sel.value !== p.kategori_id ? sel.value : null,
        p_billede_path: nySti, p_vises: null
      });
      if(res.fejl){ fejl.textContent = res.fejl; return; }
      if(nySti && p.sti) await pkSletFil(p.sti);   // gammel fil ryddes, hvis ingen andre bruger den
      luk(); pkHent();
    });
    hoejre.appendChild(gem);
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  });
}

// ---------- Kategorier ----------

function pkRedigerKategori(k){
  const d = pk.data;
  const ny = !k;
  let farve = k ? k.farve : PK_FARVER[d.kategorier.length % PK_FARVER.length];

  pkDialog(ny ? 'Ny kategori' : 'Ret kategori', (boks, luk) => {
    const navn = document.createElement('input');
    navn.type = 'text'; navn.maxLength = 40; navn.value = k ? k.navn : '';
    boks.appendChild(pkFeltRække('Navn', navn, 'pkKatNavnFelt'));

    const fr = pkEl('div', 'pkFeltRække');
    fr.appendChild(pkEl('label', null, 'Farve (bruges ens overalt som genkendelse)'));
    const valg = pkEl('div', 'pkFarver');
    function tegnFarver(){
      valg.textContent = '';
      PK_FARVER.forEach(f => {
        const b = pkEl('button', 'pkFarveValg' + (f.toLowerCase() === farve.toLowerCase() ? ' valgt' : ''));
        b.type = 'button'; b.style.background = f; b.setAttribute('aria-label', 'Farve ' + f);
        b.addEventListener('click', () => { farve = f; tegnFarver(); });
        valg.appendChild(b);
      });
      const eget = document.createElement('input');
      eget.type = 'color'; eget.value = farve; eget.setAttribute('aria-label', 'Egen farve');
      eget.addEventListener('input', () => { farve = eget.value; });
      eget.addEventListener('change', tegnFarver);
      valg.appendChild(eget);
    }
    tegnFarver();
    fr.appendChild(valg);
    boks.appendChild(fr);

    if(!ny){
      const raek = pkEl('div', 'pkFeltRække');
      raek.appendChild(pkEl('label', null, 'Placering'));
      const pile = pkEl('div', 'pkEkstra');
      ['↑ Op', '↓ Ned'].forEach((tekst, retning) => {
        const b = pkEl('button', null, tekst); b.type = 'button';
        b.addEventListener('click', async () => {
          const ider = d.kategorier.map(x => x.id);
          const i = ider.indexOf(k.id), j = retning === 0 ? i - 1 : i + 1;
          if(i < 0 || j < 0 || j >= ider.length) return;
          [ider[i], ider[j]] = [ider[j], ider[i]];
          await pkGemRaekkefoelge('kategorier', ider);
        });
        pile.appendChild(b);
      });
      raek.appendChild(pile);
      boks.appendChild(raek);
    }

    const fejl = pkEl('div', 'pkFejl');
    boks.appendChild(fejl);
    const rk = pkEl('div', 'pkKnapRække');
    if(!ny){
      rk.appendChild(pkKnap('Slet', 'fare', async () => {
        const antal = d.piktogrammer.filter(p => p.kategori_id === k.id).length;
        const ja = await pkBekraeft('Slet kategori?',
          'Kategorien "' + k.navn + '"' + (antal ? ' og dens ' + antal + ' billeder' : '') +
          ' fjernes, også fra ugeplanens koblinger og faste valg.', 'Ja, slet');
        if(!ja) return;
        const res = await pkKald('personale_pik_kategori_slet', { p_id: k.id });
        if(res.fejl){ fejl.textContent = res.fejl; return; }
        luk(); pkToast('Kategorien er slettet'); pkHent();
      }));
    }
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', luk));
    hoejre.appendChild(pkKnap('Gem', 'primaer', async () => {
      if(!navn.value.trim()){ fejl.textContent = 'Giv kategorien et navn.'; return; }
      const res = await pkKald('personale_pik_kategori_gem', { p_id: k ? k.id : null, p_navn: navn.value.trim(), p_farve: farve });
      if(res.fejl){ fejl.textContent = res.fejl; return; }
      luk(); pkHent();
    }));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  });
}

// ---------- Ugeplanens aktiviteter: kobling til billede eller fast valg ----------

function pkTegnUgeplan(rod){
  const d = pk.data;
  const mangler = pkAntalManglerBillede();
  const info = pkEl('div', 'pkInfo');
  info.appendChild(pkEl('strong', null, mangler
    ? mangler + ' af ' + d.aktiviteter.length + ' aktiviteter mangler billede'
    : 'Alle ' + d.aktiviteter.length + ' aktiviteter har billede'));
  info.appendChild(pkEl('div', 'pkAktMeta', 'Koblingen laves én gang pr. aktivitet og gælder alle ugens dage. Ændres ugeplanen, skal du ikke gøre det igen. Aktiviteter uden billede vises som tomt i Nu-kortet.'));
  rod.appendChild(info);

  if(!d.aktiviteter.length){
    rod.appendChild(pkEl('div', 'pkInfo', 'Der er ingen aktiviteter i ' + PK_BEBOER_NAVN + 's ugeplan.'));
    return;
  }
  d.aktiviteter.forEach(a => {
    const har = !!(a.piktogram_id || a.fast_valg_id);
    const knap = pkEl('button', 'pkAkt' + (har ? '' : ' mangler'));
    knap.type = 'button';

    const bilBoks = pkEl('div', 'pkAktBillede');
    let koblet = '';
    if(a.piktogram_id){
      const p = d.piktogrammer.find(x => x.id === a.piktogram_id);
      if(p){ koblet = p.navn; if(p.sti) bilBoks.appendChild(pkBilledeEl(p.sti, p.navn)); }
    } else if(a.fast_valg_id){
      const v = d.faste_valg.find(x => x.id === a.fast_valg_id);
      if(v){
        koblet = 'Fast valg: ' + v.navn;
        const f = d.piktogrammer.find(x => x.id === v.piktogram_ids[0]);
        if(f && f.sti) bilBoks.appendChild(pkBilledeEl(f.sti, ''));
      }
    }
    knap.appendChild(bilBoks);

    const tekst = pkEl('div', 'pkAktTekst');
    tekst.appendChild(pkEl('div', 'pkAktNavn', a.aktivitet));
    tekst.appendChild(pkEl('div', 'pkAktMeta', (har ? koblet + ' · ' : '') + a.antal + (a.antal === 1 ? ' gang' : ' gange') + ' om ugen'));
    knap.appendChild(tekst);
    knap.appendChild(pkEl('span', 'pkMaerke ' + (har ? 'ok' : 'mangler'), har ? 'Har billede' : 'Mangler billede'));
    knap.addEventListener('click', () => pkVaelgKobling(a));
    rod.appendChild(knap);
  });
}

function pkVaelgKobling(a){
  const d = pk.data;
  pkDialog('Billede til "' + a.aktivitet + '"', (boks, luk) => {
    boks.appendChild(pkEl('p', null, 'Vælg ét billede eller et fast valg. Det gælder alle ugens dage.'));
    const fejl = pkEl('div', 'pkFejl');

    async function gem(piktogramId, fastValgId){
      const res = await pkKald('personale_pik_kobling_saet', {
        p_aktivitet: a.aktivitet, p_piktogram_id: piktogramId, p_fast_valg_id: fastValgId
      });
      if(res.fejl){ fejl.textContent = res.fejl; return; }
      luk(); pkToast('Gemt'); pkHent();
    }

    const soeg = document.createElement('input');
    soeg.type = 'search'; soeg.placeholder = 'Søg i billeder'; soeg.setAttribute('aria-label', 'Søg i billeder');
    soeg.style.width = '100%'; soeg.style.minHeight = '46px'; soeg.style.marginBottom = '12px';
    boks.appendChild(soeg);

    const indhold = pkEl('div');
    boks.appendChild(indhold);

    function tegn(){
      indhold.textContent = '';
      const q = soeg.value.trim().toLowerCase();

      if(d.faste_valg.length && !q){
        indhold.appendChild(pkEl('h4', null, 'Faste valg'));
        const g = pkEl('div', 'pkVaelgGitter');
        d.faste_valg.forEach(v => {
          const b = pkEl('button', 'pkVaelgFelt' + (a.fast_valg_id === v.id ? ' valgt' : ''));
          b.type = 'button';
          const f = d.piktogrammer.find(x => x.id === v.piktogram_ids[0]);
          if(f && f.sti) b.appendChild(pkBilledeEl(f.sti, ''));
          b.appendChild(document.createTextNode(v.navn));
          b.addEventListener('click', () => gem(null, v.id));
          g.appendChild(b);
        });
        indhold.appendChild(g);
      }

      let fundet = 0;
      d.kategorier.forEach(k => {
        const liste = d.piktogrammer.filter(p => p.kategori_id === k.id && p.sti && (!q || p.navn.toLowerCase().indexOf(q) >= 0));
        if(!liste.length) return;
        fundet += liste.length;
        const h = pkEl('div', 'pkKatHoved');
        const prik = pkEl('span', 'pkPrik'); prik.style.background = k.farve;
        h.appendChild(prik); h.appendChild(pkEl('div', 'pkKatNavn', k.navn));
        indhold.appendChild(h);
        const g = pkEl('div', 'pkVaelgGitter');
        liste.forEach(p => {
          const b = pkEl('button', 'pkVaelgFelt' + (a.piktogram_id === p.id ? ' valgt' : ''));
          b.type = 'button';
          b.appendChild(pkBilledeEl(p.sti, p.navn));
          b.appendChild(document.createTextNode(p.navn));
          b.addEventListener('click', () => gem(p.id, null));
          g.appendChild(b);
        });
        indhold.appendChild(g);
      });
      if(!fundet) indhold.appendChild(pkEl('div', 'pkInfo', q ? 'Ingen billeder passer.' : 'Der er ingen billeder med billedfil endnu. Tilføj billeder under "Alle billeder".'));
      if(!d.faste_valg.length && !q) indhold.appendChild(pkEl('div', 'pkAktMeta', 'Faste valg oprettes under Valg (kommer i en senere del).'));
    }
    soeg.addEventListener('input', tegn);
    tegn();

    boks.appendChild(fejl);
    const rk = pkEl('div', 'pkKnapRække');
    if(a.piktogram_id || a.fast_valg_id) rk.appendChild(pkKnap('Fjern billede', 'fare', () => gem(null, null)));
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Luk', '', luk));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  }, true);
}

// ---------- Se som beboeren ----------
// Viser beboerens egen forside (leyla-v2) i en ramme. Den bruger sit eget login på enheden.

function pkSeSom(){
  const se = pkEl('div', 'pkSe');
  const hoved = pkEl('div', 'pkSeHoved');
  hoved.appendChild(pkEl('span', null, 'Sådan ser ' + PK_BEBOER_NAVN + ' det'));
  const luk = pkEl('button', null, 'Luk');
  luk.type = 'button';
  luk.addEventListener('click', () => { se.remove(); pkHent(); });
  hoved.appendChild(luk);
  se.appendChild(hoved);
  const ramme = document.createElement('iframe');
  ramme.src = '../leyla-v2/';
  ramme.title = 'Sådan ser ' + PK_BEBOER_NAVN + ' det';
  se.appendChild(ramme);
  document.body.appendChild(se);
}

// ==================================================================
// Fanen I dag (Del 3): hvem er med beboeren, og dagens plan
// ==================================================================
// Navn og foto kopieres fra dagens vagtplan (personaleskaerm_vagter) ind i
// piktogram_med_beboer. Alt i den tabel slettes automatisk efter midnat.
// Beboeren ser kun den medarbejder, hvis tidsrum er i gang lige nu.

const PK_UGEDAGE = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];

function pkMinutter(tekst){                    // "9:30" eller "09:30" -> 570
  const m = /^(\d{1,2})[:.](\d{2})/.exec(String(tekst || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function pkNuMinutter(){ const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function pkKlokke(tekst){ return String(tekst || '').replace(':', '.'); }   // "14:00" -> "14.00" (dansk skrivemåde)

// Status for et tidsrum: "Vises nu", "Fra 14.00" eller "Færdig"
function pkMedStatus(m){
  const nu = pkNuMinutter(), a = pkMinutter(m.start), b = pkMinutter(m.slut);
  if(a != null && nu < a) return { tekst: 'Fra ' + pkKlokke(m.start), klasse: 'senere' };
  if(b != null && nu >= b) return { tekst: 'Færdig', klasse: 'faerdig' };
  return { tekst: 'Vises nu', klasse: 'nu' };
}

function pkFotoEl(url, navn, klasse){
  if(url){
    const img = document.createElement('img');
    img.className = klasse; img.src = url; img.alt = ''; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(pkEl('div', klasse + ' tom', (navn || '?').charAt(0))));
    return img;
  }
  return pkEl('div', klasse + ' tom', (navn || '?').charAt(0));
}

function pkTegnIdag(rod){
  const d = pk.data;

  // ---------- Med beboeren i dag ----------
  const kort = pkEl('div', 'kort');
  kort.appendChild(pkEl('h3', null, 'Med ' + PK_BEBOER_NAVN + ' i dag'));
  const med = d.med_idag || [];
  if(!med.length){
    kort.appendChild(pkEl('p', 'pkAktMeta', 'Ingen er valgt endnu. ' + PK_BEBOER_NAVN + ' ser først en medarbejder, når der er valgt et tidsrum.'));
  }
  med.forEach(m => {
    const st = pkMedStatus(m);
    const r = pkEl('div', 'pkMedRække');
    r.appendChild(pkFotoEl(m.billede, m.navn, 'pkMedFoto'));
    const t = pkEl('div', 'pkAktTekst');
    t.appendChild(pkEl('div', 'pkAktNavn', m.navn));
    t.appendChild(pkEl('div', 'pkAktMeta', pkKlokke(m.start) + '–' + pkKlokke(m.slut)));
    r.appendChild(t);
    r.appendChild(pkEl('span', 'pkStatusMaerke ' + st.klasse, st.tekst));
    r.appendChild(pkKnap('Ret tid', '', () => pkMedTid(m, null)));
    r.appendChild(pkKnap('Fjern', 'fare', async () => {
      const ja = await pkBekraeft('Fjern ' + m.navn + '?', m.navn + ' er ikke længere med ' + PK_BEBOER_NAVN + ' i dag.', 'Ja, fjern');
      if(!ja) return;
      const res = await pkKald('personale_pik_med_slet', { p_id: m.id });
      if(res.fejl){ pkToast(res.fejl); return; }
      pkHent();
    }));
    kort.appendChild(r);
  });
  const vaelg = pkKnap('Vælg dig fra dagens vagtplan', 'primaer', pkVaelgVagt);
  vaelg.style.marginTop = '12px';
  kort.appendChild(vaelg);
  kort.appendChild(pkEl('p', 'pkAktMeta', 'Navn og foto slettes automatisk ved dagens slutning og gemmes ikke på ' + PK_BEBOER_NAVN + 's iPad efter dagen.'));
  rod.appendChild(kort);

  // ---------- Dagens plan ----------
  const nu = new Date();
  const dagNavn = PK_UGEDAGE[nu.getDay()];
  const punkter = (d.ugeplan || [])
    .filter(p => p.ugedag === dagNavn && pkMinutter(p.tid) != null)
    .map(p => ({ min: pkMinutter(p.tid), tid: p.tid, aktivitet: p.aktivitet }))
    .sort((a, b) => a.min - b.min);

  const plan = pkEl('div', 'kort');
  plan.appendChild(pkEl('h3', null, 'Dagens plan (' + dagNavn.toLowerCase() + ')'));
  if(!punkter.length) plan.appendChild(pkEl('p', 'pkAktMeta', 'Der er ingen punkter i ugeplanen i dag.'));
  const nuMin = pkNuMinutter();
  let aktuelt = -1;
  punkter.forEach((p, i) => { if(p.min <= nuMin) aktuelt = i; });

  punkter.forEach((p, i) => {
    const a = d.aktiviteter.find(x => x.aktivitet === p.aktivitet) || { aktivitet: p.aktivitet, antal: 1, piktogram_id: null, fast_valg_id: null };
    const har = !!(a.piktogram_id || a.fast_valg_id);
    const knap = pkEl('button', 'pkAkt pkPlanRække' + (har ? '' : ' mangler') + (i === aktuelt ? ' nuRække' : ''));
    knap.type = 'button';
    knap.appendChild(pkEl('span', 'pkPlanTid', pkKlokke(p.tid)));

    const bil = pkEl('div', 'pkAktBillede');
    if(a.piktogram_id){
      const pik = d.piktogrammer.find(x => x.id === a.piktogram_id);
      if(pik && pik.sti) bil.appendChild(pkBilledeEl(pik.sti, pik.navn));
    } else if(a.fast_valg_id){
      const v = d.faste_valg.find(x => x.id === a.fast_valg_id);
      const f = v && d.piktogrammer.find(x => x.id === v.piktogram_ids[0]);
      if(f && f.sti) bil.appendChild(pkBilledeEl(f.sti, ''));
    }
    knap.appendChild(bil);

    const t = pkEl('div', 'pkAktTekst');
    t.appendChild(pkEl('div', 'pkAktNavn', p.aktivitet));
    knap.appendChild(t);
    if(i === aktuelt) knap.appendChild(pkEl('span', 'pkNuMaerke', 'NU'));
    knap.appendChild(pkEl('span', 'pkMaerke ' + (har ? 'ok' : 'mangler'), har ? 'Skift billede' : 'Mangler billede'));
    knap.addEventListener('click', () => pkVaelgKobling(a));
    plan.appendChild(knap);
  });
  rod.appendChild(plan);
}

// Trin 1: vælg dig selv fra dagens vagtplan
function pkVaelgVagt(){
  const d = pk.data;
  const alleredeValgt = new Set((d.med_idag || []).map(m => m.navn));
  pkDialog('Vælg dig fra dagens vagtplan', (boks, luk) => {
    boks.appendChild(pkEl('p', null, 'Tryk på dit navn. Navn og foto hentes fra vagtplanen.'));
    const soeg = document.createElement('input');
    soeg.type = 'search'; soeg.placeholder = 'Søg på navn'; soeg.setAttribute('aria-label', 'Søg på navn');
    soeg.style.width = '100%'; soeg.style.minHeight = '46px'; soeg.style.marginBottom = '10px';
    boks.appendChild(soeg);
    const liste = pkEl('div');
    boks.appendChild(liste);

    function tegn(){
      liste.textContent = '';
      const q = soeg.value.trim().toLowerCase();
      const fundne = (d.vagter_idag || []).filter(v => !q || v.navn.toLowerCase().indexOf(q) >= 0);
      if(!fundne.length) liste.appendChild(pkEl('div', 'pkInfo', (d.vagter_idag || []).length ? 'Ingen navne passer.' : 'Der er ingen vagter i dagens vagtplan.'));
      fundne.forEach(v => {
        const b = pkEl('button', 'pkVagtRække');
        b.type = 'button';
        b.appendChild(pkFotoEl(v.billede, v.navn, 'pkMedFoto'));
        const t = pkEl('div', 'pkAktTekst');
        t.appendChild(pkEl('div', 'pkAktNavn', v.navn));
        t.appendChild(pkEl('div', 'pkAktMeta', v.rolle + ' · ' + pkKlokke(v.start) + '–' + pkKlokke(v.slut) + (v.slut_naeste_dag ? ' (næste dag)' : '')));
        b.appendChild(t);
        if(alleredeValgt.has(v.navn)) b.appendChild(pkEl('span', 'pkMaerke ok', 'Allerede valgt'));
        b.addEventListener('click', () => { luk(); pkMedTid(null, v); });
        liste.appendChild(b);
      });
    }
    soeg.addEventListener('input', tegn);
    tegn();

    const rk = pkEl('div', 'pkKnapRække');
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', luk));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  }, true);
}

// Trin 2: vælg tidsrum. m = eksisterende række (ret), v = vagt (ny).
function pkMedTid(m, v){
  const navn = m ? m.navn : v.navn;
  // Forslag: vagtens tider (aldrig ud over midnat) eller den nuværende række
  const forslagStart = m ? m.start : v.start;
  const forslagSlut = m ? m.slut : (v.slut_naeste_dag ? '23:59' : v.slut);

  pkDialog('Hvornår er du med ' + PK_BEBOER_NAVN + '?', (boks, luk) => {
    const top = pkEl('div', 'pkMedRække');
    top.appendChild(pkFotoEl(m ? m.billede : v.billede, navn, 'pkMedFoto'));
    top.appendChild(pkEl('div', 'pkAktNavn', navn));
    boks.appendChild(top);

    const fra = document.createElement('input'); fra.type = 'time'; fra.value = forslagStart; fra.step = 300;
    const til = document.createElement('input'); til.type = 'time'; til.value = forslagSlut; til.step = 300;
    const raekke = pkEl('div', 'pkEkstra');
    const f1 = pkFeltRække('Fra kl.', fra, 'pkMedFra'); f1.style.flex = '1';
    const f2 = pkFeltRække('Til kl.', til, 'pkMedTil'); f2.style.flex = '1';
    raekke.appendChild(f1); raekke.appendChild(f2);
    boks.appendChild(raekke);
    boks.appendChild(pkEl('p', 'pkAktMeta', 'Typisk er der to personer i løbet af dagen, fx 08.00–14.00 og 14.00–20.00. ' + PK_BEBOER_NAVN + ' ser kun den, der er på hende lige nu.'));

    const fejl = pkEl('div', 'pkFejl');
    boks.appendChild(fejl);
    const rk = pkEl('div', 'pkKnapRække');
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', luk));
    hoejre.appendChild(pkKnap('Gem', 'primaer', async () => {
      if(!fra.value || !til.value){ fejl.textContent = 'Vælg både start og slut.'; return; }
      if(til.value <= fra.value){ fejl.textContent = 'Sluttid skal være efter starttid.'; return; }
      const res = await pkKald('personale_pik_med_gem', {
        p_id: m ? m.id : null, p_vagt_id: v ? v.id : null, p_start: fra.value, p_slut: til.value
      });
      if(res.fejl){ fejl.textContent = res.fejl; return; }
      luk(); pkToast('Gemt'); pkHent();
    }));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  });
}

// Statussen ("Vises nu" / "Fra 14.00") følger klokken, mens fanen er åben og ingen dialog er oppe
setInterval(() => {
  if(typeof aktuelSide !== 'undefined' && aktuelSide === 'piktogram' && pk.fane === 'idag' && pk.data &&
     !document.hidden && !document.querySelector('.pkOverlay') && !document.querySelector('.pkSe')){
    pkTegn();
  }
}, 30000);

// ==================================================================
// Fanen Valg og Noter (Del 4)
// ==================================================================
// Valg: faste valg, valg i gang på beboerens iPad, og billeder til Ja / Nej / Mere.
// Noter: seneste registreringer som tekst til journalen. Ingen grafer, ingen statistik.
// Funktioner: shared/piktogram-valg-schema.sql

function pkBilledeMedId(id){ return pk.data.piktogrammer.find(p => p.id === id) || null; }

// Hjælper: vælger af billeder (til faste valg, hurtige valg og Ja/Nej/Mere).
// valgte = liste af id'er (rækkefølgen er rækkefølgen på iPad'en). maks = hvor mange der må vælges.
function pkBygVaelger(boks, valgte, maks, vedAendring){
  const stribe = pkEl('div', 'pkValgStribe');
  const soeg = document.createElement('input');
  soeg.type = 'search'; soeg.placeholder = 'Søg i billeder'; soeg.setAttribute('aria-label', 'Søg i billeder');
  soeg.style.width = '100%'; soeg.style.minHeight = '46px'; soeg.style.marginBottom = '10px';
  const gitter = pkEl('div');
  boks.appendChild(stribe); boks.appendChild(soeg); boks.appendChild(gitter);

  function tegn(){
    stribe.textContent = '';
    if(!valgte.length) stribe.appendChild(pkEl('span', 'pkAktMeta', 'Ingen billeder valgt endnu.'));
    valgte.forEach((id, i) => {
      const p = pkBilledeMedId(id);
      if(!p) return;
      const b = pkEl('button', 'pkVaelgFelt valgt'); b.type = 'button';
      b.setAttribute('aria-label', 'Fjern ' + p.navn);
      b.appendChild(pkBilledeEl(p.sti, p.navn));
      b.appendChild(document.createTextNode((maks > 1 ? (i + 1) + '. ' : '') + p.navn + ' ✕'));
      b.addEventListener('click', () => { valgte.splice(i, 1); tegn(); vedAendring(); });
      stribe.appendChild(b);
    });

    gitter.textContent = '';
    const q = soeg.value.trim().toLowerCase();
    let fundet = 0;
    pk.data.kategorier.forEach(k => {
      const liste = pk.data.piktogrammer.filter(p => p.kategori_id === k.id && p.sti && (!q || p.navn.toLowerCase().indexOf(q) >= 0));
      if(!liste.length) return;
      fundet += liste.length;
      const h = pkEl('div', 'pkKatHoved');
      const prik = pkEl('span', 'pkPrik'); prik.style.background = k.farve;
      h.appendChild(prik); h.appendChild(pkEl('div', 'pkKatNavn', k.navn));
      gitter.appendChild(h);
      const g = pkEl('div', 'pkVaelgGitter');
      liste.forEach(p => {
        const valgt = valgte.indexOf(p.id) >= 0;
        const b = pkEl('button', 'pkVaelgFelt' + (valgt ? ' valgt' : '')); b.type = 'button';
        b.appendChild(pkBilledeEl(p.sti, p.navn));
        b.appendChild(document.createTextNode(p.navn));
        b.addEventListener('click', () => {
          const i = valgte.indexOf(p.id);
          if(i >= 0) valgte.splice(i, 1);
          else if(maks === 1) valgte.splice(0, 1, p.id);
          else if(valgte.length < maks) valgte.push(p.id);
          else { pkToast('Der kan højst vælges ' + maks + ' billeder.'); return; }
          tegn(); vedAendring();
        });
        g.appendChild(b);
      });
      gitter.appendChild(g);
    });
    if(!fundet) gitter.appendChild(pkEl('div', 'pkInfo', 'Ingen billeder passer.'));
  }
  soeg.addEventListener('input', tegn);
  tegn();
}

function pkTegnValg(rod){
  const d = pk.data;
  const valg = pk.valg || {};

  // ---------- Valg i gang ----------
  if(valg.aktivt) rod.appendChild(pkAktivtValgKort(valg.aktivt));

  // ---------- Faste valg ----------
  const kort = pkEl('div', 'kort');
  const hoved = pkEl('div', 'pkVaerktoej');
  hoved.appendChild(pkEl('h3', 'pkTael', 'Faste valg'));
  hoved.appendChild(pkKnap('Start hurtigt valg', '', () => pkHurtigtValg()));
  hoved.appendChild(pkKnap('+ Nyt fast valg', 'primaer', () => pkRedigerValg(null)));
  kort.appendChild(hoved);
  if(!d.faste_valg.length){
    kort.appendChild(pkEl('p', 'pkAktMeta', 'Der er ingen faste valg endnu. Et fast valg har 2-4 billeder og et spørgsmål, der siges højt, fx "Vil du gå eller cykle?".'));
  }
  d.faste_valg.forEach(v => {
    const r = pkEl('div', 'pkMedRække');
    const stribe = pkEl('div', 'pkMiniStribe');
    v.piktogram_ids.forEach(id => {
      const p = pkBilledeMedId(id);
      const b = pkEl('div', 'pkAktBillede');
      if(p && p.sti) b.appendChild(pkBilledeEl(p.sti, p.navn));
      stribe.appendChild(b);
    });
    r.appendChild(stribe);
    const t = pkEl('div', 'pkAktTekst');
    t.appendChild(pkEl('div', 'pkAktNavn', v.navn));
    t.appendChild(pkEl('div', 'pkAktMeta', '"' + v.sporgsmaal + '"'));
    r.appendChild(t);
    r.appendChild(pkKnap('Vis på ' + PK_BEBOER_NAVN + 's iPad', 'primaer', () => pkStartValg(v.id, null, null)));
    r.appendChild(pkKnap('Ret', '', () => pkRedigerValg(v)));
    kort.appendChild(r);
  });
  rod.appendChild(kort);

  // ---------- Ja, Nej og Mere ----------
  const jnm = pkEl('div', 'kort');
  jnm.appendChild(pkEl('h3', null, 'Ja, Nej og Mere'));
  jnm.appendChild(pkEl('p', 'pkAktMeta', 'Standard er tommel op, tommel ned og et plus. Du kan erstatte dem med egne billeder, fx tegnet for "mere" fra tegn til tale.'));
  const eget = valg.ja_nej_mere || {};
  const raekke = pkEl('div', 'pkJnmRække');
  [['ja', 'Ja', 'Tommel op'], ['nej', 'Nej', 'Tommel ned'], ['mere', 'Mere', 'Plus']].forEach(([noegle, navn, standard]) => {
    const b = pkEl('button', 'pkJnm ' + noegle); b.type = 'button';
    const p = eget[noegle] ? pkBilledeMedId(eget[noegle]) : null;
    const bil = pkEl('div', 'pkJnmBillede');
    if(p && p.sti) bil.appendChild(pkBilledeEl(p.sti, p.navn)); else bil.textContent = standard;
    b.appendChild(bil);
    b.appendChild(pkEl('div', 'pkAktNavn', navn));
    b.appendChild(pkEl('div', 'pkAktMeta', p ? p.navn : 'Standardsymbol'));
    b.addEventListener('click', () => pkVaelgJnm(noegle, navn));
    raekke.appendChild(b);
  });
  jnm.appendChild(raekke);
  rod.appendChild(jnm);
}

// Faste valg: opret / ret / slet
function pkRedigerValg(v){
  const ny = !v;
  const valgte = v ? v.piktogram_ids.slice() : [];
  pkDialog(ny ? 'Nyt fast valg' : 'Ret fast valg', (boks, luk) => {
    const navn = document.createElement('input');
    navn.type = 'text'; navn.maxLength = 60; navn.value = v ? v.navn : ''; navn.placeholder = 'Fx Gåtur eller cykeltur';
    boks.appendChild(pkFeltRække('Navn (til personalet)', navn, 'pkValgNavn'));
    const sp = document.createElement('input');
    sp.type = 'text'; sp.maxLength = 120; sp.value = v ? v.sporgsmaal : ''; sp.placeholder = 'Fx Vil du gå eller cykle?';
    boks.appendChild(pkFeltRække('Spørgsmål (siges højt)', sp, 'pkValgSp'));
    boks.appendChild(pkEl('p', 'pkAktMeta', 'Vælg 2-4 billeder. Rækkefølgen er den, de står i på iPad\'en.'));
    const fejl = pkEl('div', 'pkFejl');
    pkBygVaelger(boks, valgte, 4, () => { fejl.textContent = ''; });
    boks.appendChild(fejl);

    const rk = pkEl('div', 'pkKnapRække');
    if(!ny){
      rk.appendChild(pkKnap('Slet', 'fare', async () => {
        const ja = await pkBekraeft('Slet fast valg?', '"' + v.navn + '" fjernes, også fra ugeplanens koblinger.', 'Ja, slet');
        if(!ja) return;
        const res = await pkKald('personale_pik_valg_slet', { p_id: v.id });
        if(res.fejl){ fejl.textContent = res.fejl; return; }
        luk(); pkToast('Valget er slettet'); pkHent();
      }));
    }
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', luk));
    hoejre.appendChild(pkKnap('Gem', 'primaer', async () => {
      if(!navn.value.trim()){ fejl.textContent = 'Giv valget et navn.'; return; }
      if(!sp.value.trim()){ fejl.textContent = 'Skriv spørgsmålet, der skal siges højt.'; return; }
      if(valgte.length < 2){ fejl.textContent = 'Vælg mindst 2 billeder.'; return; }
      const res = await pkKald('personale_pik_valg_gem', {
        p_id: v ? v.id : null, p_navn: navn.value.trim(), p_sporgsmaal: sp.value.trim(), p_piktogram_ids: valgte
      });
      if(res.fejl){ fejl.textContent = res.fejl; return; }
      luk(); pkToast('Gemt'); pkHent();
    }));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  }, true);
}

// Start et valg på beboerens iPad
async function pkStartValg(fastId, ider, spoergsmaal){
  const res = await pkKald('personale_pik_valg_start', { p_fast_valg_id: fastId, p_piktogram_ids: ider, p_spoergsmaal: spoergsmaal });
  if(res.fejl){ pkToast(res.fejl); return; }
  pkToast('Valget vises nu på ' + PK_BEBOER_NAVN + 's iPad');
  pkHent();
}

// Hurtigt valg: vælg 2-4 billeder uden at gemme et fast valg
function pkHurtigtValg(){
  const valgte = [];
  pkDialog('Hurtigt valg', (boks, luk) => {
    const sp = document.createElement('input');
    sp.type = 'text'; sp.maxLength = 120; sp.value = 'Hvad vil du?';
    boks.appendChild(pkFeltRække('Spørgsmål (siges højt)', sp, 'pkHurtigtSp'));
    const fejl = pkEl('div', 'pkFejl');
    pkBygVaelger(boks, valgte, 4, () => { fejl.textContent = ''; });
    boks.appendChild(fejl);
    const rk = pkEl('div', 'pkKnapRække');
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', luk));
    hoejre.appendChild(pkKnap('Vis på iPad', 'primaer', async () => {
      if(valgte.length < 2){ fejl.textContent = 'Vælg mindst 2 billeder.'; return; }
      luk();
      pkStartValg(null, valgte, sp.value.trim());
    }));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  }, true);
}

// Ja / Nej / Mere: vælg billede til én af dem (eller tilbage til standardsymbolet)
function pkVaelgJnm(noegle, navn){
  const eget = Object.assign({ ja: null, nej: null, mere: null }, (pk.valg && pk.valg.ja_nej_mere) || {});
  const valgte = eget[noegle] ? [eget[noegle]] : [];
  pkDialog('Billede til "' + navn + '"', (boks, luk) => {
    const fejl = pkEl('div', 'pkFejl');
    pkBygVaelger(boks, valgte, 1, () => {});
    boks.appendChild(fejl);
    const rk = pkEl('div', 'pkKnapRække');
    rk.appendChild(pkKnap('Brug standardsymbol', '', () => { valgte.length = 0; gem(); }));
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', luk));
    hoejre.appendChild(pkKnap('Gem', 'primaer', () => gem()));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
    async function gem(){
      eget[noegle] = valgte[0] || null;
      const res = await pkKald('personale_pik_jnm_saet', { p_ja: eget.ja, p_nej: eget.nej, p_mere: eget.mere });
      if(res.fejl){ fejl.textContent = res.fejl; return; }
      luk(); pkToast('Gemt'); pkHent();
    }
  }, true);
}

// Valg i gang: viser hvad beboeren har trykket på, og lader personalet notere svaret med ét tryk
function pkAktivtValgKort(a){
  const kort = pkEl('div', 'kort pkAktivtValg');
  kort.appendChild(pkEl('h3', null, 'Valg i gang på ' + PK_BEBOER_NAVN + 's iPad'));
  kort.appendChild(pkEl('p', 'pkAktNavn', '"' + a.spoergsmaal + '"'));
  const stribe = pkEl('div', 'pkMiniStribe stor');
  (a.billeder || []).forEach(b => {
    const f = pkEl('div', 'pkValgBillede' + (a.valgt_id === b.id ? ' valgt' : ''));
    f.appendChild(pkBilledeEl(b.sti, b.navn));
    f.appendChild(pkEl('div', 'pkAktMeta', b.navn + (a.valgt_id === b.id ? ' – trykket på' : '')));
    stribe.appendChild(f);
  });
  kort.appendChild(stribe);
  kort.appendChild(pkEl('p', 'pkAktMeta', a.valgt_id
    ? PK_BEBOER_NAVN + ' har trykket på et billede. Fremhævningen bliver stående, til du lukker valget.'
    : 'Venter på, at ' + PK_BEBOER_NAVN + ' trykker. Noter svaret, når I er færdige.'));

  // Tre lige store knapper. Ingen af dem er en fejl: alle former for svar er kommunikation.
  const rk = pkEl('div', 'pkSvarRække');
  [['valgte', 'Valgte'], ['ingen-respons', 'Intet svar'], ['andet', 'Svarede på anden måde']].forEach(([type, tekst]) => {
    const b = pkEl('button', 'pkSvarKnap', tekst); b.type = 'button';
    b.addEventListener('click', () => pkAfslutValg(a, type));
    rk.appendChild(b);
  });
  kort.appendChild(rk);
  const luk = pkKnap('Luk uden at gemme', '', async () => {
    const ja = await pkBekraeft('Luk uden at gemme?', 'Valget lukkes på iPad\'en, og der gemmes ingen note.', 'Ja, luk');
    if(!ja) return;
    const res = await pkKald('personale_pik_valg_annuller');
    if(res.fejl){ pkToast(res.fejl); return; }
    pkHent();
  });
  luk.style.marginTop = '10px';
  kort.appendChild(luk);
  return kort;
}

async function pkAfslutKald(type, valgtId){
  const res = await pkKald('personale_pik_valg_afslut', { p_type: type, p_valgt_id: valgtId });
  if(res.fejl){ pkToast(res.fejl); return false; }
  pkToast('Noteret');
  await pkHent();
  return true;
}

function pkAfslutValg(a, type){
  if(type !== 'valgte' || a.valgt_id){ pkAfslutKald(type, null); return; }
  // "Valgte" uden at beboeren har trykket: personalen peger på billedet
  pkDialog('Hvilket billede valgte ' + PK_BEBOER_NAVN + '?', (boks, luk) => {
    const g = pkEl('div', 'pkVaelgGitter');
    (a.billeder || []).forEach(b => {
      const k = pkEl('button', 'pkVaelgFelt'); k.type = 'button';
      k.appendChild(pkBilledeEl(b.sti, b.navn));
      k.appendChild(document.createTextNode(b.navn));
      k.addEventListener('click', async () => { luk(); pkAfslutKald('valgte', b.id); });
      g.appendChild(k);
    });
    boks.appendChild(g);
    const rk = pkEl('div', 'pkKnapRække');
    const hoejre = pkEl('div', 'hoejre');
    hoejre.appendChild(pkKnap('Annuller', '', luk));
    rk.appendChild(hoejre);
    boks.appendChild(rk);
  }, true);
}

// ---------- Noter ----------

function pkDatoTekst(ms){
  const d = new Date(Number(ms));
  const t = n => String(n).padStart(2, '0');
  return t(d.getDate()) + '.' + t(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + t(d.getHours()) + '.' + t(d.getMinutes());
}

function pkNoteTekst(n){
  const tilbudt = (n.tilbudt || []).length ? ' (tilbudt: ' + n.tilbudt.join(', ') + ')' : '';
  const valg = n.fast_valg_navn ? 'Valg "' + n.fast_valg_navn + '": ' : '';
  let tekst;
  if(n.type === 'ja' || n.type === 'nej' || n.type === 'mere'){
    tekst = 'Trykkede "' + n.type.charAt(0).toUpperCase() + n.type.slice(1) + '"';
  } else if(n.type === 'valgte'){
    tekst = valg + 'Valgte "' + (n.ord || '?') + '"' + tilbudt;
  } else if(n.type === 'ingen-respons'){
    tekst = valg + 'Intet svar' + tilbudt;
  } else if(n.type === 'andet'){
    tekst = valg + 'Svarede på anden måde' + tilbudt;
  } else {
    tekst = valg + String(n.type || 'Registrering') + tilbudt;
  }
  return pkDatoTekst(n.tidspunkt) + ' – ' + tekst;
}

async function pkHentNoter(){
  const res = await pkKald('personale_pik_noter', { p_antal: 100 });
  if(res.fejl){ pk.noter = []; pkToast(res.fejl); }
  else pk.noter = res.data || [];
  if(pk.fane === 'noter') pkTegn();
}

async function pkKopier(tekst){
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch(e){
    const t = document.createElement('textarea');
    t.value = tekst; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch(x){ ok = false; }
    t.remove();
    return ok;
  }
}

function pkTegnNoter(rod){
  if(!pk.noter){
    rod.appendChild(pkEl('div', 'loading', 'Henter …'));
    pkHentNoter();
    return;
  }
  const kort = pkEl('div', 'kort');
  const hoved = pkEl('div', 'pkVaerktoej');
  hoved.appendChild(pkEl('h3', 'pkTael', 'Seneste registreringer'));
  const kopi = pkKnap('Kopiér som tekst', 'primaer', async () => {
    const linjer = pk.noter.map(pkNoteTekst);
    const ok = await pkKopier('Piktogram-noter for ' + PK_BEBOER_NAVN + '\n\n' + linjer.join('\n'));
    pkToast(ok ? 'Kopieret. Sæt ind i journalen.' : 'Kunne ikke kopiere. Marker teksten og kopier selv.');
  });
  kopi.disabled = !pk.noter.length;
  hoved.appendChild(kopi);
  hoved.appendChild(pkKnap('Opdater', '', () => { pk.noter = null; pkTegn(); }));
  kort.appendChild(hoved);
  if(!pk.noter.length) kort.appendChild(pkEl('p', 'pkAktMeta', 'Der er ingen registreringer endnu.'));
  pk.noter.forEach(n => kort.appendChild(pkEl('div', 'pkNote', pkNoteTekst(n))));
  rod.appendChild(kort);
}

// Mens fanen Valg er åben, følger den med i, hvad beboeren trykker på (og om et valg er åbnet på iPad'en)
setInterval(async () => {
  if(typeof aktuelSide === 'undefined' || aktuelSide !== 'piktogram' || pk.fane !== 'valg' || !pk.data || document.hidden) return;
  if(document.querySelector('.pkOverlay') || document.querySelector('.pkSe')) return;
  const res = await pkKald('personale_pik_valg_hent');
  if(res.fejl) return;
  const nyt = JSON.stringify(res.data), gammelt = JSON.stringify(pk.valg || {});
  if(nyt !== gammelt && !document.querySelector('.pkOverlay')){ pk.valg = res.data; pkTegn(); }
}, 3000);
