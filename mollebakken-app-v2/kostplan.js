// ==================================================================
// KOSTPLAN — personalets side til beboernes kostplaner (under Beboerapp)
// ==================================================================
// Underfane i fanen Beboerapp (trMode === 'kostplan'). Bruger samme personale-login
// som Træning (token i trToken) og kalder personale_kost_*-funktionerne
// (shared/kostplan-schema.sql). Billeder ligger i den PRIVATE bucket kost-billeder og
// hentes som signerede URL'er via edge-funktionen kost-billede.
//
// Ingen liste af måltider er hardcodet her: måltidstyperne kommer fra databasen.
// Alt tekst sættes med textContent / DOM-metoder (ingen HTML-strenge med brugerinput).
// Datoer er enhedens lokale dato (aldrig UTC/servertid).

const KOST_BUCKET = 'kost-billeder';
const KOST_MAKS_PX = 800;
const KOST_MAKS_BYTES = 900 * 1024;
const KOST_MAANEDER = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const KOST_HJAELP_BILLEDE = 'Brug billeder af mad eller ting, ikke af personer.';

let kost = {
  data: null,          // { maaltider, regler, afkrydsning }
  borger: '',          // valgt borger-id
  kladde: null,        // regel under redigering
  urls: {},            // billede-sti -> signeret URL
  urlTid: 0,           // hvornår URL'erne sidst blev hentet
  fejl: '',
  henter: false,
  gemmer: false,
  dialog: null,        // måltidsdialog
  kopiAaben: false
};

// ---------- Små hjælpere ----------

function kostDatoIdag(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function kostLokalDato(iso){
  const p = iso.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

// 2026-12-24 -> "torsdag 24. december" (med årstal, hvis det ikke er i år)
function kostDatoTekst(iso){
  const d = kostLokalDato(iso);
  const dagNavn = UGEDAGE[(d.getDay() + 6) % 7].toLowerCase();
  let t = dagNavn + ' ' + d.getDate() + '. ' + KOST_MAANEDER[d.getMonth()];
  if(d.getFullYear() !== new Date().getFullYear()) t += ' ' + d.getFullYear();
  return t;
}

function kostStortStart(t){
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function kostLilleStart(t){
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

const KOST_DAGE_KORT = { Mandag: 'Man', Tirsdag: 'Tir', Onsdag: 'Ons', Torsdag: 'Tor', Fredag: 'Fre', Lørdag: 'Lør', Søndag: 'Søn' };
const KOST_DAGE_BOGSTAV = { Mandag: 'M', Tirsdag: 'T', Onsdag: 'O', Torsdag: 'T', Fredag: 'F', Lørdag: 'L', Søndag: 'S' };

// "Alle dage", "Fredag", "Man, ons, fre" eller en dato
function kostHvornaarTekst(r){
  if(r.hvornaar_type === 'dato') return kostStortStart(kostDatoTekst(r.dato));
  const dage = UGEDAGE.filter(function(d){ return (r.ugedage || []).indexOf(d) >= 0; });
  if(dage.length === 7) return 'Alle dage';
  if(dage.length === 1) return dage[0];
  return dage.map(function(d, i){
    const k = KOST_DAGE_KORT[d];
    return i === 0 ? k : k.toLowerCase();
  }).join(', ');
}

// Lange ord (fx "Mellemmåltid") får en blød bindestreg ved sammensætningen, så de ikke brydes midt i
function kostBryd(navn){
  const vokal = 'aeiouyæøåé';
  return String(navn).split(' ').map(function(ord){
    if(ord.length < 9) return ord;
    const lav = ord.toLowerCase();
    let kand = [];
    for(let i = 3; i <= ord.length - 3; i++){
      if(vokal.indexOf(lav[i - 1]) < 0 && vokal.indexOf(lav[i]) < 0) kand.push(i);
    }
    const medS = kand.filter(function(i){ return lav[i - 1] === 's'; });
    if(medS.length > 0) kand = medS;
    if(kand.length === 0) return ord;
    const midt = ord.length / 2;
    let bedst = kand[0];
    kand.forEach(function(i){
      const a = Math.abs(i - midt), b = Math.abs(bedst - midt);
      if(a < b || (a === b && i > bedst)) bedst = i;
    });
    return ord.slice(0, bedst) + '­' + ord.slice(bedst);
  }).join(' ');
}

function kostTitel(r){
  return r.maaltid.navn + ' (' + kostHvornaarTekst(r).toLowerCase() + ')';
}

// Samme regel som _kost_gaelder i databasen
function kostGaelder(r, iso){
  if(r.gyldig_fra > iso) return false;
  if(r.gyldig_til && iso >= r.gyldig_til) return false;
  if(r.hvornaar_type === 'dato') return r.dato === iso;
  return (r.ugedage || []).indexOf(UGEDAGE[(kostLokalDato(iso).getDay() + 6) % 7]) >= 0;
}

function kostSorterRegler(liste){
  const rang = function(r){
    if(r.hvornaar_type === 'dato') return 100;
    const d = r.ugedage || [];
    if(d.length === 7) return 0;
    return 1 + Math.min.apply(null, d.map(function(x){ return UGEDAGE.indexOf(x); }).concat([6]));
  };
  return liste.slice().sort(function(a, b){
    const d = rang(a) - rang(b);
    if(d !== 0) return d;
    if(a.hvornaar_type === 'dato' && a.dato !== b.dato) return a.dato < b.dato ? -1 : 1;
    return (a.maaltid.sortering || 0) - (b.maaltid.sortering || 0);
  });
}

function kostBorgerNavn(id){
  return trBeboerNavn(id) || '';
}

function kostMaaltid(id){
  return kost.data ? (kost.data.maaltider.find(function(m){ return m.id === id; }) || null) : null;
}

// ---------- Billeder (privat bucket, signerede URL'er) ----------

function kostAlleStier(){
  const s = {};
  if(!kost.data) return [];
  kost.data.maaltider.forEach(function(m){ if(m.billede_sti) s[m.billede_sti] = true; });
  kost.data.regler.forEach(function(r){
    if(r.maaltid && r.maaltid.billede_sti) s[r.maaltid.billede_sti] = true;
    r.punkter.forEach(function(p){ if(p.billede_sti) s[p.billede_sti] = true; });
  });
  return Object.keys(s);
}

async function kostHentUrls(){
  const gammel = Date.now() - kost.urlTid > 50 * 60 * 1000;
  const alle = kostAlleStier();
  const mangler = gammel ? alle : alle.filter(function(s){ return !kost.urls[s]; });
  if(mangler.length === 0 || !trToken) return;
  for(let i = 0; i < mangler.length; i += 60){
    const svar = await sb.functions.invoke('kost-billede', {
      body: { action: 'hent', rolle: 'personale', token: trToken, stier: mangler.slice(i, i + 60) }
    });
    if(svar.error || !svar.data || !svar.data.urls) return;
    Object.keys(svar.data.urls).forEach(function(s){ kost.urls[s] = svar.data.urls[s]; });
  }
  kost.urlTid = Date.now();
}

function kostBillede(sti, preview, klasse){
  const boks = trEl('div', klasse || 'kostBillede');
  const kilde = preview || (sti ? kost.urls[sti] : null);
  if(kilde){
    const img = document.createElement('img');
    img.alt = '';
    img.src = kilde;
    boks.appendChild(img);
  }
  return boks;
}

// Måltid/punkt som lille symbol: eget billede, ellers ikon
function kostSymbol(ikon, sti, preview, stoerrelse){
  const boks = trEl('span', 'kostSymbol');
  if(sti || preview){
    const b = kostBillede(sti, preview, 'kostSymbolBillede');
    boks.appendChild(b);
  } else if(ikon){
    boks.appendChild(kostIkon(ikon, stoerrelse || 24, 1.8));
  }
  return boks;
}

function kostKomprimer(fil){
  return new Promise(function(resolve, reject){
    const url = URL.createObjectURL(fil);
    const img = new Image();
    img.onload = function(){
      URL.revokeObjectURL(url);
      const lang = Math.max(img.width, img.height);
      const skala = Math.min(1, KOST_MAKS_PX / lang);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * skala));
      canvas.height = Math.max(1, Math.round(img.height * skala));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let kvalitet = 0.85;
      const proev = function(){
        canvas.toBlob(function(blob){
          if(!blob){ reject(new Error('Billedet kunne ikke bruges')); return; }
          if(blob.size > KOST_MAKS_BYTES && kvalitet > 0.45){ kvalitet -= 0.1; proev(); return; }
          if(blob.size > KOST_MAKS_BYTES){ reject(new Error('Billedet er for stort')); return; }
          resolve(blob);
        }, 'image/jpeg', kvalitet);
      };
      proev();
    };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('Billedet kunne ikke læses')); };
    img.src = url;
  });
}

async function kostUpload(blob){
  const start = await sb.functions.invoke('kost-billede', {
    body: { action: 'upload', token: trToken, type: 'image/jpeg' }
  });
  if(start.error){
    const status = start.error.context && start.error.context.status;
    if(status === 401){ trGemToken(null); throw new Error('Du er logget ud. Log ind igen med personalekoden.'); }
    throw new Error('Kunne ikke starte upload af billedet.');
  }
  const d = start.data;
  if(!d || !d.token || !d.sti) throw new Error('Kunne ikke starte upload af billedet.');
  const op = await sb.storage.from(KOST_BUCKET).uploadToSignedUrl(d.sti, d.token, blob, { contentType: 'image/jpeg' });
  if(op.error) throw new Error('Billedet kunne ikke uploades.');
  return d.sti;
}

// Best effort: serveren sletter kun filer, som ingen bruger længere
async function kostRydFiler(stier){
  for(let i = 0; i < stier.length; i++){
    try { await sb.functions.invoke('kost-billede', { body: { action: 'slet', token: trToken, sti: stier[i] } }); }
    catch(e){ console.error(e); }
  }
}

// Knap + skjult filfelt. Kalder ved(blob, preview) med det skalerede billede.
function kostUploadKnap(tekst, ved){
  const boks = trEl('span', 'kostUploadBoks');
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.hidden = true;
  inp.addEventListener('change', async function(){
    const fil = inp.files && inp.files[0];
    inp.value = '';
    if(!fil) return;
    try {
      const blob = await kostKomprimer(fil);
      ved(blob, URL.createObjectURL(blob));
    } catch(e){
      visToast(e && e.message ? e.message : 'Billedet kunne ikke bruges. Prøv et andet.');
    }
  });
  boks.appendChild(trKnap(tekst, 'sekundaer kostStorKnap', function(){ inp.click(); }));
  boks.appendChild(inp);
  return boks;
}

// Række af ikoner med knappen Flere
function kostIkonVaelger(valgt, visAlle, ved, skiftAlle){
  const rod = trEl('div', 'kostIkonVaelger');
  const gitter = trEl('div', 'kostIkonGitter');
  const liste = visAlle ? KOST_IKONER : KOST_IKONER.slice(0, KOST_IKON_FAST);
  liste.forEach(function(i){
    const k = trEl('button', 'kostIkonValg' + (i.navn === valgt ? ' valgt' : ''));
    k.type = 'button';
    k.setAttribute('aria-label', i.label);
    k.setAttribute('aria-pressed', i.navn === valgt ? 'true' : 'false');
    k.title = i.label;
    k.appendChild(kostIkon(i.navn, 26, 1.8));
    k.addEventListener('click', function(){ ved(i.navn); });
    gitter.appendChild(k);
  });
  const flere = trEl('button', 'kostIkonValg kostFlere', visAlle ? 'Færre' : 'Flere');
  flere.type = 'button';
  flere.addEventListener('click', skiftAlle);
  gitter.appendChild(flere);
  rod.appendChild(gitter);
  return rod;
}

// ---------- Hent ----------

async function kostHent(){
  if(!trToken || kost.henter) return;
  kost.henter = true;
  const res = await trKald('personale_kost_hent', { p_lokal_dato: kostDatoIdag() });
  kost.henter = false;
  if(res.fejl){
    kost.fejl = res.fejl;
  } else {
    kost.fejl = '';
    kost.data = res.data;
    try { await kostHentUrls(); } catch(e){ console.error(e); }
  }
  if(aktuelSide === 'traening' && trMode === 'kostplan') trTegn();
}

// ---------- Listen ----------

function kostTegn(rod){
  if(!kost.data){
    if(kost.fejl){
      rod.appendChild(trEl('div', 'trFejl', kost.fejl));
      rod.appendChild(trKnap('Prøv igen', 'sekundaer', function(){ kost.fejl = ''; trTegn(); }));
    } else {
      rod.appendChild(trEl('div', 'loading', 'Henter …'));
      kostHent();
    }
    return;
  }
  if(!kost.borger || !beboereListe.some(function(b){ return b.id === kost.borger; })){
    kost.borger = beboereListe.length > 0 ? beboereListe[0].id : '';
  }

  const intro = trEl('div', 'kort');
  intro.appendChild(trEl('h3', null, 'Kostplan'));
  intro.appendChild(trEl('p', 'trMeta', 'Vælg en borger. Planen vises kun på borgerens egen telefon, aldrig på en fælles skærm.'));
  const chips = trEl('div', 'trChips');
  chips.style.marginTop = '10px';
  beboereListe.forEach(function(b){
    const valgt = b.id === kost.borger;
    const k = trEl('button', 'knap trChip' + (valgt ? ' til' : ''), b.navn);
    k.type = 'button';
    k.setAttribute('aria-pressed', valgt ? 'true' : 'false');
    k.addEventListener('click', function(){ kost.borger = b.id; kost.kopiAaben = false; trTegn(); });
    chips.appendChild(k);
  });
  intro.appendChild(chips);
  rod.appendChild(intro);

  const navn = kostBorgerNavn(kost.borger);
  const regler = kostSorterRegler(kost.data.regler.filter(function(r){ return r.borger_id === kost.borger; }));

  if(regler.length === 0){
    const tom = trEl('div', 'kort');
    tom.appendChild(trEl('p', 'trMeta', navn + ' har ingen regler endnu. Tryk "Tilføj regel" for at lave den første.'));
    rod.appendChild(tom);
  }
  regler.forEach(function(r){ rod.appendChild(kostReglKort(r)); });

  const knapper = trEl('div', 'trKnapRække');
  knapper.appendChild(trKnap('Tilføj regel', 'knapGuld kostStorKnap', kostNyRegel));
  knapper.appendChild(trKnap(kost.kopiAaben ? 'Luk kopiering' : 'Kopiér regel fra en anden borger', 'sekundaer kostStorKnap', function(){
    kost.kopiAaben = !kost.kopiAaben;
    trTegn();
  }));
  rod.appendChild(knapper);

  if(kost.kopiAaben) rod.appendChild(kostKopiPanel(navn));

  rod.appendChild(kostStatus(navn, regler));
  rod.appendChild(kostMaaltidTyper());
}

function kostReglKort(r){
  const kort = trEl('div', 'kort kostRegel');
  const hoved = trEl('div', 'kostRegelHoved');
  hoved.appendChild(kostSymbol(r.maaltid.ikon, r.maaltid.billede_sti, null, 26));
  const tekst = trEl('div', 'kostRegelTekst');
  tekst.appendChild(trEl('h3', 'kostRegelTitel', r.maaltid.navn));
  tekst.appendChild(trEl('div', 'kostRegelDage', kostHvornaarTekst(r)));
  hoved.appendChild(tekst);
  const ret = trEl('button', 'kostIkonKnap');
  ret.type = 'button';
  ret.setAttribute('aria-label', 'Rediger regel: ' + kostTitel(r));
  ret.appendChild(moelleIkon('rediger', { stoerrelse: 22 }));
  ret.addEventListener('click', function(){ kostRedigerRegel(r); });
  hoved.appendChild(ret);
  kort.appendChild(hoved);

  const ul = trEl('ul', 'kostPunktListe');
  if(r.punkter.length === 0) ul.appendChild(trEl('li', 'trMeta', 'Ingen punkter'));
  r.punkter.forEach(function(p){
    const li = trEl('li', 'kostPunkt');
    if(p.ikon || p.billede_sti) li.appendChild(kostSymbol(p.ikon, p.billede_sti, null, 20));
    li.appendChild(trEl('span', 'kostPunktNavn', p.navn));
    if(p.maengde) li.appendChild(trEl('span', 'kostPunktMaengde', p.maengde));
    ul.appendChild(li);
  });
  kort.appendChild(ul);
  return kort;
}

function kostSidstAendret(regler){
  let nyeste = null;
  regler.forEach(function(r){
    if(!nyeste || r.opdateret_tidspunkt > nyeste.opdateret_tidspunkt) nyeste = r;
  });
  if(!nyeste) return '';
  const d = new Date(nyeste.opdateret_tidspunkt);   // lokal tid i browseren
  return 'Sidst ændret ' + d.getDate() + '. ' + KOST_MAANEDER[d.getMonth()] + ' ' + d.getFullYear() + ' af ' + nyeste.opdateret_af;
}

function kostStatus(navn, regler){
  const kort = trEl('div', 'kort kostStatus');
  const sidst = kostSidstAendret(regler);
  if(sidst) kort.appendChild(trEl('p', 'trMeta', sidst));
  const idag = kostDatoIdag();
  const iDag = regler.filter(function(r){ return kostGaelder(r, idag); });
  const marker = kost.data.afkrydsning.filter(function(a){ return a.borger_id === kost.borger; });
  const antalFulgt = iDag.filter(function(r){ return marker.some(function(a){ return a.regel_id === r.id; }); }).length;
  let tekst;
  if(iDag.length === 0) tekst = navn + ' har ingen måltider på planen i dag.';
  else if(antalFulgt === iDag.length) tekst = navn + ' har fulgt planen i dag.';
  else if(antalFulgt === 0) tekst = navn + ' har ikke markeret noget i dag endnu.';
  else tekst = navn + ' har fulgt ' + antalFulgt + ' af ' + iDag.length + ' måltider i dag.';
  kort.appendChild(trEl('p', 'kostStatusTekst', tekst));
  return kort;
}

// ---------- Kopiér fra en anden borger ----------

function kostKopiPanel(tilNavn){
  const kort = trEl('div', 'kort');
  kort.appendChild(trEl('h3', null, 'Kopiér til ' + tilNavn));
  kort.appendChild(trEl('p', 'trMeta', 'Vælg en regel. Kopien åbnes, så du kan rette mængden, før du gemmer.'));
  let fandt = false;
  beboereListe.forEach(function(b){
    if(b.id === kost.borger) return;
    const liste = kostSorterRegler(kost.data.regler.filter(function(r){ return r.borger_id === b.id; }));
    if(liste.length === 0) return;
    fandt = true;
    kort.appendChild(trEl('h4', 'kostKopiBorger', b.navn));
    liste.forEach(function(r){
      const rk = trEl('div', 'kostKopiRække');
      const tekst = trEl('div', 'kostKopiTekst');
      tekst.appendChild(trEl('div', 'trProgramNavn', kostTitel(r)));
      tekst.appendChild(trEl('div', 'trMeta', r.punkter.map(function(p){
        return p.navn + (p.maengde ? ' (' + p.maengde + ')' : '');
      }).join(', ')));
      rk.appendChild(tekst);
      rk.appendChild(trKnap('Kopiér', 'sekundaer', function(){ kostKopier(r); }));
      kort.appendChild(rk);
    });
  });
  if(!fandt) kort.appendChild(trEl('p', 'trMeta', 'De andre borgere har ingen regler at kopiere.'));
  return kort;
}

async function kostKopier(r){
  const navn = trMitNavn();
  if(!navn){ visToast('Skriv dit navn øverst først.'); return; }
  const res = await trKald('personale_kost_kopier_regel', {
    p_regel_id: r.id, p_til_borger: kost.borger, p_navn: navn, p_lokal_dato: kostDatoIdag()
  });
  if(res.fejl){ visToast(res.fejl); return; }
  await kostHent();
  const ny = kost.data ? kost.data.regler.find(function(x){ return x.id === res.data; }) : null;
  kost.kopiAaben = false;
  if(ny){ kostRedigerRegel(ny); visToast('Reglen er kopieret. Ret mængden og tryk Gem regel.', 3500); }
  else trTegn();
}

// ---------- Måltidstyper ----------

function kostMaaltidTyper(){
  const kort = trEl('div', 'kort');
  kort.appendChild(trEl('h3', null, 'Måltidstyper'));
  kort.appendChild(trEl('p', 'trMeta', 'Listen over måltider er jeres egen. Rettelser af ikon eller billede gælder alle regler med den måltidstype.'));
  kost.data.maaltider.forEach(function(m){
    const rk = trEl('div', 'kostKopiRække');
    const tekst = trEl('div', 'kostRegelHoved');
    tekst.appendChild(kostSymbol(m.ikon, m.billede_sti, null, 24));
    tekst.appendChild(trEl('span', 'trProgramNavn', m.navn));
    rk.appendChild(tekst);
    const ret = trEl('button', 'kostIkonKnap');
    ret.type = 'button';
    ret.setAttribute('aria-label', 'Ret måltidstypen ' + m.navn);
    ret.appendChild(moelleIkon('rediger', { stoerrelse: 22 }));
    ret.addEventListener('click', function(){ kostAabnDialog(m, null); });
    rk.appendChild(ret);
    kort.appendChild(rk);
  });
  const ny = trKnap('Ny måltidstype', 'sekundaer kostStorKnap', function(){ kostAabnDialog(null, null); });
  ny.style.marginTop = '10px';
  kort.appendChild(ny);
  return kort;
}

// Dialog: ny eller ret måltidstype (navn + ikon eller billede)
function kostAabnDialog(maaltid, efterGem){
  kost.dialog = {
    id: maaltid ? maaltid.id : null,
    navn: maaltid ? maaltid.navn : '',
    ikon: maaltid ? maaltid.ikon : 'aftensmad',
    sti: maaltid ? maaltid.billede_sti : null,
    blob: null, preview: null,
    fane: maaltid && maaltid.billede_sti ? 'billede' : 'ikon',
    visAlle: false, fejl: '', gemmer: false,
    origSti: maaltid ? maaltid.billede_sti : null,
    efterGem: efterGem
  };
  kostTegnDialog();
}

function kostLukDialog(){
  const d = kost.dialog;
  if(d && d.preview){ try { URL.revokeObjectURL(d.preview); } catch(e){ /* ignorer */ } }
  kost.dialog = null;
  const e = document.getElementById('kostDialog');
  if(e) e.parentNode.removeChild(e);
  document.body.classList.remove('kostDialogAaben');
}

function kostTegnDialog(){
  const d = kost.dialog;
  let lag = document.getElementById('kostDialog');
  if(!d){ if(lag) kostLukDialog(); return; }
  if(!lag){
    lag = trEl('div', 'kostDialogLag');
    lag.id = 'kostDialog';
    lag.setAttribute('role', 'dialog');
    lag.setAttribute('aria-modal', 'true');
    lag.setAttribute('aria-label', d.id ? 'Ret måltidstype' : 'Ny måltidstype');
    document.body.appendChild(lag);
    document.body.classList.add('kostDialogAaben');
  }
  lag.textContent = '';
  const boks = trEl('div', 'kostDialogBoks');
  boks.appendChild(trEl('h3', null, d.id ? 'Ret måltidstype' : 'Nyt måltid'));

  const nRække = trEl('div', 'formRække');
  nRække.appendChild(trEl('label', null, 'Navn'));
  const nInput = document.createElement('input');
  nInput.type = 'text';
  nInput.maxLength = 40;
  nInput.value = d.navn;
  nInput.placeholder = 'Fx Julefrokost';
  nInput.addEventListener('input', function(){ d.navn = nInput.value; });
  nRække.appendChild(nInput);
  boks.appendChild(nRække);

  boks.appendChild(kostBilledeValg({
    fane: d.fane, ikon: d.ikon, sti: d.sti, preview: d.preview, visAlle: d.visAlle,
    skiftFane: function(f){ d.fane = f; kostTegnDialog(); },
    vaelgIkon: function(n){ d.ikon = n; d.fane = 'ikon'; kostTegnDialog(); },
    skiftAlle: function(){ d.visAlle = !d.visAlle; kostTegnDialog(); },
    nytBillede: function(blob, preview){
      if(d.preview){ try { URL.revokeObjectURL(d.preview); } catch(e){ /* ignorer */ } }
      d.blob = blob; d.preview = preview; d.fane = 'billede'; kostTegnDialog();
    },
    fjernBillede: function(){
      if(d.preview){ try { URL.revokeObjectURL(d.preview); } catch(e){ /* ignorer */ } }
      d.blob = null; d.preview = null; d.sti = null; d.fane = 'ikon'; kostTegnDialog();
    }
  }));

  if(d.fejl) boks.appendChild(trEl('div', 'trFejl', d.fejl));

  const knapper = trEl('div', 'trKnapRække');
  const gem = trKnap(d.gemmer ? 'Gemmer …' : 'Gem', 'knapGuld kostStorKnap', kostGemDialog);
  gem.disabled = d.gemmer;
  knapper.appendChild(gem);
  knapper.appendChild(trKnap('Annuller', 'sekundaer kostStorKnap', kostLukDialog));
  if(d.id){
    const slet = trKnap('Slet måltidstype', 'sekundaer kostStorKnap kostSlet', kostSletDialog);
    knapper.appendChild(slet);
  }
  boks.appendChild(knapper);
  lag.appendChild(boks);
}

// Fælles blok: "Billede til måltidet" med skift mellem Ikon og Eget billede
function kostBilledeValg(o){
  const blok = trEl('div', 'formRække kostBilledeBlok');
  blok.appendChild(trEl('label', null, 'Billede til måltidet'));
  const skifter = trEl('div', 'kostSkifter');
  [['ikon', 'Ikon'], ['billede', 'Eget billede']].forEach(function(p){
    const k = trEl('button', 'kostSkifterKnap' + (o.fane === p[0] ? ' til' : ''), p[1]);
    k.type = 'button';
    k.setAttribute('aria-pressed', o.fane === p[0] ? 'true' : 'false');
    k.addEventListener('click', function(){ o.skiftFane(p[0]); });
    skifter.appendChild(k);
  });
  blok.appendChild(skifter);
  if(o.fane === 'ikon'){
    blok.appendChild(kostIkonVaelger(o.ikon, o.visAlle, o.vaelgIkon, o.skiftAlle));
  } else {
    if(o.sti || o.preview){
      blok.appendChild(kostBillede(o.sti, o.preview, 'trForhaandsvisning'));
    }
    const r = trEl('div', 'trKnapRække');
    r.appendChild(kostUploadKnap(o.sti || o.preview ? 'Skift billede' : 'Upload eget billede', o.nytBillede));
    if(o.sti || o.preview) r.appendChild(trKnap('Fjern billede', 'sekundaer kostStorKnap', o.fjernBillede));
    blok.appendChild(r);
    blok.appendChild(trEl('div', 'trHjaelp', KOST_HJAELP_BILLEDE));
  }
  return blok;
}

async function kostGemDialog(){
  const d = kost.dialog;
  if(!d || d.gemmer) return;
  const navn = d.navn.trim();
  if(!navn){ d.fejl = 'Giv måltidet et navn.'; kostTegnDialog(); return; }
  if(d.fane === 'billede' && !d.sti && !d.blob){ d.fejl = 'Vælg et billede, eller skift til Ikon.'; kostTegnDialog(); return; }
  d.gemmer = true; d.fejl = '';
  kostTegnDialog();
  try {
    let sti = d.fane === 'billede' ? d.sti : null;
    if(d.fane === 'billede' && d.blob) sti = await kostUpload(d.blob);
    const res = await trKald('personale_kost_gem_maaltid', {
      p_id: d.id, p_navn: navn, p_ikon: d.fane === 'ikon' ? d.ikon : null, p_billede_sti: sti
    });
    if(res.fejl) throw new Error(res.fejl);
    if(d.origSti && d.origSti !== sti) kostRydFiler([d.origSti]);
    const efter = d.efterGem;
    kostLukDialog();
    await kostHent();
    if(efter) efter(res.data);
    else trTegn();
    visToast('Måltidstypen er gemt');
  } catch(e){
    if(kost.dialog){ kost.dialog.gemmer = false; kost.dialog.fejl = e && e.message ? e.message : 'Noget gik galt.'; kostTegnDialog(); }
  }
}

async function kostSletDialog(){
  const d = kost.dialog;
  if(!d || !d.id) return;
  if(!window.confirm('Slette måltidstypen "' + d.navn + '"? Det kan kun lade sig gøre, hvis ingen regel bruger den.')) return;
  const res = await trKald('personale_kost_slet_maaltid', { p_id: d.id });
  if(res.fejl){ d.fejl = res.fejl.indexOf('bruges') >= 0 ? 'Måltidstypen bruges af en regel og kan ikke slettes.' : res.fejl; kostTegnDialog(); return; }
  if(d.origSti) kostRydFiler([d.origSti]);
  kostLukDialog();
  await kostHent();
  visToast('Måltidstypen er slettet');
}

// ---------- Ny regel / ret regel ----------

function kostNyKladdePunkt(){
  return { navn: '', maengde: '', ikon: null, sti: null, blob: null, preview: null, aaben: false, visAlle: false };
}

function kostKladdeFraMaaltid(k, m){
  k.maaltid_id = m ? m.id : '';
  k.maaltFane = m && m.billede_sti ? 'billede' : 'ikon';
  k.maaltIkon = m ? m.ikon : 'aftensmad';
  k.maaltSti = m ? m.billede_sti : null;
  k.maaltBlob = null; k.maaltPreview = null;
  k.maaltOrigIkon = m ? m.ikon : null; k.maaltOrigSti = m ? m.billede_sti : null;
  k.maaltAlle = false;
}

function kostNyRegel(){
  if(!kost.data || !kost.borger) return;
  const k = {
    id: null, borger_id: kost.borger,
    modus: 'dage', dage: [], dato: '',
    visSkift: false,
    punkter: [kostNyKladdePunkt()],
    origStier: [], fejl: '', fokus: null
  };
  kostKladdeFraMaaltid(k, null);
  kost.kladde = k;
  trMode = 'regelForm';
  trTegn();
  window.scrollTo(0, 0);
}

function kostRedigerRegel(r){
  const k = {
    id: r.id, borger_id: r.borger_id,
    modus: r.hvornaar_type === 'dato' ? 'dato' : 'dage',
    dage: (r.ugedage || []).slice(), dato: r.dato || '',
    visSkift: false,
    punkter: r.punkter.map(function(p){
      return { navn: p.navn, maengde: p.maengde || '', ikon: p.ikon, sti: p.billede_sti, blob: null, preview: null, aaben: false, visAlle: false };
    }),
    origStier: r.punkter.map(function(p){ return p.billede_sti; }).filter(Boolean),
    fejl: '', fokus: null
  };
  kostKladdeFraMaaltid(k, r.maaltid);
  k.maaltid_id = r.maaltid_id;
  kost.kladde = k;
  trMode = 'regelForm';
  trTegn();
  window.scrollTo(0, 0);
}

function kostLukForm(){
  const k = kost.kladde;
  if(k){
    if(k.maaltPreview){ try { URL.revokeObjectURL(k.maaltPreview); } catch(e){ /* ignorer */ } }
    k.punkter.forEach(function(p){ if(p.preview){ try { URL.revokeObjectURL(p.preview); } catch(e){ /* ignorer */ } } });
  }
  kost.kladde = null;
  trMode = 'kostplan';
  trTegn();
}

// Lille tekstlink (mindst 44 px høj trykflade)
function kostLink(tekst, ved){
  const l = trEl('button', 'kostLink', tekst);
  l.type = 'button';
  l.addEventListener('click', ved);
  return l;
}

function kostTrinHoved(nr, tekst){
  const h = trEl('h3', 'kostTrinTitel');
  h.appendChild(trEl('span', 'kostTrinNr', String(nr)));
  h.appendChild(document.createTextNode(tekst));
  return h;
}

// Én skærm, tre trin: 1 måltid, 2 dage, 3 hvad og hvor meget
function kostTegnForm(rod){
  const k = kost.kladde;
  if(!k || !kost.data){ trMode = 'kostplan'; kostTegn(rod); return; }

  const kort = trEl('div', 'kort kostForm');
  kort.appendChild(trEl('h3', 'kostFormTitel', k.id ? 'Rediger regel' : 'Ny regel'));
  kort.appendChild(trEl('p', 'trMeta', 'Til: ' + kostBorgerNavn(k.borger_id)));

  // ---- Trin 1: måltid ----
  kort.appendChild(kostTrinHoved(1, 'Hvilket måltid?'));
  const gitter = trEl('div', 'kostMaaltidGitter');
  kost.data.maaltider.forEach(function(m){
    const valgt = m.id === k.maaltid_id;
    const knap = trEl('button', 'kostMaaltidKnap' + (valgt ? ' valgt' : ''));
    knap.type = 'button';
    knap.setAttribute('aria-pressed', valgt ? 'true' : 'false');
    knap.appendChild(kostSymbol(valgt ? k.maaltIkon : m.ikon, valgt ? k.maaltSti : m.billede_sti, valgt ? k.maaltPreview : null, 26));
    knap.appendChild(trEl('span', 'kostMaaltidNavn', kostBryd(m.navn)));
    knap.addEventListener('click', function(){ kostVaelgMaaltid(m.id); });
    gitter.appendChild(knap);
  });
  const nyt = trEl('button', 'kostMaaltidKnap kostNytMaaltid');
  nyt.type = 'button';
  nyt.appendChild(trEl('span', 'kostPlus', '+'));
  nyt.appendChild(trEl('span', 'kostMaaltidNavn', 'Nyt måltid'));
  nyt.addEventListener('click', function(){ kostAabnDialog(null, function(id){ kostVaelgMaaltid(id); }); });
  gitter.appendChild(nyt);
  kort.appendChild(gitter);

  if(k.maaltid_id){
    kort.appendChild(kostLink(k.visSkift ? 'Skjul ikon og billede' : 'Skift ikon eller billede', function(){ k.visSkift = !k.visSkift; trTegn(); }));
    if(k.visSkift){
      kort.appendChild(kostBilledeValg({
        fane: k.maaltFane, ikon: k.maaltIkon, sti: k.maaltSti, preview: k.maaltPreview, visAlle: k.maaltAlle,
        skiftFane: function(f){ k.maaltFane = f; trTegn(); },
        vaelgIkon: function(n){ k.maaltIkon = n; k.maaltFane = 'ikon'; trTegn(); },
        skiftAlle: function(){ k.maaltAlle = !k.maaltAlle; trTegn(); },
        nytBillede: function(blob, preview){
          if(k.maaltPreview){ try { URL.revokeObjectURL(k.maaltPreview); } catch(e){ /* ignorer */ } }
          k.maaltBlob = blob; k.maaltPreview = preview; k.maaltFane = 'billede'; trTegn();
        },
        fjernBillede: function(){
          if(k.maaltPreview){ try { URL.revokeObjectURL(k.maaltPreview); } catch(e){ /* ignorer */ } }
          k.maaltBlob = null; k.maaltPreview = null; k.maaltSti = null; k.maaltFane = 'ikon'; trTegn();
        }
      }));
      kort.appendChild(trEl('div', 'trHjaelp', 'Ikon og billede gælder alle regler med dette måltid.'));
    }
  }

  // ---- Trin 2: dage ----
  kort.appendChild(kostTrinHoved(2, 'Hvilke dage?'));
  if(k.modus === 'dage'){
    const række = trEl('div', 'kostDagRække');
    UGEDAGE.forEach(function(dag){
      const til = k.dage.indexOf(dag) >= 0;
      const b = trEl('button', 'kostDagKnap' + (til ? ' til' : ''), KOST_DAGE_BOGSTAV[dag]);
      b.type = 'button';
      b.setAttribute('aria-label', dag);
      b.setAttribute('aria-pressed', til ? 'true' : 'false');
      b.addEventListener('click', function(){
        const i = k.dage.indexOf(dag);
        if(i >= 0) k.dage.splice(i, 1); else k.dage.push(dag);
        b.classList.toggle('til', i < 0);
        b.setAttribute('aria-pressed', i < 0 ? 'true' : 'false');
      });
      række.appendChild(b);
    });
    kort.appendChild(række);
    const links = trEl('div', 'kostLinkRække');
    links.appendChild(kostLink('Alle dage', function(){ k.dage = UGEDAGE.slice(); trTegn(); }));
    links.appendChild(kostLink('Bestemt dato', function(){ k.modus = 'dato'; trTegn(); }));
    kort.appendChild(links);
  } else {
    const dInput = document.createElement('input');
    dInput.type = 'date';
    dInput.className = 'kostDatoFelt';
    dInput.value = k.dato;
    dInput.setAttribute('aria-label', 'Dato');
    dInput.addEventListener('input', function(){ k.dato = dInput.value; });
    kort.appendChild(dInput);
    kort.appendChild(kostLink('Vælg ugedage i stedet', function(){ k.modus = 'dage'; trTegn(); }));
  }

  // ---- Trin 3: hvad og hvor meget ----
  kort.appendChild(kostTrinHoved(3, 'Hvad og hvor meget?'));
  k.punkter.forEach(function(p, i){ kort.appendChild(kostPunktRække(k, p, i)); });
  kort.appendChild(kostLink('Tilføj mere', function(){
    k.punkter.push(kostNyKladdePunkt());
    k.fokus = k.punkter.length - 1;
    trTegn();
  }));

  if(k.fejl) kort.appendChild(trEl('div', 'trFejl', k.fejl));

  const gem = trKnap(kost.gemmer ? 'Gemmer …' : 'Gem regel', 'knapGuld kostGemStor', kostGemRegel);
  gem.disabled = kost.gemmer;
  kort.appendChild(gem);
  const under = trEl('div', 'kostLinkRække kostMidt');
  under.appendChild(kostLink('Annuller', kostLukForm));
  if(k.id) under.appendChild(kostLink('Slet regel', kostSletRegel));
  kort.appendChild(under);
  rod.appendChild(kort);

  if(k.fokus != null){
    const nr = k.fokus;
    k.fokus = null;
    setTimeout(function(){
      const felt = document.getElementById('kostPunktNavn' + nr);
      if(felt) felt.focus();
    }, 0);
  }
}

function kostVaelgMaaltid(id){
  const k = kost.kladde;
  const m = kostMaaltid(id);
  if(!k || !m) return;
  if(k.maaltPreview){ try { URL.revokeObjectURL(k.maaltPreview); } catch(e){ /* ignorer */ } }
  kostKladdeFraMaaltid(k, m);
  trTegn();
}

function kostPunktRække(k, p, i){
  const boks = trEl('div', 'kostPunktForm');
  const række = trEl('div', 'kostPunktFelter');

  const nav = document.createElement('input');
  nav.type = 'text';
  nav.id = 'kostPunktNavn' + i;
  nav.maxLength = 60;
  nav.value = p.navn;
  nav.placeholder = 'Hvad, fx Havregryn';
  nav.setAttribute('aria-label', 'Hvad (punkt ' + (i + 1) + ')');
  nav.addEventListener('input', function(){ p.navn = nav.value; });
  række.appendChild(nav);

  const maengde = document.createElement('input');
  maengde.type = 'text';
  maengde.maxLength = 40;
  maengde.value = p.maengde;
  maengde.placeholder = 'Hvor meget (valgfrit)';
  maengde.setAttribute('aria-label', 'Hvor meget (punkt ' + (i + 1) + ')');
  maengde.addEventListener('input', function(){ p.maengde = maengde.value; });
  række.appendChild(maengde);
  boks.appendChild(række);

  const slet = trEl('button', 'kostIkonKnap');
  slet.type = 'button';
  slet.setAttribute('aria-label', 'Slet punkt ' + (i + 1));
  slet.appendChild(moelleIkon('slet', { stoerrelse: 22 }));
  slet.addEventListener('click', function(){
    if(p.preview){ try { URL.revokeObjectURL(p.preview); } catch(e){ /* ignorer */ } }
    k.punkter.splice(i, 1);
    if(k.punkter.length === 0) k.punkter.push(kostNyKladdePunkt());
    trTegn();
  });
  boks.appendChild(slet);

  // Skjult som standard: ikon eller billede til punktet
  const harSymbol = !!(p.ikon || p.sti || p.preview);
  const mere = trEl('button', 'kostLink kostPunktMere');
  mere.type = 'button';
  mere.setAttribute('aria-expanded', p.aaben ? 'true' : 'false');
  if(harSymbol) mere.appendChild(kostSymbol(p.ikon, p.sti, p.preview, 20));
  mere.appendChild(document.createTextNode(p.aaben ? 'Skjul ikon og billede' : (harSymbol ? 'Skift ikon eller billede' : 'Tilføj ikon eller billede')));
  mere.addEventListener('click', function(){ p.aaben = !p.aaben; trTegn(); });
  boks.appendChild(mere);

  if(p.aaben){
    const panel = trEl('div', 'kostPunktPanel');
    panel.appendChild(kostIkonVaelger(p.ikon, p.visAlle, function(n){
      p.ikon = n; p.sti = null; p.blob = null;
      if(p.preview){ try { URL.revokeObjectURL(p.preview); } catch(e){ /* ignorer */ } }
      p.preview = null;
      trTegn();
    }, function(){ p.visAlle = !p.visAlle; trTegn(); }));
    const r = trEl('div', 'trKnapRække');
    r.appendChild(kostUploadKnap('Upload eget billede', function(blob, preview){
      if(p.preview){ try { URL.revokeObjectURL(p.preview); } catch(e){ /* ignorer */ } }
      p.blob = blob; p.preview = preview; p.sti = null; p.ikon = null; trTegn();
    }));
    r.appendChild(trKnap('Ingen', 'sekundaer kostStorKnap', function(){
      if(p.preview){ try { URL.revokeObjectURL(p.preview); } catch(e){ /* ignorer */ } }
      p.ikon = null; p.sti = null; p.blob = null; p.preview = null; trTegn();
    }));
    panel.appendChild(r);
    panel.appendChild(trEl('div', 'trHjaelp', KOST_HJAELP_BILLEDE));
    boks.appendChild(panel);
  }
  return boks;
}

async function kostGemRegel(){
  const k = kost.kladde;
  if(!k || kost.gemmer) return;
  const navn = trMitNavn();
  const punkter = k.punkter.filter(function(p){ return p.navn.trim() || p.maengde.trim(); });
  let fejl = '';
  if(!navn) fejl = 'Skriv dit navn øverst på siden.';
  else if(!k.maaltid_id) fejl = 'Trin 1: vælg et måltid.';
  else if(k.modus === 'dage' && k.dage.length === 0) fejl = 'Trin 2: vælg mindst én dag.';
  else if(k.modus === 'dato' && !k.dato) fejl = 'Trin 2: vælg en dato.';
  else if(punkter.length === 0) fejl = 'Trin 3: skriv mindst ét punkt.';
  else if(punkter.some(function(p){ return !p.navn.trim(); })) fejl = 'Trin 3: alle rækker skal have noget i "Hvad".';
  if(fejl){ k.fejl = fejl; trTegn(); return; }

  kost.gemmer = true; k.fejl = '';
  trTegn();
  try {
    // 1. Måltidets ikon/billede (gælder alle regler med måltidet) — kun hvis det er ændret
    let maaltSti = k.maaltFane === 'billede' ? k.maaltSti : null;
    if(k.maaltFane === 'billede' && k.maaltBlob) maaltSti = await kostUpload(k.maaltBlob);
    const maaltIkon = k.maaltFane === 'ikon' ? k.maaltIkon : null;
    const aendret = maaltSti !== k.maaltOrigSti || (maaltSti == null && maaltIkon !== k.maaltOrigIkon);
    if(aendret){
      const m = kostMaaltid(k.maaltid_id);
      const r1 = await trKald('personale_kost_gem_maaltid', {
        p_id: k.maaltid_id, p_navn: m ? m.navn : '', p_ikon: maaltIkon, p_billede_sti: maaltSti
      });
      if(r1.fejl) throw new Error(r1.fejl);
    }
    // 2. Billeder til punkterne
    const udPunkter = [];
    for(let i = 0; i < punkter.length; i++){
      const p = punkter[i];
      let sti = p.sti;
      if(p.blob) sti = await kostUpload(p.blob);
      udPunkter.push({
        navn: p.navn.trim(), maengde: p.maengde.trim() || null,
        ikon: sti ? null : p.ikon, billede_sti: sti
      });
    }
    // 3. Selve reglen
    const res = await trKald('personale_kost_gem_regel', {
      p_regel_id: k.id, p_borger_id: k.borger_id, p_maaltid_id: k.maaltid_id,
      p_ugedage: k.modus === 'dage' ? k.dage : null,
      p_dato: k.modus === 'dato' ? k.dato : null,
      p_punkter: udPunkter, p_navn: navn, p_lokal_dato: kostDatoIdag()
    });
    if(res.fejl) throw new Error(res.fejl);

    const nye = udPunkter.map(function(p){ return p.billede_sti; }).filter(Boolean);
    const gamle = k.origStier.filter(function(s){ return nye.indexOf(s) < 0; });
    if(k.maaltOrigSti && k.maaltOrigSti !== maaltSti) gamle.push(k.maaltOrigSti);
    kost.gemmer = false;
    kost.borger = k.borger_id;
    kostLukForm();
    await kostHent();
    visToast('Reglen er gemt');
    if(gamle.length > 0) kostRydFiler(gamle);
  } catch(e){
    kost.gemmer = false;
    if(kost.kladde){ kost.kladde.fejl = e && e.message ? e.message : 'Noget gik galt.'; trTegn(); }
  }
}

async function kostSletRegel(){
  const k = kost.kladde;
  if(!k || !k.id) return;
  if(!window.confirm('Slette reglen? Point og medaljer, borgeren allerede har fået, bliver stående.')) return;
  const res = await trKald('personale_kost_slet_regel', { p_regel_id: k.id, p_lokal_dato: kostDatoIdag() });
  if(res.fejl){ k.fejl = res.fejl; trTegn(); return; }
  const gamle = k.origStier.slice();
  kostLukForm();
  await kostHent();
  visToast('Reglen er slettet');
  if(gamle.length > 0) kostRydFiler(gamle);
}
