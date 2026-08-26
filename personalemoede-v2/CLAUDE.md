# personalemoede-v2

Erstatter det gamle Apps Script-projekt `personalemoede-referat`. Samme stak
som søskende-projekterne i denne repo-rod: statisk HTML/CSS/JS, ingen
byggeproces, Supabase (projekt `lumxvqhlmokspqnazhso`, samme som
`personaletavle-v2` / `mollebakken-app-v2` / `personaleskaerm-v2`), deploy
via `git push` til GitHub Pages.

## Arkitektur (ændret 2026-08-26 — se "Konsolidering" i status)

**Alt er nu ÉT link:** `index.html`. Oprindeligt spec'et som fire separate
sider (`index.html` / `moede.html` / `skaerm.html` / `arkiv.html`, "så de kan
åbnes uafhængigt"), men konsolideret til én fil efter brugerfeedback — det
virkede forvirrende at skulle kende/dele fire forskellige URL'er. Der er nu
ét topniveau-faneblad (`#hovedNav`, funktion `visHovedSide(side)`) med fire
faner: **Indsend · Referat · Storskærm · Arkiv**. Hver fane er en
`<div id="hoved-X">` der indeholder præcis det samme indhold/den samme JS
som den gamle standalone-fil gjorde — kun selve fil-strukturen er ændret.

**Storskærm er et fast overlay**, ikke en almindelig fane: `#hoved-storskaerm.aktiv`
får `position:fixed; inset:0; z-index:1000`, så den dækker hele viewporten
(inkl. topnavigationen) præcis som en selvstændig kiosk-side ville gøre. Et
lille, diskret "×"-ikon (`#storskaermExit`) i øverste højre hjørne fører
tilbage til Indsend — nødvendigt fordi topnavigationen visuelt er skjult bag
overlayet. En fysisk TV/skærm behøver aldrig bruge dette — den åbner bare
`index.html` og lader fanen stå permanent på Storskærm.

**Vigtigt ved fremtidige ændringer — navngivnings-kollisioner ved merge:**
Da de fire filer blev slået sammen, havde flere af dem funktioner/variabler
med samme navn men forskellig betydning (`visKun()` fandtes i både
moede.html og skaerm.html; `mitNavn()` læste fra hhv. et DOM-felt og
localStorage). Løsningen:
- **`mitNavn()`/`gemMitNavn()`** er nu ÉN fælles funktion der altid læser/
  skriver `localStorage['pm_mit_navn']` — både "Dit navn"-feltet på Indsend
  og "Referent"-feltet på Referat bruger denne, så de altid er synkrone.
- **`visKun()`** (moede.html) → omdøbt til `visMoedeTilstand()`.
- **`visKun()`** (skaerm.html) → omdøbt til `visSkaermTilstand()`.
- **`kildeLabel()`, `HIGHLIGHT_TYPE_LABELS`, `escapeHtml`, `visFejlDetalje`,
  `datoLangLabel`, `tidKortLabel`, `overfoerFraSidsteMoede()`** m.fl. var
  duplikeret på tværs af filerne — findes nu kun ÉN gang, delt af alle faner.
  `datoLangLabelMedAar()` er en separat variant til Arkiv-fanen (som viser
  årstal, da man browser historik på tværs af år).
- **`.side`/`.side.aktiv`-mønsteret genbruges på TRE niveauer** (Indsend-
  fanens egne underfaner, Arkiv-fanens egne underfaner, og — hvis man
  tilføjer flere — potentielt andre steder). `visSide()` (Indsend) og
  `visFane()` (Arkiv) er derfor SCOPEDE til deres egen container
  (`#hoved-indsend .side`, `#hoved-arkiv .side`) i stedet for et
  side-bredt `document.querySelectorAll('.side')` — ellers ville de to
  fane-systemer nulstille hinandens valgte underfane. Topniveauet
  (`visHovedSide()`) bruger slet ikke `.side`-klassen, kun eksplicitte
  id'er (`#hoved-indsend`, `#hoved-referat`, osv.), for helt at undgå
  kollision.

Hvis der senere skal tilføjes en femte fane: følg samme mønster — egen
scoped fane-switcher hvis den har underfaner, genbrug de delte
hjælpefunktioner i toppen af scriptet, og husk at nye ikke-nullable
databasekolonner skal med i **alle** steder der laver multi-row insert
(se PostgREST-fælden nedenfor).

## De tre afklarede beslutninger (2026-08-24)

**Identifikation:** Intet login-system. Medarbejdere skriver blot deres navn
i et fritekstfelt der hvor det er relevant (indsend punkt, "Mine opgaver"-
filter, referent-noter). Gemmes i `localStorage['pm_mit_navn']`, delt på
tværs af Indsend- og Referat-fanen — ikke en håndhævet identitet.

**Lederrolle:** Ingen navngivet lederliste. Én delt kode (`LEDER_KODE`,
øverst i `<script>`) låser godkendelses-UI'en op (samme mønster som
`ADMIN_KODE` i `mollebakken-app-v2/index.html:444` — "kun et
menu-synligheds-gate, ikke reel sikkerhed"). RLS kan IKKE håndhæve dette, da
appen kun bruger den offentlige anon-nøgle — se kommentaren øverst i
`supabase-schema.sql`. Hvis det skal være rigtig sikkerhed senere, kræver
det Supabase Auth eller en Edge Function der validerer koden server-side.

**Mødefrekvens:** Ingen fast kadence. Når et møde afsluttes (Referat-fanen),
foreslå at oprette næste møde med det samme og lad brugeren vælge dato der
(`moeder`-række med `status = 'planlagt'`). Ingen recurring-logik.

**Word-eksport (tilføjet 2026-08-24):** Et afsluttet referat skal kunne
eksporteres som en struktureret .docx-fil, så det kan lægges ind i
Møllebakkens eksisterende system. Afklaret med bruger: **download-knap
brugeren selv uploader videre** — ingen automatisk integration til det
andet system (ukendt system, ingen API-adgang givet). Ligger på Arkiv-fanens
referat-detalje, ved siden af print-CSS'en. Teknisk: `docx`-biblioteket
(dolanmiu/docx v8.5.0) vendored lokalt som `docx.umd.js` (~725 KB, hentet fra
jsdelivrs UMD-build — `package.json`s `main`-felt peger på
`build/index.umd.js`, som eksponerer `window.docx`). Docx-strukturen følger
referatets naturlige opbygning: overskrift med mødedato, deltagere/referent,
derefter pr. dagsordenspunkt (i rækkefølge) titel + note-tekst + punktets
highlights, og en afsluttende opsummering grupperet efter highlight-type.

## Datamodel

Se `supabase-schema.sql` for den fulde SQL (tabeller + RLS). Kort:

- `faste_punkter` — kun læst af appen; redigeres direkte i Supabase (ingen UI)
- `moeder` — ét møde, status planlagt → igang → afsluttet
- `dagsordenspunkter` — hører til ét møde. `kilde` er 'fast' | 'indsendt' | 'overfoert' | 'ad_hoc'.
  `status` styrer godkendelsesflowet (afventer → godkendt/afvist/udsat).
  `behandlet` sættes under selve mødet, uafhængigt af godkendelsesstatus.
- `referat_noter` — **én række pr. punkt** (unique på `punkt_id`), skrevet
  via `upsert(..., { onConflict: 'punkt_id' })` for autosave hvert 10. sek.
  Ikke en løbende log af noter.
- `highlights` — de fire typer (beslutning/opgave/info/til_naeste). `opgave`
  kræver `ansvarlig` — håndhævet med en check-constraint i databasen, ikke
  kun i UI'en.

**Rækkefølge-bånd** (`raekkefoelge`-kolonnen) sikrer at et enkelt
`order by raekkefoelge` altid giver den rigtige gruppering fast→indsendt→
overført, uden særskilt kilde-sortering ved læsning:
fast **0-999** · indsendt **1000-1999** · overført **2000+** · ad hoc altid
sidst (`max + 1`). Konstanterne `RAEKKEFOELGE_INDSENDT_BASE` og
`RAEKKEFOELGE_OVERFOERT_BASE` findes øverst i scriptet.

Dagsordenens rækkefølge ved mødestart: faste punkter → godkendte indsendte
punkter (inkl. punkter lederen har tilføjet direkte, se nedenfor) → overførte
punkter fra sidste møde.

**Leder kan tilføje punkter direkte** (uden godkendelses-flow) fra
Leder-fanen — indsættes med `kilde='indsendt'`, `foreslaaet_af='Leder'`,
`status='godkendt'` med det samme (springer 'afventer'-trinnet over).

Ved "Afslut møde": alle highlights med `type='til_naeste'` **og** alle
dagsordenspunkter med `status='udsat'` fra det møde kopieres til det
nyoprettede næste møde som `dagsordenspunkter` med `kilde='overfoert'`,
`status='godkendt'` (funktion `overfoerFraSidsteMoede()`, kaldt både når
leder bootstrapper et møde og når næste møde oprettes efter afslutning).
At *udsatte* punkter også overføres automatisk var IKKE eksplicit en del af
den oprindelige spec (kun til_naeste-highlights var) — tilføjet for at et
udsat punkt ikke skulle forsvinde i permanent limbo. Flagget til bruger,
ikke eksplicit anfægtet.

## Tekniske faldgruber (gælder alt i denne fil)

- **Ingen nestede template literals.** Har historisk ødelagt knap-
  funktionalitet i dette system. Byg HTML med string-konkatenering (`+`).
- **Ingen `<img>` injiceret via innerHTML-strenge.** Brug
  `document.createElement('img')` og sæt `.src` direkte.
- **Kun client-side polling**, ingen server-side triggers, ingen Supabase
  Realtime-subscriptions. Storskærm-fanen poller hvert 5. sekund (kortere
  end de 60 sek. i søskende-projekterne, fordi det skal føles live under
  mødet) — kører **uafhængigt af hvilken fane der er aktiv** (starter ved
  page load, kører for evigt), så data allerede er friskt når man skifter
  til Storskærm.
- **Browsertid til alle tidssammenligninger.** Gem UTC i databasen
  (`timestamptz`), men sammenlign og vis altid med lokal tid.
- Escape alt brugerinput før det sættes i DOM (`escapeHtml`-mønster).
- **PostgREST-fælde ved multi-row insert:** `sb.from(x).insert([{...},{...}])`
  udleder kolonnelisten som UNIONEN af alle nøgler på tværs af alle rækker —
  mangler én række en nøgle som en anden række har, indsættes bogstavelig
  `NULL` for den række (IKKE kolonnens `default`-værdi). Sørg for at alle
  objekter i samme insert-array eksplicit sætter alle NOT NULL-kolonner,
  selv når værdien "bare" er standardværdien.
- Storskærm-fanen skal virke i TVBro på Google TV: `<meta name="color-scheme"
  content="light">`, ingen hover-afhængig interaktion, ingen scroll, stor
  typografi (læsbar fra 4-5 m). Overlayet dækker `#hovedNav` fuldstændigt
  når aktivt, så en fysisk TV aldrig ser nogen navigation.
- Genbrug `shared/tokens.css` (Archivo, `--blaek` til "nu"-blok, `--brand`
  mørkegrøn) og `shared/icons.js` fremfor at opfinde nyt. Fire highlight-
  farve-tokens (`--status-ok`, `--status-afvist`, `--hl-beslutning`,
  `--hl-info`) er tilføjet additivt til `tokens.css` — rør ikke ved
  eksisterende variabler (bruges af de andre projekter).
- **Navngivnings-kollisioner ved fremtidige tilføjelser:** se afsnittet
  "Arkitektur" ovenfor — al delt state/hjælpefunktion ligger i den fælles
  DELT-sektion øverst i scriptet, fane-specifik kode er scoped.

## Status

Alle 7 oprindelige faser er gennemført og testet live mod Supabase
(datamodel/RLS · indsend+godkend · dagsorden+noter · highlights · storskærm
· arkiv+overførsel · deploy). Detaljerede test-noter for hver fase er ikke
længere relevante at holde styr på enkeltvis efter konsolideringen — koden
er slået sammen, men al funktionalitet fra hver fase er bevaret og re-testet
i den samlede fil.

- [x] **Konsolidering til én fil (2026-08-26).** Bruger-feedback efter live
      brug af den fire-sidede version: forvirrende at navigere mellem fire
      URL'er, og uklart hvordan et highlight endte på storskærmen. Løst ved
      at samle `moede.html`/`skaerm.html`/`arkiv.html` ind i `index.html`
      som fire faner under ét topniveau-faneblad — se "Arkitektur" ovenfor
      for hvordan navngivnings-kollisioner blev løst. De tre gamle filer er
      slettet. Samtidig tilføjet: leder kan tilføje punkter direkte uden
      godkendelses-flow, og en kort hjælpetekst under highlight-knapperne
      ("Vises live på Storskærm-fanen") for at gøre koblingen tydelig.
      Testet grundigt i den samlede fil, inkl. mod ægte produktionsdata
      brugeren selv havde oprettet (to møder, 2026-09-08) — rørt ikke ved
      dem. Fuld cyklus verificeret: opret møde → start møde → skriv note →
      opret highlight → se det live på Storskærm (samme side, samme
      session) → ad hoc-punkt → afslut møde → opret næste møde →
      til_naeste-highlight overført korrekt. Ingen konsolefejl gennem hele
      test-sessionen.
- [ ] Deploy af konsolideringen — afventer eksplicit godkendelse (samme
      regel som al deploy: `git push` går direkte i produktion).

## Opfølgning — fane i mollebakken-app-v2 (2026-08-26, færdig)

Tilføjet en "Personalemøde"-fane i **`mollebakken-app-v2/index.html`** (et
andet, allerede live projekt — IKKE en del af personalemoede-v2-mappen),
efter samme FEATURE_KORT/`.side`/`visSide()`-mønster som appens øvrige
faner. Genbruger `sb`-klienten og `escapeHtml` der allerede findes i den
fil — ingen ny Supabase-klient. Deler `localStorage['pm_mit_navn']` med
personalemoede-v2 (samme origin på GitHub Pages), så "Dit navn" allerede er
udfyldt hvis man har brugt personalemøde-systemet før.

To undersider (mode-vælger, samme mønster som "Besked/Dagsplan" på
Opgaver-fanen):
1. **Indsend punkt** — samme flow som personalemoede-v2's `indsendPunkt()`.
2. **Referater** — de sidste 5 afsluttede møders highlights, grupperet under
   mødedato. Kompakt udgave af Arkiv-fanens mødeliste, ingen søgning/klik-
   igennem (det ligger i personalemoede-v2 selv, ikke duplikeret her).

Fanen er IKKE registreret i `indstillinger`-tabellen (ingen INSERT-adgang
fra klienten til den tabel) — vises derfor som standard (koden filtrerer
`indstillingerCache[fane] !== false`, og en manglende række giver `undefined
!== false` = vist). Konsekvens: admin kan ikke slå den fra via Admin-fanens
toggle-liste før der findes en `indstillinger`-række for `personalemoede`.
Kør denne SQL i Supabase hvis den skal kunne skjules:
`insert into indstillinger (fane, aktiv) values ('personalemoede', true);`

Testet live: navn-prefill på tværs af de to apps, indsend punkt (dukkede
korrekt op i "Mine punkter"), referat-visning mod ægte produktionsdata
(to rigtige møder fra 2026-09-08), badge-farver korrekte, ingen
konsolefejl, ingen horisontal overflow på mobilbredde (375px).

Se rod-mappens hukommelse ([[project-overview]], [[project-status]]) for
den bredere migrations-kontekst.
