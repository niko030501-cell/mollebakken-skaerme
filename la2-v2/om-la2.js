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
    under: 'Vi ser på det samme fra tre sider. Derfor findes hver plan i op til tre udgaver: borgerens egen, TIP og fagprofessionel.',
    diagramBeskrivelse: 'Diagram: en person i midten. En pil går indefra og ud (indefra), en stiplet pil fra personalet peger ind mod personen (tilstræbt indefra, TIP), og en pil udefra peger mod personen (udefra).',
    kort: [
      {
        navn: 'Indefra',
        ord: '"Min" (LA2 og LA2u)',
        tekst: 'Borgerens egne ord og oplevelse. Det er her, vi helst vil starte. I LA2u understøtter vi planen med billeder.'
      },
      {
        navn: 'Tilstræbt indefra',
        ord: '"Din" (TIP)',
        tekst: 'Personalets forsøg på at sætte sig i borgerens sted ud fra kropssprog, lyde, adfærd og erfaringer, når borgeren ikke selv kan sætte ord på alt.'
      },
      {
        navn: 'Udefra',
        ord: '"Fagprofessionel"',
        tekst: 'Personalets fælles faglige blik: hvad ser vi, og hvad ved vi om borgeren?'
      }
    ]
  },

  // 4a. Trivselsplanens tre niveauer (barometer)
  trivselsniveauer: {
    overskrift: 'Trivselsplanens tre niveauer',
    under: 'Planen læses nedefra og op, som et barometer. Mellem niveauerne går to linjer: "Linje for sårbar trivsel" og "Linje for mistrivsel".',
    eksempelMaerke: 'Eksempel',
    kolonner: ['Vi ser, borgeren gør', 'Borgerens strategier', 'Fælles faglige tilgange'],
    niveauer: [
      { nr: 3, navn: 'Mistrivsel', klasse: 'roed', gor: 'Kan ikke tage imod kontakt', strategi: 'Trækker sig og søger ro', tilgang: 'Skab tryghed, og undgå krav' },
      { nr: 2, navn: 'Sårbar trivsel', klasse: 'gul', gor: 'Går rundt, bliver stille eller høj', strategi: 'Går en tur, hører musik', tilgang: 'Giv ro og plads, og tal roligt' },
      { nr: 1, navn: 'Trivsel', klasse: 'groen', gor: 'Smiler, snakker, søger kontakt', strategi: 'Er sammen med dem, borgeren kender', tilgang: 'Fortsæt det, der virker, og vær nærværende' }
    ]
  },

  // 4b. Tryghedsplanens tre faser
  tryghedsfaser: {
    overskrift: 'Tryghedsplanens tre faser',
    under: 'En episode følger en affektkurve: den stiger, topper og falder. Planen beskriver, hvad vi gør i hver fase.',
    diagramBeskrivelse: 'Affektkurve: affektniveauet stiger i optrapningsfasen, topper i kaosfasen og falder i stabiliseringsfasen.',
    faser: [
      { nr: 1, id: 'optrapning', navn: 'Optrapning', tekst: 'Uroen vokser. Her kan vi stadig nå borgeren, så vi gør mere af det, der hjælper.' },
      { nr: 2, id: 'kaos', navn: 'Kaos', tekst: 'Højeste affekt. Vi gør kun det nødvendige: tryghed, ro og sikkerhed.' },
      { nr: 3, id: 'stabilisering', navn: 'Stabilisering', tekst: 'Det falder til ro igen. Vi er nærværende og stiller ikke krav.' }
    ],
    felter: 'I hver fase skriver vi, hvad borgeren gør og mærker, hvad vi gør mere af og lader være med, og hvad borgeren kan.'
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

  // 6. LA2, LA2u og TIP
  former: {
    overskrift: 'LA2, LA2u og TIP',
    la2: { navn: 'LA2', tekst: 'Borgeren fortæller selv om sin oplevelse, med ord.' },
    la2u: { navn: 'LA2u', tekst: 'Som LA2, men med billeder og enkelt sprog. Til borgere med udviklingshæmning, kognitive udfordringer og/eller uden verbalt sprog.' },
    tip: { navn: 'TIP', tekst: 'Tilstræbt indefra-perspektiv: personalets bedste bud på borgerens oplevelse. Bruges ud over LA2 eller LA2u, når borgeren ikke selv kan sætte ord på alt.' },
    beboereOverskrift: 'Hvem bruger hvad hos os',
    ingen: 'Ingen beboere endnu.'
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
