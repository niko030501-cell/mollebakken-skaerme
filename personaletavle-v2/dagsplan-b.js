// Dagsplan, design B: én kolonne pr. beboer med NU-kort.
// Al tid afgøres med browserens lokale tid (Date), aldrig servertid.
// Alt DOM bygges med createElement/textContent — ingen HTML-strenge, så brugertekst er sikker.
(function(){
  var SIDSTE_VARIGHED = 60;   // minutter: sidste punkt på dagen varer så længe
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function pad(n){ return (n < 10 ? '0' : '') + n; }

  function formaterTid(min){
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }

  // "8.30" / "8:30" / "08:30:00" -> minutter siden midnat; ellers null
  function parseTid(tid){
    var m = (tid || '').toString().trim().match(/^(\d{1,2})[:.](\d{2})/);
    if(!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function lav(tag, klasse, tekst){
    var e = document.createElement(tag);
    if(klasse) e.className = klasse;
    if(tekst !== undefined && tekst !== null) e.textContent = tekst;
    return e;
  }

  function flueben(){
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '3');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'dpB-flueben');
    svg.setAttribute('aria-hidden', 'true');
    var sti = document.createElementNS(SVG_NS, 'path');
    sti.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5');
    svg.appendChild(sti);
    return svg;
  }

  // Dagens punkter for én beboer, sorteret, med sluttid = næste punkts start
  function bygPunkter(rækker, beboer, ugedag){
    var punkter = [];
    rækker.forEach(function(r){
      if(r.beboer !== beboer || r.ugedag !== ugedag) return;
      var start = parseTid(r.tid);
      if(start === null) return;
      punkter.push({ start: start, slut: 0, aktivitet: r.aktivitet || '' });
    });
    punkter.sort(function(a, b){
      return (a.start - b.start) || a.aktivitet.localeCompare(b.aktivitet, 'da');
    });
    punkter.forEach(function(p, i){
      p.slut = p.start + SIDSTE_VARIGHED;
      for(var j = i + 1; j < punkter.length; j++){
        if(punkter[j].start > p.start){ p.slut = punkter[j].start; break; }
      }
    });
    return punkter;
  }

  function sorterPunkter(punkter, nuMin){
    var faerdige = [], kommende = [], aktive = [];
    punkter.forEach(function(p){
      if(p.slut <= nuMin) faerdige.push(p);
      else if(p.start <= nuMin) aktive.push(p);
      else kommende.push(p);
    });
    // Overlap: det der startede senest er NU, de andre aktive bliver i listen
    var nuPunkt = aktive.length ? aktive[aktive.length - 1] : null;
    aktive.forEach(function(p){ if(p !== nuPunkt) kommende.push(p); });
    kommende.sort(function(a, b){ return a.start - b.start; });
    return { faerdige: faerdige, nu: nuPunkt, kommende: kommende };
  }

  function lavNuKort(p, nuMin){
    var kort = lav('div', 'dpB-nu');
    var top = lav('div', 'dpB-nu-top');
    top.appendChild(lav('span', 'dpB-nu-maerke', 'NU'));
    top.appendChild(lav('span', 'dpB-nu-tid', formaterTid(p.start) + '–' + formaterTid(p.slut)));
    kort.appendChild(top);
    kort.appendChild(lav('div', 'dpB-nu-titel', p.aktivitet));
    var pct = Math.max(0, Math.min(100, (nuMin - p.start) / (p.slut - p.start) * 100));
    var spor = lav('div', 'dpB-spor');
    var fyld = lav('div', 'dpB-fyld');
    fyld.style.width = pct.toFixed(1) + '%';
    spor.appendChild(fyld);
    kort.appendChild(spor);
    return kort;
  }

  function lavFriKort(naeste){
    var kort = lav('div', 'dpB-fri');
    kort.appendChild(lav('div', 'dpB-fri-titel', 'Fri tid lige nu'));
    kort.appendChild(lav('div', 'dpB-fri-naeste', naeste
      ? 'Næste kl. ' + formaterTid(naeste.start) + ' · ' + naeste.aktivitet
      : 'Ikke mere i dag'));
    return kort;
  }

  function lavKolonne(beboer, farve, rækker, ugedag, nuMin){
    var s = sorterPunkter(bygPunkter(rækker, beboer, ugedag), nuMin);
    var kol = lav('div', 'dpB-kol');

    var hoved = lav('div', 'dpB-hoved');
    var skilt = lav('span', 'dpB-skilt', beboer);
    if(farve) skilt.style.background = farve;
    hoved.appendChild(skilt);
    var tilbage = s.kommende.length + (s.nu ? 1 : 0);
    hoved.appendChild(lav('div', 'dpB-tilbage', tilbage + (tilbage === 1 ? ' punkt tilbage' : ' punkter tilbage')));
    kol.appendChild(hoved);

    if(s.faerdige.length){
      var f = lav('div', 'dpB-faerdige');
      f.appendChild(lav('div', 'dpB-tidligere'));
      s.faerdige.forEach(function(p){
        var rk = lav('div', 'dpB-faerdig');
        rk.appendChild(flueben());
        rk.appendChild(lav('span', null, p.aktivitet));
        f.appendChild(rk);
      });
      kol.appendChild(f);
    }

    if(s.nu) kol.appendChild(lavNuKort(s.nu, nuMin));
    else kol.appendChild(lavFriKort(s.kommende[0] || null));

    // Er der et NU-kort, er det ikke en del af listen
    var liste = lav('ul', 'dpB-liste');
    s.kommende.forEach(function(p){
      var li = lav('li', 'dpB-punkt');
      li.appendChild(lav('span', 'dpB-tid', formaterTid(p.start)));
      li.appendChild(lav('span', 'dpB-tekst', p.aktivitet));
      liste.appendChild(li);
    });
    kol.appendChild(liste);
    return kol;
  }

  // Giv plads til de kommende punkter: skjul de ældste færdige punkter ét ad gangen
  // ("+N tidligere") indtil kolonnen passer. Kommende punkter og NU-kortet røres aldrig.
  function tilpasKolonne(kol){
    kol.style.setProperty('--dp-skala', '1');
    var f = kol.querySelector('.dpB-faerdige');
    if(!f){ skalerNed(kol); return; }
    var rækker = f.querySelectorAll('.dpB-faerdig');
    var maerke = f.querySelector('.dpB-tidligere');
    var skjulte = 0;
    for(var i = 0; i < rækker.length; i++) rækker[i].style.display = '';
    maerke.style.display = 'none';
    if(kol.clientHeight === 0) return;   // siden er ikke synlig; måles igen når den vises
    while(kol.scrollHeight > kol.clientHeight + 1 && skjulte < rækker.length){
      rækker[skjulte].style.display = 'none';
      skjulte++;
      maerke.textContent = '+' + skjulte + ' tidligere';
      maerke.style.display = '';
    }
    skalerNed(kol);
  }

  // Stadig for meget: skaler teksten ned (ikke under 55 %)
  function skalerNed(kol){
    var skala = 1;
    while(kol.clientHeight > 0 && kol.scrollHeight > kol.clientHeight + 1 && skala > 0.55){
      skala = Math.max(0.55, skala - 0.05);
      kol.style.setProperty('--dp-skala', skala.toFixed(2));
    }
  }

  function tilpas(container){
    var kolonner = container.querySelectorAll('.dpB-kol');
    for(var i = 0; i < kolonner.length; i++) tilpasKolonne(kolonner[i]);
  }

  // beboere: [{ navn, farve }] i visningsrækkefølge. Er listen tom, bruges navnene fra data.
  // nuMin: minutter siden midnat i lokal tid; -1 betyder "alt er kommende" (visning af i morgen).
  function tegn(container, rækker, beboere, ugedag, nuMin){
    while(container.firstChild) container.removeChild(container.firstChild);

    var liste = (beboere || []).map(function(b){ return { navn: b.navn, farve: b.farve || null }; });
    if(liste.length === 0){
      var set = {};
      rækker.forEach(function(r){
        if(!set[r.beboer]){ set[r.beboer] = true; liste.push({ navn: r.beboer, farve: null }); }
      });
    }

    container.style.gridTemplateColumns = 'repeat(' + Math.max(1, liste.length) + ', minmax(0, 1fr))';
    liste.forEach(function(b){
      container.appendChild(lavKolonne(b.navn, b.farve, rækker, ugedag, nuMin));
    });
    tilpas(container);
  }

  window.DagsplanB = { tegn: tegn, tilpas: tilpas };
})();
