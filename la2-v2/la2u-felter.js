// ==================================================================
// LA2u — billedstøtte til felterne i en plan.
//
// * Et stort billede ved hvert spørgsmål (ca. 96 px, 48 px på papir).
// * Et billede til hvert svar: "Vælg billede" (vores billedsæt eller et
//   eget foto). Fotos gemmes i den private bucket 'la2-billeder' og vises
//   med kortvarige signerede links, der kun ligger i hukommelsen.
// * Følelser vælges med ansigter; det valgte får en guldkant.
//
// Værdierne gemmes i planens content.a under <felt>~billede og
// <felt>~foelelse: 'billede:<nøgle>', 'foto:<sti>' eller 'foelelse_<x>'.
// Ingen innerHTML, ingen template literals, intet i browserens lager.
// ==================================================================
window.LA2uFelter = (function(){
  'use strict';

  var MAKS_PX = 1200;            // fotos skaleres ned i browseren før upload
  var MAKS_BYTES = 5 * 1024 * 1024;
  var URL_SEK = 300;             // signerede links gælder i 5 minutter

  var urlCache = {};             // sti -> { url, til } (kun i hukommelsen)

  function U(){ return window.LA2Util; }
  function el(tag, props, kids){ return U().el(tag, props, kids); }
  function D(){ return window.LA2Data; }

  // ---------------------------------------------------------------
  // Billeder: 'billede:<nøgle>' (vores sæt) eller 'foto:<sti>' (eget foto)
  // ---------------------------------------------------------------

  function signeretUrl(sti){
    var c = urlCache[sti];
    if(c && c.til > Date.now() + 15000) return Promise.resolve(c.url);
    return D().signeretUrl(sti, URL_SEK).then(function(url){
      urlCache[sti] = { url: url, til: Date.now() + URL_SEK * 1000 };
      return url;
    });
  }

  // Et billede som node ud fra en gemt værdi. Returnerer null, hvis der intet er.
  function billedeNode(vaerdi, px, titel){
    if(typeof vaerdi !== 'string') return null;
    if(vaerdi.indexOf('billede:') === 0){
      var b = window.la2uBillede(vaerdi.slice(8), px, titel);
      if(b) b.setAttribute('aria-hidden', titel ? 'false' : 'true');
      return b;
    }
    if(vaerdi.indexOf('foto:') === 0){
      var sti = vaerdi.slice(5);
      var img = document.createElement('img');
      img.className = 'la2u-foto';
      img.width = px;
      img.height = px;
      img.alt = titel || 'Eget foto';
      signeretUrl(sti).then(function(url){ img.src = url; }).catch(function(){
        img.alt = 'Fotoet kunne ikke hentes';
      });
      return img;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Foto: skalér og upload
  // ---------------------------------------------------------------

  function skalerFoto(fil){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(fil);
      var img = new Image();
      img.onload = function(){
        var w = img.naturalWidth, h = img.naturalHeight;
        var f = Math.min(1, MAKS_PX / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * f));
        c.height = Math.max(1, Math.round(h * f));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function(blob){
          if(!blob) return reject(new Error('Billedet kunne ikke omdannes'));
          if(blob.size > MAKS_BYTES) return reject(new Error('Billedet er for stort'));
          resolve(blob);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function(){
        URL.revokeObjectURL(url);
        reject(new Error('Filen er ikke et billede'));
      };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------
  // Billedvælger (dialog)
  // o: { residentId, nuvaerende, onVaelg(vaerdi|null), onSession() }
  // ---------------------------------------------------------------

  function aabnVaelger(o){
    var forrigeFokus = document.activeElement;
    var overlay = el('div', { class: 'bv', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vælg billede', tabindex: '-1' });
    var boks = el('div', { class: 'bv-boks' });
    overlay.appendChild(boks);

    function luk(){
      document.removeEventListener('keydown', taster, true);
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if(forrigeFokus && forrigeFokus.focus) forrigeFokus.focus();
    }
    function taster(e){ if(e.key === 'Escape'){ e.preventDefault(); luk(); } }
    document.addEventListener('keydown', taster, true);

    var tabBilleder = el('button', { type: 'button', class: 'segment aktiv', 'aria-pressed': 'true', text: 'Billeder' });
    var tabFoto = el('button', { type: 'button', class: 'segment', 'aria-pressed': 'false', text: 'Eget foto' });
    var indhold = el('div', { class: 'bv-indhold' });

    boks.appendChild(el('div', { class: 'bv-hoved' }, [
      el('h2', { class: 'bv-titel', text: 'Vælg billede' }),
      el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Luk', onclick: luk })
    ]));
    boks.appendChild(el('div', { class: 'segmenter bv-faner', role: 'group', 'aria-label': 'Hvilket billede' }, [tabBilleder, tabFoto]));
    boks.appendChild(indhold);

    function vaelg(v){
      o.onVaelg(v);
      luk();
    }

    function tomIndhold(){ while(indhold.firstChild) indhold.removeChild(indhold.firstChild); }

    function visBilleder(){
      tabBilleder.className = 'segment aktiv'; tabBilleder.setAttribute('aria-pressed', 'true');
      tabFoto.className = 'segment'; tabFoto.setAttribute('aria-pressed', 'false');
      tomIndhold();
      window.LA2Billeder.grupper().forEach(function(g){
        var gitter = el('div', { class: 'bv-gitter' });
        g.noegler.forEach(function(n){
          var vaerdi = 'billede:' + n;
          var knap = el('button', {
            type: 'button',
            class: 'bv-billede' + (o.nuvaerende === vaerdi ? ' valgt' : ''),
            'aria-label': window.LA2Billeder.tekst(n),
            'aria-pressed': o.nuvaerende === vaerdi ? 'true' : 'false'
          });
          var svg = window.la2uBillede(n, 96);
          if(svg){ svg.setAttribute('aria-hidden', 'true'); knap.appendChild(svg); }
          knap.appendChild(el('span', { class: 'bv-billede-tekst', text: window.LA2Billeder.tekst(n) }));
          knap.addEventListener('click', function(){ vaelg(vaerdi); });
          gitter.appendChild(knap);
        });
        indhold.appendChild(el('section', { class: 'bv-gruppe' }, [
          el('h3', { class: 'bv-gruppe-navn', text: g.navn }),
          gitter
        ]));
      });
    }

    function visFoto(){
      tabFoto.className = 'segment aktiv'; tabFoto.setAttribute('aria-pressed', 'true');
      tabBilleder.className = 'segment'; tabBilleder.setAttribute('aria-pressed', 'false');
      tomIndhold();

      var besked = el('div', { class: 'besked', role: 'status', hidden: true });
      var fil = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'bv-fil', 'aria-label': 'Vælg et foto' });
      fil.addEventListener('change', function(){
        var f = fil.files && fil.files[0];
        if(!f) return;
        besked.className = 'besked';
        besked.textContent = 'Gør billedet klar…';
        besked.hidden = false;
        fil.disabled = true;
        skalerFoto(f).then(function(blob){
          besked.textContent = 'Gemmer billedet…';
          return D().uploadFoto(o.residentId, blob);
        }).then(function(sti){
          vaelg('foto:' + sti);
        }).catch(function(e){
          fil.disabled = false;
          if(U().erSessionFejl && U().erSessionFejl(e) && o.onSession){ luk(); o.onSession(); return; }
          besked.className = 'besked fejl';
          besked.textContent = (e && e.message === 'Billedet er for stort')
            ? 'Billedet er for stort. Vælg et mindre billede.'
            : 'Kunne ikke gemme billedet. Prøv igen.';
          besked.hidden = false;
        });
      });

      indhold.appendChild(el('div', { class: 'bv-foto' }, [
        el('p', { class: 'bv-advarsel', text: 'Brug ikke billeder af andre beboere.' }),
        el('p', { text: 'Tag et billede eller vælg et fra telefonen. Billedet gøres mindre, før det gemmes.' }),
        el('label', { class: 'knap bv-fil-knap' }, [el('span', { text: 'Vælg eller tag et foto' }), fil]),
        besked
      ]));
    }

    tabBilleder.addEventListener('click', visBilleder);
    tabFoto.addEventListener('click', visFoto);

    if(o.nuvaerende){
      boks.appendChild(el('div', { class: 'bv-bund' }, [
        el('button', { type: 'button', class: 'knap knap-sekundaer', text: 'Fjern billedet', onclick: function(){ vaelg(null); } })
      ]));
    }

    document.body.appendChild(overlay);
    if(o.nuvaerende && o.nuvaerende.indexOf('foto:') === 0) visFoto(); else visBilleder();
    overlay.focus();
  }

  // ---------------------------------------------------------------
  // Pynt et felt med spørgsmålsbillede, følelser og svarbillede.
  // f: { node, get }   o: { nogle, billede, foelelse, readonly, print,
  //                        residentId, a, samler, udenSpoergsmaal, onAendring, onSession }
  // ---------------------------------------------------------------

  function pynt(f, o){
    var a = o.a || {};
    var rediger = !o.readonly && !o.print;
    var visSvarBillede = o.svarBillede !== false;

    var svarVaerdi = typeof a[o.nogle + '~billede'] === 'string' ? a[o.nogle + '~billede'] : '';
    var foelelseVaerdi = typeof a[o.nogle + '~foelelse'] === 'string' ? a[o.nogle + '~foelelse'] : '';

    var hoejre = el('div', { class: 'la2u-felt-krop' });

    // ---- følelser: ansigter man kan pege på ----
    if(o.foelelse){
      var raekke = el('div', { class: 'la2u-foelelser', role: 'group', 'aria-label': 'Hvordan havde du det?' });
      var knapper = [];
      function opdaterFoelelser(){
        knapper.forEach(function(k){
          var valgt = foelelseVaerdi === k.noegle;
          k.node.className = 'la2u-foelelse' + (valgt ? ' valgt' : '');
          k.node.setAttribute('aria-pressed', valgt ? 'true' : 'false');
        });
      }
      window.LA2Billeder.foelelser().forEach(function(n){
        if(o.print && foelelseVaerdi !== n) return;      // på papir kun det valgte ansigt
        var b = el('button', { type: 'button', class: 'la2u-foelelse', 'aria-label': window.LA2Billeder.tekst(n), 'aria-pressed': 'false' });
        var svg = window.la2uBillede(n, o.print ? 40 : 64);
        if(svg){ svg.setAttribute('aria-hidden', 'true'); b.appendChild(svg); }
        if(rediger){
          b.appendChild(el('span', { class: 'la2u-foelelse-tekst', text: window.LA2Billeder.tekst(n) }));
          b.addEventListener('click', function(){
            foelelseVaerdi = (foelelseVaerdi === n) ? '' : n;
            opdaterFoelelser();
            if(o.onAendring) o.onAendring();
          });
        }else{
          b.disabled = true;
        }
        knapper.push({ noegle: n, node: b });
        raekke.appendChild(b);
      });
      opdaterFoelelser();
      if(knapper.length) hoejre.appendChild(raekke);
      o.samler.push({ key: o.nogle + '~foelelse', get: function(){ return foelelseVaerdi; } });
    }

    hoejre.appendChild(f.node);

    // ---- billede til svaret ----
    if(visSvarBillede){
      var svarRamme = el('div', { class: 'la2u-svarbillede' });
      var tegnSvar = function(){
        while(svarRamme.firstChild) svarRamme.removeChild(svarRamme.firstChild);
        var b = billedeNode(svarVaerdi, o.print ? 40 : 72);
        if(b){
          svarRamme.appendChild(el('span', { class: 'la2u-svarbillede-ramme' }, [b]));
        }
        if(rediger){
          svarRamme.appendChild(el('button', {
            type: 'button', class: 'knap knap-sekundaer knap-lille',
            text: svarVaerdi ? 'Skift billede' : 'Vælg billede',
            onclick: function(){
              aabnVaelger({
                residentId: o.residentId, nuvaerende: svarVaerdi, onSession: o.onSession,
                onVaelg: function(v){
                  svarVaerdi = v || '';
                  tegnSvar();
                  if(o.onAendring) o.onAendring();
                }
              });
            }
          }));
        }
      };
      tegnSvar();
      if(svarRamme.firstChild) hoejre.appendChild(svarRamme);
      o.samler.push({ key: o.nogle + '~billede', get: function(){ return svarVaerdi; } });
    }

    // ---- stort billede ved spørgsmålet ----
    var rod = el('div', { class: 'la2u-felt' + (o.print ? ' la2u-felt-print' : '') });
    if(o.billede && !o.udenSpoergsmaal){
      var sp = window.la2uBillede(o.billede, o.print ? 48 : 96);
      if(sp){
        sp.setAttribute('aria-hidden', 'true');
        rod.appendChild(el('div', { class: 'la2u-spoergsmaal-billede' }, [sp]));
      }
    }
    rod.appendChild(hoejre);

    return { node: rod, get: f.get };
  }

  return { pynt: pynt, billedeNode: billedeNode, aabnVaelger: aabnVaelger };
})();
