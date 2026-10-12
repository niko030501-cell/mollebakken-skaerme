// ==================================================================
// LA2 — ALLE plantyper og spørgsmål ligger i denne ene fil.
// Ret spørgsmål her; resten af koden skal ikke røres.
//
// Opbygning
//   t(min, din, fag)  tekst på de tre "sprog":
//       min = borgerens eget indefra-perspektiv (LA2 med tekst, LA2u med tekst og billeder)
//       din = tilstræbt indefra-perspektiv, TIP (personalets bud på borgerens oplevelse)
//       fag = fagprofessionelt perspektiv
//     Sæt et felt til null for at skjule spørgsmålet i det perspektiv.
//   type: 'text' (fritekst) eller 'list' (liste af punkter)
//   id'er (sektion/spørgsmål/kolonne) bruges som nøgler i de gemte svar.
//   ÆNDR ELLER GENBRUG ALDRIG et eksisterende id — så ville gamle svar
//   ikke længere kunne vises. Tilføj nye id'er i stedet for at omdøbe.
//
// Spørgsmål markeret "TODO: tjek mod Sopras PDF" er første udkast og
// skal rettes til efter Sopras officielle materiale.
// ==================================================================
window.LA2Templates = (function(){
  'use strict';

  function t(min, din, fag){
    return { min: min, din: din, fag: fag };
  }

  // Ét trivselsniveau med de fire kolonners felter (se plans.trivsel).
  // id'erne gor/maerker/baro/strategi/tilgang ændres ALDRIG.
  function trivselsNiveau(id, level, navn, strategiTekst){
    return {
      id: id, level: level, levelLabel: navn,
      heading: t(navn, navn, navn),
      questions: [
        { id: 'gor', type: 'list', gruppe: 'Vi ser, borgeren gør',
          text: t('Det gør jeg:', 'Det gør du mon:', 'Vi ser, borgeren gør:') },
        { id: 'maerker', type: 'list', gruppe: 'Vi antager, borgeren mærker',
          text: t('Det mærker jeg:', 'Det mærker du mon:', 'Vi antager, borgeren mærker:') },
        // TODO: Nikolaj bekræfter, hvad feltet ved barometeret bruges til
        { id: 'baro', type: 'text', gruppe: 'Felt ved barometeret',
          text: t(navn, navn, navn) },
        { id: 'strategi', type: 'list', gruppe: 'Borgerens strategier',
          text: strategiTekst },
        { id: 'tilgang', type: 'list', gruppe: 'Fælles faglige tilgange',
          text: t('I kan støtte mig ved at:', 'Vi kan støtte dig ved at:', 'Vi kan støtte borgeren ved at:') }
      ]
    };
  }

  // Én fase i Tryghedsplanen (felterne hentes fra tpl.felter/grupper).
  // `questions` bruges af Sammenlign og print; formularen læser tpl.grupper.
  function tryghedsFase(id, navn, langtNavn){
    var felter = {
      gor:     { type: 'list', gruppe: 'Adfærd: gør',            text: t('Jeg gør:', 'Du gør mon:', 'Borgeren gør:') },
      maerker: { type: 'list', gruppe: 'Tilstand: mærker',       text: t('Jeg mærker:', 'Du mærker mon:', 'Vi antager, borgeren mærker:') },
      meremed: { type: 'list', gruppe: 'Støtte: gør mere af',    text: t('Gør mere af:', 'Vi gør mere af:', 'Vi gør mere af:') },
      lad:     { type: 'list', gruppe: 'Støtte: lad være med',   text: t('Lad være med:', 'Vi lader være med:', 'Vi lader være med:') },
      kan:     { type: 'list', gruppe: 'Mestring: kan',          text: t('Jeg kan:', 'Du kan mon:', 'Vi kan støtte borgeren ved at:') }
    };
    return {
      id: id, level: id, levelLabel: navn, langtNavn: langtNavn,
      heading: t(langtNavn, langtNavn, langtNavn),
      questions: ['gor', 'maerker', 'meremed', 'lad', 'kan'].map(function(fid){
        return { id: fid, type: felter[fid].type, gruppe: felter[fid].gruppe, text: felter[fid].text };
      })
    };
  }

  // Ét niveau i Mestringsplanen. id'erne strategi/netvaerk/andet ændres ALDRIG.
  function mestringsNiveau(id, level, navn){
    return {
      id: id, level: level, levelLabel: navn,
      heading: t(navn, navn, navn),
      questions: [
        { id: 'strategi', type: 'list', gruppe: 'Mestringsstrategier',
          text: t('Mine mestringsstrategier', 'Dine mestringsstrategier (mon)', 'Borgerens mestringsstrategier') },
        { id: 'netvaerk', type: 'list', gruppe: 'Støtte fra netværket',
          text: t('Støtte fra netværket', 'Støtte fra netværket', 'Støtte fra netværket') },
        { id: 'andet', type: 'list', gruppe: 'Andet hjælpsomt',
          text: t('Andet som kan være hjælpsomt', 'Andet som mon kan være hjælpsomt', 'Andet som kan være hjælpsomt') }
      ]
    };
  }

  var KILDE = {
    tekst: 'Baseret på LA2 og LA2u, Sopra',
    url: 'https://www.sopra.dk',
    visUrl: 'www.sopra.dk'
  };

  // Rækkefølgen her er rækkefølgen på fanerne på beboerens side
  var FANER = [
    { id: 'trivsel',    label: 'Trivsel' },
    { id: 'tryghed',    label: 'Tryghed' },
    { id: 'laering',    label: 'Læring' },
    { id: 'mestring',   label: 'Mestring' },
    { id: 'trivselsoeer', label: 'Trivselsøer' },
    { id: 'haab_droem', label: 'Håb og drømme' }
  ];

  var plans = {

    // ---------------------------------------------------------------
    // TRIVSELSPLAN (forebyggelse): tre trivselsniveauer, læses nedefra og op
    // (som et barometer). For hvert niveau fire kolonner:
    //   1 Borgerens tegn (gor + maerker)  2 Feltet ved barometeret (baro)
    //   3 Borgerens strategier (strategi) 4 Fælles faglige tilgange (tilgang)
    // Mellem niveauerne: "Linje for sårbar trivsel" og "Linje for mistrivsel".
    // Nye id'er; de gamle (trives.*, hverdag.*, svaert.*, stoette.*) ligger
    // stadig i gemte planer og vises som "Fra tidligere version" (se legacy).
    // ---------------------------------------------------------------
    trivsel: {
      kind: 'barometer',
      title: 'Trivselsplan',
      fase: 'Forebyggelse',
      // TODO: tjek mod Sopras PDF (kolonneoverskrifter og Min/Din-tekster er mine udkast)
      kolonner: {
        tegn:     t('Mine tegn', 'Dine tegn', 'Borgerens tegn'),
        baro:     t('Felt ved barometeret', 'Felt ved barometeret', 'Felt ved barometeret'),
        strategi: t('Mine strategier', 'Dine strategier', 'Borgerens strategier'),
        tilgang:  t('Det kan vi gøre sammen', 'Det kan vi gøre sammen', 'Fælles faglige tilgange')
      },
      // LA2u: billede ved hvert spørgsmål (nøgler i la2u-billeder.js) og ansigt ved hvert niveau
      billeder: { gor: 'aktivitet_gaatur', maerker: 'foelelse_okay', baro: 'person_mig',
                  strategi: 'hjaelp_ro_og_plads', tilgang: 'hjaelp_vaer_hos_mig' },
      ansigter: { trivsel: 'foelelse_glad', saarbar: 'foelelse_urolig', mistrivsel: 'foelelse_ked' },
      graenser: {
        saarbar:   'Linje for sårbar trivsel',   // mellem niveau 1 og 2
        mistrivsel: 'Linje for mistrivsel'       // mellem niveau 2 og 3
      },
      sections: [
        trivselsNiveau('trivsel', 'groen', 'Trivsel',
          t('Jeg holder min trivsel ved at:', 'Du holder mon din trivsel ved at:', 'Borgeren opretholder sin trivsel ved at:')),
        trivselsNiveau('saarbar', 'gul', 'Sårbar trivsel',
          t('Jeg klarer det ved at:', 'Du klarer det mon ved at:', 'Borgeren mestrer ved at:')),
        trivselsNiveau('mistrivsel', 'roed', 'Mistrivsel',
          t('Jeg klarer det ved at:', 'Du klarer det mon ved at:', 'Borgeren mestrer ved at:'))
      ],
      // Svar fra den gamle opbygning (vises skrivebeskyttet, flyttes ikke automatisk)
      legacy: [
        { key: 'trives.trives',   label: t('Det får mig til at trives', 'Det får dig mon til at trives', 'Det vi ved får borgeren til at trives') },
        { key: 'hverdag.godDag',  label: t('Min hverdag', 'Din hverdag', 'Borgerens hverdag') },
        { key: 'svaert.svaert',   label: t('Det kan gøre det svært', 'Det kan mon gøre det svært for dig', 'Det kan gøre det svært for borgeren') },
        { key: 'stoette.stoette', label: t('Sådan kan du hjælpe mig', 'Sådan kan vi mon hjælpe dig', 'Sådan støtter vi borgerens trivsel') }
      ]
    },

    // ---------------------------------------------------------------
    // TRYGHEDSPLAN (håndtering): tre faser i en episode (affektkurve)
    //   øverst: Udløsende årsager + en fast affektkurve (illustration)
    //   skema: tre faser som kolonner, tre grupper som rækker
    // id'er: sektion = udloesende | optrapning | kaos | stabilisering,
    //        felt   = aarsager | gor | maerker | meremed | lad | kan
    // De gamle felter (groen/gul/roed) vises som "Fra tidligere version".
    // ---------------------------------------------------------------
    tryghed: {
      kind: 'faser',
      title: 'Tryghedsplan',
      fase: 'Håndtering',
      // TODO: tjek mod Sopras PDF (felttekster i Min/Din/Fagprofessionel er mine udkast)
      udloesende: {
        id: 'udloesende',
        heading: t('Udløsende årsager', 'Udløsende årsager', 'Udløsende årsager'),
        question: { id: 'aarsager', type: 'text', gruppe: 'Udløsende årsager',
          text: t('Udløsende årsager:', 'Udløsende årsager (mon):', 'Udløsende årsager:') }
      },
      billeder: { aarsager: 'signal_stop', gor: 'aktivitet_gaatur', maerker: 'foelelse_urolig',
                  meremed: 'hjaelp_vaer_hos_mig', lad: 'hjaelp_tal_stille', kan: 'hjaelp_ro_og_plads' },
      // grupperne er rækkerne i skemaet; felterne står i rækkefølge
      grupper: [
        { id: 'adfaerd', label: t('Min adfærd og mine tilstande', 'Din adfærd og dine tilstande (mon)', 'Borgerens adfærd og tilstande'),
          felter: ['gor', 'maerker'] },
        { id: 'stoette', label: t('Fagprofessionel støtte', 'Fagprofessionel støtte', 'Fagprofessionel støtte'),
          felter: ['meremed', 'lad'] },
        { id: 'mestring', label: t('Mine mestringsstrategier', 'Dine mestringsstrategier (mon)', 'Borgerens mestringsstrategier'),
          felter: ['kan'] }
      ],
      sections: [
        tryghedsFase('optrapning', 'Optrapning', 'Optrapningsfase'),
        tryghedsFase('kaos', 'Kaos', 'Kaosfase'),
        tryghedsFase('stabilisering', 'Stabilisering', 'Stabiliseringsfase')
      ],
      // Svar fra den gamle opbygning (grøn/gul/rød)
      legacy: [
        { key: 'groen.tegn',      label: t('Grøn · Tegn', 'Grøn · Tegn', 'Grøn · Tegn') },
        { key: 'groen.handling',  label: t('Grøn · Hvad gør vi', 'Grøn · Hvad gør vi', 'Grøn · Hvad gør vi') },
        { key: 'groen.headline',  label: t('Grøn · Overskrift', 'Grøn · Overskrift', 'Grøn · Overskrift') },
        { key: 'gul.tegn',        label: t('Gul · Tegn', 'Gul · Tegn', 'Gul · Tegn') },
        { key: 'gul.handling',    label: t('Gul · Hvad gør vi', 'Gul · Hvad gør vi', 'Gul · Hvad gør vi') },
        { key: 'gul.headline',    label: t('Gul · Overskrift', 'Gul · Overskrift', 'Gul · Overskrift') },
        { key: 'roed.tegn',       label: t('Rød · Tegn', 'Rød · Tegn', 'Rød · Tegn') },
        { key: 'roed.handling',   label: t('Rød · Hvad gør vi', 'Rød · Hvad gør vi', 'Rød · Hvad gør vi') },
        { key: 'roed.headline',   label: t('Rød · Overskrift', 'Rød · Overskrift', 'Rød · Overskrift') }
      ]
    },

    // ---------------------------------------------------------------
    // LÆRINGSPLAN — to kolonner, fire rækker, plus trivsels-/affektkurve
    // Rækker med perColumn:false har ét samlet felt (ikke pr. kolonne).
    // ---------------------------------------------------------------
    laering: {
      kind: 'laering',
      title: 'Læringsplan',
      fase: 'Læring',
      // LA2u: billede ved hvert spørgsmål; ansigter vælges ved "Hvordan havde du det?"
      billeder: { 'forloeb.q1': 'aktivitet_gaatur', 'forloeb.q2': 'person_mig',
                  'stoette.q1': 'person_personale', 'stoette.q2': 'signal_nej',
                  'mestring.q1': 'hjaelp_ro_og_plads', 'mestring.q3': 'signal_ja', 'mestring.q2': 'hjaelp_hjaelp',
                  'fremad.q1': 'hjaelp_sig_det_i_god_tid' },
      foelelser: ['forloeb.q2'],
      // label er den neutrale tekst (Sammenlign); labelT/headingT følger perspektivet
      columns: [
        { id: 'foer',    label: 'Perioden op til episoden',
          labelT: t('Mine oplevelser af perioden op til episoden',
                    'Dine oplevelser (mon) af perioden op til episoden',
                    'Borgerens oplevelser af perioden op til episoden') },
        { id: 'episode', label: 'Selve episoden',
          labelT: t('Mine oplevelser af episoden',
                    'Dine oplevelser (mon) af episoden',
                    'Borgerens oplevelser af episoden') }
      ],
      rows: [
        {
          id: 'forloeb', heading: 'Forløb', perColumn: true,
          headingT: t('Forløb', 'Forløb', 'Forløb'),
          questions: [
            { id: 'q1', type: 'text',
              text: t('Hvad oplevede du, der skete?',
                      'Hvad mon du oplevede, at der skete?',
                      'Hvad oplevede vi, der skete?') },
            { id: 'q2', type: 'text',
              text: t('Hvordan havde du det? Og hvorfor?',
                      'Hvordan mon du havde det? Og hvorfor?',
                      'Hvilke antagelser har vi om, hvordan borgeren havde det? Og hvorfor?') }
          ]
        },
        {
          id: 'stoette', heading: 'Fagprofessionel støtte/netværksstøtte', perColumn: true,
          headingT: t('Fagprofessionel støtte/netværksstøtte',
                      'Fagprofessionel støtte/netværksstøtte',
                      'Fagprofessionel støtte/netværksstøtte'),
          questions: [
            { id: 'q1', type: 'text',
              text: t('Hvad gjorde de fagprofessionelle/netværket, som var hjælpsomt?',
                      'Hvad mon de fagprofessionelle/netværket gjorde, som var hjælpsomt for dig?',
                      'Hvad gjorde vi, som vi oplevede, var hjælpsomt for borgeren?') },
            { id: 'q2', type: 'text',
              text: t('Hvad gjorde de fagprofessionelle/netværket, som ikke var hjælpsomt?',
                      'Hvad mon de fagprofessionelle/netværket gjorde, som ikke var hjælpsomt for dig?',
                      'Hvad gjorde vi, som vi oplevede, ikke var hjælpsomt for borgeren?') }
          ]
        },
        {
          id: 'mestring', heading: 'Mestringsstrategier', perColumn: true,
          headingT: t('Mine mestringsstrategier', 'Dine mestringsstrategier (mon)', 'Borgerens mestringsstrategier'),
          questions: [
            { id: 'q1', type: 'text',
              text: t('Hvad gjorde du for at klare situationen?',
                      'Hvad gjorde du mon for at klare situationen?',
                      'Hvad gjorde borgeren for at klare situationen?') },
            { id: 'q3', type: 'text',
              text: t('Hvordan virkede det?',
                      'Hvordan mon du oplevede, at det virkede?',
                      'Hvordan virkede det for borgeren?') },
            { id: 'q2', type: 'text',
              text: t('Hvad har du andre gange gjort, som var hjælpsomt for dig?',
                      'Hvad har du mon andre gange gjort, som var hjælpsomt for dig?',
                      'Hvordan har vi tidligere støttet borgeren i at anvende sine mestringsstrategier?') }
          ]
        },
        {
          id: 'fremad', heading: 'Fremadrettet', perColumn: false,
          headingT: t('Fremadrettet', 'Fremadrettet', 'Fremadrettet'),
          questions: [
            { id: 'q1', type: 'text',
              text: t('Hvad ønsker du, vi gør fremadrettet?',
                      'Hvad vil du mon ønske, at vi gør fremadrettet?',
                      'Hvad vil borgeren mon ønske, vi gør fremadrettet?') },
            { id: 'q2', type: 'text',
              text: t(null, null, 'Hvad vil vi gøre fremadrettet?') }
          ]
        }
      ],

      // Trivsels- og affektkurve: 1-5 på hvert tidspunkt (7 faste tidspunkter)
      curve: {
        // TODO: tjek mod Sopras PDF (tidspunkter og skala er mit første udkast)
        title: 'Trivsels- og affektkurve',
        hint: 'Hvor slemt var det på hvert tidspunkt? 1 = roligt, 5 = meget slemt.',
        // hintT følger perspektivet (Min: "Vis hvordan du havde det …")
        hintT: t('Vis hvordan du havde det: vælg et niveau for hvert tidspunkt. 1 = roligt, 5 = meget slemt.',
                 'Vis hvordan du mon havde det: vælg et niveau for hvert tidspunkt. 1 = roligt, 5 = meget slemt.',
                 'Hvor slemt var det på hvert tidspunkt? 1 = roligt, 5 = meget slemt.'),
        min: 1,
        max: 5,
        // 7 faste tidspunkter (samme i begge perspektiver, så kurverne kan lægges oven i hinanden)
        episodeIndex: 4,
        points: [
          { id: 'p1', label: '3 dage før',   short: ['3 dage', 'før'] },
          { id: 'p2', label: '2 dage før',   short: ['2 dage', 'før'] },
          { id: 'p3', label: 'Dagen før',    short: ['Dagen', 'før'] },
          { id: 'p4', label: 'Samme morgen', short: ['Samme', 'morgen'] },
          { id: 'p5', label: 'Episoden',     short: ['Episoden'] },
          { id: 'p6', label: 'Lige efter',   short: ['Lige', 'efter'] },
          { id: 'p7', label: 'Næste dag',    short: ['Næste', 'dag'] }
        ]
      }
    },

    // ---------------------------------------------------------------
    // MESTRINGSPLAN: tre niveauer oven over hinanden (barometer + ansigt),
    // tre kolonner pr. niveau: strategi · netvaerk · andet.
    // id'er: sektion = trivsel | saarbar | mistrivsel, felt = strategi | netvaerk | andet
    // Gamle svar (selv.*, virker.*, hjaelp.*) vises som "Fra tidligere version".
    // ---------------------------------------------------------------
    mestring: {
      kind: 'mestring',
      title: 'Mestringsplan',
      fase: 'Forebyggelse',
      // TODO: Nikolaj bekræfter navnene på niveauerne (papirplanen viser kun ansigter)
      // TODO: tjek mod Sopras PDF (kolonneoverskrifter i Din og Fagprofessionel)
      kolonner: {
        strategi: t('Mine mestringsstrategier', 'Dine mestringsstrategier (mon)', 'Borgerens mestringsstrategier'),
        netvaerk: t('Støtte fra netværket', 'Støtte fra netværket', 'Støtte fra netværket'),
        andet:    t('Andet som kan være hjælpsomt', 'Andet som mon kan være hjælpsomt', 'Andet som kan være hjælpsomt')
      },
      billeder: { strategi: 'person_mig', netvaerk: 'person_flere', andet: 'hjaelp_hjaelp' },
      // ansigt og kolonneikoner (nøgler i la2u-billeder.js)
      ansigter: { trivsel: 'foelelse_glad', saarbar: 'foelelse_okay', mistrivsel: 'foelelse_ked' },
      ikoner: { strategi: 'person_mig', netvaerk: 'person_flere', andet: 'hjaelp_hjaelp' },
      sections: [
        mestringsNiveau('trivsel', 'groen', 'Trivsel'),
        mestringsNiveau('saarbar', 'gul', 'Sårbar trivsel'),
        mestringsNiveau('mistrivsel', 'roed', 'Mistrivsel')
      ],
      legacy: [
        { key: 'selv.selv', label: t('Det kan jeg selv gøre', 'Det kan du mon selv gøre', 'Det kan borgeren selv gøre') },
        { key: 'virker.virker', label: t('Det virker for mig', 'Det virker mon for dig', 'Det virker for borgeren') },
        { key: 'virker.virkerIkke', label: t('Hvad hjælper ikke?', 'Hvad hjælper mon ikke?', 'Hvad hjælper ikke for borgeren?') },
        { key: 'hjaelp.bede', label: t('Når jeg har brug for hjælp', 'Når du mon har brug for hjælp', 'Når borgeren har brug for hjælp') }
      ]
    },

    // ---------------------------------------------------------------
    // TRIVSELSØER: aktiviteter, fællesskaber, steder eller relationer, hvor
    // man lader op. Op til 5 øer + refleksion. Hører til Forebyggelse.
    // id'er: oeN.navn | hvor | hvad | hvem | hvordan | billede | kan.trivsel |
    //        kan.saarbar | kan.mistrivsel (N = 1-5), refleksion.fri
    // ---------------------------------------------------------------
    trivselsoeer: {
      kind: 'oeer',
      title: 'Trivselsøer',
      fase: 'Forebyggelse',
      maxOeer: 5,
      // TODO: tjek mod Sopras PDF (teksterne er skrevet med egne ord)
      intro: t('En trivselsø er et sted, en aktivitet, et fællesskab eller en person, hvor jeg lader op og får det godt. ' +
               'Den kan være kort eller lang, rolig eller aktiv, og jeg kan være der alene eller sammen med andre. ' +
               'Her kan jeg skrive om mine trivselsøer.',
               'En trivselsø er et sted, en aktivitet, et fællesskab eller en person, hvor du mon lader op og får det godt. ' +
               'Den kan være kort eller lang, rolig eller aktiv, og du kan være der alene eller sammen med andre.',
               'En trivselsø er et sted, en aktivitet, et fællesskab eller en relation, hvor borgeren lader op og får trivsel. ' +
               'Den kan være kort eller lang, rolig eller aktiv, og borgeren kan være der alene eller sammen med andre.'),
      billeder: { hvor: 'sted_ude', hvad: 'aktivitet_musik', hvem: 'person_flere', hvordan: 'foelelse_glad' },
      foelelser: ['hvordan'],
      oeNavn: t('Navn på øen', 'Navn på øen', 'Navn på øen'),
      oeFelter: [
        { id: 'hvor',    label: t('Hvor er jeg?', 'Hvor er du mon?', 'Hvor er borgeren?') },
        { id: 'hvad',    label: t('Hvad laver jeg?', 'Hvad laver du mon?', 'Hvad laver borgeren?') },
        { id: 'hvem',    label: t('Hvem er jeg sammen med?', 'Hvem er du mon sammen med?', 'Hvem er borgeren sammen med?') },
        { id: 'hvordan', label: t('Hvordan opleves det at være der?', 'Hvordan oplever du mon det at være der?', 'Hvordan oplever borgeren det at være der?') }
      ],
      besoegSpoergsmaal: t('Kan jeg besøge den, når jeg er i:', 'Kan du besøge den, når du mon er i:', 'Kan borgeren besøge den, når borgeren er i:'),
      besoeg: [
        { id: 'trivsel',    label: 'Trivsel' },
        { id: 'saarbar',    label: 'Sårbar trivsel' },
        { id: 'mistrivsel', label: 'Mistrivsel' }
      ],
      refleksion: {
        overskrift: t('Hvilke tanker har øvelsen sat i gang?', 'Hvilke tanker har øvelsen mon sat i gang?', 'Hvilke tanker har øvelsen sat i gang?'),
        spoergsmaal: [
          t('Hvilken betydning har trivselsøerne for mit liv?', 'Hvilken betydning har trivselsøerne mon for dit liv?', 'Hvilken betydning har trivselsøerne for borgerens liv?'),
          t('Kender jeg den gode vej til mine trivselsøer?', 'Kender du mon den gode vej til dine trivselsøer?', 'Kender borgeren den gode vej til sine trivselsøer?'),
          t('Er det en fordel at have en rejsemakker, eller er det bedst at rejse alene?', 'Er det mon en fordel for dig at have en rejsemakker, eller er det bedst at rejse alene?', 'Er det en fordel for borgeren at have en rejsemakker, eller er det bedst at rejse alene?'),
          t('Er der trivselsøer, jeg tidligere har besøgt, som jeg kunne begynde at besøge igen?', 'Er der trivselsøer, du mon tidligere har besøgt, som du kunne begynde at besøge igen?', 'Er der trivselsøer, borgeren tidligere har besøgt, som borgeren kunne begynde at besøge igen?'),
          t('Hvad/hvem kan hjælpe mig med at værne om mine trivselsøer?', 'Hvad/hvem kan mon hjælpe dig med at værne om dine trivselsøer?', 'Hvad/hvem kan hjælpe borgeren med at værne om borgerens trivselsøer?')
        ],
        fri: t('Mine tanker', 'Dine tanker (mon)', 'Vores tanker')
      },
      sections: []     // bruges ikke; formularen bygges ud fra oeFelter/refleksion
    },

    // ---------------------------------------------------------------
    // HÅB OG DRØMME
    // ---------------------------------------------------------------
    haab_droem: {
      kind: 'standard',
      title: 'Håb og drømme',
      fase: 'Forebyggelse',
      sections: [
        {
          id: 'droemme',
          heading: t('Mine drømme', 'Dine drømme', 'Borgerens drømme'),
          questions: [
            { id: 'droemme', type: 'list',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad drømmer jeg om?',
                      'Hvad drømmer du mon om?',
                      'Hvad drømmer borgeren om?') }
          ]
        },
        {
          id: 'haab',
          heading: t('Mit håb', 'Dit håb', 'Borgerens håb'),
          questions: [
            { id: 'haab', type: 'text',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad håber jeg på det næste år?',
                      'Hvad håber du mon på det næste år?',
                      'Hvad håber borgeren på det næste år?') }
          ]
        },
        {
          id: 'skridt',
          heading: t('Et skridt nærmere', 'Et skridt nærmere', 'Et skridt nærmere'),
          questions: [
            { id: 'skridt', type: 'text',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad skal der til, for at jeg kommer et skridt nærmere?',
                      'Hvad skal der mon til, for at du kommer et skridt nærmere?',
                      'Hvad skal der til, for at borgeren kommer et skridt nærmere, og hvad kan vi bidrage med?') }
          ]
        }
      ]
    }
  };

  // key = 'min' | 'din' | 'fag'. 'din' falder tilbage til 'min' hvis der
  // ikke er en særskilt tekst.
  function tekst(obj, key){
    if(!obj) return null;
    var v = obj[key];
    if((v === undefined) && key === 'din') v = obj.min;
    return v === undefined ? null : v;
  }

  // Valgfrie undersøgelsesark til TIP (Din-planer). Svarene gemmes i content.a
  // under nøglerne tip.ark1 … tip.ark5. Ret ALDRIG en eksisterende key.
  // TODO: tjek mod Sopras PDF (metodehåndbog om TIP)
  var tipArk = {
    titel: 'Undersøgelsesark til TIP (valgfrit)',
    hjaelp: 'Brug arkene, når I undersøger, hvordan borgeren oplever tingene. De er en støtte til planen og kan lades stå tomme.',
    felter: [
      { key: 'tip.ark1', label: 'Jeres iagttagelser af borgeren i konkrete situationer og samspil',
        hint: 'Hvad ser og hører vi? Kropssprog, lyde, adfærd og samspil.' },
      { key: 'tip.ark2', label: 'Jeres fornemmelser for borgerens indre tilstande',
        hint: 'Hvad tror vi, borgeren mærker eller oplever, ud fra det vi har set?' },
      { key: 'tip.ark3', label: 'Jeres erfaringer med borgeren i konkrete situationer',
        hint: 'Hvad har vi prøvet, og hvordan virkede det?' },
      { key: 'tip.ark4', label: 'Borgerens alternative udtryksformer',
        hint: 'Hvordan udtrykker borgeren sig, når det ikke er med ord?' },
      { key: 'tip.ark5', label: 'Planlægning af nærværende samspil med borgeren',
        hint: 'Hvordan vil vi være sammen med borgeren, så borgeren mærker nærvær?' }
    ]
  };

  return {
    kilde: KILDE,
    faner: FANER,
    plans: plans,
    tipArk: tipArk,
    tekst: tekst
  };
})();
