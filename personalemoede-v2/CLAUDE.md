# personalemoede-v2

Erstatter det gamle Apps Script-projekt `personalemoede-referat`. Samme stak
som søskende-projekterne i denne repo-rod: statisk HTML/CSS/JS, ingen
byggeproces, Supabase (projekt `lumxvqhlmokspqnazhso`, samme som
`personaletavle-v2` / `mollebakken-app-v2` / `personaleskaerm-v2`), deploy
via `git push` til GitHub Pages.

## De tre afklarede beslutninger (2026-08-24)

**Identifikation:** Intet login-system. Medarbejdere skriver blot deres navn
i et fritekstfelt der hvor det er relevant (indsend punkt, "Mine opgaver"-
filter, referent-noter). Overvej at prefille feltet fra `localStorage` for
bekvemmelighed, men det er ikke en håndhævet identitet.

**Lederrolle:** Ingen navngivet lederliste. Én delt kode låser
godkendelses-UI'en op (samme mønster som `ADMIN_KODE` i
`mollebakken-app-v2/index.html:444` — "kun et menu-synligheds-gate, ikke
reel sikkerhed"). RLS kan IKKE håndhæve dette, da appen kun bruger den
offentlige anon-nøgle — se kommentaren øverst i `supabase-schema.sql`.
Hvis det skal være rigtig sikkerhed senere, kræver det Supabase Auth eller
en Edge Function der validerer koden server-side.

**Mødefrekvens:** Ingen fast kadence. Når et møde afsluttes (`moede.html`),
foreslå at oprette næste møde med det samme og lad brugeren vælge dato der
(`moeder`-række med `status = 'planlagt'`). Ingen recurring-logik.

**Word-eksport (tilføjet 2026-08-24):** Et afsluttet referat skal kunne
eksporteres som en struktureret .docx-fil, så det kan lægges ind i
Møllebakkens eksisterende system. Afklaret med bruger: **download-knap
brugeren selv uploader videre** — ingen automatisk integration til det
andet system (ukendt system, ingen API-adgang givet). Hører hjemme i
`arkiv.html` (Fase 6) på det enkelte referat, ved siden af print-CSS'en.
Overvej samme knap lige efter "Afslut møde" i `moede.html` for bekvemmelighed.
Teknisk: brug `docx`-biblioteket (dolanmiu/docx, UMD-bundle) **vendored
lokalt** som en enkelt .js-fil i `personalemoede-v2/` (samme mønster som
`supabase-js.min.js` — ingen CDN-scripts i dette repo). Docx-strukturen bør
følge referatets naturlige opbygning: overskrift med mødedato, deltagere/
referent, derefter pr. dagsordenspunkt (i rækkefølge) titel + note-tekst +
punktets highlights, og en afsluttende opsummering grupperet efter
highlight-type (matcher "Afslut møde"-opsummeringen).

## Datamodel

Se `supabase-schema.sql` for den fulde SQL (tabeller + RLS). Kort:

- `faste_punkter` — kun læst af appen; redigeres direkte i Supabase (ingen UI)
- `moeder` — ét møde, status planlagt → igang → afsluttet
- `dagsordenspunkter` — hører til ét møde. `kilde` er 'fast' | 'indsendt' | 'overfoert'.
  `status` styrer godkendelsesflowet (afventer → godkendt/afvist/udsat).
  `behandlet` sættes under selve mødet, uafhængigt af godkendelsesstatus.
- `referat_noter` — **én række pr. punkt** (unique på `punkt_id`), skrevet
  via `upsert(..., { onConflict: 'punkt_id' })` for autosave hvert 10. sek.
  Ikke en løbende log af noter.
- `highlights` — de fire typer (beslutning/opgave/info/til_naeste). `opgave`
  kræver `ansvarlig` — håndhævet med en check-constraint i databasen, ikke
  kun i UI'en.

Dagsordenens rækkefølge ved mødestart: faste punkter (efter deres egen
`raekkefoelge`) → godkendte indsendte punkter → overførte punkter fra sidste
møde (`kilde = 'overfoert'`).

Ved "Afslut møde": alle highlights med `type = 'til_naeste'` kopieres til
det nyoprettede næste møde som `dagsordenspunkter` med
`kilde = 'overfoert'`, `status = 'godkendt'`.

## Tekniske faldgruber (gælder alt i denne mappe)

- **Ingen nestede template literals.** Har historisk ødelagt knap-
  funktionalitet i dette system. Byg HTML med string-konkatenering (`+`).
- **Ingen `<img>` injiceret via innerHTML-strenge.** Brug
  `document.createElement('img')` og sæt `.src` direkte.
- **Kun client-side polling**, ingen server-side triggers. `skaerm.html`
  poller hvert 5. sekund (kortere end de 60 sek. i søskende-projekterne,
  fordi det skal føles live under mødet).
- **Browsertid til alle tidssammenligninger.** Gem UTC i databasen
  (`timestamptz`), men sammenlign og vis altid med lokal tid.
- Escape alt brugerinput før det sættes i DOM (`escapeHtml`-mønster, se
  søskende-projekterne).
- **PostgREST-fælde ved multi-row insert:** `sb.from(x).insert([{...},{...}])`
  udleder kolonnelisten som UNIONEN af alle nøgler på tværs af alle rækker —
  mangler én række en nøgle som en anden række har, indsættes bogstavelig
  `NULL` for den række (IKKE kolonnens `default`-værdi). Ramte dette under
  test af `overfoerFraSidsteMoede()` (opdagede fejlen i selve testdataen,
  ikke i produktionskoden — men værd at huske ved fremtidige ændringer):
  sørg for at alle objekter i samme insert-array eksplicit sætter alle
  NOT NULL-kolonner, selv når værdien "bare" er standardværdien.
- `skaerm.html` skal virke i TVBro på Google TV: `<meta name="color-scheme"
  content="light">` + `:root { color-scheme: light; }`, ingen hover-
  afhængig interaktion, ingen scroll, stor typografi (læsbar fra 4-5 m).
- Genbrug `shared/tokens.css` (Archivo, `--blaek` til "nu"-blok, `--brand`
  mørkegrøn) og `shared/icons.js` fremfor at opfinde nyt. Highlight-typerne
  får sandsynligvis brug for 4 nye farve-tokens — tilføj dem additivt til
  `tokens.css`, rør ikke ved eksisterende variabler (bruges af de andre
  projekter).

## Status

- [x] Fase 1 — datamodel + RLS SQL kørt af bruger i Supabase
- [x] Fase 2 — `index.html`: indsend punkt + leder-godkendelse. Testet live
      mod Supabase (indsend, godkend/afvis/udsæt/rediger, op/ned-sortering,
      "mine opgaver" + marker løst, "opret næste møde"-bootstrap). Al
      testdata ryddet op efter, undtagen én test-møde-række (dato
      2026-09-09) som kræver manuel sletning i Supabase Table Editor —
      `moeder`/`dagsordenspunkter` har bevidst ingen delete-policy (ingen
      slet-UI i spec'en), så anon-nøglen kan ikke selv rydde den op.
- [x] Fase 3 — `moede.html`: dagsorden + noter (uden highlights). Migration
      kørt, alt testet live mod Supabase inkl. ad hoc-punkt. Rækkefølge-bånd:
      fast 0-999 · indsendt 1000-1999 (index.html's `godkendPunkt()` bruger
      `RAEKKEFOELGE_INDSENDT_BASE`) · overført 2000+ (Fase 6) · ad hoc altid
      sidst (max+1). Fandt og rettede undervejs: "Sidste punkt"-knappen var
      ikke reelt disabled (kun tekstet om); en uopnåelig "møde afsluttet"-
      tilstand blev fjernet; `tilfoejAdHocPunkt()` opdaterede ikke
      hovedpanelet efter indsættelse (så fx en tom dagsorden aldrig viste det
      første ad hoc-punkts indhold, og næste/forrige-knappens
      enabled/disabled-state blev stående forkert) — rettet ved at kalde
      `visPunkt(aktivIndex)` efter insert. To test-møder (2026-09-16,
      2026-09-30) står stadig i databasen og kræver manuel sletning —
      samme delete-policy-begrænsning som Fase 2.
- [x] Fase 4 — highlights (de fire knapper), i `moede.html`. "Ansvarlig"
      ved `opgave` er et dropdown bygget fra mødets `deltagere` (sat ved
      "Start møde") — der findes ingen medarbejderliste i systemet (jf.
      "intet login"-beslutningen), så deltagere er den bedste tilgængelige
      kilde. Falder tilbage til et fritekstfelt hvis deltagere er tomt.
      Testet live: alle fire typer, check-constraint-validering af
      ansvarlig (blokerer korrekt uden serverfejl), redigering, sletning
      (highlights har delete-policy, modsat moeder/dagsordenspunkter),
      farve-badges bekræftet visuelt distinkte. Al testdata ryddet op.
- [x] Fase 5 — `skaerm.html`: polling (5 sek.) + visning. "Nu-blok" er mørk
      (`--blaek`, samme sprog som `.listepunkt.nu` i tokens.css) med en
      farvet highlight-type-badge ovenpå — IKKE hele blokken farvet efter
      type, for at holde det visuelle "nu"-sprog konsistent med resten af
      systemet. Viser kun møder med status 'igang'; 'planlagt' og "intet
      møde" viser rolig tilstand med hhv. dato og en generisk besked.
      Respekterer `vist_paa_skaerm` (filtreret i selve Supabase-forespørgslen).
      Testet live: automatisk opdatering uden reload, alle fire typers
      farver, ansvarlig+deadline på nu-blokken, alle tilstande, ingen
      scroll/overflow ved 1920×1080 (76px highlight-tekst ved den
      opløsning). IKKE testet i selve TVBro/på fysisk Google TV-hardware —
      kun de tekniske krav (color-scheme, ingen hover, ingen scroll,
      fast layout) er verificeret i almindelig browser.
- [x] Fase 6 — `arkiv.html` + overførsel til næste møde. Mødeliste,
      referat-detalje (punkter+noter+highlights i rækkefølge), opsummering
      grupperet efter type, tværgående highlight-søgning (type/ansvarlig/
      status/fritekst), print-CSS (`@media print`), og Word-eksport.
      `overfoerFraSidsteMoede()` (duplikeret i index.html og moede.html,
      kaldt lige efter enhver ny `moeder`-insert i begge filer) finder det
      senest afsluttede møde og kopierer dets `til_naeste`-highlights og
      `udsat`-punkter ind i det nyoprettede møde som `kilde='overfoert'`,
      `status='godkendt'` — dette var IKKE eksplicit spec'et for
      'udsat'-punkter (kun for til_naeste-highlights), men uden det ville
      et udsat punkt aldrig kunne dukke op på en dagsorden igen. Flagget
      til bruger, ikke eksplicit bekræftet.

      **Word-eksport:** `docx`-biblioteket (dolanmiu/docx v8.5.0) vendored
      lokalt som `docx.umd.js` (~725 KB, hentet fra jsdelivrs UMD-build —
      `package.json`s `main`-felt peger på `build/index.umd.js`, som
      eksponerer `window.docx`). Testet: gyldig ZIP/OOXML-signatur (`PK\x03\x04`),
      korrekt MIME-type, klik-til-download-flow uden fejl.

      **Fundet under test (i testdata, ikke i produktionskoden):**
      PostgREST-fælden ved multi-row insert er nu dokumenteret ovenfor i
      "Tekniske faldgruber" — værd at huske ved fremtidige ændringer af
      `overfoerFraSidsteMoede()` eller `materialiserFastePunkter()`.

      Tre test-møder (2026-08-12, 2026-10-07, 2026-11-04) står i databasen
      og kræver manuel sletning i `moeder` — cascade rydder automatisk
      `dagsordenspunkter`/`referat_noter` under dem, så kun de 3 rækker
      i `moeder` skal slettes.
- [ ] Fase 7 — deploy (kun efter eksplicit godkendelse — `git push` går i produktion)

## Planlagt opfølgning (efter Fase 7) — NY fane i mollebakken-app-v2

Aftalt med bruger 2026-08-24: efter personalemoede-v2 er deployet, skal der
tilføjes en ny fane i **`mollebakken-app-v2/index.html`** (et andet,
allerede live projekt — IKKE en del af personalemoede-v2-mappen), så
medarbejdere ikke behøver besøge en separat URL. Fanen skal:

1. Vise "vigtige punkter" (dvs. `highlights`) fra personalemøder, organiseret
   under de datoer møderne er blevet holdt — i praksis en kompakt udgave af
   `arkiv.html`s mødeliste + referat-detalje, genbrug samme forespørgsler
   (`hentAfsluttedeMoeder()`, `visReferatDetalje()`-mønsteret).
2. Lade medarbejdere indsende ("anmode om") punkter til det kommende møde —
   samme funktion som `index.html`s indsend-flow (`indsendPunkt()`).

**Bevidst rækkefølge:** bygges IKKE i denne omgang. Personalemoede-v2 skal
først deployes og bruges af rigtige medarbejdere (Fase 7), før denne fane
tilføjes som en selvstændig, afgrænset opgave i det andet projekt — for at
undgå at blande ændringer i to forskellige live-produkter i én omgang.

Se rod-mappens hukommelse ([[project-overview]], [[project-status]]) for
den bredere migrations-kontekst.
