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
  la2-templates.js    SPØRGSMÅL (ret her)
  la2-print.js/.css   udskrift (A4)
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
  la2-rls-test.mjs      test af adgangsregler (se nedenfor)
```

## Test af adgangsreglerne

`shared/la2-rls-test.mjs` kontrollerer, at anon ikke kan læse noget, at `screen` kun kan læse feedet,
og at `editor` kan læse og skrive. Kør i PowerShell, med adgangskoder fra miljøvariabler
(aldrig i filen):

```powershell
$env:LA2_ANON_KEY="..."; $env:LA2_EDITOR_PW="..."; $env:LA2_SCREEN_PW="..."; node shared/la2-rls-test.mjs
```

Testen efterlader én arkiveret testplan (`__RLS_TEST__`). Oprydnings-SQL printes til sidst.

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
