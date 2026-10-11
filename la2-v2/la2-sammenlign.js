// ==================================================================
// LA2 — Sammenlign: to planer (eller to versioner) side om side.
//
// Systemet vurderer ALDRIG, om to tekster betyder det samme. Det er
// personalets opgave på mødet. Systemet markerer kun det, der kan måles
// helt sikkert: at den ene side er tom.
//
// Sammenligningen ændrer aldrig selve planerne. Noter og markeringer
// gemmes for sig i la2_compare_notes (og senere bunker i la2_compare_common).
//
// Mødedata og planindhold holdes kun i hukommelsen mens siden er åben;
// intet gemmes i browserens lager eller skrives til konsollen.
// Regler: ingen template literals, ingen innerHTML med data, lokal tid.
// ==================================================================
window.LA2Sammenlign = (function(){
  'use strict';

  var D = window.LA2Data;
  var T = window.LA2Templates;
  var I = window.LA2Ikoner;
  var P = window.LA2Punkter;

  var AUTO_MS = 1500;                 // autogem et par sekunder efter en ændring
  var MARKERINGER = [
    { id: 'enige', label: 'Enige' },
    { id: 'forskel', label: 'Forskel' },
    { id: 'spoergsmaal', label: 'Spørgsmål' }
  ];
  var PLAN_NAVN = {
    trivsel: 'Trivselsplan', tryghed: 'Tryghedsplan', laering: 'Læringsplan',
    mestring: 'Mestringsplan', haab_droem: 'Håb og drømme'
  };

  var S = null;        // tilstand for den åbne sammenligning
  var moede = null;    // resumé til "Opdatér plan →" (vises i sidepanelet)

  function U(){ return window.LA2Util; }
  function el(tag, props, kids){ return U().el(tag, props, kids); }

  // ---------------------------------------------------------------
  // Hjælpere
  // ---------------------------------------------------------------

  function genitiv(n){ return /[sxz]$/i.test(n) ? n + "'" : n + 's'; }

  function datoAar(iso){
    var d = new Date(iso);
    return U().kortDato(d) + ' ' + d.getFullYear();
  }

  function klokken(d){
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function tom(n){ while(n.firstChild) n.removeChild(n.firstChild); }

  function borgerKey(){ return S.resident.variant === 'LA2u' ? 'din' : 'min'; }

  function erFag(plan){ return !!plan && plan.perspective === 'fagprofessionel'; }

  function planNavn(plan){
    if(!plan) return 'Ingen plan';
    if(erFag(plan)) return 'Fagprofessionel';
    if(plan.perspective === 'din') return 'Tilstræbt indefra (Din)';
    return genitiv(S.navn) + ' ord (Min)';
  }

  // Standardversion: nyeste aktive (ikke udkast), ellers nyeste
  function standardVersion(planId){
    var vs = S.versioner[planId] || [];
    var v = vs.filter(function(x){ return !x.is_draft && x.status === 'aktiv'; })[0] || vs[0];
    return v ? { planId: planId, versionNo: v.version_no, versionId: v.id } : null;
  }

  function planMedId(id){
    return S.planer.filter(function(p){ return p.id === id; })[0] || null;
  }

  function kast(e){
    if(U().erSessionFejl(e)){ S.ctx.onSessionError(); return true; }
    console.error('sammenlign:', U().fejlTekst(e));
    return false;
  }

  // ---------------------------------------------------------------
  // Rækker ud fra skabelonen (samme nøgler i alle perspektiver)
  // ---------------------------------------------------------------

  function byggRaekker(tpl, key){
    var r = [];
    function tekst(q){ return T.tekst(q.text, key) || T.tekst(q.text, 'fag') || ''; }

    if(tpl.kind === 'laering'){
      tpl.rows.forEach(function(row){
        if(row.perColumn){
          tpl.columns.forEach(function(col){
            row.questions.forEach(function(q){
              r.push({ key: row.id + '.' + q.id + '.' + col.id, type: q.type || 'text',
                       sektion: row.heading + ' · ' + col.label, felt: tekst(q), fase: 'laering', niveau: null });
            });
          });
        }else{
          row.questions.forEach(function(q){
            r.push({ key: row.id + '.' + q.id, type: q.type || 'text',
                     sektion: row.heading, felt: tekst(q), fase: 'laering', niveau: null });
          });
        }
      });
      return r;
    }

    tpl.sections.forEach(function(sec, i){
      sec.questions.forEach(function(q){
        var tryghed = !!sec.level;
        r.push({
          key: sec.id + '.' + q.id,
          type: q.type || 'text',
          sektion: tryghed ? sec.levelLabel : (T.tekst(sec.heading, key) || ''),
          felt: tryghed ? (q.gruppe || tekst(q)) : tekst(q),
          fase: S.tab === 'tryghed' ? 'tryghed' : 'trivsel',
          niveau: tryghed ? { nr: i + 1, level: sec.level } : null
        });
      });
    });
    return r;
  }

  // Punkter (hvide bobler) for en side i en række: [{ id, t }]
  function punkter(side, raekke){
    if(!side || !side.content || !side.content.a) return [];
    var v = side.content.a[raekke.key];
    return P.tilPunkter(v).filter(function(p){ return p.t.trim().length > 0; });
  }

  // ---------------------------------------------------------------
  // Indlæsning
  // ---------------------------------------------------------------

  function hentIndhold(valg){
    if(!valg) return Promise.resolve(null);
    var vs = S.versioner[valg.planId] || [];
    var v = vs.filter(function(x){ return x.version_no === valg.versionNo; })[0];
    if(!v) return Promise.resolve(null);
    return D.version(v.id).then(function(rows){
      var r = rows[0];
      return r ? { planId: valg.planId, versionNo: valg.versionNo, content: r.content || {},
                   editedAt: r.edited_at, editedBy: r.edited_by_name, isDraft: !!r.is_draft } : null;
    });
  }

  function exact(n){
    var L = S.left, R = S.right;
    if(!L || !R) return false;
    return (n.left_plan_id === L.planId && n.left_version_no === L.versionNo &&
            n.right_plan_id === R.planId && n.right_version_no === R.versionNo) ||
           (n.left_plan_id === R.planId && n.left_version_no === R.versionNo &&
            n.right_plan_id === L.planId && n.right_version_no === L.versionNo);
  }

  function indlaesNoter(){
    S.noter = {};
    S.dirty = {};
    if(!S.left || !S.right) return Promise.resolve();
    return D.compareNotes(S.left.planId, S.right.planId).then(function(rows){
      // pr. felt: præcis denne sammenligning har forrang; ellers nyeste fra en anden version
      var pr = {};
      rows.forEach(function(n){
        var k = n.row_key;
        var er = exact(n);
        var nuvaerende = pr[k];
        if(!nuvaerende ||
           (er && !nuvaerende.er) ||
           (er === nuvaerende.er && n.updated_at > nuvaerende.n.updated_at)){
          pr[k] = { n: n, er: er };
        }
      });
      Object.keys(pr).forEach(function(k){
        var x = pr[k];
        S.noter[k] = {
          id: x.er ? x.n.id : null,
          marking: x.n.marking || null,
          note: x.n.note || '',
          fra: x.er ? null : ('version ' + x.n.left_version_no + ' mod version ' + x.n.right_version_no),
          updatedAt: x.n.updated_at,
          updatedBy: x.n.updated_by_name
        };
      });
    });
  }

  function indlaesValg(){
    return Promise.all([hentIndhold(S.leftValg), hentIndhold(S.rightValg)]).then(function(r){
      S.left = r[0];
      S.right = r[1];
      return indlaesNoter().then(indlaesFaelles);
    });
  }

  // ---------------------------------------------------------------
  // Gem (autogem)
  // ---------------------------------------------------------------

  function noteOk(){ return !!(S.left && S.right); }

  function planlaeg(){
    setStatus('Ændret…');
    if(S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(function(){ gemAlt(); }, AUTO_MS);
  }

  function setStatus(tekst, fejl){
    if(!S) return;
    S.statusTekst = tekst;
    S.statusFejl = !!fejl;
    if(S.statusNode){
      S.statusNode.textContent = tekst;
      S.statusNode.className = 'sam-status' + (fejl ? ' sam-status-fejl' : '');
    }
  }

  function gemEn(key){
    var n = S.noter[key];
    var felter = { marking: n.marking || null, note: n.note || '', updated_by_name: S.ctx.name };
    if(n.id){
      return D.compareNoteUpdate(n.id, felter).then(function(rows){
        if(rows[0]){ n.updatedAt = rows[0].updated_at; n.updatedBy = rows[0].updated_by_name; }
      });
    }
    if(!n.marking && !(n.note || '').trim()) return Promise.resolve();   // intet at gemme
    var ny = {
      resident_id: S.resident.resident_id,
      plan_type: S.tab,
      left_plan_id: S.left.planId, left_version_no: S.left.versionNo,
      right_plan_id: S.right.planId, right_version_no: S.right.versionNo,
      row_key: key,
      marking: felter.marking,
      note: felter.note,
      created_by_name: S.ctx.name,
      updated_by_name: S.ctx.name
    };
    return D.compareNoteInsert(ny).then(function(rows){
      if(rows[0]){
        n.id = rows[0].id; n.fra = null;
        n.updatedAt = rows[0].updated_at; n.updatedBy = rows[0].updated_by_name;
      }
    }).catch(function(e){
      if(e && e.code === '23505'){
        // findes allerede (fx fra en anden fane): hent og opdatér i stedet
        return D.compareNotes(S.left.planId, S.right.planId).then(function(rows){
          var fundet = rows.filter(function(r){ return r.row_key === key && exact(r); })[0];
          if(!fundet) throw e;
          n.id = fundet.id;
          return gemEn(key);
        });
      }
      throw e;
    });
  }

  // Returnerer et løfte, så "Opdatér plan →" kan vente på gem
  function gemAlt(){
    if(!S) return Promise.resolve();
    if(S.timer){ clearTimeout(S.timer); S.timer = null; }
    if(S.gemmer) return S.gemmer.then(function(){ return gemAlt(); });
    var keys = Object.keys(S.dirty);
    if(!keys.length || !noteOk()) return Promise.resolve();
    S.dirty = {};
    setStatus('Gemmer…');
    var kaede = Promise.resolve();
    keys.forEach(function(k){ kaede = kaede.then(function(){ return gemEn(k); }); });
    var staerkS = S;
    S.gemmer = kaede.then(function(){
      staerkS.gemmer = null;
      if(S === staerkS){
        var nu = new Date();
        setStatus('Gemt kl. ' + klokken(nu));
        tegnBund();
      }
    }).catch(function(e){
      staerkS.gemmer = null;
      keys.forEach(function(k){ staerkS.dirty[k] = true; });   // prøv igen ved næste ændring/Gem
      if(!kast(e)) setStatus('Kunne ikke gemme. Tryk Gem for at prøve igen.', true);
    });
    return S.gemmer;
  }

  // ---------------------------------------------------------------
  // Tegning
  // ---------------------------------------------------------------

  function avatar(stoerrelse){
    var a = el('span', { class: 'avatar avatar-' + stoerrelse, text: S.navn.charAt(0) });
    a.setAttribute('aria-hidden', 'true');
    a.style.background = U().erFarve(S.farve) ? S.farve : '#374151';
    return a;
  }

  // Overskrift og undertekst for en kolonne ("Indefra" / "Udefra")
  function kolonneTitel(valg, erVenstre){
    var plan = valg ? planMedId(valg.planId) : null;
    var begge = S.leftValg && S.rightValg && S.leftValg.planId === S.rightValg.planId;
    var v = valg ? 'version ' + valg.versionNo : '';
    if(begge){
      return { hoved: 'Version ' + valg.versionNo, under: planNavn(plan), ikon: null };
    }
    if(!plan) return { hoved: erVenstre ? 'Indefra' : 'Udefra', under: 'Ingen plan endnu', ikon: null };
    if(erFag(plan)) return { hoved: 'Fagprofessionelle', under: 'Udefra · ' + v, ikon: 'gruppe' };
    if(plan.perspective === 'din') return { hoved: 'Tilstræbt indefra', under: 'Indefra · ' + v, ikon: 'avatar' };
    return { hoved: genitiv(S.navn) + ' egne ord', under: 'Indefra · ' + v, ikon: 'avatar' };
  }

  function visualKolonne(titel, klasse){
    var hoved = el('div', { class: 'sam-kol-hoved ' + klasse });
    if(titel.ikon === 'avatar') hoved.appendChild(avatar(34));
    if(titel.ikon === 'gruppe'){
      var gi = el('span', { class: 'sam-gruppeikon', 'aria-hidden': 'true' });
      gi.appendChild(I.ikon('gruppe', { stoerrelse: 20 }));
      hoved.appendChild(gi);
    }
    hoved.appendChild(el('div', null, [
      el('div', { class: 'sam-kol-titel', text: titel.hoved }),
      el('div', { class: 'sam-kol-under', text: titel.under })
    ]));
    return hoved;
  }

  function sideNode(poster, klasse){
    var kolonne = el('div', { class: 'sam-side ' + klasse });
    if(!poster.length){
      kolonne.appendChild(el('div', { class: 'sam-tom', text: 'Intet skrevet her · forskel' }));
      return kolonne;
    }
    poster.forEach(function(p){
      kolonne.appendChild(el('div', { class: 'sam-boble', text: p.t }));
    });
    return kolonne;
  }

  function noteFor(key){
    if(!S.noter[key]) S.noter[key] = { id: null, marking: null, note: '', fra: null };
    return S.noter[key];
  }

  function raekkeNode(r){
    var venstre = punkter(S.left, r);
    var hoejre = punkter(S.right, r);
    var n = noteFor(r.key);
    var baggrund = r.niveau ? 'niveau-' + r.niveau.level : 'fase-' + r.fase;

    // Første kolonne: nummer/ikon, sektion, feltnavn
    var forste = el('div', { class: 'sam-felt' });
    if(r.niveau){
      forste.appendChild(el('span', { class: 'baro-nr sam-nr', 'aria-hidden': 'true', text: String(r.niveau.nr) }));
    }else{
      var ik = el('span', { class: 'fase-ikon fase-' + r.fase });
      ik.appendChild(I.ikon(I.FASER[r.fase].ikon, { stoerrelse: 20 }));
      forste.appendChild(ik);
    }
    forste.appendChild(el('div', null, [
      el('div', { class: 'sam-sektion', text: r.sektion }),
      el('div', { class: 'sam-feltnavn', text: r.felt })
    ]));

    // Til mødet: note + tre valgknapper
    var ta = el('textarea', {
      rows: '2', maxlength: '4000', class: 'sam-note',
      'aria-label': 'Refleksion og spørgsmål: ' + r.sektion + ' ' + r.felt,
      placeholder: 'Skriv en note til mødet…'
    });
    ta.value = n.note || '';
    if(!noteOk()) ta.disabled = true;

    var knapper = el('div', { class: 'sam-valg', role: 'group', 'aria-label': 'Markering' });
    MARKERINGER.forEach(function(m){
      var b = el('button', {
        type: 'button',
        class: 'sam-markering' + (n.marking === m.id ? ' valgt' : ''),
        'aria-pressed': n.marking === m.id ? 'true' : 'false',
        text: m.label
      });
      if(!noteOk()) b.disabled = true;
      b.addEventListener('click', function(){
        if(n.fra){
          // noten stammer fra en anden version: ændringen gemmes for denne sammenligning
          n.id = null; n.fra = null; fraDetaljer.hidden = true;
        }
        n.marking = (n.marking === m.id) ? null : m.id;     // tryk igen = fjern
        S.dirty[r.key] = true;
        knapper.querySelectorAll('button').forEach(function(x, i){
          var valgt = n.marking === MARKERINGER[i].id;
          x.className = 'sam-markering' + (valgt ? ' valgt' : '');
          x.setAttribute('aria-pressed', valgt ? 'true' : 'false');
        });
        node.classList.toggle('sam-forskel', visSomForskel(r, n));
        planlaeg();
      });
      knapper.appendChild(b);
    });

    var fraDetaljer = el('div', { class: 'sam-fra', text: n.fra ? 'Fra et tidligere møde (' + n.fra + ')' : '', hidden: !n.fra });
    ta.addEventListener('input', function(){
      n.note = ta.value;
      if(n.fra){
        // en ændring gemmes for denne sammenligning (ikke over den gamle)
        n.id = null; n.fra = null; fraDetaljer.hidden = true;
      }
      S.dirty[r.key] = true;
      planlaeg();
    });

    var tilMoedet = el('div', { class: 'sam-moede' }, [
      el('div', { class: 'sam-celle-label', text: 'Refleksion og spørgsmål' }),
      ta, knapper, fraDetaljer
    ]);

    var node = el('div', { class: 'sam-raekke ' + baggrund });
    node.appendChild(forste);
    node.appendChild(el('div', { class: 'sam-celle' }, [
      el('div', { class: 'sam-celle-label', text: 'Indefra' }),
      sideNode(venstre, 'sam-venstre')
    ]));
    node.appendChild(el('div', { class: 'sam-celle' }, [
      el('div', { class: 'sam-celle-label', text: 'Udefra' }),
      sideNode(hoejre, 'sam-hoejre')
    ]));
    node.appendChild(tilMoedet);
    node.setAttribute('data-key', r.key);

    // Systemet markerer kun det, der kan måles: en tom side
    node.setAttribute('data-tom', (venstre.length === 0 || hoejre.length === 0) ? '1' : '0');
    if(visSomForskel(r, n)) node.classList.add('sam-forskel');
    return node;
  }

  function visSomForskel(r, n){
    var venstre = punkter(S.left, r);
    var hoejre = punkter(S.right, r);
    return venstre.length === 0 || hoejre.length === 0 ||
           n.marking === 'forskel' || n.marking === 'spoergsmaal';
  }

  function tegnTabel(maal){
    tom(maal);
    var key = borgerKey();
    var tpl = T.plans[S.tab];
    var raekker = byggRaekker(tpl, key);

    if(!S.left && !S.right){
      maal.appendChild(el('p', { class: 'tom-tilstand', text: 'Der er ingen planer at sammenligne endnu.' }));
      return;
    }

    var tL = kolonneTitel(S.leftValg, true);
    var tR = kolonneTitel(S.rightValg, false);

    var hoved = el('div', { class: 'sam-hoved' }, [
      el('div', { class: 'sam-hoved-felt', text: 'Felt' }),
      visualKolonne(tL, 'sam-kol-venstre'),
      visualKolonne(tR, 'sam-kol-hoejre'),
      el('div', { class: 'sam-kol-hoved sam-kol-moede' }, [
        el('div', null, [
          el('div', { class: 'sam-kol-titel', text: 'Til mødet' }),
          el('div', { class: 'sam-kol-under', text: 'Refleksion og spørgsmål' })
        ])
      ])
    ]);
    maal.appendChild(hoved);

    var liste = el('div', { class: 'sam-raekker' });
    var antal = 0;
    raekker.forEach(function(r){
      var n = noteFor(r.key);
      if(S.kunForskelle && !visSomForskel(r, n)) return;
      liste.appendChild(raekkeNode(r));
      antal++;
    });
    if(!antal){
      liste.appendChild(el('p', { class: 'tom-tilstand', text: 'Ingen forskelle at vise. Slå "Vis kun forskelle" fra for at se alle rækker.' }));
    }
    maal.appendChild(liste);
  }

  function tegnBund(){
    if(!S || !S.bundNode) return;
    tom(S.bundNode);

    var seneste = null;
    Object.keys(S.noter).forEach(function(k){
      var n = S.noter[k];
      if(n.id && n.updatedAt && (!seneste || n.updatedAt > seneste.at)) seneste = { at: n.updatedAt, by: n.updatedBy };
    });
    var tekst = seneste
      ? 'Gemmes ved planen · ' + U().kortDato(new Date(seneste.at)) + ' ' + new Date(seneste.at).getFullYear() + ' · ' + seneste.by
      : 'Gemmes ved planen · ikke gemt endnu';

    var besked = moedeBesked();
    if(besked){
      S.bundNode.appendChild(el('div', { class: 'besked sam-besked' }, [
        el('span', { text: besked.tekst + ' ' }),
        el('a', { class: 'sam-link', href: besked.href, text: besked.label })
      ]));
    }

    S.statusNode = el('span', {
      class: 'sam-status' + (S.statusFejl ? ' sam-status-fejl' : ''), role: 'status',
      text: S.statusTekst || (Object.keys(S.dirty).length ? 'Ændret…' : '')
    });

    var gemKnap = el('button', { type: 'button', class: 'knap knap-lys', text: 'Gem', onclick: function(){ gemAlt(); } });
    var opdater = el('button', { type: 'button', class: 'knap', text: 'Opdatér plan →', onclick: function(){ opdaterPlan(); } });

    S.bundNode.appendChild(el('div', { class: 'sam-bund-raekke' }, [
      el('div', { class: 'sam-bund-tekst' }, [
        el('span', { text: tekst }),
        S.statusNode
      ]),
      el('div', { class: 'sam-bund-knapper' }, [gemKnap, opdater])
    ]));
  }

  // Er der noter/markeringer, hvor den indefra-side har indhold?
  function indefraBerort(){
    var borger = null;
    if(S.left && planMedId(S.left.planId) && !erFag(planMedId(S.left.planId))) borger = 'venstre';
    else if(S.right && planMedId(S.right.planId) && !erFag(planMedId(S.right.planId))) borger = 'hoejre';
    if(!borger) return null;
    var side = borger === 'venstre' ? S.left : S.right;
    var raekker = byggRaekker(T.plans[S.tab], borgerKey());
    var fundet = raekker.some(function(r){
      var n = S.noter[r.key];
      return n && (n.marking || (n.note || '').trim()) && punkter(side, r).length > 0;
    });
    return fundet ? (borger === 'venstre' ? S.leftValg : S.rightValg) : null;
  }

  function moedeBesked(){
    var v = indefraBerort();
    if(!v) return null;
    var plan = planMedId(v.planId);
    return {
      tekst: 'Ændringer i ' + genitiv(S.navn) + ' egen plan laves sammen med ' + S.navn + '.',
      label: 'Åbn ' + (plan && plan.perspective === 'din' ? 'Din' : 'Min') + '-planen',
      href: planHref(false)
    };
  }

  function planHref(fag){
    var base = '#/beboer/' + S.resident.resident_id + '/' + S.tab;
    if(S.tab === 'laering' && S.gruppe) base += '/' + S.gruppe;
    return base;
  }

  // Resumé af mødet til sidepanelet på planens side
  function byggMoede(){
    var raekker = byggRaekker(T.plans[S.tab], borgerKey());
    var poster = [];
    raekker.forEach(function(r){
      var n = S.noter[r.key];
      if(!n) return;
      if(n.marking || (n.note || '').trim()){
        poster.push({ label: r.sektion + ' · ' + r.felt, marking: n.marking, note: (n.note || '').trim() });
      }
    });
    var kn = S.noter.kurve;
    if(kn && (kn.marking || (kn.note || '').trim())){
      poster.push({ label: 'Trivsels- og affektkurve', marking: kn.marking, note: (kn.note || '').trim() });
    }
    return {
      rid: S.resident.resident_id,
      tab: S.tab,
      gruppe: S.gruppe || null,
      poster: poster,
      indefra: moedeBesked()
    };
  }

  function opdaterPlan(){
    gemAlt().then(function(){
      moede = byggMoede();
      if(window.LA2Plans && window.LA2Plans.saetPerspektiv) window.LA2Plans.saetPerspektiv('fag');
      S.ctx.go(planHref(true));
    });
  }

  // ---------------------------------------------------------------
  // Tre bunker: "Kun [Navn]" · "Begge er enige" · "Kun personalet"
  //
  // Et punkt flyttes til midten med træk eller pil. Det gemmes straks i
  // la2_compare_common (kun punkt-id'er, ingen versioner). Systemet vurderer
  // aldrig, om to punkter betyder det samme: det gør personalet ved at
  // slippe ét punkt oven på et andet.
  // ---------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgNode(tag, attrs){
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    return n;
  }

  function gribIkon(){
    var s = svgNode('svg', { width: '16', height: '24', viewBox: '0 0 16 24', 'aria-hidden': 'true', focusable: 'false' });
    [5, 12, 19].forEach(function(y){
      [4, 12].forEach(function(x){
        s.appendChild(svgNode('circle', { cx: String(x), cy: String(y), r: '2', fill: 'currentColor' }));
      });
    });
    return s;
  }

  function flueben(){
    var s = svgNode('svg', { width: '22', height: '22', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgNode('path', { d: 'M4 12.5l5 5L20 6.5', fill: 'none', stroke: 'currentColor',
      'stroke-width': '3.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }

  // Kort navn for en side: borgerens navn, "personalet" eller "version N"
  function sideNavn(valg){
    if(!valg) return '';
    if(S.leftValg && S.rightValg && S.leftValg.planId === S.rightValg.planId) return 'version ' + valg.versionNo;
    var plan = planMedId(valg.planId);
    if(!plan) return '';
    return erFag(plan) ? 'personalet' : S.navn;
  }

  function findPunkt(liste, id){
    for(var i = 0; i < liste.length; i++){ if(liste[i].id === id) return liste[i]; }
    return null;
  }

  // Rækkerne i skabelonens rækkefølge (samme som Tabel)
  function bunkeRaekker(){
    return byggRaekker(T.plans[S.tab], borgerKey());
  }

  function raekkeMedKey(key){
    return bunkeRaekker().filter(function(r){ return r.key === key; })[0] || null;
  }

  // Delene "Kun venstre / Begge / Kun højre" for ét felt
  function bunkerFor(r){
    var L = punkter(S.left, r);
    var R = punkter(S.right, r);
    var brugtL = {}, brugtR = {};
    var midt = [];
    var mangler = 0;
    S.faelles.filter(function(k){ return k.key === r.key; }).forEach(function(k){
      var li = k.l ? findPunkt(L, k.l) : null;
      var ri = k.r ? findPunkt(R, k.r) : null;
      if(k.l && !li) mangler++;
      if(k.r && !ri) mangler++;
      if(!li && !ri) return;
      if(li) brugtL[li.id] = true;
      if(ri) brugtR[ri.id] = true;
      midt.push({ k: k, li: li, ri: ri });
    });
    return {
      midt: midt,
      kunL: L.filter(function(p){ return !brugtL[p.id]; }),
      kunR: R.filter(function(p){ return !brugtR[p.id]; }),
      mangler: mangler
    };
  }

  // Række fra databasen -> { id, key, l, r } set fra den nuværende venstre/højre side
  function normFaelles(c){
    var vendt = c.left_plan_id !== S.left.planId && c.left_plan_id === S.right.planId;
    return {
      id: c.id, key: c.row_key,
      l: vendt ? c.right_item_id : c.left_item_id,
      r: vendt ? c.left_item_id : c.right_item_id,
      at: c.created_at
    };
  }

  function indlaesFaelles(){
    S.faelles = [];
    if(!S.left || !S.right) return Promise.resolve();
    return D.compareCommon(S.left.planId, S.right.planId).then(function(rows){
      S.faelles = rows.map(normFaelles);
    });
  }

  // ---- Gem (køres efter hinanden, så hurtige flytninger ikke blander sig) ----

  function bunkeOp(fn){
    var mit = S;
    setStatus('Gemmer…');
    S.opKaede = S.opKaede.then(function(){
      if(S !== mit) return null;
      return fn();
    }).then(function(){
      if(S !== mit) return;
      setStatus('Gemt kl. ' + klokken(new Date()));
      tegnIndhold();
      tegnBund();
    }).catch(function(e){
      if(S !== mit) return;
      if(kast(e)) return;
      // noget gik galt (fx ændret fra en anden fane): hent bunkerne på ny
      indlaesFaelles().then(function(){
        if(S !== mit) return;
        setStatus('Kunne ikke gemme flytningen. Bunkerne er hentet igen.', true);
        tegnIndhold();
        tegnBund();
      }).catch(function(e2){ kast(e2); });
    });
  }

  function opretFaelles(key, l, r){
    return D.commonInsert({
      resident_id: S.resident.resident_id,
      plan_type: S.tab,
      left_plan_id: S.left.planId,
      right_plan_id: S.right.planId,
      row_key: key,
      left_item_id: l || null,
      right_item_id: r || null,
      created_by_name: S.ctx.name
    }).then(function(rows){
      if(rows[0]) S.faelles.push(normFaelles(rows[0]));
    });
  }

  function fjernFaelles(post){
    return D.commonDelete(post.id).then(function(){
      S.faelles = S.faelles.filter(function(k){ return k.id !== post.id; });
    });
  }

  // Ét punkt fra en side lægges i midten
  function tilMidten(key, side, id){
    S.fokus = side + ':' + id;
    bunkeOp(function(){
      return opretFaelles(key, side === 'l' ? id : null, side === 'r' ? id : null);
    });
  }

  // Midt-punktet flyttes tilbage (rækken slettes; begge punkter vender hjem)
  function tilbage(post, fokusNoegle){
    S.fokus = fokusNoegle;
    bunkeOp(function(){ return fjernFaelles(post); });
  }

  // Et punkt fra den anden side parres med et punkt i midten
  function parMed(key, e, side, id){
    var l = e.li ? e.li.id : (side === 'l' ? id : null);
    var r = e.ri ? e.ri.id : (side === 'r' ? id : null);
    if(!l || !r) return;
    S.fokus = 'p:' + l + '|' + r;
    bunkeOp(function(){
      return fjernFaelles(e.k).then(function(){ return opretFaelles(key, l, r); });
    });
  }

  // ---- Træk (Pointer Events: mus og touch, ingen biblioteker) ----

  function maalAccepterer(kilde, maal){
    if(!maal || !maal._slip) return false;
    var t = maal._slip;
    if(kilde.type === 'l' || kilde.type === 'r'){
      if(t.type === 'midt') return true;
      if(t.type === 'par'){
        var e = t.entry;
        return kilde.type === 'l' ? (!!e.ri && !e.li) : (!!e.li && !e.ri);
      }
      return false;
    }
    // et punkt i midten kan kun flyttes tilbage
    var m = kilde.entry;
    if(t.type === 'venstre') return !!m.li;
    if(t.type === 'hoejre') return !!m.ri;
    return false;
  }

  function udfoerSlip(kilde, maal, key){
    var t = maal._slip;
    if(kilde.type === 'l' || kilde.type === 'r'){
      if(t.type === 'midt') tilMidten(key, kilde.type, kilde.id);
      else if(t.type === 'par') parMed(key, t.entry, kilde.type, kilde.id);
    }else{
      tilbage(kilde.entry.k, noegleTilbage(kilde.entry, t.type));
    }
  }

  // Fokus efter "tilbage": det punkt, der nu ligger i en side-bunke
  function noegleTilbage(e, mod){
    if(e.li && (mod === 'venstre' || !e.ri)) return 'l:' + e.li.id;
    if(e.ri) return 'r:' + e.ri.id;
    return null;
  }

  function startTraek(ev, kilde, kortNode, key){
    if(ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    var grib = ev.currentTarget;
    var rect = kortNode.getBoundingClientRect();
    var dx = ev.clientX - rect.left;
    var dy = ev.clientY - rect.top;
    var spoegelse = kortNode.cloneNode(true);
    spoegelse.className += ' sam-spoegelse';
    spoegelse.style.width = rect.width + 'px';
    spoegelse.style.left = rect.left + 'px';
    spoegelse.style.top = rect.top + 'px';
    document.body.appendChild(spoegelse);
    kortNode.classList.add('sam-traekkes');
    try{ grib.setPointerCapture(ev.pointerId); }catch(e){ /* ikke afgørende */ }

    var maal = null;
    var sidste = { x: ev.clientX, y: ev.clientY };
    var flyttet = false;

    function ryd(){
      if(maal) maal.classList.remove('sam-maal-aktiv');
      clearInterval(rulle);
      grib.removeEventListener('pointermove', bevaeg);
      grib.removeEventListener('pointerup', slip);
      grib.removeEventListener('pointercancel', annuller);
      document.removeEventListener('keydown', taster);
      if(spoegelse.parentNode) spoegelse.parentNode.removeChild(spoegelse);
      kortNode.classList.remove('sam-traekkes');
      try{ grib.releasePointerCapture(ev.pointerId); }catch(e){ /* allerede frigivet */ }
    }

    function find(x, y){
      var n = document.elementFromPoint(x, y);
      while(n && !n._slip) n = n.parentNode;
      return n || null;
    }

    function opdaterMaal(){
      var ny = find(sidste.x, sidste.y);
      if(ny && !maalAccepterer(kilde, ny)) ny = null;
      if(ny === maal) return;
      if(maal) maal.classList.remove('sam-maal-aktiv');
      maal = ny;
      if(maal) maal.classList.add('sam-maal-aktiv');
    }

    function bevaeg(e){
      sidste = { x: e.clientX, y: e.clientY };
      if(Math.abs(e.clientX - ev.clientX) + Math.abs(e.clientY - ev.clientY) > 4) flyttet = true;
      spoegelse.style.left = (e.clientX - dx) + 'px';
      spoegelse.style.top = (e.clientY - dy) + 'px';
      opdaterMaal();
    }

    // rul siden, når kortet holdes nær skærmens top eller bund
    var rulle = setInterval(function(){
      var h = window.innerHeight;
      if(sidste.y < 70) window.scrollBy(0, -14);
      else if(sidste.y > h - 70) window.scrollBy(0, 14);
      else return;
      opdaterMaal();
    }, 30);

    function slip(){
      var valgt = maal;
      ryd();
      if(flyttet && valgt) udfoerSlip(kilde, valgt, key);
    }
    function annuller(){ ryd(); }
    function taster(e){ if(e.key === 'Escape') ryd(); }

    grib.addEventListener('pointermove', bevaeg);
    grib.addEventListener('pointerup', slip);
    grib.addEventListener('pointercancel', annuller);
    document.addEventListener('keydown', taster);
  }

  // ---- Tegning ----

  // dele: [{ label, t }]; pil: { retning:'hoejre'|'venstre', label, tekst, onClick }
  function bunkeKort(o){
    var kort = el('div', { class: 'sam-kort ' + (o.klasse || '') });
    if(o.nogle) kort.setAttribute('data-nogle', o.nogle);
    if(o.stribe && U().erFarve(o.stribe)) kort.style.borderLeftColor = o.stribe;

    var greb = el('span', { class: 'sam-greb', title: 'Træk for at flytte' });
    greb.appendChild(gribIkon());
    greb.addEventListener('pointerdown', function(ev){ startTraek(ev, o.kilde, kort, o.key); });

    var tekst = el('div', { class: 'sam-kort-tekst' });
    if(o.overskrift) tekst.appendChild(el('div', { class: 'sam-kort-fra', text: o.overskrift }));
    o.dele.forEach(function(d){
      if(d.label) tekst.appendChild(el('div', { class: 'sam-kort-label', text: d.label }));
      tekst.appendChild(el('div', { class: 'sam-kort-t', text: d.t }));
    });

    var pil = el('button', {
      type: 'button',
      class: 'sam-pil' + (o.pil.tekst.length > 2 ? ' sam-pil-tekst' : ''),
      'aria-label': o.pil.label,
      title: o.pil.label,
      text: o.pil.tekst
    });
    pil.addEventListener('click', o.pil.onClick);

    kort.appendChild(greb);
    kort.appendChild(tekst);
    kort.appendChild(pil);
    return kort;
  }

  function markerMaal(node, slip){
    node._slip = slip;
    return node;
  }

  function bunkeTal(n){
    return String(n);
  }

  function tegnBunker(maal){
    tom(maal);
    if(!S.left || !S.right){
      maal.appendChild(el('p', { class: 'tom-tilstand',
        text: 'Tre bunker kræver to planer at sammenligne. Vælg en plan i begge felter ovenfor.' }));
      return;
    }

    var raekker = bunkeRaekker();
    if(!raekker.length) return;
    if(!S.felt || !raekkeMedKey(S.felt)) S.felt = raekker[0].key;
    var r = raekkeMedKey(S.felt);
    var data = bunkerFor(r);

    var venstreNavn = sideNavn(S.leftValg);
    var hoejreNavn = sideNavn(S.rightValg);
    var venstreOrd = venstreNavn || 'indefra';
    var hoejreOrd = hoejreNavn || 'udefra';
    var venstreStribe = (S.leftValg && planMedId(S.leftValg.planId) && !erFag(planMedId(S.leftValg.planId))) ? S.farve : '';
    var hoejreStribe = (S.rightValg && planMedId(S.rightValg.planId) && !erFag(planMedId(S.rightValg.planId))) ? S.farve : '';

    maal.appendChild(el('div', { class: 'sam-forklaring' }, [
      el('strong', { text: 'Sådan bruger I de tre bunker. ' }),
      el('span', { text: 'Træk et punkt over i midten, eller tryk på pilen, når I er enige om det. ' +
        'Slip et punkt fra den anden side oven på et punkt i midten, når I mener, at de to hører sammen. ' +
        'Det er jer, der afgør det, ikke systemet.' })
    ]));

    maal.appendChild(feltVaelger(raekker, r));

    var kolonner = el('div', { class: 'sam-bunker' });

    // --- venstre: kun [Navn] ---
    var kv = markerMaal(el('section', { class: 'sam-bunke sam-bunke-venstre', 'aria-label': 'Kun ' + venstreOrd }), { type: 'venstre' });
    kv.appendChild(el('h3', { class: 'sam-bunke-titel' }, [
      el('span', { text: 'Kun ' + venstreOrd }),
      el('span', { class: 'sam-bunke-antal', text: bunkeTal(data.kunL.length) })
    ]));
    if(!data.kunL.length) kv.appendChild(el('div', { class: 'sam-tom', text: S.left && punkter(S.left, r).length ? 'Alle punkter er flyttet til midten.' : 'Intet skrevet her · forskel' }));
    data.kunL.forEach(function(p){
      kv.appendChild(bunkeKort({
        klasse: 'sam-kort-venstre', stribe: venstreStribe, nogle: 'l:' + p.id, key: r.key,
        dele: [{ t: p.t }], kilde: { type: 'l', id: p.id },
        pil: { tekst: '→', label: 'Flyt til Begge er enige: ' + p.t, onClick: function(){ tilMidten(r.key, 'l', p.id); } }
      }));
    });

    // --- midten: begge er enige ---
    var km = markerMaal(el('section', { class: 'sam-bunke sam-bunke-midt', 'aria-label': 'Begge er enige' }), { type: 'midt' });
    var mh = el('h3', { class: 'sam-bunke-titel' }, [
      el('span', { class: 'sam-flueben', 'aria-hidden': 'true' }, [flueben()]),
      el('span', { text: 'Begge er enige' }),
      el('span', { class: 'sam-bunke-antal', text: bunkeTal(data.midt.length) })
    ]);
    km.appendChild(mh);
    data.midt.forEach(function(e){
      km.appendChild(midtKort(r, e, data, venstreOrd, hoejreOrd, venstreStribe, hoejreStribe));
    });
    km.appendChild(el('div', { class: 'sam-slip', text: 'Slip et punkt her' }));
    km.appendChild(noteFelt(r));

    // --- højre: kun personalet ---
    var kh = markerMaal(el('section', { class: 'sam-bunke sam-bunke-hoejre', 'aria-label': 'Kun ' + hoejreOrd }), { type: 'hoejre' });
    kh.appendChild(el('h3', { class: 'sam-bunke-titel' }, [
      el('span', { text: 'Kun ' + hoejreOrd }),
      el('span', { class: 'sam-bunke-antal', text: bunkeTal(data.kunR.length) })
    ]));
    if(!data.kunR.length) kh.appendChild(el('div', { class: 'sam-tom', text: S.right && punkter(S.right, r).length ? 'Alle punkter er flyttet til midten.' : 'Intet skrevet her · forskel' }));
    data.kunR.forEach(function(p){
      kh.appendChild(bunkeKort({
        klasse: 'sam-kort-hoejre', stribe: hoejreStribe, nogle: 'r:' + p.id, key: r.key,
        dele: [{ t: p.t }], kilde: { type: 'r', id: p.id },
        pil: { tekst: '←', label: 'Flyt til Begge er enige: ' + p.t, onClick: function(){ tilMidten(r.key, 'r', p.id); } }
      }));
    });

    kolonner.appendChild(kv);
    kolonner.appendChild(km);
    kolonner.appendChild(kh);
    maal.appendChild(kolonner);

    if(data.mangler > 0){
      maal.appendChild(el('p', { class: 'sam-mangler',
        text: data.mangler === 1
          ? '1 punkt fra et tidligere møde findes ikke længere i planen.'
          : data.mangler + ' punkter fra et tidligere møde findes ikke længere i planen.' }));
    }

    maal.appendChild(helePlanen(raekker, r));

    // fokus tilbage på det flyttede punkts pil
    if(S.fokus){
      var kort = maal.querySelector('[data-nogle="' + S.fokus.replace(/"/g, '') + '"]');
      var knap = kort ? kort.querySelector('.sam-pil') : null;
      if(knap) knap.focus();
      S.fokus = null;
    }
  }

  // Et punkt (eller par) i midten
  function midtKort(r, e, data, venstreOrd, hoejreOrd, venstreStribe, hoejreStribe){
    var erPar = !!(e.li && e.ri);
    var kilde = { type: 'm', entry: e };
    var klasse = 'sam-kort-midt';
    var dele, overskrift, stribe, nogle, pil;

    if(erPar){
      dele = [
        { label: venstreOrd, t: e.li.t },
        { label: hoejreOrd, t: e.ri.t }
      ];
      overskrift = 'Fra begge';
      stribe = '';
      nogle = 'p:' + e.li.id + '|' + e.ri.id;
      pil = { tekst: 'Flyt tilbage', label: 'Flyt tilbage til de to sider: ' + e.li.t,
        onClick: function(){ tilbage(e.k, 'l:' + e.li.id); } };
    }else if(e.li){
      dele = [{ t: e.li.t }];
      overskrift = 'Fra ' + venstreOrd;
      stribe = venstreStribe;
      nogle = 'l:' + e.li.id;
      pil = { tekst: '←', label: 'Flyt tilbage til Kun ' + venstreOrd + ': ' + e.li.t,
        onClick: function(){ tilbage(e.k, 'l:' + e.li.id); } };
    }else{
      dele = [{ t: e.ri.t }];
      overskrift = 'Fra ' + hoejreOrd;
      stribe = hoejreStribe;
      nogle = 'r:' + e.ri.id;
      pil = { tekst: '→', label: 'Flyt tilbage til Kun ' + hoejreOrd + ': ' + e.ri.t,
        onClick: function(){ tilbage(e.k, 'r:' + e.ri.id); } };
    }

    var kort = bunkeKort({ klasse: klasse, stribe: stribe, nogle: nogle, key: r.key,
      dele: dele, overskrift: overskrift, kilde: kilde, pil: pil });

    // Et enkelt punkt i midten kan parres (oven på med træk, eller med dette valg)
    if(!erPar){
      var modsat = e.li ? data.kunR : data.kunL;
      var modsatSide = e.li ? 'r' : 'l';
      if(modsat.length){
        var sel = el('select', { class: 'sam-par', 'aria-label': 'Par med et punkt fra ' + (e.li ? hoejreOrd : venstreOrd) });
        sel.appendChild(el('option', { value: '', text: 'Par med et punkt fra ' + (e.li ? hoejreOrd : venstreOrd) + '…' }));
        modsat.forEach(function(p){ sel.appendChild(el('option', { value: p.id, text: p.t })); });
        sel.addEventListener('change', function(){
          if(sel.value) parMed(r.key, e, modsatSide, sel.value);
        });
        kort.appendChild(sel);
      }
    }
    return markerMaal(kort, { type: 'par', entry: e });
  }

  // Note til feltet (samme note som i Tabel: la2_compare_notes, row_key = feltet)
  function noteFelt(r){
    var n = noteFor(r.key);
    var fraDetaljer = el('div', { class: 'sam-fra', text: n.fra ? 'Fra et tidligere møde (' + n.fra + ')' : '', hidden: !n.fra });
    var ta = el('textarea', {
      rows: '2', maxlength: '4000', class: 'sam-note',
      'aria-label': 'Note til ' + r.sektion + ' · ' + r.felt,
      placeholder: 'Note til det, I er enige om…'
    });
    ta.value = n.note || '';
    ta.addEventListener('input', function(){
      n.note = ta.value;
      if(n.fra){ n.id = null; n.fra = null; fraDetaljer.hidden = true; }
      S.dirty[r.key] = true;
      planlaeg();
    });
    return el('div', { class: 'sam-midt-note' }, [ta, fraDetaljer]);
  }

  // Vælg del og felt (Tryghed: 1 Grøn / 2 Gul / 3 Rød + Tegn / Hvad gør vi)
  function feltVaelger(raekker, valgt){
    var dele = [];
    raekker.forEach(function(r){
      var d = dele.filter(function(x){ return x.navn === r.sektion; })[0];
      if(!d){ d = { navn: r.sektion, niveau: r.niveau, raekker: [] }; dele.push(d); }
      d.raekker.push(r);
    });
    var aktivDel = dele.filter(function(d){ return d.navn === valgt.sektion; })[0];

    function vaelg(key){
      S.felt = key;
      tegnIndhold();
    }

    var boks = el('div', { class: 'sam-vaelger' });
    var delGruppe = el('div', { class: 'sam-chips', role: 'group', 'aria-label': 'Del af planen' });
    dele.forEach(function(d){
      var erAktiv = d === aktivDel;
      var b = el('button', {
        type: 'button',
        class: 'sam-chip' + (erAktiv ? ' valgt' : '') + (d.niveau ? ' sam-chip-' + d.niveau.level : ''),
        'aria-pressed': erAktiv ? 'true' : 'false',
        text: (d.niveau ? d.niveau.nr + ' ' : '') + d.navn
      });
      b.addEventListener('click', function(){ vaelg(d.raekker[0].key); });
      delGruppe.appendChild(b);
    });
    boks.appendChild(delGruppe);

    if(aktivDel && aktivDel.raekker.length > 1){
      var feltGruppe = el('div', { class: 'sam-chips sam-chips-felt', role: 'group', 'aria-label': 'Felt' });
      aktivDel.raekker.forEach(function(r){
        var erAktiv = r.key === valgt.key;
        var b = el('button', {
          type: 'button',
          class: 'sam-chip' + (erAktiv ? ' valgt' : ''),
          'aria-pressed': erAktiv ? 'true' : 'false',
          text: r.felt
        });
        b.addEventListener('click', function(){ vaelg(r.key); });
        feltGruppe.appendChild(b);
      });
      boks.appendChild(feltGruppe);
    }

    boks.appendChild(el('div', { class: 'sam-feltspoergsmaal' }, [
      el('span', { class: 'sam-sektion', text: valgt.sektion }),
      el('div', { class: 'sam-feltnavn', text: valgt.felt })
    ]));
    return boks;
  }

  // "Hele planen på én gang": en bjælke pr. del
  function helePlanen(raekker, valgt){
    var venstreOrd = sideNavn(S.leftValg) || 'indefra';
    var hoejreOrd = sideNavn(S.rightValg) || 'udefra';
    var dele = [];
    raekker.forEach(function(r){
      var d = dele.filter(function(x){ return x.navn === r.sektion; })[0];
      if(!d){ d = { navn: r.sektion, niveau: r.niveau, forste: r.key, v: 0, m: 0, h: 0 }; dele.push(d); }
      var b = bunkerFor(r);
      d.v += b.kunL.length;
      d.m += b.midt.length;
      d.h += b.kunR.length;
    });

    var boks = el('section', { class: 'sam-hele', 'aria-label': 'Hele planen på én gang' });
    boks.appendChild(el('h3', { class: 'sam-hele-titel', text: 'Hele planen på én gang' }));
    boks.appendChild(el('p', { class: 'sam-hele-tekst',
      text: 'Hver bjælke er én del af planen. Den viser, hvor mange punkter der kun står hos ' + venstreOrd +
            ', hvor mange I er enige om, og hvor mange der kun står hos ' + hoejreOrd + '. Tryk på en bjælke for at gå til delen.' }));

    var liste = el('div', { class: 'sam-hele-liste' });
    dele.forEach(function(d){
      var total = d.v + d.m + d.h;
      var aktiv = d.navn === valgt.sektion;
      var knap = el('button', {
        type: 'button',
        class: 'sam-del' + (aktiv ? ' aktiv' : ''),
        'aria-pressed': aktiv ? 'true' : 'false',
        'aria-label': d.navn + ': kun ' + venstreOrd + ' ' + d.v + ', begge ' + d.m + ', kun ' + hoejreOrd + ' ' + d.h
      });
      knap.appendChild(el('span', { class: 'sam-del-navn', text: (d.niveau ? d.niveau.nr + ' ' : '') + d.navn }));

      var bar = el('span', { class: 'sam-bar', 'aria-hidden': 'true' });
      if(total === 0){
        bar.appendChild(el('span', { class: 'sam-seg sam-seg-tom', style: 'flex:1 1 0' }));
      }else{
        [['v', d.v], ['m', d.m], ['h', d.h]].forEach(function(s){
          if(!s[1]) return;
          var seg = el('span', { class: 'sam-seg sam-seg-' + s[0], style: 'flex:' + s[1] + ' 1 0' });
          if(s[0] === 'v' && U().erFarve(S.farve)) seg.style.background = S.farve;
          bar.appendChild(seg);
        });
      }
      knap.appendChild(bar);
      knap.appendChild(el('span', { class: 'sam-del-tal', 'aria-hidden': 'true' }, [
        el('span', { text: String(d.v) }), el('span', { text: String(d.m) }), el('span', { text: String(d.h) })
      ]));
      knap.addEventListener('click', function(){ S.felt = d.forste; tegnIndhold(); });
      liste.appendChild(knap);
    });
    boks.appendChild(liste);

    function tegn(klasse, tekst, farve){
      var s = el('span', { class: 'sam-seg ' + klasse, 'aria-hidden': 'true' });
      if(farve && U().erFarve(farve)) s.style.background = farve;
      return el('span', { class: 'sam-tegn' }, [s, el('span', { text: tekst })]);
    }
    boks.appendChild(el('div', { class: 'sam-tegnforklaring' }, [
      tegn('sam-seg-v', 'Kun ' + venstreOrd, S.farve),
      tegn('sam-seg-m', 'Begge er enige'),
      tegn('sam-seg-h', 'Kun ' + hoejreOrd)
    ]));
    return boks;
  }

  // ---------------------------------------------------------------
  // Kurver: trivsels- og affektkurven fra to læringsplaner lagt oven på hinanden.
  //
  // Systemet måler kun tal: hvor kurverne ligger, og hvor mange trin der er
  // mellem dem. Hvad en forskel betyder, afgør personalet på mødet.
  // Skala: 1 = roligt, 5 = meget slemt (høj = slemt).
  // ---------------------------------------------------------------

  var KURVE_FORSKEL = 2;      // "Største forskel" vises fra og med så mange trin

  function kurveSkabelon(){
    var tpl = T.plans.laering;
    return tpl && tpl.curve ? tpl.curve : null;
  }

  // 7 værdier (tal eller null) for en side
  function kurveVaerdier(side, curve){
    var gemt = P.kurve7(side && side.content && side.content.curve, curve.points.length);
    return gemt.map(function(v){
      return (typeof v === 'number' && v >= curve.min && v <= curve.max) ? v : null;
    });
  }

  // Hvilken side er "indefra" (fuld streg, prikker) og hvilken "udefra" (stiplet, firkanter)
  function kurveStil(){
    var lp = S.leftValg ? planMedId(S.leftValg.planId) : null;
    var rp = S.rightValg ? planMedId(S.rightValg.planId) : null;
    var lFag = erFag(lp), rFag = erFag(rp);
    if(lFag && !rFag) return { left: 'ude', right: 'inde' };
    return { left: 'inde', right: 'ude' };
  }

  function kurveFarve(){
    return U().erFarve(S.farve) ? S.farve : '#374151';
  }

  // Lille tegn til forklaringen
  function kurveTegn(stil){
    var s = svgNode('svg', { width: '44', height: '16', viewBox: '0 0 44 16', 'aria-hidden': 'true', focusable: 'false' });
    if(stil === 'inde'){
      s.appendChild(svgNode('line', { x1: '2', x2: '42', y1: '8', y2: '8', stroke: kurveFarve(), 'stroke-width': '4', 'stroke-linecap': 'round' }));
      s.appendChild(svgNode('circle', { cx: '22', cy: '8', r: '6', fill: kurveFarve(), stroke: '#fff', 'stroke-width': '2' }));
    }else if(stil === 'ude'){
      s.appendChild(svgNode('line', { x1: '2', x2: '42', y1: '8', y2: '8', 'class': 'kurve-linje-ude', 'stroke-width': '4', 'stroke-dasharray': '8 5' }));
      s.appendChild(svgNode('rect', { x: '15', y: '1', width: '14', height: '14', 'class': 'kurve-firkant', 'stroke-width': '2' }));
    }else{
      s.appendChild(svgNode('line', { x1: '22', x2: '22', y1: '0', y2: '16', 'class': 'kurve-episode', 'stroke-width': '3', 'stroke-dasharray': '4 3' }));
    }
    return s;
  }

  function kurveGraf(curve, vL, vR, stil, navnL, navnR){
    var W = 720, H = 360, pl = 104, pr = 28, pt = 40, pb = 70;
    var n = curve.points.length;
    var lo = curve.min, hi = curve.max;
    var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'kurve-sam-svg', role: 'img',
      'aria-label': 'Kurver: ' + navnL + ' og ' + navnR + ' lagt oven på hinanden. Tallene står i tabellen under grafen.' });

    function x(i){ return pl + i * (W - pl - pr) / (n - 1); }
    function y(v){ return pt + (hi - v) * (H - pt - pb) / (hi - lo); }
    function tekst(txt, attrs){
      var t = svgNode('text', attrs);
      t.textContent = txt;
      return t;
    }

    // Vandrette hjælpelinjer med tal (1 roligt … 5 meget slemt)
    for(var v = lo; v <= hi; v++){
      svg.appendChild(svgNode('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), 'class': 'kurve-gitter' }));
      var lbl = String(v) + (v === lo ? ' roligt' : (v === hi ? ' meget slemt' : ''));
      svg.appendChild(tekst(lbl, { x: pl - 10, y: y(v) + 5, 'text-anchor': 'end', 'class': 'kurve-akse' }));
    }

    // Tidspunkter med to linjer (som i planen)
    var epi = typeof curve.episodeIndex === 'number' ? curve.episodeIndex : Math.floor((n - 1) / 2);
    curve.points.forEach(function(p, i){
      var linjer = p.short || [p.label];
      linjer.forEach(function(l, k){
        svg.appendChild(tekst(l, { x: x(i), y: H - pb + 28 + k * 17, 'text-anchor': 'middle',
          'class': 'kurve-akse' + (i === epi ? ' kurve-akse-episode' : '') }));
      });
    });

    // Forskelle på 2 trin eller mere: guldbånd bag kurverne
    var stoerst = 0;
    var forskelle = [];
    for(var i = 0; i < n; i++){
      if(vL[i] !== null && vR[i] !== null){
        var f = Math.abs(vL[i] - vR[i]);
        forskelle.push(f);
        if(f > stoerst) stoerst = f;
      }else{
        forskelle.push(null);
      }
    }
    forskelle.forEach(function(f, i){
      if(f !== null && f >= KURVE_FORSKEL){
        svg.appendChild(svgNode('rect', { x: x(i) - 26, y: pt - 14, width: 52, height: H - pt - pb + 28,
          rx: 8, 'class': 'kurve-baand' + (f === stoerst ? ' kurve-baand-stoerst' : '') }));
      }
    });

    // Rød stiplet streg ved Episoden
    svg.appendChild(svgNode('line', { x1: x(epi), x2: x(epi), y1: pt - 18, y2: H - pb + 8,
      'class': 'kurve-episode', 'stroke-width': 3, 'stroke-dasharray': '7 5' }));
    svg.appendChild(tekst('Episoden', { x: x(epi), y: pt - 24, 'text-anchor': 'middle', 'class': 'kurve-episode-tekst' }));

    // Serierne: forskudt et par pixel, så to ens værdier begge kan ses
    function serie(vaerdier, st, forskyd){
      var seg = [];
      function flush(){
        if(seg.length > 1){
          var l = svgNode('polyline', {
            points: seg.map(function(i){ return (x(i) + forskyd) + ',' + y(vaerdier[i]); }).join(' '),
            fill: 'none', 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
          });
          if(st === 'inde'){ l.setAttribute('stroke', kurveFarve()); }
          else{ l.setAttribute('class', 'kurve-linje-ude'); l.setAttribute('stroke-dasharray', '10 6'); l.setAttribute('stroke-linecap', 'butt'); }
          svg.appendChild(l);
        }
        seg = [];
      }
      for(var i = 0; i < n; i++){
        if(vaerdier[i] !== null) seg.push(i); else flush();
      }
      flush();
      for(var j = 0; j < n; j++){
        if(vaerdier[j] === null) continue;
        var cx = x(j) + forskyd, cy = y(vaerdier[j]);
        if(st === 'inde'){
          svg.appendChild(svgNode('circle', { cx: cx, cy: cy, r: 8, fill: kurveFarve(), stroke: '#fff', 'stroke-width': 2 }));
        }else{
          svg.appendChild(svgNode('rect', { x: cx - 7, y: cy - 7, width: 14, height: 14, 'class': 'kurve-firkant', 'stroke-width': 2 }));
        }
      }
    }
    serie(vR, stil.right, stil.right === 'inde' ? -4 : 4);
    serie(vL, stil.left, stil.left === 'inde' ? -4 : 4);

    return { svg: svg, forskelle: forskelle, stoerst: stoerst };
  }

  // Note + markering til kurven (row_key = 'kurve', samme som i Tabel)
  function kurveNote(){
    var n = noteFor('kurve');
    var fraDetaljer = el('div', { class: 'sam-fra', text: n.fra ? 'Fra et tidligere møde (' + n.fra + ')' : '', hidden: !n.fra });
    var ta = el('textarea', {
      rows: '3', maxlength: '4000', class: 'sam-note',
      'aria-label': 'Note til kurverne',
      placeholder: 'Hvad ser I, når I kigger på kurverne sammen?'
    });
    ta.value = n.note || '';
    ta.addEventListener('input', function(){
      n.note = ta.value;
      if(n.fra){ n.id = null; n.fra = null; fraDetaljer.hidden = true; }
      S.dirty.kurve = true;
      planlaeg();
    });

    var knapper = el('div', { class: 'sam-valg', role: 'group', 'aria-label': 'Markering' });
    MARKERINGER.forEach(function(m){
      var b = el('button', {
        type: 'button',
        class: 'sam-markering' + (n.marking === m.id ? ' valgt' : ''),
        'aria-pressed': n.marking === m.id ? 'true' : 'false',
        text: m.label
      });
      b.addEventListener('click', function(){
        if(n.fra){ n.id = null; n.fra = null; fraDetaljer.hidden = true; }
        n.marking = (n.marking === m.id) ? null : m.id;
        S.dirty.kurve = true;
        knapper.querySelectorAll('button').forEach(function(x, i){
          var valgt = n.marking === MARKERINGER[i].id;
          x.className = 'sam-markering' + (valgt ? ' valgt' : '');
          x.setAttribute('aria-pressed', valgt ? 'true' : 'false');
        });
        planlaeg();
      });
      knapper.appendChild(b);
    });

    return el('div', { class: 'sam-kurve-note' }, [
      el('div', { class: 'sam-celle-label sam-kurve-label', text: 'Refleksion og spørgsmål' }),
      ta, knapper, fraDetaljer
    ]);
  }

  function kurveNoteSlut(maal, laes){
    if(!laes){ maal.appendChild(kurveNote()); return; }
    var n = noteLaes('kurve');
    if(n) maal.appendChild(n);
  }

  function tegnKurver(maal, laes){
    tom(maal);
    var curve = kurveSkabelon();
    if(S.tab !== 'laering' || !curve){
      maal.appendChild(el('p', { class: 'tom-tilstand', text: 'Kurver findes kun for læringsplaner.' }));
      return;
    }
    if(!S.left || !S.right){
      maal.appendChild(el('p', { class: 'tom-tilstand',
        text: 'Kurver kræver to planer at sammenligne. Vælg en plan i begge felter ovenfor.' }));
      return;
    }

    var vL = kurveVaerdier(S.left, curve);
    var vR = kurveVaerdier(S.right, curve);
    var stil = kurveStil();
    var navnL = sideNavn(S.leftValg) || 'venstre';
    var navnR = sideNavn(S.rightValg) || 'højre';
    var tekstL = navnL + (stil.left === 'inde' ? ' (indefra)' : ' (udefra)');
    var tekstR = navnR + (stil.right === 'inde' ? ' (indefra)' : ' (udefra)');

    var harNogen = vL.concat(vR).some(function(v){ return v !== null; });

    // Titel + forklaring
    maal.appendChild(el('div', { class: 'sam-kurve-hoved' }, [
      el('h2', { class: 'sam-kurve-titel', text: curve.title }),
      el('p', { class: 'sam-kurve-hint', text: curve.hint })
    ]));

    var forklaring = el('div', { class: 'sam-kurve-forklaring' });
    [[stil.left, tekstL], [stil.right, tekstR], ['episode', 'Episoden']].forEach(function(f){
      forklaring.appendChild(el('span', { class: 'sam-tegn' }, [kurveTegn(f[0]), el('span', { text: f[1] })]));
    });
    maal.appendChild(forklaring);

    if(!harNogen){
      maal.appendChild(el('p', { class: 'tom-tilstand',
        text: 'Ingen af de to planer har udfyldt kurven endnu.' }));
      kurveNoteSlut(maal, laes);
      return;
    }

    var graf = kurveGraf(curve, vL, vR, stil, navnL, navnR);
    maal.appendChild(el('div', { class: 'sam-kurve-graf' }, [graf.svg]));

    // Det systemet kan måle: forskel i trin og tomme tidspunkter
    var resume = el('div', { class: 'sam-kurve-resume' });
    if(graf.stoerst >= KURVE_FORSKEL){
      var stoerste = [];
      graf.forskelle.forEach(function(f, i){ if(f === graf.stoerst) stoerste.push(i); });
      resume.appendChild(el('div', { class: 'sam-kurve-stoerst-titel', text: 'Største forskel' }));
      stoerste.forEach(function(i){
        resume.appendChild(el('div', { class: 'sam-kurve-stoerst' }, [
          el('strong', { text: curve.points[i].label + ': ' + graf.stoerst + ' trin' }),
          el('span', { text: ' · ' + navnL + ' ' + vL[i] + ', ' + navnR + ' ' + vR[i] })
        ]));
      });
    }else{
      resume.appendChild(el('div', { class: 'sam-kurve-stoerst-ingen',
        text: 'Ingen tidspunkter, hvor kurverne ligger ' + KURVE_FORSKEL + ' trin eller mere fra hinanden.' }));
    }

    var kunEn = [];
    curve.points.forEach(function(p, i){
      if((vL[i] === null) !== (vR[i] === null)){
        kunEn.push(p.label + ' (kun ' + (vL[i] !== null ? navnL : navnR) + ')');
      }
    });
    if(kunEn.length){
      resume.appendChild(el('div', { class: 'sam-kurve-kunen', text: 'Kun udfyldt på den ene side: ' + kunEn.join(', ') + '.' }));
    }
    maal.appendChild(resume);

    // Tallene som tabel (kan læses uden farver og på telefon)
    var tabel = el('table', { class: 'sam-kurve-tabel' });
    tabel.appendChild(el('thead', null, [el('tr', null, [
      el('th', { scope: 'col', text: 'Tidspunkt' }),
      el('th', { scope: 'col', text: tekstL }),
      el('th', { scope: 'col', text: tekstR }),
      el('th', { scope: 'col', text: 'Forskel' })
    ])]));
    var tb = el('tbody');
    curve.points.forEach(function(p, i){
      var f = graf.forskelle[i];
      var stor = f !== null && f >= KURVE_FORSKEL;
      tb.appendChild(el('tr', { class: stor ? 'sam-kurve-stor' : null }, [
        el('th', { scope: 'row', text: p.label }),
        el('td', { text: vL[i] !== null ? String(vL[i]) : '–' }),
        el('td', { text: vR[i] !== null ? String(vR[i]) : '–' }),
        el('td', { text: f !== null ? String(f) : '–' })
      ]));
    });
    tabel.appendChild(tb);
    maal.appendChild(el('div', { class: 'sam-kurve-tabel-wrap' }, [tabel]));

    kurveNoteSlut(maal, laes);
  }

  // ---------------------------------------------------------------
  // Mødevisning: fuldskærm til skærm eller TV på mødet. Ét felt ad gangen
  // (og kurverne sidst i en læringsplan), stor skrift, piletaster/fjernbetjening.
  // Kun visning: noter og bunker ændres i Tabel / Tre bunker / Kurver.
  // Indholdet findes kun i overlayet mens det er åbent.
  // ---------------------------------------------------------------

  var MV = null;      // { node, scene, slides, i, fuld, tast, fuldFn, opener, taeller, forrige, naeste }

  function moedeSlides(){
    var slides = [];
    bunkeRaekker().forEach(function(r){
      var d = bunkerFor(r);
      var n = S.noter[r.key];
      var harNote = !!(n && (n.marking || (n.note || '').trim()));
      if(!d.kunL.length && !d.kunR.length && !d.midt.length && !harNote) return;
      slides.push({ type: 'felt', r: r, d: d });
    });
    if(S.tab === 'laering' && kurveSkabelon()) slides.push({ type: 'kurve' });
    return slides;
  }

  // Skrivebeskyttet note (markering + tekst) eller null
  function noteLaes(key){
    var n = S.noter[key];
    if(!n) return null;
    var tekst = (n.note || '').trim();
    if(!n.marking && !tekst) return null;
    var kids = [el('div', { class: 'mv-note-label', text: 'Refleksion og spørgsmål' })];
    if(n.marking){
      var m = MARKERINGER.filter(function(x){ return x.id === n.marking; })[0];
      kids.push(el('span', { class: 'mv-chip', text: m ? m.label : '' }));
    }
    if(tekst) kids.push(el('p', { class: 'mv-note-tekst', text: tekst }));
    return el('div', { class: 'mv-note' }, kids);
  }

  function mvKolonne(klasse, titel, antal, kort, tomTekst){
    var k = el('section', { class: 'mv-kol ' + klasse }, [
      el('h3', { class: 'mv-kol-titel' }, [
        el('span', { text: titel }),
        el('span', { class: 'mv-kol-antal', text: String(antal) })
      ])
    ]);
    if(!kort.length && tomTekst) k.appendChild(el('div', { class: 'mv-tom', text: tomTekst }));
    kort.forEach(function(x){ k.appendChild(x); });
    return k;
  }

  function mvKort(overskrift, dele, stribe){
    var kort = el('div', { class: 'mv-kort' });
    if(stribe && U().erFarve(stribe)) kort.style.borderLeftColor = stribe;
    if(overskrift) kort.appendChild(el('div', { class: 'mv-kort-fra', text: overskrift }));
    dele.forEach(function(d){
      if(d.label) kort.appendChild(el('div', { class: 'mv-kort-label', text: d.label }));
      kort.appendChild(el('div', { class: 'mv-kort-t', text: d.t }));
    });
    return kort;
  }

  function mvFeltSlide(sl){
    var r = sl.r, d = sl.d;
    var vOrd = sideNavn(S.leftValg) || 'indefra';
    var hOrd = sideNavn(S.rightValg) || 'udefra';
    var lp = S.leftValg ? planMedId(S.leftValg.planId) : null;
    var rp = S.rightValg ? planMedId(S.rightValg.planId) : null;
    var vStribe = (lp && !erFag(lp)) ? S.farve : '';
    var hStribe = (rp && !erFag(rp)) ? S.farve : '';

    var venstre = d.kunL.map(function(p){ return mvKort(null, [{ t: p.t }], vStribe); });
    var hoejre = d.kunR.map(function(p){ return mvKort(null, [{ t: p.t }], hStribe); });
    var midt = d.midt.map(function(e){
      if(e.li && e.ri){
        return mvKort('Fra begge', [{ label: vOrd, t: e.li.t }, { label: hOrd, t: e.ri.t }], '');
      }
      if(e.li) return mvKort('Fra ' + vOrd, [{ t: e.li.t }], vStribe);
      return mvKort('Fra ' + hOrd, [{ t: e.ri.t }], hStribe);
    });

    var harV = punkter(S.left, r).length > 0;
    var harH = punkter(S.right, r).length > 0;

    var slide = el('div', { class: 'mv-slide' });
    slide.appendChild(el('div', { class: 'mv-sektion', text: r.sektion }));
    slide.appendChild(el('h2', { class: 'mv-felt', text: r.felt }));
    slide.appendChild(el('div', { class: 'mv-kolonner' }, [
      mvKolonne('mv-kol-v', 'Kun ' + vOrd, venstre.length, venstre, harV ? 'Alt er flyttet til midten' : 'Intet skrevet her'),
      mvKolonne('mv-kol-m', 'Begge er enige', midt.length, midt, 'Intet er flyttet hertil endnu'),
      mvKolonne('mv-kol-h', 'Kun ' + hOrd, hoejre.length, hoejre, harH ? 'Alt er flyttet til midten' : 'Intet skrevet her')
    ]));
    var note = noteLaes(r.key);
    if(note) slide.appendChild(note);
    if(d.mangler > 0){
      slide.appendChild(el('p', { class: 'mv-mangler',
        text: d.mangler === 1
          ? '1 punkt fra et tidligere møde findes ikke længere i planen.'
          : d.mangler + ' punkter fra et tidligere møde findes ikke længere i planen.' }));
    }
    return slide;
  }

  function mvKurveSlide(){
    var slide = el('div', { class: 'mv-slide mv-slide-kurve' });
    var maal = el('div', { class: 'mv-kurve' });
    tegnKurver(maal, true);
    slide.appendChild(maal);
    return slide;
  }

  function mvVis(i){
    if(!MV || !MV.slides.length) return;
    if(i < 0) i = 0;
    if(i > MV.slides.length - 1) i = MV.slides.length - 1;
    MV.i = i;
    var sl = MV.slides[i];
    tom(MV.scene);
    MV.scene.appendChild(sl.type === 'kurve' ? mvKurveSlide() : mvFeltSlide(sl));
    MV.scene.scrollTop = 0;
    if(sl.type === 'felt') S.felt = sl.r.key;
    MV.taeller.textContent = (i + 1) + ' / ' + MV.slides.length;
    MV.forrige.disabled = i === 0;
    MV.naeste.disabled = i === MV.slides.length - 1;
  }

  function mvLuk(){
    if(!MV) return;
    var m = MV;
    MV = null;
    document.removeEventListener('keydown', m.tast, true);
    document.removeEventListener('fullscreenchange', m.fuldFn);
    document.removeEventListener('webkitfullscreenchange', m.fuldFn);
    if(m.node.parentNode) m.node.parentNode.removeChild(m.node);
    document.documentElement.classList.remove('mv-aaben');
    var fe = document.fullscreenElement || document.webkitFullscreenElement;
    if(fe){
      try{
        var ud = document.exitFullscreen || document.webkitExitFullscreen;
        var p = ud.call(document);
        if(p && p.catch) p.catch(function(){ /* allerede ude */ });
      }catch(e){ /* ikke afgørende */ }
    }
    if(S && S.visning === 'bunker') tegnIndhold();
    if(m.opener && m.opener.focus) m.opener.focus();
  }

  function aabnMoedevisning(opener){
    if(MV || !S || !noteOk()) return;
    var slides = moedeSlides();
    var start = 0;
    if(S.visning === 'kurver'){
      for(var k = 0; k < slides.length; k++){ if(slides[k].type === 'kurve') start = k; }
    }else if(S.felt){
      for(var j = 0; j < slides.length; j++){ if(slides[j].type === 'felt' && slides[j].r.key === S.felt){ start = j; break; } }
    }

    var vOrd = sideNavn(S.leftValg) || 'indefra';
    var hOrd = sideNavn(S.rightValg) || 'udefra';
    var taeller = el('span', { class: 'mv-taeller', role: 'status', 'aria-live': 'polite' });
    var forrige = el('button', { type: 'button', class: 'mv-knap', text: '← Forrige' });
    var naeste = el('button', { type: 'button', class: 'mv-knap', text: 'Næste →' });
    var luk = el('button', { type: 'button', class: 'mv-knap mv-luk', text: 'Luk' });
    var scene = el('div', { class: 'mv-scene' });

    var node = el('div', { class: 'mv', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mødevisning', tabindex: '-1' }, [
      el('header', { class: 'mv-top' }, [
        el('div', { class: 'mv-top-tekst' }, [
          el('span', { class: 'mv-top-plan', text: (PLAN_NAVN[S.tab] || '') + ' · ' + genitiv(S.navn) + ' og personalets' }),
          el('span', { class: 'mv-top-side', text: vOrd + ' mod ' + hOrd })
        ]),
        taeller,
        luk
      ]),
      scene,
      el('footer', { class: 'mv-bund' }, [
        forrige,
        el('span', { class: 'mv-hjaelp', text: 'Piletaster skifter · Esc lukker' }),
        naeste
      ])
    ]);

    MV = { node: node, scene: scene, slides: slides, i: 0, fuld: false, opener: opener,
           taeller: taeller, forrige: forrige, naeste: naeste };

    forrige.addEventListener('click', function(){ mvVis(MV.i - 1); });
    naeste.addEventListener('click', function(){ mvVis(MV.i + 1); });
    luk.addEventListener('click', mvLuk);

    MV.tast = function(e){
      if(!MV) return;
      var k = e.key;
      var paaKnap = e.target && e.target.tagName === 'BUTTON';
      if(k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown'){ e.preventDefault(); mvVis(MV.i + 1); }
      else if(k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp'){ e.preventDefault(); mvVis(MV.i - 1); }
      else if(k === ' ' && !paaKnap){ e.preventDefault(); mvVis(MV.i + 1); }
      else if(k === 'Home'){ e.preventDefault(); mvVis(0); }
      else if(k === 'End'){ e.preventDefault(); mvVis(MV.slides.length - 1); }
      else if(k === 'Escape' || k === 'Backspace'){ e.preventDefault(); mvLuk(); }
      else if(k === 'Tab'){
        // hold fokus inde i mødevisningen
        var knapper = [forrige, naeste, luk].filter(function(b){ return !b.disabled; });
        if(!knapper.length) return;
        var nu = knapper.indexOf(document.activeElement);
        var ny = e.shiftKey ? (nu <= 0 ? knapper.length - 1 : nu - 1) : (nu === knapper.length - 1 ? 0 : nu + 1);
        e.preventDefault();
        knapper[ny].focus();
      }
    };
    document.addEventListener('keydown', MV.tast, true);

    // lukker browseren fuldskærm (fx med Esc), lukker vi også mødevisningen
    MV.fuldFn = function(){
      if(!MV) return;
      var fe = document.fullscreenElement || document.webkitFullscreenElement;
      if(fe === MV.node) MV.fuld = true;
      else if(MV.fuld) mvLuk();
    };
    document.addEventListener('fullscreenchange', MV.fuldFn);
    document.addEventListener('webkitfullscreenchange', MV.fuldFn);

    document.body.appendChild(node);
    document.documentElement.classList.add('mv-aaben');
    var krav = node.requestFullscreen || node.webkitRequestFullscreen;
    if(krav){
      try{
        var lov = krav.call(node);
        if(lov && lov.catch) lov.catch(function(){ /* vi dækker alligevel hele skærmen */ });
      }catch(e){ /* ikke afgørende */ }
    }

    if(!slides.length){
      scene.appendChild(el('div', { class: 'mv-slide' }, [
        el('h2', { class: 'mv-felt', text: 'Der er intet at vise endnu' }),
        el('p', { class: 'mv-note-tekst', text: 'Ingen af de to planer har indhold, og der er ingen noter.' })
      ]));
      taeller.textContent = '0 / 0';
      forrige.disabled = true;
      naeste.disabled = true;
    }else{
      mvVis(start);
    }
    naeste.disabled || naeste.focus();
    if(naeste.disabled) luk.focus();
  }

  // ---------------------------------------------------------------
  // Siden
  // ---------------------------------------------------------------

  function tegnIndhold(){
    var maal = S.rod.querySelector('.sam-indhold');
    if(!maal) return;
    if(S.visning === 'bunker') tegnBunker(maal);
    else if(S.visning === 'kurver') tegnKurver(maal);
    else tegnTabel(maal);
  }

  function skiftVisning(ny){
    if(S.visning === ny) return;
    gemAlt().then(function(){
      if(!S) return;
      S.visning = ny;
      tegnAlt();
    });
  }

  function tegnAlt(){
    var rod = S.rod;
    tom(rod);
    var tpl = T.plans[S.tab];
    var visningNavn = S.visning === 'bunker' ? 'Tre bunker' : (S.visning === 'kurver' ? 'Kurver' : 'Tabel');

    // Top
    rod.appendChild(el('a', { class: 'tilbage', href: planHref(false), text: '← ' + genitiv(S.navn) + ' planer' }));
    rod.appendChild(el('header', { class: 'sam-top' }, [
      avatar(48),
      el('div', { class: 'sam-top-tekst' }, [
        el('div', { class: 'sam-label', text: 'Sammenlign · ' + (PLAN_NAVN[S.tab] || '') + ' · ' + visningNavn }),
        el('h1', { class: 'sam-h1', text: S.navn + ': indefra og udefra' })
      ])
    ]));

    // Vælg visning
    rod.appendChild(el('div', { class: 'sam-visninger' }, [
      el('div', { class: 'segmenter', role: 'group', 'aria-label': 'Visning' }, [
        el('button', { type: 'button', class: 'segment' + (S.visning === 'tabel' ? ' aktiv' : ''),
          'aria-pressed': S.visning === 'tabel' ? 'true' : 'false', text: 'Tabel',
          onclick: function(){ skiftVisning('tabel'); } }),
        el('button', { type: 'button', class: 'segment' + (S.visning === 'bunker' ? ' aktiv' : ''),
          'aria-pressed': S.visning === 'bunker' ? 'true' : 'false', text: 'Tre bunker',
          onclick: function(){ skiftVisning('bunker'); } }),
        el('button', { type: 'button', class: 'segment' + (S.visning === 'kurver' ? ' aktiv' : ''),
          'aria-pressed': S.visning === 'kurver' ? 'true' : 'false', text: 'Kurver',
          disabled: S.tab !== 'laering',
          title: S.tab === 'laering' ? null : 'Kun for læringsplaner',
          onclick: function(){ skiftVisning('kurver'); } })
      ]),
      el('button', { type: 'button', class: 'knap knap-lys sam-moedeknap', text: 'Mødevisning',
        disabled: !noteOk(), onclick: function(ev){ aabnMoedevisning(ev.currentTarget); } }),
      S.tab !== 'laering' ? el('span', { class: 'sam-hjaelp', text: 'Kurver: kun for læringsplaner' }) : null
    ]));

    // Vælg hvad der sammenlignes
    rod.appendChild(valgBjaelke());

    // Indhold
    var maal = el('div', { class: 'sam-indhold' });
    rod.appendChild(maal);
    tegnIndhold();

    // Bund
    S.bundNode = el('footer', { class: 'sam-bund' });
    rod.appendChild(S.bundNode);
    tegnBund();
    rod.appendChild(el('p', { class: 'kilde', text: 'Baseret på LA2 og LA2u, Sopra (www.sopra.dk)' }));
  }

  function valgOptions(sel, valgt){
    S.planer.forEach(function(p){
      if(S.tab === 'laering' && S.gruppe && p.episode_group_id !== S.gruppe) return;
      var vs = S.versioner[p.id] || [];
      if(!vs.length) return;
      var g = el('optgroup', { label: planNavn(p) + (p.status === 'arkiv' ? ' (arkiveret)' : '') });
      vs.forEach(function(v){
        var o = el('option', {
          value: p.id + '|' + v.version_no,
          text: planNavn(p) + ' · version ' + v.version_no + ' · ' + datoAar(v.edited_at) + (v.is_draft ? ' · udkast' : '')
        });
        if(valgt && valgt.planId === p.id && valgt.versionNo === v.version_no) o.selected = true;
        g.appendChild(o);
      });
      sel.appendChild(g);
    });
  }

  function parsValg(tekst){
    var d = String(tekst).split('|');
    var vs = S.versioner[d[0]] || [];
    var v = vs.filter(function(x){ return String(x.version_no) === d[1]; })[0];
    return v ? { planId: d[0], versionNo: v.version_no, versionId: v.id } : null;
  }

  function valgBjaelke(){
    var bjaelke = el('div', { class: 'sam-valgbjaelke' });

    // Læringsplaner: først episoden
    if(S.tab === 'laering'){
      var epSel = el('select', { 'aria-label': 'Episode' });
      S.episoder.forEach(function(e){
        var d = e.dato ? U().lokalDato(e.dato) : null;
        var o = el('option', { value: e.group,
          text: (e.titel || 'Uden titel') + (d ? ' · ' + U().kortDato(d) + ' ' + d.getFullYear() : '') });
        if(e.group === S.gruppe) o.selected = true;
        epSel.appendChild(o);
      });
      epSel.addEventListener('change', function(){
        var overgang = gemAlt();
        overgang.then(function(){
          S.gruppe = epSel.value;
          vaelgStandard();
          indlaesValg().then(tegnAlt).catch(function(e){ kast(e); });
        });
      });
      bjaelke.appendChild(el('label', { class: 'felt sam-valg-felt' }, [el('span', { text: 'Episode' }), epSel]));
    }

    function lavSelect(etiket, hvilken){
      var sel = el('select', { 'aria-label': etiket });
      valgOptions(sel, hvilken === 'left' ? S.leftValg : S.rightValg);
      sel.addEventListener('change', function(){
        var v = parsValg(sel.value);
        if(!v) return;
        gemAlt().then(function(){
          if(hvilken === 'left') S.leftValg = v; else S.rightValg = v;
          indlaesValg().then(tegnAlt).catch(function(e){ kast(e); });
        });
      });
      return el('label', { class: 'felt sam-valg-felt' }, [el('span', { text: etiket }), sel]);
    }

    bjaelke.appendChild(lavSelect('Venstre', 'left'));
    bjaelke.appendChild(el('span', { class: 'sam-mod', 'aria-hidden': 'true', text: 'mod' }));
    bjaelke.appendChild(lavSelect('Højre', 'right'));

    if(S.visning !== 'tabel') return bjaelke;

    var cb = el('input', { type: 'checkbox', id: 'samKunForskelle' });
    cb.checked = !!S.kunForskelle;
    cb.addEventListener('change', function(){
      S.kunForskelle = cb.checked;
      tegnTabel(S.rod.querySelector('.sam-indhold'));
    });
    bjaelke.appendChild(el('label', { class: 'sam-afkryds', for: 'samKunForskelle' }, [cb, el('span', { text: 'Vis kun forskelle' })]));
    return bjaelke;
  }

  // Standardvalg: Min/Din til venstre, fagprofessionel til højre
  function vaelgStandard(){
    var kandidater = S.planer.filter(function(p){
      if(S.tab === 'laering' && S.gruppe) return p.episode_group_id === S.gruppe;
      return true;
    });
    function bedst(fag){
      var liste = kandidater.filter(function(p){ return erFag(p) === fag; });
      var levende = liste.filter(function(p){ return p.status !== 'arkiv'; });
      return (levende[0] || liste[0]) || null;
    }
    var b = bedst(false);
    var f = bedst(true);
    S.leftValg = b ? standardVersion(b.id) : null;
    S.rightValg = f ? standardVersion(f.id) : null;
  }

  function vis(ctx, rid, tab, gruppe){
    mvLuk();
    if(S && S.timer) gemAlt();           // aflever evt. afventende gem fra forrige sammenligning
    var rod = el('div', { class: 'sammenlign' }, [el('div', { class: 'indlaeser', text: 'Henter planer…' })]);
    ctx.visIRod(rod);

    S = {
      ctx: ctx, rod: rod, tab: tab, gruppe: gruppe || null,
      resident: null, navn: '', farve: '',
      planer: [], versioner: {}, episoder: [],
      leftValg: null, rightValg: null, left: null, right: null,
      noter: {}, dirty: {}, timer: null, gemmer: null,
      visning: 'tabel', felt: null, faelles: [], opKaede: Promise.resolve(), fokus: null,
      kunForskelle: false, bundNode: null, statusNode: null, statusTekst: '', statusFejl: false
    };
    var mit = S;

    Promise.all([D.residents(), D.plansForResident(rid, tab, false)]).then(function(r){
      if(S !== mit) return null;
      var res = r[0].filter(function(x){ return x.resident_id === rid; })[0];
      if(!res) throw new Error('Beboeren blev ikke fundet');
      mit.resident = res;
      mit.navn = res.beboere ? res.beboere.navn : 'Ukendt';
      mit.farve = res.beboere ? res.beboere.farve : '';
      mit.planer = r[1];
      return Promise.all(mit.planer.map(function(p){
        return D.versions(p.id).then(function(vs){ mit.versioner[p.id] = vs; });
      }));
    }).then(function(){
      if(S !== mit) return null;

      if(tab === 'laering'){
        var g = {};
        mit.planer.forEach(function(p){
          var k = p.episode_group_id || p.id;
          if(!g[k]) g[k] = { group: k, titel: p.title, dato: p.episode_date, harBegge: { b: false, f: false } };
          if(erFag(p)) g[k].harBegge.f = true; else g[k].harBegge.b = true;
        });
        mit.episoder = Object.keys(g).map(function(k){ return g[k]; })
          .sort(function(a, b){
            var ab = (a.harBegge.b && a.harBegge.f) ? 1 : 0, bb = (b.harBegge.b && b.harBegge.f) ? 1 : 0;
            if(ab !== bb) return bb - ab;
            return (b.dato || '').localeCompare(a.dato || '');
          });
        if(!mit.gruppe || !g[mit.gruppe]) mit.gruppe = mit.episoder.length ? mit.episoder[0].group : null;
      }

      vaelgStandard();
      return indlaesValg();
    }).then(function(){
      if(S !== mit) return;
      tegnAlt();
    }).catch(function(e){
      if(S !== mit) return;
      if(kast(e)) return;
      tom(rod);
      rod.appendChild(el('div', { class: 'besked fejl', text: 'Kunne ikke hente sammenligningen. Prøv igen om lidt.' }));
    });

    return { opdater: function(){ return Promise.resolve(); } };   // ingen polling: ændringer gemmes straks
  }

  function afslut(){
    mvLuk();
    if(S && (S.timer || Object.keys(S.dirty).length)) gemAlt();
  }

  // Mødenoter til sidepanelet på planens side
  function moedeFor(rid, tab){
    if(!moede) return null;
    if(moede.rid !== rid) return null;
    if(moede.tab !== tab) return null;
    return moede;
  }

  function nulstilMoede(){ moede = null; }

  return { vis: vis, afslut: afslut, moedeFor: moedeFor, nulstilMoede: nulstilMoede };
})();
