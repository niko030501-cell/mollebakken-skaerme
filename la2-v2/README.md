# LA2 på Møllebakken

LA2-systemet består af tre dele:

| Del | Hvor | Hvad |
|---|---|---|
| **LA2-siden** | `la2-v2/` | Personalet ser, opretter, redigerer og printer planer. Virker på PC og mobil. |
| **Link i appen** | `mollebakken-app-v2/` | Fanen "LA2" åbner `la2-v2/`. |
| **Fane på infoskærmen** | `personaletavle-v2/` (`la2-fane.js`/`.css`) | Viser *at* noget er sket eller skal gøres. Aldrig planernes indhold. |

Planerne indeholder følsomme personoplysninger. Alt går gennem Supabase Auth og RLS.
Den offentlige nøgle (anon) kan **ikke** læse noget LA2-data.

> **Rør ikke** `personaleskaerm-v2/` (beboerskærmen i gangen) og `shared/tokens.css`
> (bruges af alle skærmene).

---

## Hvem må hvad

| Bruger | Bruges til | Rolle (`app_metadata.la2_role`) | Rettigheder |
|---|---|---|---|
| `la2@mollebakken.dk` | LA2-siden (fælles login) | `editor` | Læse og skrive. Aldrig slette. |
| `infoskaerm@mollebakken.dk` | TV'et på kontoret | `screen` | Kun `la2_screen_feed()` (metadata). Intet indhold. |
| alle andre / anon | | | Ingen adgang til LA2. |

Planer **slettes ikke**. De arkiveres (`status = 'arkiv'`) og kan gendannes under Historik.

---

## LA2, LA2u og TIP

Hver beboer har to indstillinger (under "Indstillinger for [Navn]" på beboersiden):

| Indstilling | Betydning |
|---|---|
| **Hvordan laves [Navn]s egen plan?** | *Med ord (LA2)* eller *Med ord og billeder (LA2u)*. Bestemmer, hvordan **Min**-planen ser ud. |
| **Bruger vi også TIP?** | Ja/Nej. TIP er personalets tilstræbte indefra-perspektiv (**Din**-planer). |

En beboer kan have flere på én gang: fx LA2u + TIP + fagprofessionel. Perspektivknappen på planen viser "[Navn]s ord", "TIP · tilstræbt" (kun ved TIP) og "Fagprofessionel".

## Planernes opbygning og udskrift

Planerne tegnes af **én funktion i to tilstande** (`rediger` og `print`, se `byggPlanKrop` og `byggPlanTop` i `la2-plans.js`). Der er ingen separat print-opbygning at holde ens. "Vis som udskrift" viser print-tilstanden på skærmen, og "Print" åbner printdialogen.

- **Trivselsplan** (liggende): tre niveauer (1 Trivsel, 2 Sårbar trivsel, 3 Mistrivsel) som barometer med fire kolonner.
- **Tryghedsplan** (stående): "Udløsende årsager", affektkurve og tre faser (Optrapning, Kaos, Stabilisering).
- **Læringsplan** (liggende), **Mestringsplan** (liggende, med ansigter) og **Trivselsøer** (liggende, op til 5 øer).
- Svar fra planernes gamle opbygning røres ikke. De vises under "Fra tidligere version".

## Billeder (LA2u)

Billedsættet ligger i `la2u-billeder.js` (SVG i egen stil). Billeder vælges i planerne med "Vælg billede":
**Billeder** (vores sæt) eller **Eget foto** (skaleres til højst 1200 px og gemmes i den private bucket `la2-billeder`).

- Hvilket billede der står ved et spørgsmål, rettes i `billeder` pr. plan i `la2-templates.js` (nøgle = spørgsmålets id, fx `gor`, eller `række.spørgsmål`, fx `forloeb.q1`).
- Hvilke spørgsmål der har ansigter at vælge mellem, står i `foelelser`.
- Ret aldrig eksisterende felt-id'er. Billeder gemmes under `<felt>~billede` og `<felt>~foelelse` i planens indhold.
- **Udskift billedsættet** (fx hvis vi får lov til at bruge Sopras billeder): ret kun `la2u-billeder.js`. Resten af koden bruger `la2uBillede(nøgle, størrelse)`. Hold nøglerne (fx `foelelse_glad`, `aktivitet_musik`), så gemte planer stadig virker.
- Fotos ligger i bucketen som `<resident_id>/<id>.jpg`. Kun `editor` kan læse og uploade; `anon` og `screen` har ingen adgang. Billederne slettes ikke af appen.

---

## Ret spørgsmålene (`la2-templates.js`)

Alle plantyper og spørgsmål ligger i **én fil**: `la2-v2/la2-templates.js`. Resten af koden skal ikke røres.

1. Åbn filen og find planen (`trivsel`, `tryghed`, `laering`, `mestring` eller `haab_droem`).
2. Ret teksten mellem citationstegnene. Hvert spørgsmål har tre tekster:
   `t('Min-tekst', 'Din-tekst (LA2u)', 'Fagprofessionel-tekst')`.
3. Sæt en tekst til `null`, hvis spørgsmålet ikke skal vises i det perspektiv.
4. Gem filen, commit og push. Ændringen er live efter et par minutter.

**Vigtigt:**

- **Ret eller genbrug aldrig et eksisterende `id`** (sektion, spørgsmål eller kolonne). De bruges som nøgler
  i de gemte svar. Ændres de, kan gamle svar ikke længere vises. Tilføj i stedet et nyt `id`.
- Spørgsmål markeret `// TODO: tjek mod Sopras PDF` er første udkast. Ret dem til efter Sopras materiale.
- Kurven (trivsels- og affektkurven) bruger skalaen **1 = roligt, 5 = meget slemt**. Høj værdi betyder slemt.
- Kurven har **7 faste tidspunkter** (3 dage før · 2 dage før · Dagen før · Samme morgen · Episoden · Lige efter ·
  Næste dag). Ældre kurver med 6 værdier vises ét tidspunkt forskudt, med første plads tom. Der opfindes aldrig værdier.
- **Punkter i lister har et fast id** (`{ id, t }`). Det bruges til at genkende et punkt på tværs af versioner.
  Ældre planer med ren tekst får id'erne `l0`, `l1`, … ved næste gem. Ret aldrig id'erne i hånden.

## Sammenlign og mødedata

Knappen **Sammenlign** (ved Print/Historik på en beboers plan) lægger to planer eller to versioner
side om side til et møde om *indefra* (beboerens Min/Din) og *udefra* (fagprofessionelle).
Systemet **vurderer aldrig**, om to tekster betyder det samme. Det markerer kun det, der kan måles:
en tom side, og tal på kurverne. Sammenligningen ændrer aldrig selve planerne.

| Visning | Hvad |
|---|---|
| **Tabel** | En række pr. felt: indefra, udefra og noter/markeringer (Enige / Forskel / Spørgsmål). |
| **Tre bunker** | Punkterne flyttes (træk eller pil) mellem "Kun [Navn]", "Begge er enige" og "Kun personalet". Slip et punkt oven på et punkt i midten for at parre dem. |
| **Kurver** | Læringsplanens kurver oven på hinanden, med største forskel i trin. Kun for læringsplaner. |
| **Mødevisning** | Fuldskærm, stor skrift, piletaster/fjernbetjening. Kun visning. |
| **Print** | Den viste visning som liggende A4 (kan skelnes i sort-hvid). |

### Hvor mødedata ligger

Alt, der skrives eller flyttes på et møde, ligger i to tabeller (kun `editor` har adgang):

| Tabel | Indhold | Må slettes via appen? |
|---|---|---|
| `la2_compare_notes` | Noter og markeringer pr. felt og sammenligning (`row_key`, fx `roed.tegn`, `forloeb.q1.foer` eller `kurve`) | Nej (kun rettes) |
| `la2_compare_common` | Punkter i "Begge er enige": venstre/højre punkt-id, evt. parret | Ja ("Flyt tilbage") |

- Noter hører til et bestemt par af versioner. Ændres en plan, vises noter fra en tidligere version
  mærket *"Fra et tidligere møde"*, og en ændring gemmes for den nuværende sammenligning.
- Bunkerne gemmer kun punkt-id'er (ingen versioner), så de følger med til nye versioner. Et punkt,
  der er slettet fra planen, vises ikke; i stedet står der *"1 punkt fra et tidligere møde findes ikke længere i planen."*
- Mødedata vises **ikke** på infoskærmen.

### Ryd mødedata for én beboer

Kør i Supabase → **SQL Editor** (udskift navnet). Planerne røres ikke.

```sql
-- se hvad der ligger
select 'noter' as hvad, count(*) from la2_compare_notes
 where resident_id = (select id from beboere where navn = 'NAVN')
union all
select 'fælles', count(*) from la2_compare_common
 where resident_id = (select id from beboere where navn = 'NAVN');

-- slet (kun mødedata)
delete from la2_compare_common
 where resident_id = (select id from beboere where navn = 'NAVN');
delete from la2_compare_notes
 where resident_id = (select id from beboere where navn = 'NAVN');
```

Vil du kun rydde **én plantype**, så tilføj `and plan_type = 'laering'` (eller `tryghed` osv.) til begge `delete`.
Noter og fælles punkter slettes også automatisk, hvis en plan eller version fjernes (fx ved oprydning af testdata).

### Ret teksterne

Felter og rækkefølge i Sammenlign kommer fra `la2-templates.js`, så ret spørgsmål dér.
Ret aldrig eksisterende `id`'er: noter og bunker bruger dem som nøgler.

---

## Ret teksterne på "Om LA2" (`om-la2.js`)

Alle teksterne ligger i `la2-v2/om-la2.js` som data. Ret kun teksten mellem citationstegnene.
Layoutet ligger i `la2-om.js`. Teksterne er skrevet med egne ord; Sopra er angivet som kilde.

---

## Skift den fælles adgangskode (fx når en medarbejder stopper)

Den fælles adgangskode til `la2@mollebakken.dk` står **ikke** i koden. Den ligger kun i Supabase.

1. Åbn Supabase → projekt `lumxvqhlmokspqnazhso` → **SQL Editor**.
2. Kør (udskift `NYT_KODEORD`):

   ```sql
   update auth.users
      set encrypted_password = extensions.crypt('NYT_KODEORD', extensions.gen_salt('bf')),
          updated_at = now()
    where email = 'la2@mollebakken.dk';
   ```

3. **Log alle ud**, så ingen bliver ved med at være logget ind med den gamle kode:

   ```sql
   delete from auth.sessions
    where user_id = (select id from auth.users where email = 'la2@mollebakken.dk');
   ```

4. Giv personalet den nye kode.
5. Skal medarbejderens navn væk fra "Hvem er du?": åbn **Table Editor → `la2_staff`**
   og sæt `aktiv` til `false` på rækken (navne slettes ikke).

> Adgangskoder må aldrig stå i kode, README eller chat.
> Deaktiverede navne kan altid tændes igen.

Efter 30 minutter uden aktivitet logges man automatisk ud af LA2-siden.

---

## Sæt infoskærmens login op igen

Skærmen viser *"LA2 kræver login – kontakt Nikolaj"*, når den ikke er logget ind (fx hvis
sessionen er udløbet, eller adgangskoden er skiftet). Resten af tavlen kører videre.

1. **Tjek, at fanen er tændt:** appen → **Admin → Skærme → LA2-planer**.
2. Åbn `personaletavle-v2/` på TV'et og gå til **LA2**-fanen
   (eller åbn `personaletavle-v2/#la2-login` direkte).
3. Tryk **"Log ind (opsætning)"**.
4. Skriv `infoskaerm@mollebakken.dk` og adgangskoden, og tryk **Log ind**.

Sessionen gemmes på TV'et (under nøglen `la2-screen-auth`), så det er normalt kun nødvendigt én gang.

**Har du glemt skærmens adgangskode?** Sæt en ny med samme SQL som ovenfor, men med
`email = 'infoskaerm@mollebakken.dk'`, og log ind på TV'et igen som beskrevet.

---

## Filer

```
la2-v2/
  index.html          siden (login, Hvem er du?, overblik, beboer, Om LA2)
  la2.css             design (bygger oven på ../shared/tokens.css)
  la2-app.js          login, session, auto-logud, routing
  la2-data.js         alle Supabase-kald
  la2-overblik.js     overblik, Episoder, Revision
  la2-plans.js        plansider, formularer, udkast, historik
  la2-punkter.js      punkter med fast id, kurver med 7 tidspunkter
  la2-sammenlign.js   Sammenlign: Tabel, Tre bunker, Kurver, Mødevisning, Print
  la2-templates.js    SPØRGSMÅL (ret her)
  la2-print.js/.css   udskrift (A4; også Sammenlign)
  la2u-billeder.js    eget billedsæt (SVG) og la2uBillede()
  la2u-felter.js      billedstøtte i felterne: billedvælger, foto-upload, følelser
  la2-om.js           "Om LA2"-siden (layout)
  om-la2.js           "Om LA2"-teksterne (ret her)
  la2-ikoner.js       ikoner og fasedata
  supabase-js.min.js  Supabase-klient (lokal kopi)

personaletavle-v2/
  la2-fane.js/.css    LA2-fanen på infoskærmen

shared/
  la2-schema.sql        tabeller, RLS, triggere, feed
  la2-skaerm-fane.sql   feed med seneste aktive gemning + række i skaerm_indstillinger
  la2-haerdning.sql     hærdning af funktioner (kør efter godkendelse)
  la2-sammenlign-schema.sql  mødedata: noter og fælles punkter
  la2-sammenlign-test.sql    SQL-test af mødedata-tabellerne (rulles tilbage)
  la2-indstillinger-billeder.sql  indefra_form, bruger_tip, plantype trivselsoeer og billedbucket
  la2-rls-test.mjs      test af adgangsregler, inkl. Sammenlign (se nedenfor)
```

## Test af adgangsreglerne

`shared/la2-rls-test.mjs` kontrollerer, at anon ikke kan læse noget, at `screen` kun kan læse feedet,
og at `editor` kan læse og skrive (også mødedata i `la2_compare_*`: noter kan ikke slettes, fælles punkter kan ikke opdateres). Kør i PowerShell, med adgangskoder fra miljøvariabler
(aldrig i filen):

```powershell
$env:LA2_ANON_KEY="..."; $env:LA2_EDITOR_PW="..."; $env:LA2_SCREEN_PW="..."; node shared/la2-rls-test.mjs
```

Testen efterlader én arkiveret testplan (`__RLS_TEST__`) og en test-note (`__rls_test__`). Oprydnings-SQL printes til sidst; noterne følger med, når testplanens versioner slettes.

`shared/la2-sammenlign-test.sql` tester de samme regler direkte i databasen (uden adgangskoder) og ruller alt tilbage.

---

## Regler for kodeændringer

- Ingen template literals (backticks): de har tidligere fået knapper til at fejle med "function is not defined".
- Ingen `<img>` sat ind via `innerHTML`. Brug DOM-metoder eller `+`.
- Escape brugerinput. Brug `textContent`, ikke `innerHTML`.
- Brug browserens lokale tid til tidssammenligninger.
- Polling hvert 60. sekund. Ingen realtime.
- Ingen build-proces og ingen frameworks.
- Lyst tema gennemtvunget (`color-scheme: light`).
- Planindhold må ikke logges (`console.log`) og ikke gemmes i `localStorage`/`sessionStorage`.
  Kun login-sessionen (`la2-auth`) og et aktivitetstidsstempel (`la2-last-activity`) ligger i localStorage.
  Det valgte navn ligger kun i `sessionStorage` for den aktuelle session.
- Efter ændring i `la2-v2/` virker auto-genindlæsning ikke på telefoner; luk og åbn siden igen.
