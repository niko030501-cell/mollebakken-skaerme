// ==================================================================
// LA2 — ALLE plantyper og spørgsmål ligger i denne ene fil.
// Ret spørgsmål her; resten af koden skal ikke røres.
//
// Opbygning
//   t(min, din, fag)  tekst på de tre "sprog":
//       min = borgerens indefra-perspektiv (variant LA2)
//       din = tilstræbt indefra-perspektiv (variant LA2u)
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
    { id: 'haab_droem', label: 'Håb og drømme' }
  ];

  var plans = {

    // ---------------------------------------------------------------
    // TRIVSELSPLAN (forebyggelse)
    // ---------------------------------------------------------------
    trivsel: {
      kind: 'standard',
      title: 'Trivselsplan',
      fase: 'Forebyggelse',
      sections: [
        {
          id: 'trives',
          heading: t('Det får mig til at trives', 'Det får dig mon til at trives', 'Det vi ved får borgeren til at trives'),
          questions: [
            { id: 'trives', type: 'list',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad får mig til at have det godt?',
                      'Hvad får dig mon til at have det godt?',
                      'Hvad ved vi får borgeren til at have det godt?') }
          ]
        },
        {
          id: 'hverdag',
          heading: t('Min hverdag', 'Din hverdag', 'Borgerens hverdag'),
          questions: [
            { id: 'godDag', type: 'text',
              // TODO: tjek mod Sopras PDF
              text: t('Hvordan ser en god dag ud for mig?',
                      'Hvordan ser en god dag mon ud for dig?',
                      'Hvordan ser en god dag ud for borgeren?') }
          ]
        },
        {
          id: 'svaert',
          heading: t('Det kan gøre det svært', 'Det kan mon gøre det svært for dig', 'Det kan gøre det svært for borgeren'),
          questions: [
            { id: 'svaert', type: 'list',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad kan gøre det svært for mig?',
                      'Hvad kan mon gøre det svært for dig?',
                      'Hvad ved vi kan gøre det svært for borgeren?') }
          ]
        },
        {
          id: 'stoette',
          heading: t('Sådan kan du hjælpe mig', 'Sådan kan vi mon hjælpe dig', 'Sådan støtter vi borgerens trivsel'),
          questions: [
            { id: 'stoette', type: 'list',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad kan de voksne gøre, så jeg har det godt?',
                      'Hvad kan vi mon gøre, så du har det godt?',
                      'Hvad gør vi for at støtte borgerens trivsel?') }
          ]
        }
      ]
    },

    // ---------------------------------------------------------------
    // TRYGHEDSPLAN (håndtering) — grøn / gul / rød
    // `level` styrer farve + tekstmærke (så det også kan ses i sort-hvid)
    // ---------------------------------------------------------------
    tryghed: {
      kind: 'tryghed',
      title: 'Tryghedsplan',
      fase: 'Håndtering',
      sections: [
        {
          id: 'groen', level: 'groen', levelLabel: 'Grøn',
          // TODO: tjek mod Sopras PDF
          heading: t('Grøn: Jeg har det godt', 'Grøn: Du har det mon godt', 'Grøn: Borgeren har det godt'),
          questions: [
            { id: 'tegn', type: 'text',
              text: t('Hvad mærker jeg, og hvad kan du se på mig?',
                      'Hvad mærker du mon, og hvad kan vi se på dig?',
                      'Hvad ser vi hos borgeren?') },
            { id: 'handling', type: 'text',
              text: t('Hvad gør jeg, og hvad gør du?',
                      'Hvad gør du mon, og hvad gør vi?',
                      'Hvad gør vi?') }
          ]
        },
        {
          id: 'gul', level: 'gul', levelLabel: 'Gul',
          // TODO: tjek mod Sopras PDF
          heading: t('Gul: Det begynder at blive svært', 'Gul: Det begynder mon at blive svært for dig', 'Gul: Det begynder at blive svært for borgeren'),
          questions: [
            { id: 'tegn', type: 'text',
              text: t('Hvad mærker jeg, og hvad kan du se på mig?',
                      'Hvad mærker du mon, og hvad kan vi se på dig?',
                      'Hvad ser vi hos borgeren?') },
            { id: 'handling', type: 'text',
              text: t('Hvad gør jeg, og hvad gør du?',
                      'Hvad gør du mon, og hvad gør vi?',
                      'Hvad gør vi?') }
          ]
        },
        {
          id: 'roed', level: 'roed', levelLabel: 'Rød',
          // TODO: tjek mod Sopras PDF
          heading: t('Rød: Det er meget svært', 'Rød: Det er mon meget svært for dig', 'Rød: Det er meget svært for borgeren'),
          questions: [
            { id: 'tegn', type: 'text',
              text: t('Hvad mærker jeg, og hvad kan du se på mig?',
                      'Hvad mærker du mon, og hvad kan vi se på dig?',
                      'Hvad ser vi hos borgeren?') },
            { id: 'handling', type: 'text',
              text: t('Hvad gør jeg, og hvad gør du?',
                      'Hvad gør du mon, og hvad gør vi?',
                      'Hvad gør vi?') }
          ]
        }
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
      columns: [
        { id: 'foer',    label: 'Perioden op til episoden' },
        { id: 'episode', label: 'Selve episoden' }
      ],
      rows: [
        {
          id: 'forloeb', heading: 'Forløb', perColumn: true,
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
          questions: [
            { id: 'q1', type: 'text',
              text: t('Hvad gjorde vi, som hjalp dig?',
                      'Hvad mon vi gjorde, som hjalp dig?',
                      'Hvad gjorde vi, som vi oplevede, var hjælpsomt for borgeren?') },
            { id: 'q2', type: 'text',
              text: t('Hvad gjorde vi, som ikke hjalp dig?',
                      'Hvad mon vi gjorde, som ikke hjalp dig?',
                      'Hvad gjorde vi, som vi oplevede, ikke var hjælpsomt for borgeren?') }
          ]
        },
        {
          id: 'mestring', heading: 'Mestringsstrategier', perColumn: true,
          questions: [
            { id: 'q1', type: 'text',
              text: t('Hvad gjorde du for at undgå at komme ud i det svære?',
                      'Hvad gjorde du mon for at mestre perioden op til episoden?',
                      'Hvad gjorde borgeren for at mestre perioden op til episoden?') },
            { id: 'q2', type: 'text',
              text: t('Hvad har du andre gange gjort?',
                      'Hvordan mon du oplevede, at det virkede?',
                      'Hvordan har vi tidligere støttet borgeren i at anvende sine mestringsstrategier?') }
          ]
        },
        {
          id: 'fremad', heading: 'Fremadrettet', perColumn: false,
          questions: [
            { id: 'q1', type: 'text',
              text: t('Hvad ønsker du, vi gør sammen næste gang?',
                      'Hvad vil du mon ønske, at vi gør næste gang?',
                      'Hvad vil borgeren mon ønske, vi gør næste gang?') },
            { id: 'q2', type: 'text',
              text: t(null, null, 'Hvad vil vi gøre næste gang?') }
          ]
        }
      ],

      // Trivsels- og affektkurve: 1-5 på hvert tidspunkt (6 tidspunkter)
      curve: {
        // TODO: tjek mod Sopras PDF (tidspunkter og skala er mit første udkast)
        title: 'Trivsels- og affektkurve',
        hint: 'Hvordan havde borgeren det? 1 = meget svært, 5 = det gik godt.',
        min: 1,
        max: 5,
        points: [
          { id: 'p1', label: 'Dagene før',                  short: ['Dagene', 'før'] },
          { id: 'p2', label: 'Dagen før',                   short: ['Dagen', 'før'] },
          { id: 'p3', label: 'Lige før episoden',           short: ['Lige før', 'episoden'] },
          { id: 'p4', label: 'Under episoden',              short: ['Under', 'episoden'] },
          { id: 'p5', label: 'Lige efter episoden',         short: ['Lige efter', 'episoden'] },
          { id: 'p6', label: 'Dagen efter',                 short: ['Dagen', 'efter'] }
        ]
      }
    },

    // ---------------------------------------------------------------
    // MESTRINGSPLAN
    // ---------------------------------------------------------------
    mestring: {
      kind: 'standard',
      title: 'Mestringsplan',
      fase: 'Forebyggelse',
      sections: [
        {
          id: 'selv',
          heading: t('Det kan jeg selv gøre', 'Det kan du mon selv gøre', 'Det kan borgeren selv gøre'),
          questions: [
            { id: 'selv', type: 'list',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad kan jeg selv gøre, når det bliver svært?',
                      'Hvad kan du mon selv gøre, når det bliver svært?',
                      'Hvilke mestringsstrategier bruger borgeren, når det bliver svært?') }
          ]
        },
        {
          id: 'virker',
          heading: t('Det virker for mig', 'Det virker mon for dig', 'Det virker for borgeren'),
          questions: [
            { id: 'virker', type: 'text',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad har virket for mig før?',
                      'Hvad har mon virket for dig før?',
                      'Hvad har virket for borgeren før?') },
            { id: 'virkerIkke', type: 'text',
              // TODO: tjek mod Sopras PDF
              text: t('Hvad hjælper ikke?',
                      'Hvad hjælper mon ikke?',
                      'Hvad hjælper ikke for borgeren?') }
          ]
        },
        {
          id: 'hjaelp',
          heading: t('Når jeg har brug for hjælp', 'Når du mon har brug for hjælp', 'Når borgeren har brug for hjælp'),
          questions: [
            { id: 'bede', type: 'text',
              // TODO: tjek mod Sopras PDF
              text: t('Hvordan kan jeg bede om hjælp?',
                      'Hvordan kan du mon bede om hjælp?',
                      'Hvordan viser eller beder borgeren om hjælp, og hvordan støtter vi?') }
          ]
        }
      ]
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

  return {
    kilde: KILDE,
    faner: FANER,
    plans: plans,
    tekst: tekst
  };
})();
