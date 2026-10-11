// ==================================================================
// "Om LA2" — alle teksterne ligger her, så de kan rettes uden at røre
// layoutet (la2-om.js). Teksterne er skrevet med egne ord; henvisning til
// Sopra som kilde og link til deres sider står nederst.
//
// Rettes kun i selve teksterne (mellem citationstegnene). Nye punkter
// i lister tilføjes ved at kopiere en linje.
// ==================================================================
window.LA2OmTekster = {

  // 1. Toppen
  top: {
    overskrift: 'Hvad er LA2?',
    intro: [
      'LA2 er et redskab til samtale og refleksion. Det hjælper os med at skabe mere trivsel og færre voldsomme episoder.',
      'Det gør vi ved at starte i borgerens egen oplevelse af en situation, i stedet for i vores gæt om, hvad der er galt.'
    ]
  },

  // 2. De tre faser som et kredsløb
  faser: {
    overskrift: 'De tre faser',
    under: 'De tre planer hænger sammen i en cirkel. Det vi lærer, føres tilbage til trivsels- og tryghedsplanen.',
    diagramBeskrivelse: 'Diagram: tre faser i en cirkel. Forebyggelse (Trivselsplan) fører til Håndtering (Tryghedsplan), som fører til Læring (Læringsplan), og læringen går tilbage til Forebyggelse.',
    cyklus: 'Cyklus',
    trivsel: {
      sætning: 'Bruges i hverdagen. Hvad får borgeren til at trives, og hvad kan vi gøre, så det bliver ved?'
    },
    tryghed: {
      sætning: 'Bruges, når det bliver svært. Hvordan ser vi, at det er på vej, og hvad gør vi på hvert niveau?'
    },
    laering: {
      sætning: 'Bruges efter en episode. Hvad skete der, hvad hjalp, og hvad gør vi næste gang?'
    }
  },

  // 3. De tre perspektiver
  perspektiver: {
    overskrift: 'De tre perspektiver',
    under: 'Vi ser på det samme fra tre sider. Det er derfor hver plan findes i to udgaver: borgerens og fagprofessionel.',
    diagramBeskrivelse: 'Diagram: en person i midten. En pil går indefra og ud (indefra), en stiplet pil fra personalet peger ind mod personen (tilstræbt indefra), og en pil udefra peger mod personen (udefra).',
    kort: [
      {
        navn: 'Indefra',
        ord: '"Min"',
        tekst: 'Borgerens egne ord og oplevelse. Det er her, vi helst vil starte.'
      },
      {
        navn: 'Tilstræbt indefra',
        ord: '"Din" (LA2u)',
        tekst: 'Når borgeren har begrænset sprog, forsøger vi at sætte os i borgerens sted og beskriver, hvad vi tror, borgeren oplever.'
      },
      {
        navn: 'Udefra',
        ord: '"Fagprofessionel"',
        tekst: 'Personalets fælles faglige blik: hvad ser vi, og hvad ved vi om borgeren?'
      }
    ]
  },

  // 4. Barometeret
  barometer: {
    overskrift: 'Barometeret i Tryghedsplanen',
    under: 'Det svære deles op i tre niveauer. Til hvert niveau skriver vi to ting.',
    eksempelMaerke: 'Eksempel',
    forklaring: [
      { navn: 'Tegn', tekst: 'Hvad kan vi se og mærke, når borgeren er på det her niveau?' },
      { navn: 'Hvad gør vi', tekst: 'Hvad hjælper, og hvad gør vi, så alle gør det samme?' }
    ],
    niveauer: [
      { nr: 1, navn: 'Grøn', overskrift: 'Jeg har det godt', tegn: 'Smiler, snakker, søger kontakt', handling: 'Fortsæt det, der virker, og vær nærværende' },
      { nr: 2, navn: 'Gul', overskrift: 'Jeg er ved at blive urolig', tegn: 'Går rundt, bliver stille eller høj', handling: 'Giv ro og plads, og tal roligt' },
      { nr: 3, navn: 'Rød', overskrift: 'Det er blevet for svært', tegn: 'Kan ikke tage imod kontakt', handling: 'Skab tryghed, og undgå krav' }
    ]
  },

  // 5. De otte principper
  principper: {
    overskrift: 'De otte principper',
    punkter: [
      { nr: 1, navn: 'Forebyggelse', tekst: 'Trivselsplaner i hverdagen. Vi forebygger ved at gøre mere af det, der virker.', fase: 'trivsel' },
      { nr: 2, navn: 'Håndtering', tekst: 'Tryghedsplaner i svære situationer. Alle ved, hvad de skal gøre.', fase: 'tryghed' },
      { nr: 3, navn: 'Læring', tekst: 'Læringsplaner efter episoder. Vi bliver klogere hver gang.', fase: 'laering' },
      { nr: 4, navn: 'Borgerens indefra-perspektiv', tekst: 'Vi tager udgangspunkt i, hvordan borgeren selv oplever det.' },
      { nr: 5, navn: 'Dialogisk', tekst: 'Planerne laves sammen med borgeren, ikke om borgeren.' },
      { nr: 6, navn: 'Nonverbalt undersøgende', tekst: 'Vi undersøger også uden ord, fx gennem kropssprog, billeder og tegn.' },
      { nr: 7, navn: 'Fælles faglige tilgange', tekst: 'Hele teamet gør det samme, så borgeren møder forudsigelighed.' },
      { nr: 8, navn: 'Systematisk', tekst: 'Vi følger de samme skridt hver gang og skriver dem ned.' }
    ]
  },

  // 6. LA2 og LA2u
  la2u: {
    overskrift: 'LA2 og LA2u',
    la2: 'LA2 bruges, når borgeren selv kan fortælle om sin oplevelse.',
    la2u: 'LA2u er til borgere med udviklingshæmning, kognitive udfordringer og/eller uden verbalt sprog. Her bruger vi visuelle samtaleark og det tilstræbte indefra-perspektiv.',
    beboereOverskrift: 'Hos os er sat til LA2u',
    ingen: 'Ingen beboere er sat til LA2u endnu.'
  },

  // 7. Sådan bruger vi det på Møllebakken
  trin: {
    overskrift: 'Sådan bruger vi det på Møllebakken',
    punkter: [
      { ikon: 'spire', tekst: 'Kontaktpersonen laver Trivselsplan og Tryghedsplan sammen med beboeren.' },
      { ikon: 'cirkelpil', tekst: 'Efter en episode laves en Læringsplan med "+ Ny episode".' },
      { ikon: 'skjold', tekst: 'Systemet spørger, om Trivsels- eller Tryghedsplanen skal opdateres.' },
      { ikon: 'revision', tekst: 'Infoskærmen minder os om nye planer og om revision.' },
      { ikon: 'episoder', tekst: 'Planerne kan printes til samtalen med beboeren.' }
    ]
  },

  // 8. Lær mere
  link: {
    overskrift: 'Lær mere',
    punkter: [
      { titel: 'Sopra: Hvad er LA2?', tekst: 'Sopras egen beskrivelse af metoden.', url: 'https://sopra.dk/hvad-er-la2/' },
      { titel: 'LA2-materialer', tekst: 'Skabeloner og vejledninger fra Sopra.', url: 'https://sopra.dk/la2-materialer/' },
      { titel: 'LA2u-materialer', tekst: 'Materialer til LA2u fra Sopra.', url: 'https://sopra.dk/la2u-materialer/' },
      { titel: 'Film: Introduktion til LA2', tekst: 'Kort film fra Viden på tværs.', url: 'https://vpt.dk/la2-introduktion' },
      { titel: 'Podcast fra SocialPædagogen', tekst: 'Lyt til en samtale om metoden.', url: 'https://socialpaedagogen.sl.dk/arkiv/2021/10/metoder-og-tilgange-low-arousal-2-la2/' }
    ]
  },

  // 9. Nederst
  kilde: 'LA2 er udviklet af Sopra Konsulenterne. Teksterne her er en kort introduktion skrevet til Møllebakken.'
};
