# Leylas iPad og piktogram-admin

Det her er en kort vejledning til personalet. Der er to dele:

1. **Leylas visning** (mappen `leyla-v2`): kun til at se og trykke på hendes egen iPad.
2. **Admin** i Møllebakken-appen (menupunktet **Piktogrammer**): her styrer personalet alt.

---

## Del 1: Sådan sættes Leylas iPad op

Det gøres kun én gang. Bagefter skal Leyla ikke logge ind.

1. Åbn **Safari** på iPad'en og gå til adressen på Leylas app (samme adresse som Møllebakken-appen, men med `/leyla-v2/` til sidst).
2. Log ind med **Leylas navn og hendes firecifrede kode** (samme login som i beboerappen). Koden sættes under Beboerapp → Beboere.
3. Tryk på **Del**-knappen (firkant med pil op) og vælg **Føj til hjemmeskærm**. Giv den navnet "Min dag".
4. Åbn appen fra hjemmeskærmen. Den fylder hele skærmen.
5. Hold iPad'en på **langs** (landskab). Tryk på **Skærmlås → slå retningslås fra**, hvis skærmen ikke vil dreje.
6. Slå gerne **Guidet adgang** til (Indstillinger → Tilgængelighed), så Leyla ikke kommer ud af appen ved et uheld.

Hvis Leyla bliver logget ud (fx efter lang tid): log ind igen som i trin 2.

### Hvad Leyla ser

- **Til venstre:** hvad der sker **NU** (billede og ord) og hvad der kommer **Bagefter**. Under det står, hvem der er **med hende nu**, og de tre knapper **Ja** (grøn), **Nej** (rød) og **Mere** (blå). Når hun trykker, siges ordet højt.
- **Til højre:** alle billeder, delt i kategorier med hver sin farve. Tryk på et billede viser det i fuld skærm med ordet under, og ordet siges højt. Swipe til siden for næste billede. Tryk et vilkårligt sted for at lukke.
- **Sæt to billeder op mod hinanden (personalet):** hold fingeren på den lille knap **Sæt valg op** nederst til højre i ca. 1 sekund. Tryk på 2-4 billeder, skriv evt. et spørgsmål, og tryk **Vis til Leyla**. Valget kommer i fuld skærm. Noter svaret bagefter i admin under Valg. Faste valg kan også startes derfra eller fra Nu-kortet.
- **Valg:** når der er et valg i gang, vises billederne side om side i fuld skærm. Når hun trykker på ét, fremhæves det, og de andre dæmpes. Det bliver stående, til personalet lukker valget.
- **Uden net:** appen viser det sidst hentede og henter igen, når nettet er tilbage. En lille grå prik øverst til højre betyder, at der ikke er net lige nu.

Hvis personalet skal lukke et valg direkte på iPad'en: **hold fingeren på det svage ✕ nederst til højre i halvanden sekund**. Det lukker valget uden at gemme en note. Brug hellere admin (se nedenfor), så svaret bliver noteret.

---

## Del 2: Sådan bruges admin

Åbn Møllebakken-appen og tryk på **Piktogrammer**. Første gang skal du skrive personalekoden (den samme som under Beboerapp). Knappen **Se som Leyla** viser hendes forside.

### Fanen Billeder

- Øverst står, hvor mange billeder der vises for Leyla, fx "24 af 27 billeder vises".
- **Kontakten** ved hvert billede slår det til eller fra for Leyla. Skjulte billeder slettes ikke.
- **+ Tilføj**: vælg flere billedfiler på én gang. Navnet foreslås ud fra filnavnet (`toilet.png` bliver "Toilet"). Ret navn, vælg kategori og tryk Gem. Billederne skaleres ned og gemmes automatisk.
- Tryk på et billede for at **omdøbe, skifte billede, flytte kategori, ændre placering eller slette**. Sletning skal bekræftes.
- Du kan også **trække** billederne for at ændre rækkefølgen.
- **Ny kategori** og **Rediger** ved hver kategori: navn, farve og sletning. Farven bruges ens overalt, så Leyla kan genkende kategorien.
- **Ugeplanens aktiviteter**: her kobler du en aktivitet (fx "På wc") til et billede (fx "Toilet") eller til et fast valg (fx "Tilbydes aktivitet" → "Gåtur eller cykeltur"). Det gøres **én gang** og gælder alle dage, også hvis ugeplanen ændres. Aktiviteter uden billede er markeret rødt og vises som tomme i Nu-kortet. Det er bedre end et forkert billede.

### Fanen I dag

- **Med Leyla i dag:** tryk **Vælg dig fra dagens vagtplan**, find dit navn og vælg tidsrummet, du er på Leyla, fx 08.00–14.00. Navn og foto hentes fra vagtplanen. Typisk er der to personer i løbet af dagen.
- Leyla ser kun den, der er på hende **lige nu**. I admin står der **Vises nu** eller **Fra 14.00**.
- Alt slettes automatisk efter midnat. Foto og navn gemmes ikke på iPad'en efter dagen.
- **Dagens plan** ligger nedenunder med klokkeslæt, aktivitet og billede. Det aktuelle punkt er markeret **NU**. Tryk på en linje for at skifte billede.

### Fanen Valg

- **Faste valg:** opret et valg med et navn, 2-4 billeder og et spørgsmål, der siges højt (fx "Vil du gå eller cykle?").
- **Vis på Leylas iPad** starter valget. **Start hurtigt valg** laver et valg med 2-4 billeder uden at gemme det.
- Når Leyla trykker, kan du se det her. Noter derefter svaret med **ét tryk**:
  - **Valgte**: hun valgte et billede.
  - **Intet svar**.
  - **Svarede på anden måde**.
  De tre knapper er lige store, og ingen af dem er en fejl. Alle former for svar er kommunikation. Når du trykker, gemmes noten, og valget lukkes på iPad'en.
- **Ja, Nej og Mere:** her kan du erstatte tommel op, tommel ned og plus med egne billeder, fx tegnet for "mere" fra tegn til tale. Hvert tryk på Ja, Nej og Mere gemmes med tidspunkt.

### Fanen Noter

En simpel liste over de seneste registreringer, nyeste øverst. Tryk **Kopiér som tekst** og sæt teksten ind i journalen. Der er ingen grafer og ingen statistik.

---

## Til den, der vedligeholder appen

- Database-ændringerne ligger som SQL i mappen `shared`:
  `piktogram-leyla-schema.sql`, `piktogram-admin-schema.sql`, `piktogram-med-schema.sql`, `piktogram-valg-schema.sql` og edge-funktionen `piktogram-billede-edge-function.ts`.
- Alle piktogram-tabeller har `beboer_id` (samme id som i `beboere`), så delen senere kan flyttes ind under Beboer.
- Leylas iPad kan kun **læse sine egne data** og **skrive registreringer og valg-tryk**. Der er ingen service-nøgler i koden.
- Billederne ligger i bucketten `piktogram-billeder`, som er offentlig-læsbar (filnavnene er tilfældige id'er, og billederne er generiske piktogrammer).
- Personalets foto kommer fra vagtplanen (en ekstern adresse). Browseren kan i kort tid have billedet i sin egen cache.
