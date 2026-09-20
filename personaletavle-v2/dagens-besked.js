// ============================================================
// DAGENS BESKED — vises kl. 09:02 på personaletavlen
// (selve effekten og triggeren ligger i dagens-besked-effekt.js)
//
// SÅDAN TILFØJER DU EN NY BESKED:
// Skriv den ind i listen herunder — én pr. linje, i citationstegn,
// med komma til sidst. Sæt den hvor som helst; listen længde tælles
// automatisk. Undgå dobbelte citationstegn (") inde i selve teksten.
//
// Dagens besked vælges ud fra dag-nummer i året (1. januar = 1, ...
// 31. december = 365/366): (dag - 1) modulo antal beskeder. Samme
// besked hele dagen, ny besked næste dag. Bemærk: når du tilføjer eller
// fjerner en besked, ændres hvilken besked der falder på hvilken dag.
// ============================================================

(function(){

  const BESKEDER = [
    "Små øjeblikke gør en stor forskel. Lad os skabe nogle af dem i dag.",
    "En god dag starter med et godt overlap. Tak fordi du er her.",
    "Vi er et hold. Ingen løfter alene i dag.",
    "Et smil koster ingenting, men betyder alt.",
    "Tålmodighed er også en superkraft.",
    "Det, du gør her, betyder noget for nogen hver eneste dag.",
    "Husk at trække vejret. Vi tager én ting ad gangen.",
    "Godt humør smitter. Lad os sprede det.",
    "I dag er en ny chance for en god dag.",
    "Den bedste støtte er at blive set. Lad os se hinanden i dag.",
    "Stolthed over det lille er også stolthed.",
    "Ro i os giver ro omkring os.",
    "En kop kaffe, et godt overlap, et godt hold. Vi er klar.",
    "Spørg hinanden: Hvordan har du det i dag?",
    "Fejl er okay. Det er det, vi gør bagefter, der tæller.",
    "Glæde er ikke et mål, det er en måde at være sammen på.",
    "Tak for i går. Lad os gøre i dag lige så godt.",
    "Hver borger, hver kollega, hver dag: det tæller.",
    "Varme hænder, rolige stemmer, åbne hjerter.",
    "God kommunikation er det bedste værktøj, vi har.",
    "Hjælp gerne. Bed gerne om hjælp.",
    "En god dag bygges af mange små gode valg.",
    "Du gør en forskel, også når det ikke føles sådan.",
    "Grin lidt sammen i dag. Det er også en del af arbejdet.",
    "Vi møder hinanden, hvor vi er.",
    "Tryghed skabes i det lille: at vi gør, som vi siger.",
    "Pas på dig selv, så du kan passe på andre.",
    "Nysgerrighed åbner døre. Spørg hellere én gang for meget.",
    "Sammen er vi Møllebakken.",
    "God morgen! Lad os gøre i dag til en god dag."
  ];

  // ---- Logik (behøver du normalt ikke at røre herunder) ----

  // Dag-nummer i året i LOKAL tid: 1. januar = 1. Regnes via Date.UTC på
  // år/måned/dag, så sommertid ikke kan give en times forskydning.
  function dagNummer(dato){
    const d = dato || new Date();
    const dagIdag = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const nytår = Date.UTC(d.getFullYear(), 0, 0);
    return Math.round((dagIdag - nytår) / 86400000);
  }

  // Index i listen for et dag-nummer. Tåler 0, negative og ikke-hele tal.
  function indexForDag(dag){
    const n = BESKEDER.length;
    if(n === 0) return -1;
    const d = Math.floor(Number(dag));
    if(isNaN(d)) return -1;
    return ((d - 1) % n + n) % n;
  }

  // Dagens besked som ren tekst. dagOverride (valgfri) bruges af test-mode
  // (?testbesked=1&dag=5) til at vælge et bestemt dag-nummer.
  function dagensBesked(dato, dagOverride){
    const dag = (dagOverride !== undefined && dagOverride !== null)
      ? dagOverride
      : dagNummer(dato);
    const i = indexForDag(dag);
    return i === -1 ? '' : BESKEDER[i];
  }

  // Konsol-hjælper: DagensBesked.naeste7Dage() — viser i dag + de 6 følgende
  // dage. Valgfri startdato til at prøve andre datoer af.
  function naeste7Dage(startDato){
    const start = startDato ? new Date(startDato) : new Date();
    const rækker = [];

    for(let k = 0; k < 7; k++){
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
      const dag = dagNummer(d);
      const i = indexForDag(dag);
      rækker.push({
        dato: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'),
        dagNr: dag,
        beskedNr: i + 1,
        besked: i === -1 ? '' : BESKEDER[i]
      });
    }

    if(typeof console !== 'undefined'){
      if(console.table) console.table(rækker);
      else rækker.forEach(r => console.log(r.dato, '(dag ' + r.dagNr + ', besked ' + r.beskedNr + '):', r.besked));
    }
    return rækker;
  }

  window.DagensBesked = {
    beskeder: BESKEDER,
    dagNummer: dagNummer,
    dagensBesked: dagensBesked,
    naeste7Dage: naeste7Dage
  };

})();
