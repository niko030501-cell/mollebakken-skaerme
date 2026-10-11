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
      return indlaesNoter();
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
  // Siden
  // ---------------------------------------------------------------

  function tegnAlt(){
    var rod = S.rod;
    tom(rod);
    var tpl = T.plans[S.tab];
    var visningNavn = 'Tabel';

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
        el('button', { type: 'button', class: 'segment aktiv', 'aria-pressed': 'true', text: 'Tabel' }),
        el('button', { type: 'button', class: 'segment', disabled: true, text: 'Tre bunker', title: 'Kommer i en senere del' }),
        el('button', { type: 'button', class: 'segment', disabled: true,
          text: 'Kurver', title: S.tab === 'laering' ? 'Kommer i en senere del' : 'Kun for læringsplaner' })
      ]),
      S.tab !== 'laering' ? el('span', { class: 'sam-hjaelp', text: 'Kurver: kun for læringsplaner' }) : null
    ]));

    // Vælg hvad der sammenlignes
    rod.appendChild(valgBjaelke());

    // Indhold
    var maal = el('div', { class: 'sam-indhold' });
    rod.appendChild(maal);
    tegnTabel(maal);

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
    if(S && S.timer) gemAlt();           // aflever evt. afventende gem fra forrige sammenligning
    var rod = el('div', { class: 'sammenlign' }, [el('div', { class: 'indlaeser', text: 'Henter planer…' })]);
    ctx.visIRod(rod);

    S = {
      ctx: ctx, rod: rod, tab: tab, gruppe: gruppe || null,
      resident: null, navn: '', farve: '',
      planer: [], versioner: {}, episoder: [],
      leftValg: null, rightValg: null, left: null, right: null,
      noter: {}, dirty: {}, timer: null, gemmer: null,
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
